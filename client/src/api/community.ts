import { api } from "./client";

export interface QuarterDirectoryEntry {
  id: string;
  name: string;
  district: string;
  county: string;
  chief_name?: string;
  chief_phone?: string;
  population?: number;
}

export function listQuarters() {
  return api.get<{ items: QuarterDirectoryEntry[] }>("/community/quarters");
}

export function updateQuarter(id: string, patch: Partial<QuarterDirectoryEntry>) {
  return api.patch<{ item: QuarterDirectoryEntry }>(`/community/quarters/${id}`, patch);
}
