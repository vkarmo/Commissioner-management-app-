import { api } from "./client";

export interface NamedRecord {
  id: string;
  [key: string]: unknown;
}

export function listFamilyMembers(familyId: string) {
  return api.get<{ items: NamedRecord[] }>(`/families/${familyId}/members`);
}

export function listCaseFamilies(caseId: string) {
  return api.get<{ items: NamedRecord[] }>(`/cases/${caseId}/families`);
}

export function listHearingWitnesses(hearingId: string) {
  return api.get<{ items: NamedRecord[] }>(`/hearings/${hearingId}/witnesses`);
}

export function listPeopleForPicker() {
  return api.get<{ items: NamedRecord[] }>("/people");
}

export function listFamiliesForPicker() {
  return api.get<{ items: NamedRecord[] }>("/families");
}

export function addRelationship(type: string, fromResource: string, fromId: string, toResource: string, toId: string) {
  return api.post("/relate", { type, from: { resource: fromResource, id: fromId }, to: { resource: toResource, id: toId } });
}
