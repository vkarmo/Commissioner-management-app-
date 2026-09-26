import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF, COUNTY_AGGREGATE_READERS, COUNTY_FINANCE } from "../schema/roleGroups.js";
import { getSession } from "../db/neo4j.js";
import { createNode, getNode, NotFoundError, relate, updateNode, ValidationError } from "../services/graphService.js";

/**
 * Migration M5 (Phase 2, schema-patch spec, 2026-09-26): Expenditure.payee
 * is free text, so the same vendor often appears under several spellings.
 * This groups unreviewed expenditures by a normalized payee name and lets
 * a clerk confirm each group as a Contractor (creating it if needed, and
 * PAID_TO-linking every expenditure in the group) or dismiss it as "not a
 * contractor" (a refund, fuel, allowances, etc.) — never auto-merged.
 * Expenditure.contractor_review_status tracks the decision so a group
 * doesn't keep reappearing once resolved.
 */
export const contractorReviewRouter = Router();
const READ_ROLES = [...OFFICE_STAFF, ...COUNTY_AGGREGATE_READERS];
const WRITE_ROLES = [...OFFICE_STAFF, ...COUNTY_FINANCE];
contractorReviewRouter.use(requireAuth);

function normalizePayee(raw: string): string {
  let s = raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/(\s+(inc|ltd|llc|co|corp|company))+$/i, "").trim();
  return s;
}

interface PayeeGroup {
  normalizedName: string;
  payeeVariants: string[];
  expenditureIds: string[];
  totalAmount: number;
  count: number;
}

contractorReviewRouter.get("/", requireRole(...READ_ROLES), async (req, res) => {
  const scope = scopeFromRequest(req);
  const session = getSession("READ");
  try {
    const result = await session.run(
      `MATCH (e:Expenditure {county: $county, district: $district})
       WHERE e.archived = false
         AND e.contractor_review_status IS NULL
         AND NOT EXISTS { MATCH (e)-[:PAID_TO]->(:Contractor) }
       RETURN e.id AS id, e.payee AS payee, e.amount AS amount`,
      { county: scope.county, district: scope.district },
    );

    const groups = new Map<string, PayeeGroup>();
    for (const record of result.records) {
      const id = record.get("id") as string;
      const payee = record.get("payee") as string;
      const amount = record.get("amount") as number;
      const key = normalizePayee(payee);
      let group = groups.get(key);
      if (!group) {
        group = { normalizedName: key, payeeVariants: [], expenditureIds: [], totalAmount: 0, count: 0 };
        groups.set(key, group);
      }
      if (!group.payeeVariants.includes(payee)) group.payeeVariants.push(payee);
      group.expenditureIds.push(id);
      group.totalAmount += amount;
      group.count += 1;
    }

    res.json({ groups: Array.from(groups.values()).sort((a, b) => b.totalAmount - a.totalAmount) });
  } finally {
    await session.close();
  }
});

const contractorRefSchema = z.union([
  z.object({ id: z.string().min(1) }),
  z.object({
    name: z.string().min(1),
    registration_number: z.string().optional(),
    phone: z.string().optional(),
    owner_name: z.string().optional(),
    notes: z.string().optional(),
  }),
]);

const confirmSchema = z.object({
  expenditureIds: z.array(z.string().min(1)).min(1),
  contractor: contractorRefSchema,
});

contractorReviewRouter.post("/confirm", requireRole(...WRITE_ROLES), async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    const contractorInput = parsed.data.contractor;
    const contractor =
      "id" in contractorInput
        ? await getNode("Contractor", contractorInput.id, scope)
        : await createNode({ resource: "Contractor", props: contractorInput, scope, actorEmail: req.user!.email });

    for (const expenditureId of parsed.data.expenditureIds) {
      await getNode("Expenditure", expenditureId, scope); // confirms it's in scope
      await relate("PAID_TO", "Expenditure", expenditureId, "Contractor", (contractor as any).id, scope);
      await updateNode({
        resource: "Expenditure",
        id: expenditureId,
        patch: { contractor_review_status: "linked" },
        scope,
        actorEmail: req.user!.email,
      });
    }

    res.json({ contractor, linked: parsed.data.expenditureIds.length });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to confirm contractor group",
    });
  }
});

const dismissSchema = z.object({ expenditureIds: z.array(z.string().min(1)).min(1) });

contractorReviewRouter.post("/dismiss", requireRole(...WRITE_ROLES), async (req, res) => {
  const parsed = dismissSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    for (const expenditureId of parsed.data.expenditureIds) {
      await updateNode({
        resource: "Expenditure",
        id: expenditureId,
        patch: { contractor_review_status: "not_contractor" },
        scope,
        actorEmail: req.user!.email,
      });
    }
    res.json({ dismissed: parsed.data.expenditureIds.length });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to dismiss contractor group",
    });
  }
});
