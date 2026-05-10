"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Lock, Mail, Activity, ShieldAlert, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react"
import { loginUser, updatePassword } from "@/actions/auth/actions"
//  Import reusable Button
import Button from "@/components/ui/Button"

export default function LoginPage() {
  const router = useRouter()
  
  const [step, setStep] = useState<"login" | "force-change">("login")
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  
  const [tempUserData, setTempUserData] = useState<{ role: string } | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const user = await loginUser(email, password);
      setTempUserData({ role: user.role });

      if (user.forcePasswordChange) {
        setStep("force-change");
      } else {
        localStorage.setItem("auth", "true");
        localStorage.setItem("role", user.role);
        router.push(user.role === "admin" ? "/admin/dashboard" : "/dashboard");
      }
    } catch (error: any) {
      alert(error.message || "An error occurred during login.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setIsLoading(true);
    try {
      await updatePassword(email, newPassword);
      alert("Success! Password updated securely.");
      const finalRole = tempUserData?.role || "bhw";
      localStorage.setItem("auth", "true");
      localStorage.setItem("role", finalRole);
      router.push(finalRole === "admin" ? "/admin/dashboard" : "/dashboard");
    } catch (error: any) {
      alert(error.message || "Failed to update password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative font-sans !text-slate-900">
      <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
      
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg mb-4">
            <Activity className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold !text-slate-800 tracking-tight italic">
            DIGI<span className="text-blue-600">VAX</span>
          </h1>
          <p className="!text-slate-500 text-sm mt-2 font-medium italic">Barangay Health Management System</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full border border-slate-100">
          {step === "login" ? (
            <form onSubmit={handleLogin} className="animate-in fade-in zoom-in-95 duration-300">
              <div className="mb-8">
                <h2 className="text-xl font-bold !text-slate-800 tracking-tight">System Access</h2>
                <p className="!text-slate-500 text-sm font-medium">Authorized Personnel Only</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                  <input
                    required
                    type="email"
                    placeholder="Staff Email"
                    className="w-full pl-12 pr-4 p-3.5 bg-white !text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-slate-400 w-5 h-5" />
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    className="w-full pl-12 pr-12 p-3.5 bg-white !text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 outline-none"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* Reusable Button*/}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full mt-8 py-4 rounded-2xl flex justify-center items-center"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : "Sign In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleUpdatePassword} className="animate-in slide-in-from-right-4 duration-500">
              <div className="mb-6">
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 mb-4">
                  <ShieldAlert className="text-amber-600 shrink-0" size={20} />
                  <p className="text-xs !text-amber-800 font-semibold leading-relaxed">
                    Account Protection: You are using a temporary password. Please set a <span className="underline font-black">private</span> one to continue.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black !text-slate-400 uppercase tracking-widest ml-1">New Password</label>
                  <input
                    required
                    type="password"
                    placeholder="Create new password"
                    className="w-full px-5 p-3.5 bg-white !text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black !text-slate-400 uppercase tracking-widest ml-1">Confirm Password</label>
                  <input
                    required
                    type="password"
                    placeholder="Confirm new password"
                    className="w-full px-5 p-3.5 bg-white !text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              {}
              <Button 
                type="submit" 
                disabled={isLoading}
                // Custom background for the "Emerald" feel while keeping your component's core logic
                className={`w-full mt-8 py-4 rounded-2xl flex justify-center items-center gap-2 ${!isLoading ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <>Save & Proceed <CheckCircle2 size={18} /></>}
              </Button>
            </form>
          )}
        </div>
        
        <p className="text-center !text-slate-400 text-[10px] uppercase font-black tracking-[0.2em] mt-8">
          © 2026 DigiVax • Secure Access Portal
        </p>
      </div>
    </div>
  )
}