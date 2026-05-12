"use client";

const sessionStartedAtKey = "digivax:sessionStartedAt";
const lastActivityAtKey = "digivax:lastActivityAt";

export const absoluteSessionDurationMs = 8 * 60 * 60 * 1000;
export const inactivityDurationMs = 30 * 60 * 1000;
export const maxBrowserTimeoutMs = 2_147_483_647;
export const sessionActivityEvents = [
  "click",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
] as const;

export function ensureSessionTimestamps() {
  const now = Date.now();

  // The first timestamp enforces the absolute session limit across refreshes.
  if (!sessionStorage.getItem(sessionStartedAtKey)) {
    sessionStorage.setItem(sessionStartedAtKey, String(now));
  }

  // The activity timestamp drives the rolling inactivity timeout.
  if (!sessionStorage.getItem(lastActivityAtKey)) {
    sessionStorage.setItem(lastActivityAtKey, String(now));
  }
}

export function recordSessionActivity() {
  sessionStorage.setItem(lastActivityAtKey, String(Date.now()));
}

export function clearSessionTimestamps() {
  sessionStorage.removeItem(sessionStartedAtKey);
  sessionStorage.removeItem(lastActivityAtKey);
}

export function getMillisecondsUntilSessionExpiry() {
  const now = Date.now();
  const startedAt = getStoredTimestamp(sessionStartedAtKey) || now;
  const lastActivityAt = getStoredTimestamp(lastActivityAtKey) || now;
  const absoluteExpiry = startedAt + absoluteSessionDurationMs;
  const inactivityExpiry = lastActivityAt + inactivityDurationMs;

  // Whichever rule expires first wins: 8 hours total or 30 minutes idle.
  return Math.min(absoluteExpiry, inactivityExpiry) - now;
}

function getStoredTimestamp(key: string) {
  const value = Number(sessionStorage.getItem(key));

  return Number.isFinite(value) && value > 0 ? value : null;
}
