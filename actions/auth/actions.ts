import {
  EmailAuthProvider,
  browserSessionPersistence,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  updatePassword as updateFirebasePassword,
} from "firebase/auth";

import { auth } from "@/lib/firebase/client";
import { writeClientAuditLog } from "@/lib/firebase/audit-client";
import { getUserProfile, updateUserPasswordState } from "@/lib/firebase/users";

export const loginUser = async (email: string, password: string) => {
  try {
    await setPersistence(auth, browserSessionPersistence);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(credential.user.uid);

    if (!profile) {
      await signOut(auth);
      throw new Error("This Firebase user has no DigiVax staff profile yet.");
    }

    if (profile.status !== "Active") {
      await signOut(auth);
      throw new Error("Access Denied: This account is not active.");
    }

    await writeClientAuditLog({
      action: "User Login",
      target: "System Access",
      status: "success",
    });

    return profile;
  } catch (error: unknown) {
    throw new Error(getAuthErrorMessage(error));
  }
};

export const updatePassword = async (
  email: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = auth.currentUser;

  if (!user || user.email !== email) {
    throw new Error("Please sign in again before changing your password.");
  }

  try {
    const credential = EmailAuthProvider.credential(email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updateFirebasePassword(user, newPassword);
    await updateUserPasswordState(user.uid);
    await writeClientAuditLog({
      action: "Password Change",
      target: user.email || "Current User",
      status: "warning",
    });

    return {
      success: true,
      message: "Password updated successfully.",
    };
  } catch (error: unknown) {
    throw new Error(getAuthErrorMessage(error));
  }
};

function getAuthErrorMessage(error: unknown) {
  const authError = error as { code?: string; message?: string };

  switch (authError.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/requires-recent-login":
      return "Please sign in again before changing your password.";
    default:
      return authError.message || "Authentication failed.";
  }
}
