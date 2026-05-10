import "server-only";

import { adminAuth, adminDb } from "@/lib/firebase/admin";

const usersCollection = "users";

export async function assertActiveStaff(idToken: string) {
  const { uid, profile } = await getVerifiedProfile(idToken);
  const role = String(profile?.role || "").toLowerCase();
  const status = String(profile?.status || "");

  if (status !== "Active" || !["admin", "bhw"].includes(role)) {
    throw new Error("Active staff access is required.");
  }

  return uid;
}

export async function assertAdmin(idToken: string) {
  const { uid, profile } = await getVerifiedProfile(idToken);
  const role = String(profile?.role || "").toLowerCase();
  const status = String(profile?.status || "");

  if (status !== "Active" || role !== "admin") {
    throw new Error("Admin access is required.");
  }

  return uid;
}

async function getVerifiedProfile(idToken: string) {
  if (!idToken) {
    throw new Error("Session is missing.");
  }

  const decodedToken = await adminAuth.verifyIdToken(idToken);
  const snapshot = await adminDb.collection(usersCollection).doc(decodedToken.uid).get();

  if (!snapshot.exists) {
    throw new Error("Your account does not have a DigiVax profile.");
  }

  return {
    uid: decodedToken.uid,
    profile: snapshot.data(),
  };
}
