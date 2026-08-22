import { api } from "./client";
import { cacheRecords, getCachedRecord, listCachedRecords, queueCreate, queueUpdate } from "../db/offlineStore";
import { flushQueue } from "../db/sync";
import type { ResourceModule } from "../types";

export async function listResource(module: ResourceModule): Promise<Record<string, unknown>[]> {
  try {
    const { items } = await api.get<{ items: Record<string, unknown>[] }>(`/${module.key}`);
    await cacheRecords(module.resource, items);
    return items;
  } catch {
    return listCachedRecords(module.resource);
  }
}

export async function getResource(module: ResourceModule, id: string): Promise<Record<string, unknown> | null> {
  try {
    const { item } = await api.get<{ item: Record<string, unknown> }>(`/${module.key}/${id}`);
    return item;
  } catch {
    return getCachedRecord(module.resource, id);
  }
}

/** Always queues through the offline store, then attempts an immediate flush. */
export async function createResource(module: ResourceModule, payload: Record<string, unknown>): Promise<string> {
  const id = await queueCreate(module.resource, payload);
  void flushQueue();
  return id;
}

export async function updateResource(
  module: ResourceModule,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await queueUpdate(module.resource, id, patch);
  void flushQueue();
}
