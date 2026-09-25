import { Router } from "express";
import { z } from "zod";
import type { Session } from "neo4j-driver";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF } from "../schema/roleGroups.js";
import { getSession } from "../db/neo4j.js";
import { createNode, getNode, NotFoundError, relate, ScopeError, ValidationError } from "../services/graphService.js";
import type { Scope } from "../types/index.js";

/**
 * Phase 1.4 (schema-patch spec, 2026-09-25): reporter_name/reporter_phone
 * and respondent_name from SMS/WhatsApp intake (intake.routes.ts) are text
 * only. This is the review queue that turns them into real Person links —
 * a clerk confirms a suggested match (or creates a new Person) rather than
 * the server ever auto-linking on name alone.
 */
export const casePartyReviewRouter = Router();
casePartyReviewRouter.use(requireAuth, requireRole(...OFFICE_STAFF));

interface Candidate {
  id: string;
  full_name: string;
  phone: string | null;
  match_type: "phone" | "name";
}

async function findCandidates(
  session: Session,
  scope: Scope,
  name: string,
  phone?: string | null,
): Promise<Candidate[]> {
  const result = await session.run(
    `MATCH (cand:Person {county: $county, district: $district})
     WHERE cand.archived = false
       AND ( ($phone IS NOT NULL AND cand.phone = $phone)
             OR trim(toLower(cand.full_name)) = trim(toLower($name)) )
     RETURN cand.id AS id, cand.full_name AS full_name, cand.phone AS phone,
            CASE WHEN $phone IS NOT NULL AND cand.phone = $phone THEN 'phone' ELSE 'name' END AS match_type`,
    { county: scope.county, district: scope.district, name, phone: phone ?? null },
  );
  return result.records.map((r) => r.toObject() as unknown as Candidate);
}

casePartyReviewRouter.get("/", async (req, res) => {
  const scope = scopeFromRequest(req);
  const session = getSession("READ");
  try {
    const caseRows = await session.run(
      `MATCH (c:Case {county: $county, district: $district})
       WHERE c.archived = false
       WITH c,
            (c.reporter_name IS NOT NULL AND trim(c.reporter_name) <> ''
             AND NOT EXISTS { MATCH (:Person)-[:FILED]->(c) }) AS reporterUnresolved,
            (c.respondent_name IS NOT NULL AND trim(c.respondent_name) <> ''
             AND NOT EXISTS { MATCH (c)-[:INVOLVES]->(:Person) }) AS respondentUnresolved
       WHERE c.status = 'intake_pending' OR reporterUnresolved OR respondentUnresolved
       RETURN c, reporterUnresolved, respondentUnresolved
       ORDER BY c.filed_date DESC`,
      { county: scope.county, district: scope.district },
    );

    const items = await Promise.all(
      caseRows.records.map(async (record) => {
        const caseNode = record.get("c").properties;
        const reporterUnresolved = record.get("reporterUnresolved");
        const respondentUnresolved = record.get("respondentUnresolved");

        const [reporterCandidates, respondentCandidates] = await Promise.all([
          reporterUnresolved
            ? findCandidates(session, scope, caseNode.reporter_name, caseNode.reporter_phone)
            : Promise.resolve([]),
          respondentUnresolved ? findCandidates(session, scope, caseNode.respondent_name) : Promise.resolve([]),
        ]);

        return {
          case: caseNode,
          reporterUnresolved,
          respondentUnresolved,
          reporterCandidates,
          respondentCandidates,
        };
      }),
    );

    res.json({ items });
  } finally {
    await session.close();
  }
});

const confirmSchema = z.object({
  field: z.enum(["reporter", "respondent"]),
  personId: z.string().min(1),
});

casePartyReviewRouter.post("/:caseId/confirm", async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    await getNode("Case", req.params.caseId, scope);
    await getNode("Person", parsed.data.personId, scope);

    if (parsed.data.field === "reporter") {
      await relate("FILED", "Person", parsed.data.personId, "Case", req.params.caseId, scope);
    } else {
      await relate("INVOLVES", "Case", req.params.caseId, "Person", parsed.data.personId, scope);
    }
    const item = await getNode("Case", req.params.caseId, scope);
    res.json({ item });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : err instanceof ScopeError ? 403 : err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to confirm case party match",
    });
  }
});

const newPersonSchema = z.object({
  field: z.enum(["reporter", "respondent"]),
  full_name: z.string().min(1),
  phone: z.string().optional(),
});

casePartyReviewRouter.post("/:caseId/new-person", async (req, res) => {
  const parsed = newPersonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    await getNode("Case", req.params.caseId, scope);

    const person = await createNode({
      resource: "Person",
      props: {
        full_name: parsed.data.full_name,
        role: "citizen",
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
      },
      scope,
      actorEmail: req.user!.email,
    });

    if (parsed.data.field === "reporter") {
      await relate("FILED", "Person", (person as any).id, "Case", req.params.caseId, scope);
    } else {
      await relate("INVOLVES", "Case", req.params.caseId, "Person", (person as any).id, scope);
    }
    const item = await getNode("Case", req.params.caseId, scope);
    res.status(201).json({ person, item });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : err instanceof ScopeError ? 403 : err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to create and link new person",
    });
  }
});
