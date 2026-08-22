import { db, recordKey, type QueuedMutation } from "./db";

function uuid(): string {
  return crypto.randomUUID();
}

export async function cacheRecords(resource: string, items: Record<string, unknown>[]) {
  await db.records.bulkPut(
    items.map((item) => ({
      key: recordKey(resource, item.id as string),
      resource,
      id: item.id as string,
      data: item,
      pendingSync: false,
    })),
  );
}

export async function cacheRecord(resource: string, item: Record<string, unknown>, pendingSync = false) {
  await db.records.put({
    key: recordKey(resource, item.id as string),
    resource,
    id: item.id as string,
    data: item,
    pendingSync,
  });
}

export async function listCachedRecords(resource: string) {
  const rows = await db.records.where("resource").equals(resource).toArray();
  return rows.map((r) => r.data);
}

export async function getCachedRecord(resource: string, id: string) {
  const row = await db.records.get(recordKey(resource, id));
  return row?.data ?? null;
}

/** Queues an offline-first create. Returns the client-generated id immediately. */
export async function queueCreate(resource: string, payload: Record<string, unknown>) {
  const id = uuid();
  const now = new Date().toISOString();
  const fullPayload = { ...payload, id };

  await cacheRecord(resource, { ...fullPayload, created_at: now, updated_at: now, archived: false }, true);

  const mutation: QueuedMutation = {
    clientMutationId: uuid(),
    resource,
    operation: "create",
    entityId: id,
    payload,
    clientUpdatedAt: now,
    status: "pending",
    createdAt: now,
  };
  await db.mutations.put(mutation);
  return id;
}

/** Queues an offline-first update against a record already known locally. */
export async function queueUpdate(resource: string, id: string, patch: Record<string, unknown>) {
  const now = new Date().toISOString();
  const existing = await getCachedRecord(resource, id);
  const baseUpdatedAt = (existing?.updated_at as string) || undefined;

  await cacheRecord(resource, { ...(existing || { id }), ...patch, updated_at: now }, true);

  const mutation: QueuedMutation = {
    clientMutationId: uuid(),
    resource,
    operation: "update",
    entityId: id,
    payload: patch,
    clientUpdatedAt: now,
    baseUpdatedAt,
    status: "pending",
    createdAt: now,
  };
  await db.mutations.put(mutation);
}

export async function pendingMutationCount(): Promise<number> {
  return db.mutations.where("status").anyOf("pending", "error").count();
}
