"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Users, UserPlus, CheckCircle, XCircle, 
  ShieldCheck, User as UserIcon, X, Clock, KeyRound, ChevronDown
} from "lucide-react";
import { StaffMember, UserStatus, UserRole } from "@/types/user";
import { getStaffDirectory, updateUserStatus, createStaffAccount, resetUserPassword } from "@/actions/admin/user-actions";
import { auth } from "@/lib/firebase/client";

const rolePrefix = {
  admin: "ADMIN",
  bhw: "BHW",
} satisfies Record<UserRole, string>;

export default function ManageStaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "All">("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [formData, setFormData] = useState({ 
    name: "", email: "", role: "bhw" as UserRole, password: "" 
  });

  // INITIAL LOAD
  useEffect(() => {
    const loadData = async () => {
      try {
        const idToken = await getAdminIdToken();
        const data = await getStaffDirectory(idToken);
        setStaff(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // UPDATED HANDLER: Captures the random password generated in user-actions.ts
  const handleResetPassword = async (id: string, name: string) => {
    const confirmReset = confirm(`Are you sure you want to reset the password for ${name}?`);
    
    if (confirmReset) {
      try {
        const idToken = await getAdminIdToken();
        const result = await resetUserPassword(idToken, id);
        // Show the actual random password to the Admin
        alert(
          `SUCCESS!\n\n` +
          `The password for ${name} has been reset to: ${result.tempPass}\n\n` +
          `Please provide this code to the user. They will be forced to change it upon login.`
        );
      } catch (error) {
        alert(getErrorMessage(error, "Failed to reset password. Please try again."));
      }
    }
  };

  // FILTER LOGIC (Kept exactly as yours)
  const filteredStaff = useMemo(() => {
    return staff.filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "All" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staff, searchQuery, roleFilter]);

  const paginatedStaff = filteredStaff.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // HANDLERS
  const handleUpdateStatus = async (id: string, newStatus: UserStatus) => {
    try {
      const idToken = await getAdminIdToken();
      await updateUserStatus(idToken, id, newStatus);
      setStaff(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    } catch (error) {
      alert(getErrorMessage(error, "Failed to update status"));
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Sends formData (including the admin's manual password) to the action
      const idToken = await getAdminIdToken();
      const response = await createStaffAccount(idToken, {
        ...formData,
        name: getPrefixedName(formData.name, formData.role),
      });
      // Ensure we add the returned user which now includes forcePasswordChange: true
      setStaff([response.user, ...staff]);
      setIsModalOpen(false);
      setFormData({ name: "", email: "", role: "bhw", password: "" });
    } catch (error) {
      alert(getErrorMessage(error, "Failed to create user"));
    }
  };

  if (isLoading) return (
    <div className="p-20 text-center bg-slate-50 min-h-screen">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="font-bold !text-slate-400 italic">Syncing Health Staff Directory...</p>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold !text-slate-900 tracking-tight flex items-center gap-3">
            <Users className="text-blue-600" /> Manage Staff
          </h1>
          <p className="!text-slate-500 text-sm">Assign roles and control system access.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <select 
            className="pl-4 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold !text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value as UserRole | "All"); setCurrentPage(1); }}
          >
            <option value="All">All Roles</option>
            <option value="admin">Admins</option>
            <option value="bhw">BHWs</option>
          </select>

          <input 
            type="text"
            placeholder="Search by name..."
            className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none !text-slate-900"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />

          <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all">
            <UserPlus size={18} /> Add New User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-4xl border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left table-fixed min-w-[900px]"> 
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-[10px] font-black !text-slate-400 uppercase tracking-widest">
                <th className="p-6 pl-10 w-[35%]">User Info</th>
                <th className="p-6 w-[20%]">System Role</th>
                <th className="p-6 w-[20%] text-center">Account Status</th>
                <th className="p-6 text-right pr-10 w-[25%]">Administrative Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {paginatedStaff.map((member) => (
                <tr key={member.id} className="hover:bg-blue-50/20 transition-colors group">
                  <td className="p-6 pl-10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold !text-slate-500 uppercase">{member.name[0]}</div>
                      <div className="truncate">
                        <p className="font-bold !text-slate-800 truncate">{member.name}</p>
                        <p className="text-xs !text-slate-400 truncate">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-2 font-bold text-xs !text-slate-600">
                      {member.role === 'admin' ? <ShieldCheck size={16} className="text-purple-500" /> : <UserIcon size={16} className="text-blue-500" />}
                      <span className="capitalize">{member.role}</span>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <StatusBadge status={member.status} />
                  </td>
                  <td className="p-6 text-right pr-10">
                    <div className="flex justify-end gap-1">
                      {member.status === 'Active' ? (
                        <button onClick={() => handleUpdateStatus(member.id, 'Disabled')} className="p-2 !text-slate-400 hover:!text-red-500 rounded-lg transition-all" title="Disable User"><XCircle size={20} /></button>
                      ) : (
                        <button onClick={() => handleUpdateStatus(member.id, 'Active')} className="p-2 !text-slate-400 hover:!text-emerald-500 rounded-lg transition-all" title="Enable User"><CheckCircle size={20} /></button>
                      )}
                      
                      <button 
                        onClick={() => handleUpdateStatus(member.id, 'Pending')} 
                        className="p-2 !text-slate-400 hover:!text-amber-500 hover:bg-amber-50 rounded-lg transition-all" 
                        title="Set to Pending"
                        ><Clock size={20}
                      /></button>
                      
                      <button 
                        onClick={() => handleResetPassword(member.id, member.name)} 
                        className="p-2 !text-slate-400 hover:!text-blue-600 hover:bg-blue-50 rounded-lg transition-all" 
                        title="Reset Password"
                        ><KeyRound size={20} 
                      /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD STAFF */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl relative animate-in zoom-in-95">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 !text-slate-400 hover:!text-slate-600">
              <X size={24} />
            </button>
            <h2 className="text-2xl font-bold !text-slate-800">Add New User</h2>
            <form onSubmit={handleAddStaff} className="space-y-5 mt-6">
              <div className="flex rounded-2xl bg-slate-50">
                <div className="flex min-w-20 items-center justify-center rounded-l-2xl border-r border-slate-100 px-4 text-xs font-black tracking-widest text-blue-600">
                  {rolePrefix[formData.role]}
                </div>
                <input required className="w-full px-5 py-4 bg-transparent !text-slate-900 outline-none" placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: stripRolePrefix(e.target.value)})} />
              </div>
              <input required type="email" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl !text-slate-900 outline-none" placeholder="Email Address" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              <input required type="password" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl !text-slate-900 outline-none" placeholder="Set Password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsRoleMenuOpen((value) => !value)}
                  className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-6 py-4 text-left font-bold !text-slate-700 outline-none ring-blue-600 transition-all hover:bg-slate-100 focus:ring-2"
                >
                  <span>{getRoleLabel(formData.role)}</span>
                  <ChevronDown
                    size={18}
                    className={`text-slate-400 transition-transform ${isRoleMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isRoleMenuOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-10 overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-xl shadow-slate-200/70">
                    {(["bhw", "admin"] as UserRole[]).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, role });
                          setIsRoleMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition-all ${
                          formData.role === role
                            ? "bg-blue-50 !text-blue-700"
                            : "!text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {role === "admin" ? (
                          <ShieldCheck size={16} className="text-purple-500" />
                        ) : (
                          <UserIcon size={16} className="text-blue-500" />
                        )}
                        {getRoleLabel(role)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="w-full  bg-blue-600 text-white py-3 rounded-2xl font-bold text-lg shadow-xl shadow-blue-100 hover:bg-blue-700">
                Create Account
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

async function getAdminIdToken() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please sign in again.");
  }

  return currentUser.getIdToken();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getRoleLabel(role: UserRole) {
  return role === "admin" ? "Administrator" : "Health Worker (BHW)";
}

function getPrefixedName(name: string, role: UserRole) {
  const unprefixedName = stripRolePrefix(name);

  return `${rolePrefix[role]} ${unprefixedName}`.trim();
}

function stripRolePrefix(name: string) {
  return name.trimStart().replace(/^(admin|bhw)\s+/i, "");
}

function StatusBadge({ status }: { status: UserStatus }) {
  const styles = { 
    Active: "bg-emerald-50 !text-emerald-600 border-emerald-100", 
    Pending: "bg-amber-50 !text-amber-600 border-amber-100", 
    Disabled: "bg-slate-100 !text-slate-500 border-slate-200" 
  };
  return (
    <span className={`inline-flex items-center justify-center px-4 py-1.5 border text-[10px] font-black uppercase rounded-full w-25 shadow-sm ${styles[status]}`}>
      {status}
    </span>
  );
}
