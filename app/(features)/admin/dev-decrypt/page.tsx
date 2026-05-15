"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Eye, Loader2, RefreshCcw, Search } from "lucide-react";

import Button from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";
import type { VaccinationRecordDocument } from "@/types/records";

interface DevDecryptedRecord {
  id: string;
  firestore: {
    createdBy: string;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    piiProtected: boolean;
    encryptionVersion: number | null;
    encryptedRecord: {
      alg: string;
      kid: string;
      encryptedAt: string;
      ciphertextBytesApprox: number;
    } | null;
  };
  decrypted: VaccinationRecordDocument;
}

export default function DevDecryptPage() {
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<DevDecryptedRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const token = await user?.getIdToken();

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch("/api/dev/decrypted-records", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json().catch(() => ({})) as {
        records?: DevDecryptedRecord[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load decrypted records.");
      }

      setRecords(payload.records || []);
      setSelectedId((current) => current || payload.records?.[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load decrypted records.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (profile?.role === "admin") {
      void loadRecords();
    }
  }, [loadRecords, profile?.role]);

  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return records;
    }

    return records.filter((record) => JSON.stringify(record.decrypted).toLowerCase().includes(normalized)
      || record.id.toLowerCase().includes(normalized));
  }, [query, records]);

  const selectedRecord = filteredRecords.find((record) => record.id === selectedId) || filteredRecords[0];

  if (profile?.role !== "admin") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
        Admin access is required.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-red-500">Developer Test Only</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Decrypted Record Inspector</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
            Admin-only view for checking encrypted Firestore records after upload. Disable
            <span className="font-mono"> DIGIVAX_ENABLE_DEV_DECRYPT_VIEW </span>
            after validation.
          </p>
        </div>
        <Button className="flex items-center gap-2" onClick={loadRecords} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <p>
            This page displays decrypted patient data. Use it only for short validation sessions,
            avoid screenshots/exports, and turn the server flag off when done.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {error}
        </div>
      )}

      <div className="grid min-h-[680px] grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search decrypted values..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
            <p className="mt-3 text-xs font-bold text-slate-400">
              {filteredRecords.length} of {records.length} records
            </p>
          </div>

          <div className="max-h-[620px] overflow-auto">
            {filteredRecords.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setSelectedId(record.id)}
                className={`block w-full border-b border-slate-100 p-4 text-left transition-colors ${
                  selectedRecord?.id === record.id ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Database className="mt-0.5 shrink-0 text-blue-600" size={18} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{record.decrypted.patientName}</p>
                    <p className="truncate text-xs font-semibold text-slate-500">{record.id}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {record.decrypted.vaccineType} · {record.decrypted.status}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
          {isLoading ? (
            <div className="grid min-h-[680px] place-items-center text-slate-500">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : selectedRecord ? (
            <RecordDetails record={selectedRecord} />
          ) : (
            <div className="grid min-h-[680px] place-items-center p-8 text-center text-sm font-semibold text-slate-400">
              No records found.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RecordDetails({ record }: { record: DevDecryptedRecord }) {
  const decryptedJson = JSON.stringify(record.decrypted, null, 2);

  return (
    <div className="flex min-h-[680px] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Eye className="text-blue-600" size={18} />
            <h2 className="truncate text-xl font-bold text-slate-900">{record.decrypted.patientName}</h2>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-400">{record.id}</p>
        </div>
        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">
          Decrypted
        </span>
      </div>

      <div className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-2 xl:grid-cols-4">
        <Fact label="Patient" value={record.decrypted.patientName} />
        <Fact label="Vaccine" value={record.decrypted.vaccineType} />
        <Fact label="Date" value={record.decrypted.vaccinationDate || "No date"} />
        <Fact label="Status" value={record.decrypted.status} />
        <Fact label="Created By" value={record.firestore.createdByName || record.firestore.createdBy} />
        <Fact label="Created At" value={record.firestore.createdAt || "No timestamp"} />
        <Fact label="Encryption" value={record.firestore.encryptedRecord?.alg || "Legacy/plain fallback"} />
        <Fact label="Key ID" value={record.firestore.encryptedRecord?.kid || "None"} />
      </div>

      <div className="grid min-h-0 flex-1 gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-400">
            Full Decrypted Record
          </h3>
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
            {decryptedJson}
          </pre>
        </div>

        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-400">
            Encryption Metadata
          </h3>
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
            {JSON.stringify(record.firestore, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}
