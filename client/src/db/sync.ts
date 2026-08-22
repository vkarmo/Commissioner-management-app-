import { api } from "../api/client";
import { db } from "./db";
import { cacheRecord } from "./offlineStore";

interface SyncResult {
  clientMutationId: string;
  status: "applied" | "conflict" | "error";
  item?: Record<string, unknown>;
  serverItem?: Record<string, unknown>;
  error?: string;
}

let syncing = false;

/**
 * Flushes the local mutation queue to the server. Safe to call repeatedly
 * (e.g. on reconnect, on an interval, or after every queued write) — it
 * no-ops if a sync is already in flight or the queue is empty.
 */
export async function flushQueue(): Promise<{ applied: number; conflicts: number; errors: number }> {
  if (syncing) return { applied: 0, conflicts: 0, errors: 0 };
  if (!navigator.onLine) return { applied: 0, conflicts: 0, errors: 0 };

  syncing = true;
  try {
    const pending = await db.mutations.where("status").anyOf("pending", "error").sortBy("createdAt");
    if (pending.length === 0) return { applied: 0, conflicts: 0, errors: 0 };

    await db.mutations.bulkPut(pending.map((m) => ({ ...m, status: "syncing" as const })));

    const { results } = await api.post<{ results: SyncResult[] }>("/sync/batch", {
      mutations: pending.map(({ status: _s, error: _e, ...m }) => m),
    });

    let applied = 0;
    let conflicts = 0;
    let errors = 0;

    for (const result of results) {
      const mutation = pending.find((m) => m.clientMutationId === result.clientMutationId);
      if (!mutation) continue;

      if (result.status === "applied" && result.item) {
        await cacheRecord(mutation.resource, result.item, false);
        await db.mutations.delete(mutation.clientMutationId);
        applied++;
      } else if (result.status === "conflict") {
        await db.mutations.put({ ...mutation, status: "conflict" });
        if (result.serverItem) {
          // Keep the server's version visible; the clerk resolves via the
          // conflicts review screen before the local edit is retried.
          await cacheRecord(mutation.resource, result.serverItem, true);
        }
        conflicts++;
      } else {
        await db.mutations.put({ ...mutation, status: "error", error: result.error });
        errors++;
      }
    }

    return { applied, conflicts, errors };
  } finally {
    syncing = false;
  }
}

export function startAutoSync() {
  flushQueue();
  window.addEventListener("online", () => void flushQueue());
  const interval = setInterval(() => void flushQueue(), 30_000);
  return () => clearInterval(interval);
}
