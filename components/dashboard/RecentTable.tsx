import React from "react";
import { Clock } from "lucide-react";

interface ActivityTableProps {
  title: string;
  data: ActivityItem[];
  viewAllLink: string;
  isAdmin?: boolean;
}

interface ActivityItem {
  id: string;
  primary?: string;
  patientName?: string;
  user?: string;
  secondary?: string;
  action?: string;
  status?: string;
  time?: string;
  timestamp?: string;
}

export function ActivityTable({ title, data, viewAllLink, isAdmin }: ActivityTableProps) {
  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex-1">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h3>
        <a href={viewAllLink} className="text-blue-600 text-sm font-bold hover:underline flex items-center gap-1">
          View All <span className="text-lg">↗</span>
        </a>
      </div>

      <div className="overflow-x-auto">
        {/* Added table-fixed to enforce our percentage widths */}
        <table className="w-full border-separate border-spacing-y-3 table-fixed">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">
              {/* Widths: 35% for Name, 40% for Status, 25% for Time */}
              <th className="text-left px-4 w-[35%] font-black">{isAdmin ? "Admin/Staff" : "Patient"}</th>
              <th className="text-left px-4 w-[40%] font-black">Status / Action</th>
              <th className="text-right px-4 w-[25%] font-black">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const isBHWStatus = item.status === "Completed" || item.status === "Pending Review";

              return (
                <tr key={item.id} className="group transition-all hover:bg-slate-50/50">
                  {/* 1. Primary Name - Added left padding for breathing room */}
                  <td className="py-3 px-4 font-bold text-slate-700 text-sm truncate">
                    {item.primary || item.patientName || item.user}
                  </td>

                  {/* 2. Status/Activity - Pushed away from the name slightly */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {isBHWStatus ? (
                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          item.status === "Completed" 
                            ? "bg-[#EAFBF3] text-[#24A16C]" 
                            : "bg-orange-50 text-orange-600 border border-orange-100"
                        }`}>
                          {item.status}
                        </div>
                      ) : (
                        <>
                          <span className={`h-2 w-2 rounded-full shrink-0 ${
                            item.status === 'success' ? 'bg-emerald-500' : 
                            item.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                          }`} />
                          <span className="text-slate-500 text-sm truncate font-medium">
                            {item.secondary || item.action}
                          </span>
                        </>
                      )}
                    </div>
                  </td>

                  {/* 3. Timestamp - Aligned and brought closer with right padding */}
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2 text-slate-400 text-xs font-bold italic">
                      <Clock size={14} className="shrink-0 opacity-70" />
                      {/* Fixed width for the text portion ensures the clocks stay in a straight line */}
                      <span className="min-w-[75px] text-right whitespace-nowrap">
                        {item.time || item.timestamp}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data.length === 0 && (
          <div className="py-12 text-center text-slate-400 italic text-sm">
            No recent activity recorded.
          </div>
        )}
      </div>
    </div>
  );
}
