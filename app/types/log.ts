export type LogStatus = "success" | "warning" | "error";

export interface SystemLog {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  status: LogStatus;
}