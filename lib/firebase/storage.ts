import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { auth, storage } from "@/lib/firebase/client";

const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
const maxUploadBytes = 10 * 1024 * 1024;

export async function uploadVaccinationRecordFile(file: File) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("You must be signed in to upload a file.");
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Unsupported file format. Please use JPG, PNG, or PDF.");
  }

  if (file.size > maxUploadBytes) {
    throw new Error("File is too large. Please upload a file up to 10MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `vaccination-records/${user.uid}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      uploadedBy: user.uid,
      originalName: file.name,
    },
  });

  return storagePath;
}

export async function getVaccinationRecordFileUrl(storagePath: string) {
  if (!storagePath) {
    throw new Error("This record does not have an uploaded source file.");
  }

  return getDownloadURL(ref(storage, storagePath));
}
