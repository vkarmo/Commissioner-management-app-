import type { ResourceModule } from "./types";

/**
 * Field configuration for each of the 12 business resources. This drives
 * the generic list/detail/form UI (src/pages/ResourcePage.tsx) so adding
 * a new module is a config entry here, not a new page — deliberately
 * mirrors the server's schema-driven approach in resources.ts.
 */
export const MODULES: ResourceModule[] = [
  {
    key: "people",
    resource: "Person",
    label: "People",
    titleField: "full_name",
    fields: [
      { key: "full_name", label: "Full name", type: "text", required: true },
      { key: "phone", label: "Phone", type: "text" },
      { key: "quarter", label: "Quarter/Town", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "cases",
    resource: "Case",
    label: "Cases",
    titleField: "case_number",
    fields: [
      { key: "case_number", label: "Case number", type: "text", required: true },
      { key: "type", label: "Type", type: "text", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        options: ["open", "hearing_scheduled", "referred", "resolved", "closed"],
      },
      { key: "filed_date", label: "Filed date", type: "date" },
      { key: "summary", label: "Summary", type: "textarea" },
    ],
  },
  {
    key: "parcels",
    resource: "Parcel",
    label: "Land Parcels",
    titleField: "parcel_ref",
    fields: [
      { key: "parcel_ref", label: "Parcel reference", type: "text" },
      { key: "quarter", label: "Quarter/Town", type: "text" },
      { key: "location_desc", label: "Location description", type: "textarea" },
      { key: "status", label: "Status", type: "text" },
    ],
  },
  {
    key: "public-works",
    resource: "PublicWorksItem",
    label: "Public Works",
    titleField: "title",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "category", label: "Category", type: "text" },
      { key: "quarter", label: "Quarter/Town", type: "text" },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        options: ["planned", "funded", "in_progress", "completed", "stalled"],
      },
      { key: "target_date", label: "Target date", type: "date" },
    ],
  },
  {
    key: "revenue",
    resource: "RevenueRecord",
    label: "Revenue",
    titleField: "source",
    fields: [
      { key: "source", label: "Source", type: "text", required: true },
      { key: "amount", label: "Amount (LRD)", type: "number", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "receipt_reference", label: "Receipt reference", type: "text" },
    ],
  },
  {
    key: "meetings",
    resource: "Meeting",
    label: "Meetings",
    titleField: "title",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "minutes", label: "Minutes", type: "textarea" },
    ],
  },
  {
    key: "communications",
    resource: "CommunicationLog",
    label: "Communications",
    titleField: "summary",
    fields: [
      {
        key: "channel",
        label: "Channel",
        type: "select",
        required: true,
        options: ["whatsapp", "sms", "phone", "letter", "in_person", "email"],
      },
      { key: "direction", label: "Direction", type: "select", options: ["inbound", "outbound"] },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "contact_name", label: "Contact name", type: "text" },
      { key: "contact_phone", label: "Contact phone", type: "text" },
      { key: "summary", label: "Summary", type: "textarea", required: true },
    ],
  },
  {
    key: "budgets",
    resource: "Budget",
    label: "Budgets",
    titleField: "fiscal_year",
    fields: [
      { key: "fiscal_year", label: "Fiscal year", type: "text", required: true },
      { key: "source", label: "Source", type: "text", required: true },
      { key: "total_amount", label: "Total amount (LRD)", type: "number", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        required: true,
        options: ["proposed", "approved", "active", "closed"],
      },
    ],
  },
  {
    key: "budget-line-items",
    resource: "BudgetLineItem",
    label: "Budget Line Items",
    titleField: "category",
    fields: [
      { key: "category", label: "Category", type: "text", required: true },
      { key: "allocated_amount", label: "Allocated amount (LRD)", type: "number", required: true },
      { key: "quarter_target", label: "Quarter target", type: "text" },
    ],
  },
  {
    key: "disbursements",
    resource: "Disbursement",
    label: "Disbursements",
    titleField: "reference_number",
    fields: [
      { key: "amount", label: "Amount (LRD)", type: "number", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "purpose", label: "Purpose", type: "text" },
      { key: "reference_number", label: "Reference number", type: "text" },
    ],
  },
  {
    key: "expenditures",
    resource: "Expenditure",
    label: "Expenditures",
    titleField: "payee",
    fields: [
      { key: "payee", label: "Vendor / payee", type: "text", required: true },
      { key: "amount", label: "Amount (LRD)", type: "number", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "receipt_reference", label: "Receipt reference", type: "text" },
    ],
  },
  {
    key: "approval-actions",
    resource: "ApprovalAction",
    label: "Approval Actions",
    titleField: "approving_body",
    fields: [
      {
        key: "approving_body",
        label: "Approving body",
        type: "select",
        required: true,
        options: ["County Council", "Superintendent", "Finance Officer"],
      },
      {
        key: "decision",
        label: "Decision",
        type: "select",
        required: true,
        options: ["approved", "rejected", "pending", "revised"],
      },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "notes", label: "Notes (paper/verbal trail)", type: "textarea" },
    ],
  },
];

export function findModule(key: string): ResourceModule | undefined {
  return MODULES.find((m) => m.key === key);
}
