import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { adminRouter } from "./admin.routes.js";
import { configRouter } from "./config.routes.js";
import { relateRouter } from "./relate.routes.js";
import { syncRouter } from "./sync.routes.js";
import { createResourceRouter } from "./resource.routes.js";
import { OFFICE_STAFF, COUNTY_AGGREGATE_READERS, COUNTY_FINANCE } from "../schema/roleGroups.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/config", configRouter);
apiRouter.use("/relate", relateRouter);
apiRouter.use("/sync", syncRouter);

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
