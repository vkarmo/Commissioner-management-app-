import { api } from "./client";

export interface WaterPointSuggestion {
  id: string;
  title: string;
  quarter?: string;
  matchType: "gps" | "quarter" | "office";
  distanceKm: number | null;
  [key: string]: unknown;
}

export function getNearestWaterPoints(incidentId: string) {
  return api.get<{ items: WaterPointSuggestion[] }>(`/fire-incidents/${incidentId}/nearest-water-points`);
}

export function respondLocally(incidentId: string, fireStationId: string) {
  return api.post<{ item: Record<string, unknown> }>(`/fire-incidents/${incidentId}/respond-locally`, {
    fireStationId,
  });
}

export function referToAgency(incidentId: string, fireAgencyId: string, notes?: string) {
  return api.post<{ item: Record<string, unknown> }>(`/fire-incidents/${incidentId}/refer`, {
    fireAgencyId,
    notes,
  });
}

export function dispatchScout(incidentId: string, scoutType: "Person" | "Official", scoutId: string) {
  return api.post<{ item: Record<string, unknown> }>(`/fire-incidents/${incidentId}/dispatch-scout`, {
    scoutType,
    scoutId,
  });
}

export interface ScoutReportPayload {
  result: "confirmed" | "false_alarm";
  severity?: "minor" | "moderate" | "severe";
  channel: "whatsapp" | "radio";
  notes?: string;
}

export function submitScoutReport(incidentId: string, payload: ScoutReportPayload) {
  return api.post<{ item: Record<string, unknown> }>(`/fire-incidents/${incidentId}/scout-report`, payload);
}
