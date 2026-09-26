import { api } from "./client";

export interface PayeeGroup {
  normalizedName: string;
  payeeVariants: string[];
  expenditureIds: string[];
  totalAmount: number;
  count: number;
}

export type ContractorRef =
  | { id: string }
  | { name: string; registration_number?: string; phone?: string; owner_name?: string; notes?: string };

export function listContractorReviewGroups() {
  return api.get<{ groups: PayeeGroup[] }>("/contractor-review");
}

export function confirmContractorGroup(expenditureIds: string[], contractor: ContractorRef) {
  return api.post("/contractor-review/confirm", { expenditureIds, contractor });
}

export function dismissContractorGroup(expenditureIds: string[]) {
  return api.post("/contractor-review/dismiss", { expenditureIds });
}
