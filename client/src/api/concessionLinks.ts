import { api } from "./client";
import type { NamedRecord } from "./familyLinks";
import type { PublicWorksItemSummary } from "./contractorLinks";

export function listConcessionQuarters(concessionId: string) {
  return api.get<{ items: NamedRecord[] }>(`/concessions/${concessionId}/quarters`);
}

export function listConcessionCommitments(concessionId: string) {
  return api.get<{ items: NamedRecord[] }>(`/concessions/${concessionId}/commitments`);
}

export function listCommitmentQuarters(commitmentId: string) {
  return api.get<{ items: NamedRecord[] }>(`/commitments/${commitmentId}/quarters`);
}

export function listQuartersForPicker() {
  return api.get<{ items: NamedRecord[] }>("/community/quarters");
}

export function listCommitmentsForPicker() {
  return api.get<{ items: NamedRecord[] }>("/commitments");
}

export function getCommunicationAbout(logId: string) {
  return api.get<{ commitment: NamedRecord | null; publicWorksItem: PublicWorksItemSummary | null }>(
    `/communications/${logId}/about`,
  );
}
