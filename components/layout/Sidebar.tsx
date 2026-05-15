"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { 
  LayoutDashboard, 
  FilePlus, 
  Search, 
  Users, 
  ShieldAlert, 
  LogOut,
  Activity,
  Eye
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

interface SidebarLinkProps {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, signOutUser } = useAuth();
  const role = profile?.role;

  const isActive = (path: string) => pathname === path;

  return (
    <aside className="w-64 bg-[#0f172a] text-white flex flex-col p-6 h-screen sticky top-0 shadow-xl">
      {/* Branding */}
      <div className="flex items-center gap-2 mb-10 px-2">
        <div className="bg-blue-600 p-1.5 rounded-lg">
          <Activity size={20} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tighter italic">
          DIGI<span className="text-blue-500">VAX</span>
        </h1>
      </div>

      <nav className="flex-1 space-y-1">
        <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Menu</p>
        
        {/* SHARED: Dashboard link changes destination based on role */}
        <SidebarLink 
          href={role === "admin" ? "/admin/dashboard" : "/dashboard"} 
          icon={<LayoutDashboard size={20} />} 
          label="Dashboard" 
          active={isActive(role === "admin" ? "/admin/dashboard" : "/dashboard")} 
        />

        {/* SHARED: Tools accessible to both Admin and BHW */}
        <SidebarLink 
          href="/digitalize" 
          icon={<FilePlus size={20} />} 
          label="Digitalize File" 
          active={isActive("/digitalize")} 
        />
        <SidebarLink 
          href="/search" 
          icon={<Search size={20} />} 
          label="Search Records" 
          active={isActive("/search")} 
        />

        {/* ADMIN EXCLUSIVE: Only rendered if role is 'admin' */}
        {role === "admin" && (
          <div className="mt-8 pt-8 border-t border-slate-800">
            <p className="px-4 text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">
              System Admin
            </p>
            <SidebarLink 
              href="/admin/users" 
              icon={<Users size={20} />} 
              label="Manage Staff" 
              active={isActive("/admin/users")} 
            />
            <SidebarLink 
              href="/admin/logs" 
              icon={<ShieldAlert size={20} />} 
              label="System Logs" 
              active={isActive("/admin/logs")} 
            />
            <SidebarLink
              href="/admin/dev-decrypt"
              icon={<Eye size={20} />}
              label="Dev Decrypt"
              active={isActive("/admin/dev-decrypt")}
            />
          </div>
        )}
      </nav>

      {/* Logout Area */}
      <button 
        onClick={async () => {
          await signOutUser();
          window.location.href = "/login";
        }}
        className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 transition-colors mt-auto group"
      >
        <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" /> 
        <span className="font-bold">Sign out</span>
      </button>
    </aside>
  );
}

function SidebarLink({ href, icon, label, active }: SidebarLinkProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
          : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
      }`}
    >
      {icon} 
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
