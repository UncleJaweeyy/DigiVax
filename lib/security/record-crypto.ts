import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import type { EncryptedDocumentField } from "@/types/records";

const algorithm = "aes-256-gcm";
const keyId = process.env.DIGIVAX_RECORD_ENCRYPTION_KEY_ID || "record-key-v1";

export function encryptRecordPayload<T>(payload: T): EncryptedDocumentField {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: "AES-256-GCM",
    kid: keyId,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
    encryptedAt: new Date().toISOString(),
  };
}

export function decryptRecordPayload<T>(field: unknown): T | null {
  if (!isEncryptedDocumentField(field)) {
    return null;
  }

  const decipher = createDecipheriv(
    algorithm,
    getEncryptionKey(),
    Buffer.from(field.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(field.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(field.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as T;
}

export function encryptBytes(data: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    metadata: {
      encrypted: "true",
      alg: "AES-256-GCM",
      kid: keyId,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      encryptedAt: new Date().toISOString(),
    },
  };
}

export function decryptBytes(data: Buffer, metadata: Record<string, string | undefined>) {
  if (metadata.encrypted !== "true") {
    return data;
  }

  if (metadata.alg !== "AES-256-GCM" || !metadata.iv || !metadata.tag) {
    throw new Error("Source file encryption metadata is invalid.");
  }

  const decipher = createDecipheriv(
    algorithm,
    getEncryptionKey(),
    Buffer.from(metadata.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(metadata.tag, "base64"));

  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function getEncryptionKey() {
  const value = process.env.DIGIVAX_RECORD_ENCRYPTION_KEY;

  if (!value) {
    throw new Error(
      "DIGIVAX_RECORD_ENCRYPTION_KEY is required. Use a 32-byte base64 or 64-character hex key.",
    );
  }

  const trimmed = value.trim();
  const decoded = decodeExplicitKey(trimmed);

  if (decoded) {
    return decoded;
  }

  // Development fallback for passphrases. Production should use a random 32-byte key or Cloud KMS.
  return createHash("sha256").update(trimmed, "utf8").digest();
}

function decodeExplicitKey(value: string) {
  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const buffer = Buffer.from(value, "base64");
    return buffer.length === 32 ? buffer : null;
  } catch {
    return null;
  }
}

function isEncryptedDocumentField(value: unknown): value is EncryptedDocumentField {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const field = value as Partial<EncryptedDocumentField>;

  return (
    field.alg === "AES-256-GCM"
    && typeof field.kid === "string"
    && typeof field.iv === "string"
    && typeof field.ciphertext === "string"
    && typeof field.tag === "string"
  );
}
