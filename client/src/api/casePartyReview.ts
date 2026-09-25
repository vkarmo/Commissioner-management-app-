import { api } from "./client";

export interface PersonCandidate {
  id: string;
  full_name: string;
  phone: string | null;
  match_type: "phone" | "name";
}

export interface CasePartyReviewItem {
  case: Record<string, unknown> & { id: string; case_number: string };
  reporterUnresolved: boolean;
  respondentUnresolved: boolean;
  reporterCandidates: PersonCandidate[];
  respondentCandidates: PersonCandidate[];
}

export function listCasePartyReview() {
  return api.get<{ items: CasePartyReviewItem[] }>("/case-party-review");
}

export function confirmCaseParty(caseId: string, field: "reporter" | "respondent", personId: string) {
  return api.post(`/case-party-review/${caseId}/confirm`, { field, personId });
}

export function createCasePartyPerson(
  caseId: string,
  field: "reporter" | "respondent",
  full_name: string,
  phone?: string,
) {
  return api.post(`/case-party-review/${caseId}/new-person`, { field, full_name, phone });
}
