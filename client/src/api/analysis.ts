import { api } from "./client";

export interface CheckResult<T = Record<string, unknown>> {
  check: string;
  generated_at: string;
  findings: T[];
}

export function runQuartersLeftOut() {
  return api.get<CheckResult>("/analysis/quarters-left-out");
}

export function runLineItemDrift() {
  return api.get<CheckResult>("/analysis/line-item-drift");
}

export function runUnapprovedDisbursements() {
  return api.get<CheckResult>("/analysis/unapproved-disbursements");
}

export function runRepeatLandCases() {
  return api.get<CheckResult>("/analysis/repeat-land-cases");
}

export function runLocationMismatches() {
  return api.get<CheckResult>("/analysis/location-mismatches");
}

export function runStalledContractors() {
  return api.get<CheckResult>("/analysis/stalled-contractors");
}
