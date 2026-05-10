import type { LogStatus } from "@/app/types/log";
import { auth } from "@/lib/firebase/client";

interface ClientAuditLogInput {
  action: string;
  target: string;
  status: LogStatus;
  targetId?: string;
}

export async function writeClientAuditLog(input: ClientAuditLogInput) {
  const user = auth.currentUser;

  if (!user) {
    return;
  }

  const idToken = await user.getIdToken();

  await fetch("/api/audit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  }).catch((error) => {
    console.warn("Audit log write failed:", error);
  });
}
