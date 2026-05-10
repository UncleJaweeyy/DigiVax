// src/actions/admin/user-actions.ts
import { STAFF_MEMBERS } from "@/lib/dummy-data";
import { StaffMember, UserStatus } from "@/app/types/user";

/**
 * FETCH ALL STAFF
 * Ready for GET /api/admin/users
 */
export const getStaffDirectory = async (): Promise<StaffMember[]> => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  
  /* const response = await fetch('/api/admin/users');
  if (!response.ok) throw new Error("Failed to fetch directory");
  return await response.json(); 
  */
  return STAFF_MEMBERS as StaffMember[];
};

/**
 * UPDATE USER STATUS
 * Ready for PATCH /api/admin/users/:id/status
 */
export const updateUserStatus = async (userId: string, status: UserStatus) => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  /*
  const response = await fetch(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error("Update failed");
  */
  
  console.log(`Status of ${userId} changed to ${status}`);
  return { success: true };
};

/**
 * CREATE NEW USER
 * Takes Admin-inputted password and sets the Force Change flag.
 */
export const createStaffAccount = async (userData: any) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // The 'userData' coming from your modal contains: name, email, role, and password
  const newUser: StaffMember = {
    ...userData,
    id: Math.random().toString(36).substring(7),
    status: "Pending",
    joined: new Date().toLocaleDateString(),
    forcePasswordChange: true // Forces user to change the admin-set password on first login
  };

  /* const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newUser)
  });
  if (!res.ok) throw new Error("Could not create user");
  */

  return { success: true, user: newUser };
};

/**
 * RESET USER PASSWORD
 * Generates a random 6-digit numeric code.
 */
export const resetUserPassword = async (userId: string) => {
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Generate random 6-digit number
  const randomNumber = Math.floor(100000 + Math.random() * 900000);
  const tempPass = `DVX-${randomNumber}`;

  /* const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        password: tempPass, 
        forcePasswordChange: true 
    })
  });
  if (!response.ok) throw new Error("Reset failed");
  */

  return { 
    success: true, 
    tempPass: tempPass, 
    message: "Temporary password generated successfully." 
  };
};