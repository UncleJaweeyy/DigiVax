
// Manage types related to user roles, staff members, and their statuses in the system.
export type UserRole = 'admin' | 'bhw';
export type UserStatus = 'Active' | 'Pending' | 'Disabled';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  joined: string;
  forcePasswordChange?: boolean;
}