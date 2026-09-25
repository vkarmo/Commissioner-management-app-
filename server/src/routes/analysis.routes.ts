import { Router } from "express";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { getSession } from "../db/neo4j.js";
import type { Role } from "../schema/resources.js";

/**
 * Phase 0 of the analysis layer (schema-patch spec, 2026-09-25): read-only
 * checks over the existing graph, no schema changes. Every query takes
 * $county/$district from the caller's session scope — never from the
 * request — and filters archived = false on every matched node, per the
 * spec's conventions.
 *
 * Not exposed to Clerk: findings can name specific people (parties,
 * witnesses, contractors), so this is Commissioner/Official/SuperAdmin only.
 */
const ANALYSIS_ROLES: Role[] = ["Commissioner", "Official", "SuperAdmin"];

export const analysisRouter = Router();
analysisRouter.use(requireAuth, requireRole(...ANALYSIS_ROLES));

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearsAgoISODate(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

interface CheckResult {
  check: string;
  generated_at: string;
  findings: Record<string, unknown>[];
}

async function runCheck(checkName: string, cypher: string, params: Record<string, unknown>): Promise<CheckResult> {
  const session = getSession("READ");
  try {
    const result = await session.run(cypher, params);
    return {
      check: checkName,
      generated_at: new Date().toISOString(),
      findings: result.records.map((r) => r.toObject()),
    };
  } finally {
    await session.close();
  }
}

// --- 0.1 quarters-left-out ---------------------------------------------
// Quarters with no public works item (in the last 3 years) and no budget
// line targeting them.
analysisRouter.get("/quarters-left-out", async (req, res) => {
  const scope = scopeFromRequest(req);
  const result = await runCheck(
    "quarters-left-out",
    `MATCH (q:Quarter {county: $county, district: $district})
     WHERE q.archived = false
       AND NOT EXISTS {
         MATCH (q)<-[:LOCATED_IN]-(w:PublicWorksItem)
         WHERE w.archived = false AND w.created_at >= $since
       }
       AND NOT EXISTS {
         MATCH (q)<-[:TARGETS]-(li:BudgetLineItem)
         WHERE li.archived = false
       }
     RETURN q.id AS quarter_id, q.name AS quarter, q.population AS population
     ORDER BY population DESC`,
    { county: scope.county, district: scope.district, since: yearsAgoISODate(3) },
  );
  res.json(result);
});

// --- 0.2 line-item-drift -------------------------------------------------
// Budget lines where disbursed/spent amounts don't add up.
analysisRouter.get("/line-item-drift", async (req, res) => {
  const scope = scopeFromRequest(req);
  const result = await runCheck(
    "line-item-drift",
    `MATCH (b:Budget {county: $county, district: $district})-[:ALLOCATED_TO]->(li:BudgetLineItem)
     WHERE b.archived = false AND li.archived = false
     OPTIONAL MATCH (li)-[:DISBURSED_AS]->(d:Disbursement)
     WHERE d.archived = false
     WITH b, li, collect(d) AS ds, coalesce(sum(d.amount), 0) AS disbursed
     OPTIONAL MATCH (d2:Disbursement)-[:SPENT_AS]->(e:Expenditure)
     WHERE d2 IN ds AND e.archived = false
     WITH b, li, disbursed, coalesce(sum(e.amount), 0) AS spent
     WHERE disbursed > li.allocated_amount
        OR spent > disbursed
        OR (disbursed > 0 AND spent = 0)
     RETURN b.id AS budget_id, b.fiscal_year AS fiscal_year, b.source AS source,
            li.id AS line_item_id, li.category AS category,
            li.allocated_amount AS allocated, disbursed, spent,
            CASE
              WHEN disbursed > li.allocated_amount THEN 'over_disbursed'
              WHEN spent > disbursed THEN 'spent_more_than_disbursed'
              ELSE 'disbursed_not_spent'
            END AS flag`,
    { county: scope.county, district: scope.district },
  );
  res.json(result);
});

// --- 0.3 unapproved-disbursements ---------------------------------------
// Money disbursed from a budget with no approved ApprovalAction.
analysisRouter.get("/unapproved-disbursements", async (req, res) => {
  const scope = scopeFromRequest(req);
  const result = await runCheck(
    "unapproved-disbursements",
    `MATCH (b:Budget {county: $county, district: $district})
           -[:ALLOCATED_TO]->(:BudgetLineItem)-[:DISBURSED_AS]->(d:Disbursement)
     WHERE b.archived = false AND d.archived = false
       AND NOT EXISTS {
         MATCH (a:ApprovalAction {decision: 'approved'})-[:ON]->(b)
         WHERE a.archived = false
       }
     RETURN b.id AS budget_id, b.fiscal_year AS fiscal_year, b.source AS source,
            count(d) AS disbursements, sum(d.amount) AS total`,
    { county: scope.county, district: scope.district },
  );
  res.json(result);
});

// --- 0.4 repeat-land-cases (basic) --------------------------------------
// Parcels with more than one land case. Phase 3 replaces this with the
// full version (families + witnesses).
analysisRouter.get("/repeat-land-cases", async (req, res) => {
  const scope = scopeFromRequest(req);
  const result = await runCheck(
    "repeat-land-cases",
    `MATCH (p:Parcel {county: $county, district: $district})<-[:CONCERNS]-(c:Case {type: 'land'})
     WHERE p.archived = false AND c.archived = false
     WITH p, collect(c) AS cases
     WHERE size(cases) > 1
     OPTIONAL MATCH (c2:Case)-[:INVOLVES]->(x:Person)
     WHERE c2 IN cases
     RETURN p.id AS parcel_id, p.parcel_ref AS parcel_ref, size(cases) AS case_count,
            [c IN cases | {id: c.id, number: c.case_number, status: c.status, filed: c.filed_date}] AS cases,
            collect(DISTINCT x.full_name) AS parties`,
    { county: scope.county, district: scope.district },
  );
  res.json(result);
});

// Exported for the Phase 0 test suite (avoids re-deriving "today" with a
// slightly different clock read than the routes above used).
export const analysisDateHelpers = { todayISODate, yearsAgoISODate };
