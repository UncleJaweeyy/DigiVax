import type { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import type { UserRole, UserStatus } from "@/app/types/user";
import { db } from "@/lib/firebase/client";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  forcePasswordChange: boolean;
  joined?: string;
}

const usersCollection = "users";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, usersCollection, uid));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    uid,
    name: String(data.name || ""),
    email: String(data.email || ""),
    role: data.role === "admin" ? "admin" : "bhw",
    status: data.status === "Disabled" || data.status === "Pending" ? data.status : "Active",
    forcePasswordChange: Boolean(data.forcePasswordChange),
    joined: typeof data.joined === "string" ? data.joined : undefined,
  };
}

export async function updateUserPasswordState(uid: string) {
  await updateDoc(doc(db, usersCollection, uid), {
    forcePasswordChange: false,
    updatedAt: serverTimestamp(),
  });
}

export async function createMissingUserProfile(user: User) {
  const profile: UserProfile = {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "DigiVax User",
    email: user.email || "",
    role: "bhw",
    status: "Pending",
    forcePasswordChange: false,
    joined: new Date().toISOString().slice(0, 10),
  };

  await setDoc(doc(db, usersCollection, user.uid), {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return profile;
}
