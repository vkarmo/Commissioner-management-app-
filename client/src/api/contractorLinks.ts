import { api } from "./client";

export interface Contractor {
  id: string;
  name: string;
  registration_number?: string;
  phone?: string;
  owner_name?: string;
  notes?: string;
}

export interface PublicWorksItemSummary {
  id: string;
  title: string;
}

export function listContractors() {
  return api.get<{ items: Contractor[] }>("/contractors");
}

export function listPublicWorksItemsForPicker() {
  return api.get<{ items: PublicWorksItemSummary[] }>("/public-works");
}

export function getPublicWorksContractor(publicWorksItemId: string) {
  return api.get<{ contractor: Contractor | null }>(`/public-works/${publicWorksItemId}/contractor`);
}

export function setPublicWorksContractor(publicWorksItemId: string, contractorId: string) {
  return api.post("/relate", {
    type: "BUILT_BY",
    from: { resource: "PublicWorksItem", id: publicWorksItemId },
    to: { resource: "Contractor", id: contractorId },
  });
}

export function getExpenditureLinks(expenditureId: string) {
  return api.get<{ contractor: Contractor | null; publicWorksItem: PublicWorksItemSummary | null }>(
    `/expenditures/${expenditureId}/links`,
  );
}

export function setExpenditureContractor(expenditureId: string, contractorId: string) {
  return api.post("/relate", {
    type: "PAID_TO",
    from: { resource: "Expenditure", id: expenditureId },
    to: { resource: "Contractor", id: contractorId },
  });
}

export function setExpenditurePublicWorksItem(expenditureId: string, publicWorksItemId: string) {
  return api.post("/relate", {
    type: "FOR",
    from: { resource: "Expenditure", id: expenditureId },
    to: { resource: "PublicWorksItem", id: publicWorksItemId },
  });
}
