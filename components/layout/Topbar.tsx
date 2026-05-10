import { Bell } from "lucide-react";

export default function Topbar() {
  return (
    <div className="bg-white shadow px-8 py-4 flex justify-between items-center">
      <div>
        <p className="text-sm text-gray-500">
          Vaccination Record Management
        </p>
        <p className="text-xs text-green-600">● Cloud Database Connected</p>
      </div>

      <Bell className="text-gray-600 cursor-pointer" />
    </div>
  );
}
