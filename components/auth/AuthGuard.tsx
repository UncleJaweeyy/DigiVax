"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/auth/AuthProvider";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user || !profile) {
      router.replace("/login");
      return;
    }

    if (profile.status === "Disabled") {
      router.replace("/login");
      return;
    }

    if (pathname.startsWith("/admin") && profile.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [loading, pathname, profile, router, user]);

  if (loading || !user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (pathname.startsWith("/admin") && profile.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}
