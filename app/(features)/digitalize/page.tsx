"use client";

import React, { useState, useRef } from "react";
import { Upload, Edit3, Check } from "lucide-react";
import Button from "@/components/ui/Button";

// Import from the correct folder location
import {
  processScan,
  ScanStatus,
} from "@/actions/records/scan-actions";
import { createVaccinationRecord } from "@/lib/firebase/records";
import { uploadVaccinationRecordFile } from "@/lib/firebase/storage";

export default function DigitalizePage() {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [textPreview, setTextPreview] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // File Processing
  const handleFileProcessing = async (file: File) => {
    setStatus("processing");
    setTextPreview("Initializing OCR Engine...");
    setSelectedFile(file);

    try {
      // FIX: Wrap file in FormData so it can be sent to the server
      const formData = new FormData();
      formData.append("file", file);

      const result = await processScan(formData);

      if (result.success && result.text) {
        setStatus("done");
        setTextPreview(result.text);
      } else {
        setStatus("error");
        setTextPreview(result.error || "Error processing file.");
      }
    } catch {
      setStatus("error");
      setTextPreview("Failed to connect to server.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFileProcessing(file);
  };

  const toggleEditMode = () => {
    if (isEditing) {
      setIsEditing(false);
    } else {
      setIsEditing(true);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const sourceStoragePath = selectedFile
        ? await uploadVaccinationRecordFile(selectedFile)
        : "";

      const recordId = await createVaccinationRecord({
        rawText: textPreview,
        correctedText: textPreview,
        sourceFileName: selectedFile?.name,
        sourceFileType: selectedFile?.type,
        sourceStoragePath,
      });

      alert(`Saved record ${recordId}`);
      setTextPreview("");
      setStatus("idle");
      setIsEditing(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save record.");
    } finally {
      setIsSaving(false);
    }
  };

  // Status Styling Logic
  const getStatusStyle = () => {
    switch (status) {
      case "idle": return "bg-blue-100 text-blue-600";
      case "processing": return "bg-yellow-100 text-yellow-600";
      case "done": return "bg-green-100 text-green-600 font-bold uppercase";
      case "error": return "bg-red-100 text-red-600 font-bold uppercase";
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "idle": return "Waiting for Upload";
      case "processing": return "Processing...";
      case "done": return "Processed";
      case "error": return "Not Processed";
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900">Digitilize a File</h1>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex overflow-hidden min-h-[550px]">
        {/* LEFT SECTION */}
        <div
          className="w-1/3 p-12 flex flex-col items-center justify-center border-r border-slate-100"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) await handleFileProcessing(file);
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          />

          <div
            onClick={() => status !== "processing" && fileInputRef.current?.click()}
            className="group cursor-pointer flex flex-col items-center"
          >
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-blue-300 bg-blue-50 flex items-center justify-center mb-6 group-hover:bg-blue-100 transition-colors">
              <Upload className="text-blue-500" size={32} />
            </div>
            <span className="text-lg font-bold text-slate-800">Import Record Image</span>
          </div>

          <p className="text-slate-400 text-center text-sm mt-4 px-4 leading-relaxed">
            Drop your vaccination certificate here or browse to upload. Supports JPG, PNG, JPEG, and PDF.
          </p>

          <Button
            variant="outline"
            className="mt-8"
            onClick={() => fileInputRef.current?.click()}
            disabled={status === "processing"}
          >
            Browse Files
          </Button>
        </div>

        {/* RIGHT SECTION */}
        <div className="w-2/3 p-10 bg-slate-50/30 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-slate-800">Extracted Text Preview</h2>
            <div className={`px-4 py-1 rounded-full text-[10px] tracking-widest ${getStatusStyle()}`}>
              {getStatusLabel()}
            </div>
          </div>

          <div
            className={`flex-1 bg-white border rounded-xl p-6 shadow-inner transition-all duration-300 ${
              isEditing ? "border-blue-500 ring-2 ring-blue-100 scale-[1.01]" : "border-slate-200"
            }`}
          >
            <textarea
              ref={textareaRef}
              className="w-full h-full resize-none outline-none text-slate-600 font-mono text-sm leading-relaxed"
              placeholder="The extracted text will appear here after processing..."
              value={textPreview}
              onChange={(e) => setTextPreview(e.target.value)}
              readOnly={!isEditing}
            />
          </div>

          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={toggleEditMode}
              disabled={status !== "done"}
              className={`flex items-center gap-2 transition-all ${isEditing ? "bg-blue-50 border-blue-600 text-blue-600" : ""}`}
            >
              {isEditing ? (
                <><Check size={18} /> Finish Editing</>
              ) : (
                <><Edit3 size={18} /> Edit Extracted Text</>
              )}
            </Button>

            <Button
              className="px-10"
              disabled={status !== "done" || isEditing || isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save Record"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
