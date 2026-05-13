import { ref, uploadBytes } from "firebase/storage";

import { auth, storage } from "@/lib/firebase/client";

const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
const maxUploadBytes = 10 * 1024 * 1024;
const imageCompressionQuality = 0.78;
const maxImageDimension = 1800;

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

  const uploadFile = await compressImageForStorage(file);
  const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `vaccination-records/${user.uid}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, uploadFile, {
    contentType: uploadFile.type,
    customMetadata: {
      uploadedBy: user.uid,
      originalName: file.name,
      originalSize: String(file.size),
      storedSize: String(uploadFile.size),
      compressed: String(uploadFile.size < file.size),
    },
  });

  return {
    storagePath,
    fileName: uploadFile.name,
    contentType: uploadFile.type,
    originalSize: file.size,
    storedSize: uploadFile.size,
  };
}

async function compressImageForStorage(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const scale = Math.min(
      1,
      maxImageDimension / Math.max(image.naturalWidth, image.naturalHeight, 1),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", imageCompressionQuality);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceExtension(file.name, "jpg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to prepare the image for upload."));
    image.src = url;
  });
}

function replaceExtension(fileName: string, extension: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName || "source-file"}.${extension}`;
}

export interface VaccinationRecordFilePreview {
  url: string;
  contentType: string;
  fileName: string;
}

export async function getVaccinationRecordFilePreview(
  recordId: string,
): Promise<VaccinationRecordFilePreview> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in again before opening this file.");
  }

  if (!recordId) {
    throw new Error("Missing record ID.");
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`/api/records/source?recordId=${encodeURIComponent(recordId)}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Unable to open source file.");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";

  return {
    url: URL.createObjectURL(blob),
    contentType: blob.type || response.headers.get("content-type") || "application/octet-stream",
    fileName: getFileName(contentDisposition) || `${recordId}-source-file`,
  };
}

function getFileName(contentDisposition: string) {
  const match = contentDisposition.match(/filename="([^"]+)"/i);
  return match?.[1] || "";
}
