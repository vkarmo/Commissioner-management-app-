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

// --- 1.3 location-mismatches ---------------------------------------------
// Phase 1 (schema-patch spec, 2026-09-25): Case/Parcel/PublicWorksItem/
// FireIncident store location both as a `quarter` string and as a
// LOCATED_IN edge. graphService.relate() keeps the two in sync going
// forward (see relationshipSideEffects there), but this surfaces anything
// already out of step — from data entered before that sync existed, or
// entered directly without going through relate() at all.
function locationMismatchQuery(label: string): string {
  return `
    MATCH (n:${label} {county: $county, district: $district}) WHERE n.archived = false
    OPTIONAL MATCH (n)-[:LOCATED_IN]->(q:Quarter) WHERE q.archived = false
    WITH n, q, '${label}' AS label
    WHERE (n.quarter IS NOT NULL AND trim(n.quarter) <> '' AND q IS NULL)
       OR (q IS NOT NULL AND (n.quarter IS NULL OR trim(n.quarter) = ''))
       OR (q IS NOT NULL AND n.quarter IS NOT NULL AND trim(toLower(n.quarter)) <> trim(toLower(q.name)))
    RETURN n.id AS node_id, label, n.quarter AS quarter_string,
           q.id AS located_in_quarter_id, q.name AS located_in_quarter_name
  `;
}

const LOCATION_MISMATCH_LABELS = ["Case", "Parcel", "PublicWorksItem", "FireIncident"];

analysisRouter.get("/location-mismatches", async (req, res) => {
  const scope = scopeFromRequest(req);
  const result = await runCheck(
    "location-mismatches",
    LOCATION_MISMATCH_LABELS.map(locationMismatchQuery).join("\nUNION ALL\n"),
    { county: scope.county, district: scope.district },
  );
  res.json(result);
});

// --- 2. stalled-contractors -----------------------------------------------
// Phase 2 (schema-patch spec, 2026-09-26): contractors with 2+ overdue
// PublicWorksItems, and how much they've already been paid on those items.
analysisRouter.get("/stalled-contractors", async (req, res) => {
  const scope = scopeFromRequest(req);
  const result = await runCheck(
    "stalled-contractors",
    `MATCH (k:Contractor {county: $county, district: $district})<-[:BUILT_BY]-(w:PublicWorksItem)
     WHERE k.archived = false AND w.archived = false
       AND w.status IN ['planned', 'in_progress', 'stalled']
       AND w.target_date < $today
     WITH k, collect(w) AS items
     WHERE size(items) >= 2
     OPTIONAL MATCH (e:Expenditure)-[:FOR]->(w2:PublicWorksItem)
     WHERE w2 IN items AND e.archived = false
     RETURN k.id AS contractor_id, k.name AS name,
            [i IN items | {id: i.id, title: i.title, status: i.status, target_date: i.target_date}] AS overdue_items,
            coalesce(sum(e.amount), 0) AS paid_on_overdue_items
     ORDER BY paid_on_overdue_items DESC`,
    { county: scope.county, district: scope.district, today: todayISODate() },
  );
  res.json(result);
});

// Exported for the Phase 0 test suite (avoids re-deriving "today" with a
// slightly different clock read than the routes above used).
export const analysisDateHelpers = { todayISODate, yearsAgoISODate };
