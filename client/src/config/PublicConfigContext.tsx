import { createContext, useContext } from "react";
import type { SetupStatus } from "../api/setup";

export interface PublicConfigValue {
  status: SetupStatus;
  refresh: () => Promise<void>;
}

export const PublicConfigContext = createContext<PublicConfigValue | null>(null);

export function usePublicConfig(): PublicConfigValue {
  const ctx = useContext(PublicConfigContext);
  if (!ctx) throw new Error("usePublicConfig must be used within PublicConfigContext.Provider");
  return ctx;
}

const STATUS_CACHE_KEY = "co_setup_status_cache";

export function readCachedStatus(): SetupStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SetupStatus) : null;
  } catch {
    return null;
  }
}

export function writeCachedStatus(status: SetupStatus) {
  try {
    localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(status));
  } catch {
    // best-effort — private browsing / storage full
  }
}
