import { StaffMember } from "@/app/types/user";
import { VaccinationRecord } from "@/app/types/records";
import { DashboardStat } from "@/app/types/dashboard";
import { SystemLog } from "@/app/types/log";

/* ===========================
   ADMIN DASHBOARD DATA
=========================== */

export const ADMIN_STATS: DashboardStat[] = [
  { label: "Total Staff", value: "12", type: "staff", desc: "Active BHWs" },
  { label: "Pending Access", value: "3", type: "access", desc: "Waiting Review" },
  { label: "Cloud Storage", value: "1.2GB", type: "storage", desc: "Of 5GB Used" },
];

/* ===========================
   MAIN DASHBOARD DATA
=========================== */

export const DASHBOARD_STATS: DashboardStat[] = [
  { label: "Digitized Records", value: "85", type: "total" },
  { label: "Total Patients", value: "111", type: "patients" },
  { label: "Awaiting Review", value: "12", type: "pending" },
];

export const RECENT_RECORDS: VaccinationRecord[] = [
  { id: "1", patientName: "Juan Dela Cruz", vaccineType: "Pfizer", timestamp: "2 mins ago", status: "Completed" },
  { id: "2", patientName: "Jane Doe", vaccineType: "MMR", timestamp: "15 mins ago", status: "Pending Review" },
  { id: "3", patientName: "Maria Clara", vaccineType: "Flu Shot", timestamp: "1 hour ago", status: "Completed" },
  { id: "4", patientName: "Jose Rizal", vaccineType: "Hepatitis B", timestamp: "3 hours ago", status: "Pending Review" },
];

/* ===========================
   SEARCH PAGE DATA
   (same record type)
=========================== */

export const SEARCH_RECORDS: VaccinationRecord[] = [
  { id: "2022-00-00101", patientName: "Jane D. Doe", vaccineType: "Polio Shot", timestamp: "Oct 12, 2022" },
  { id: "2022-02-00103", patientName: "Jane B. Base", vaccineType: "PCV Shot", timestamp: "Nov 3, 2023" },
  { id: "2023-10-00121", patientName: "Jane Smith", vaccineType: "Hepa B", timestamp: "Mar 12, 2024" },
  { id: "2023-11-00122", patientName: "Jane Watson", vaccineType: "MMR", timestamp: "Apr 05, 2024" },
  { id: "2023-12-00123", patientName: "Jane Foster", vaccineType: "Flu Shot", timestamp: "May 20, 2024" },
  { id: "2023-13-00124", patientName: "Jane Austen", vaccineType: "Tdap", timestamp: "Jun 15, 2024" },
  { id: "2023-14-00125", patientName: "Jane Goodall", vaccineType: "Varicella", timestamp: "Jul 22, 2024" },
  { id: "2022-01-00102", patientName: "Joe A. Doe", vaccineType: "OPV Shot", timestamp: "Jan 23, 2022" },
  { id: "2022-03-00104", patientName: "Mark Ruffalo", vaccineType: "Hepa B", timestamp: "Dec 05, 2023" },
  { id: "2022-04-00105", patientName: "Sarah Connor", vaccineType: "MMR", timestamp: "Jan 12, 2024" },
  { id: "2022-05-00106", patientName: "Tony Stark", vaccineType: "Flu Shot", timestamp: "Feb 14, 2024" },
  { id: "2022-06-00107", patientName: "Bruce Wayne", vaccineType: "Tdap", timestamp: "Mar 10, 2024" },
  { id: "2022-07-00108", patientName: "Diana Prince", vaccineType: "Varicella", timestamp: "Apr 22, 2024" },
  { id: "2022-08-00109", patientName: "Peter Parker", vaccineType: "HPV", timestamp: "May 15, 2024" },
  { id: "2022-09-00110", patientName: "Wanda Maximoff", vaccineType: "Pneumococcal", timestamp: "Jun 30, 2024" },
  { id: "2023-00-00111", patientName: "Steve Rogers", vaccineType: "Hepatitis A", timestamp: "Jul 04, 2024" },
  { id: "2023-01-00112", patientName: "Natasha Romanoff", vaccineType: "Meningococcal", timestamp: "Aug 12, 2024" },
  { id: "2023-02-00113", patientName: "Clint Barton", vaccineType: "Shingles", timestamp: "Sep 18, 2024" },
  { id: "2023-03-00114", patientName: "Barry Allen", vaccineType: "Polio Shot", timestamp: "Oct 01, 2024" },
  { id: "2023-04-00115", patientName: "Arthur Curry", vaccineType: "Rotavirus", timestamp: "Oct 20, 2024" },
];

/* ===========================
   MANAGE STAFF DATA
=========================== */

export const STAFF_MEMBERS: StaffMember[] = [
  {
    id: "1",
    name: "Maria Santos",
    email: "maria@bhw.com",
    role: "bhw",
    status: "Active",
    joined: "2025-10-12",
    forcePasswordChange: false,
  },
  {
    id: "2",
    name: "John Doe",
    email: "john@bhw.com",
    role: "bhw",
    status: "Pending",
    joined: "2026-02-20",
    forcePasswordChange: true,
  },
  {
    id: "3",
    name: "Allen Barry",
    email: "allen@bhw.com",
    role: "admin",
    status: "Active",
    joined: "2024-02-20",
    forcePasswordChange: false,
  },
];


/* ===========================
   MOCK OCR TEXT
=========================== */

export const MOCK_EXTRACTED_TEXT = `
VACCINATION RECORD
--------------------------
Name: JUAN DELA CRUZ
Sex: Male
Date of Birth: 1995-05-20

1st Dose: Pfizer
Date: 2023-08-15

2nd Dose: Pfizer
Date: 2023-09-05
`;

/* ===========================
   USER PROFILE
=========================== */

export const USER_PROFILE = {
  name: "Barangay Health Worker",
  role: "Brgy. Health Center",
  initials: "BH",
};


export const MOCK_LOGS: SystemLog[] = [
  { id: "LOG-101", user: "Admin Sarah", action: "User Login", target: "System Access", timestamp: "2 mins ago", status: "success" },
  { id: "LOG-102", user: "BHW Maria", action: "Digitalize Record", target: "REC-8829", timestamp: "15 mins ago", status: "success" },
  { id: "LOG-103", user: "Admin Sarah", action: "Password Change", target: "Staff: John Doe", timestamp: "1 hour ago", status: "warning" },
  { id: "LOG-104", user: "System", action: "Failed Login", target: "IP: 192.168.1.1", timestamp: "3 hours ago", status: "error" },
];