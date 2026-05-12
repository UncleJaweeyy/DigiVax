"use server";

import { FieldValue, type DocumentData } from "firebase-admin/firestore";

import type { StaffMember, UserRole, UserStatus } from "@/app/types/user";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/firebase/admin-access";
import { writeAuditLog } from "@/lib/firebase/audit-log";

type CreateStaffAccountInput = Pick<StaffMember, "name" | "email" | "role"> & {
  password: string;
};

const usersCollection = "users";

export const getStaffDirectory = async (idToken: string): Promise<StaffMember[]> => {
  await assertAdmin(idToken);

  const snapshot = await adminDb.collection(usersCollection).orderBy("name", "asc").get();
  const staff = await Promise.all(
    snapshot.docs.map(async (doc) => {
      try {
        const authUser = await adminAuth.getUser(doc.id);
        const member = mapStaffMember(doc.id, doc.data());

        return {
          ...member,
          status: authUser.disabled ? "Disabled" : member.status,
        };
      } catch (error) {
        if (isAuthUserNotFound(error)) {
          await doc.ref.delete();
          return null;
        }

        throw error;
      }
    }),
  );

  return staff.filter((member): member is StaffMember => member !== null);
};

export const updateUserStatus = async (
  idToken: string,
  userId: string,
  status: UserStatus,
) => {
  const adminUid = await assertAdmin(idToken);

  if (!isUserStatus(status)) {
    throw new Error("Invalid account status.");
  }

  if (adminUid === userId && status !== "Active") {
    throw new Error("You cannot restrict your own admin account.");
  }

  await adminAuth.updateUser(userId, {
    disabled: status === "Disabled",
  });

  await adminDb.collection(usersCollection).doc(userId).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const [adminProfile, targetProfile] = await Promise.all([
    getStaffProfile(adminUid),
    getStaffProfile(userId),
  ]);

  await writeAuditLog({
    userId: adminUid,
    user: adminProfile.name,
    action: "User Status Update",
    target: `${targetProfile.name} set to ${status}`,
    targetId: userId,
    status: status === "Active" ? "success" : "warning",
  });

  return { success: true };
};

export const createStaffAccount = async (
  idToken: string,
  userData: CreateStaffAccountInput,
) => {
  const adminUid = await assertAdmin(idToken);

  const name = formatStaffDisplayName(userData.name, userData.role);
  const email = userData.email.trim().toLowerCase();
  const password = userData.password.trim();

  if (!name || !email || !password) {
    throw new Error("Name, email, and password are required.");
  }

  if (!isUserRole(userData.role)) {
    throw new Error("Invalid system role.");
  }

  const authUser = await adminAuth.createUser({
    displayName: name,
    email,
    password,
    disabled: false,
  });

  const newUser: StaffMember = {
    id: authUser.uid,
    name,
    email,
    role: userData.role,
    status: "Active",
    joined: new Date().toISOString().slice(0, 10),
    forcePasswordChange: true,
  };

  try {
    await adminDb.collection(usersCollection).doc(authUser.uid).set({
      uid: authUser.uid,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      forcePasswordChange: true,
      joined: newUser.joined,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const adminProfile = await getStaffProfile(adminUid);

    await writeAuditLog({
      userId: adminUid,
      user: adminProfile.name,
      action: "Create User",
      target: `${newUser.name} (${newUser.role})`,
      targetId: authUser.uid,
      status: "success",
    });
  } catch (error) {
    await adminAuth.deleteUser(authUser.uid).catch(() => undefined);
    throw error;
  }

  return { success: true, user: newUser };
};

export const resetUserPassword = async (idToken: string, userId: string) => {
  const adminUid = await assertAdmin(idToken);

  const userSnapshot = await adminDb.collection(usersCollection).doc(userId).get();

  if (!userSnapshot.exists) {
    throw new Error("Staff profile not found.");
  }

  const profile = mapStaffMember(userSnapshot.id, userSnapshot.data() || {});

  if (profile.status === "Disabled") {
    throw new Error("Enable this account before resetting its password.");
  }

  const tempPass = `DVX-${Math.floor(100000 + Math.random() * 900000)}`;

  await adminAuth.updateUser(userId, {
    password: tempPass,
  });

  await userSnapshot.ref.update({
    forcePasswordChange: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const adminProfile = await getStaffProfile(adminUid);

  await writeAuditLog({
    userId: adminUid,
    user: adminProfile.name,
    action: "Password Reset",
    target: profile.name,
    targetId: userId,
    status: "warning",
  });

  return {
    success: true,
    tempPass,
    message: "Temporary password generated successfully.",
  };
};

function mapStaffMember(id: string, data: DocumentData): StaffMember {
  return {
    id,
    name: String(data.name || "Unnamed Staff"),
    email: String(data.email || ""),
    role: data.role === "admin" ? "admin" : "bhw",
    status: data.status === "Disabled" || data.status === "Pending" ? data.status : "Active",
    joined: typeof data.joined === "string" ? data.joined : "",
    forcePasswordChange: Boolean(data.forcePasswordChange),
  };
}

function isUserRole(role: string): role is UserRole {
  return role === "admin" || role === "bhw";
}

function isUserStatus(status: string): status is UserStatus {
  return status === "Active" || status === "Pending" || status === "Disabled";
}

function formatStaffDisplayName(name: string, role: UserRole) {
  const trimmedName = name.trim().replace(/\s+/g, " ");
  const unprefixedName = trimmedName.replace(/^(admin|bhw)\s+/i, "");
  const prefix = role === "admin" ? "ADMIN" : "BHW";

  return `${prefix} ${unprefixedName}`.trim();
}

function isAuthUserNotFound(error: unknown) {
  return (error as { code?: string }).code === "auth/user-not-found";
}

async function getStaffProfile(userId: string) {
  const snapshot = await adminDb.collection(usersCollection).doc(userId).get();
  const data = snapshot.data() || {};

  return {
    name: String(data.name || data.email || "Staff"),
  };
}
