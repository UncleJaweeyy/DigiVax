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
  | "Review Completed"
  | "Export CSV"
  | "Export All Records"
  | "Export Session Logs"
  | "Flush Session Logs";

export type LogDateMode = "All Dates" | "Specific Date" | "Date Range";

export interface LogDateFilter {
  mode: LogDateMode;
  date?: string;
  from?: string;
  to?: string;
}

export interface SystemLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  status: LogStatus;
}
