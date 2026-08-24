import { api } from "./client";

export interface ParcelDetail {
  parcel: Record<string, unknown>;
  deeds: Array<Record<string, unknown> & { owner: Record<string, unknown> | null }>;
  adjacentParcels: Array<Record<string, unknown>>;
  openDisputes: Array<Record<string, unknown>>;
}

export function getParcelDetail(parcelId: string) {
  return api.get<ParcelDetail>(`/parcels/${parcelId}/detail`);
}
