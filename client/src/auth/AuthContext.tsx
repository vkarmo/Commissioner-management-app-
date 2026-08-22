import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import { clearSession, getStoredUser, getToken, storeSession } from "./tokenStore";
import type { SessionUser } from "../types";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  loginWithGoogleIdToken: (idToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(getStoredUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Revalidate the stored session against the server once on load; an
    // expired/invalid token clears itself out via the 401 handler in the
    // api client, so we just reflect that back into state here.
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await api.get<{ user: SessionUser }>("/auth/me");
        setUser(me);
      } catch {
        clearSession();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loginWithGoogleIdToken = useCallback(async (idToken: string) => {
    setError(null);
    try {
      const { token, user: sessionUser } = await api.post<{ token: string; user: SessionUser }>("/auth/google", {
        idToken,
      });
      storeSession(token, sessionUser);
      setUser(sessionUser);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, loginWithGoogleIdToken, logout }),
    [user, loading, error, loginWithGoogleIdToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
