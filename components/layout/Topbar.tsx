"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut, User } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";

export default function Topbar() {
  const { user, profile, signOutUser } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const displayName = profile?.name || user?.displayName || user?.email?.split("@")[0] || "DigiVax User";
  const currentDateTime = useMemo(() => {
    return new Intl.DateTimeFormat("en-PH", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
  }, [now]);

  return (
    <div className="bg-white shadow px-8 py-4 flex justify-between items-center">
      <div>
        <p className="text-sm text-gray-500">
          Vaccination Record Management
        </p>
        <p className="text-xs text-green-600">● Cloud Database Connected</p>
      </div>

      <div className="relative flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800">{displayName}</p>
          <p className="text-xs font-medium text-slate-400">{currentDateTime}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-600 transition-colors hover:bg-red-50 hover:text-red-600"
          aria-expanded={isMenuOpen}
          aria-label="Open account menu"
        >
          <User size={20} />
        </button>

        {isMenuOpen && (
          <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white py-2 shadow-xl shadow-slate-200/70">
            <button
              type="button"
              onClick={async () => {
                setIsMenuOpen(false);
                await signOutUser();
                window.location.href = "/login";
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
