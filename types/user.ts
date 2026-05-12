// Shared staff access-control types used by Firebase profiles and admin screens.
export type UserRole = "admin" | "bhw";
export type UserStatus = "Active" | "Pending" | "Disabled";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  joined: string;
  forcePasswordChange?: boolean;
}
