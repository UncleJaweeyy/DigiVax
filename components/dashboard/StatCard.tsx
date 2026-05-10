import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  description?: string;
}

export function StatCard({ label, value, icon: Icon, color, bg, description }: StatCardProps) {
  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-6 transition-transform hover:scale-[1.02]">
      <div className={`p-4 rounded-2xl ${bg}`}>
        <Icon className={color} size={32} />
      </div>
      <div className="bg-white">
        {/* ! forces dark slate even in dark mode */}
        <p className="!text-slate-500 font-medium text-sm">{label}</p>
        <h3 className="text-4xl font-bold !text-slate-900">{value}</h3>
        {description && (
          <p className="text-[10px] !text-slate-400 mt-1 uppercase font-bold tracking-tight">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}