import Dexie, { type Table } from "dexie";

export interface LocalRecord {
  /** Composite key `${resource}:${id}` */
  key: string;
  resource: string;
  id: string;
  data: Record<string, unknown>;
  /** True while this record has queued mutations not yet confirmed by the server. */
  pendingSync: boolean;
}

export type MutationStatus = "pending" | "syncing" | "applied" | "conflict" | "error";

export interface QueuedMutation {
  clientMutationId: string;
  resource: string;
  operation: "create" | "update";
  entityId: string;
  payload: Record<string, unknown>;
  clientUpdatedAt: string;
  baseUpdatedAt?: string;
  status: MutationStatus;
  error?: string;
  createdAt: string;
}

class CommissionersOfficeDB extends Dexie {
  records!: Table<LocalRecord, string>;
  mutations!: Table<QueuedMutation, string>;

  constructor() {
    super("commissioners-office");
    this.version(1).stores({
      records: "key, resource, id, pendingSync",
      mutations: "clientMutationId, resource, status, createdAt",
    });
  }
}

export const db = new CommissionersOfficeDB();

export function recordKey(resource: string, id: string) {
  return `${resource}:${id}`;
}
