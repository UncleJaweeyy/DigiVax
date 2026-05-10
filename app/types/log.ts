export type LogStatus = "success" | "warning" | "error";

export type LogType =
  | "All"
  | "User Login"
  | "Password Change"
  | "Create User"
  | "User Status Update"
  | "Password Reset"
  | "Digitalized Record"
  | "Record Updated"
  | "Review Completed";

export interface SystemLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  status: LogStatus;
}
