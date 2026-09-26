import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { adminRouter } from "./admin.routes.js";
import { configRouter } from "./config.routes.js";
import { relateRouter } from "./relate.routes.js";
import { syncRouter } from "./sync.routes.js";
import { createResourceRouter } from "./resource.routes.js";
import { fireIncidentActionsRouter } from "./fireIncidentActions.routes.js";
import { landRecordsRouter } from "./landRecords.routes.js";
import { communityRouter } from "./community.routes.js";
import { intakeRouter } from "./intake.routes.js";
import { analysisRouter } from "./analysis.routes.js";
import { casePartyReviewRouter } from "./casePartyReview.routes.js";
import { contractorReviewRouter } from "./contractorReview.routes.js";
import { contractorLinksRouter } from "./contractorLinks.routes.js";
import { familyLinksRouter } from "./familyLinks.routes.js";
import { OFFICE_STAFF, COUNTY_AGGREGATE_READERS, COUNTY_FINANCE } from "../schema/roleGroups.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/config", configRouter);
apiRouter.use("/relate", relateRouter);
apiRouter.use("/sync", syncRouter);
apiRouter.use("/intake", intakeRouter);
apiRouter.use("/community", communityRouter);
apiRouter.use("/analysis", analysisRouter);
apiRouter.use("/case-party-review", casePartyReviewRouter);

// The original 7-module schema: office business only, per design recap §4
// ("county-scoped roles ... not case/land detail").
apiRouter.use("/people", createResourceRouter("Person", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
apiRouter.use("/cases", createResourceRouter("Case", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
apiRouter.use("/parcels", createResourceRouter("Parcel", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
apiRouter.use(
  "/public-works",
  createResourceRouter("PublicWorksItem", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }),
);
apiRouter.use(
  "/revenue",
  createResourceRouter("RevenueRecord", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }),
);
apiRouter.use("/meetings", createResourceRouter("Meeting", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
apiRouter.use(
  "/communications",
  createResourceRouter("CommunicationLog", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }),
);

// Case Tracker / Land Records support entities.
apiRouter.use("/officials", createResourceRouter("Official", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
apiRouter.use("/hearings", createResourceRouter("Hearing", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
apiRouter.use("/deeds", createResourceRouter("Deed", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
// Phase 3 (schema-patch spec): families and witnesses.
apiRouter.use("/families", createResourceRouter("Family", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }));
apiRouter.use(familyLinksRouter);
// Retired (Phase 1.5, schema-patch spec): read/update/archive stay open
// for existing records, but no new Dispute can be created — file a
// Case{type:'land'} instead. See m4RetireDisputes.ts.
apiRouter.use(
  "/disputes",
  createResourceRouter("Dispute", {
    readRoles: OFFICE_STAFF,
    writeRoles: OFFICE_STAFF,
    createDisabledMessage: "Dispute is retired — record a land dispute as a Case with type 'land' instead.",
  }),
);
apiRouter.use("/parcels", landRecordsRouter);

// Fire Incident Reporting (build prompt module 8).
apiRouter.use(
  "/fire-incidents",
  createResourceRouter("FireIncident", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }),
);
apiRouter.use("/fire-incidents", fireIncidentActionsRouter);
apiRouter.use(
  "/fire-stations",
  createResourceRouter("FireStation", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }),
);
apiRouter.use(
  "/fire-apparatus",
  createResourceRouter("FireApparatus", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }),
);
apiRouter.use(
  "/fire-agencies",
  createResourceRouter("FireAgency", { readRoles: OFFICE_STAFF, writeRoles: OFFICE_STAFF }),
);

// Budget / fund-tracking layer: office staff write (Clerks transcribe
// county decisions per the RECORDED_VIA pattern); county roles get read
// access to the aggregate financial picture once they exist (design §7).
const budgetReadRoles = [...OFFICE_STAFF, ...COUNTY_AGGREGATE_READERS];
const budgetWriteRoles = [...OFFICE_STAFF, ...COUNTY_FINANCE];

apiRouter.use("/budgets", createResourceRouter("Budget", { readRoles: budgetReadRoles, writeRoles: budgetWriteRoles }));
apiRouter.use(
  "/budget-line-items",
  createResourceRouter("BudgetLineItem", { readRoles: budgetReadRoles, writeRoles: budgetWriteRoles }),
);
apiRouter.use(
  "/disbursements",
  createResourceRouter("Disbursement", { readRoles: budgetReadRoles, writeRoles: budgetWriteRoles }),
);
apiRouter.use(
  "/expenditures",
  createResourceRouter("Expenditure", { readRoles: budgetReadRoles, writeRoles: budgetWriteRoles }),
);
apiRouter.use(
  "/approval-actions",
  createResourceRouter("ApprovalAction", { readRoles: budgetReadRoles, writeRoles: budgetWriteRoles }),
);
// Phase 2 (schema-patch spec): the project money trail — built by/paid to.
apiRouter.use(
  "/contractors",
  createResourceRouter("Contractor", { readRoles: budgetReadRoles, writeRoles: budgetWriteRoles }),
);
apiRouter.use("/contractor-review", contractorReviewRouter);
apiRouter.use(contractorLinksRouter);
