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
import {
  clearSessionTimestamps,
  ensureSessionTimestamps,
  getMillisecondsUntilSessionExpiry,
  maxBrowserTimeoutMs,
  recordSessionActivity,
  sessionActivityEvents,
} from "@/lib/auth/session";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

    // Session persistence makes Firebase forget the user when the browser session closes.
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

      timeoutId = window.setTimeout(expireSession, Math.min(delay, maxBrowserTimeoutMs));
    };

    const recordActivity = () => {
      recordSessionActivity();
      scheduleExpiry();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleExpiry();
      }
    };

    ensureSessionTimestamps();
    scheduleExpiry();
    // User activity refreshes the inactivity window, but not the hard 8-hour cap.
    sessionActivityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      sessionActivityEvents.forEach((eventName) => {
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

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
