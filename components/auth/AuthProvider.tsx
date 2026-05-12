"use client";

import {
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut,
  type User,
} from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { auth } from "@/lib/firebase/client";
import { getUserProfile, type UserProfile } from "@/lib/firebase/users";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const sessionStartedAtKey = "digivax:sessionStartedAt";
const lastActivityAtKey = "digivax:lastActivityAt";
const absoluteSessionDurationMs = 8 * 60 * 60 * 1000;
const inactivityDurationMs = 30 * 60 * 1000;
const maxTimeoutMs = 2_147_483_647;
const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      return;
    }

    const nextProfile = await getUserProfile(currentUser.uid);
    setProfile(nextProfile);
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    setPersistence(auth, browserSessionPersistence)
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) {
          return;
        }

        unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
          setLoading(true);
          setUser(currentUser);

          if (currentUser) {
            ensureSessionTimestamps();
          } else {
            clearSessionTimestamps();
          }

          await loadProfile(currentUser);
          setLoading(false);
        });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    let timeoutId: number | undefined;

    const expireSession = async () => {
      clearSessionTimestamps();
      await signOut(auth);
      setUser(null);
      setProfile(null);
    };

    const scheduleExpiry = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      const delay = getMillisecondsUntilSessionExpiry();

      if (delay <= 0) {
        void expireSession();
        return;
      }

      timeoutId = window.setTimeout(expireSession, Math.min(delay, maxTimeoutMs));
    };

    const recordActivity = () => {
      sessionStorage.setItem(lastActivityAtKey, String(Date.now()));
      scheduleExpiry();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleExpiry();
      }
    };

    ensureSessionTimestamps();
    scheduleExpiry();
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      refreshProfile: async () => loadProfile(auth.currentUser),
      signOutUser: async () => {
        clearSessionTimestamps();
        await signOut(auth);
        setUser(null);
        setProfile(null);
      },
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ensureSessionTimestamps() {
  const now = Date.now();

  if (!sessionStorage.getItem(sessionStartedAtKey)) {
    sessionStorage.setItem(sessionStartedAtKey, String(now));
  }

  if (!sessionStorage.getItem(lastActivityAtKey)) {
    sessionStorage.setItem(lastActivityAtKey, String(now));
  }
}

function clearSessionTimestamps() {
  sessionStorage.removeItem(sessionStartedAtKey);
  sessionStorage.removeItem(lastActivityAtKey);
}

function getMillisecondsUntilSessionExpiry() {
  const now = Date.now();
  const startedAt = getStoredTimestamp(sessionStartedAtKey) || now;
  const lastActivityAt = getStoredTimestamp(lastActivityAtKey) || now;
  const absoluteExpiry = startedAt + absoluteSessionDurationMs;
  const inactivityExpiry = lastActivityAt + inactivityDurationMs;

  return Math.min(absoluteExpiry, inactivityExpiry) - now;
}

function getStoredTimestamp(key: string) {
  const value = Number(sessionStorage.getItem(key));

  return Number.isFinite(value) && value > 0 ? value : null;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
