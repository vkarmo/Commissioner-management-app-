import { Router } from "express";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF, COUNTY_AGGREGATE_READERS } from "../schema/roleGroups.js";
import { getNode, NotFoundError } from "../services/graphService.js";
import { getSession } from "../db/neo4j.js";

/**
 * Phase 4 (schema-patch spec, 2026-09-26): read-only convenience so the
 * client can show what's currently linked before offering a picker — same
 * pattern as contractorLinks.routes.ts/familyLinks.routes.ts. Adding a
 * link goes through the existing generic POST /api/relate (AFFECTS/
 * COMMITTED/BENEFITS/ABOUT are already allowlisted).
 */
export const concessionLinksRouter = Router();
const READ_ROLES = [...OFFICE_STAFF, ...COUNTY_AGGREGATE_READERS];
concessionLinksRouter.use(requireAuth, requireRole(...READ_ROLES));

concessionLinksRouter.get("/concessions/:id/quarters", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("Concession", req.params.id, scope);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (cn:Concession {id: $id})-[:AFFECTS]->(q:Quarter) WHERE q.archived = false RETURN q ORDER BY q.name`,
        { id: req.params.id },
      );
      res.json({ items: result.records.map((r) => r.get("q").properties) });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load affected quarters",
    });
  }
});

concessionLinksRouter.get("/concessions/:id/commitments", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("Concession", req.params.id, scope);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (cn:Concession {id: $id})-[:COMMITTED]->(m:Commitment) WHERE m.archived = false RETURN m ORDER BY m.title`,
        { id: req.params.id },
      );
      res.json({ items: result.records.map((r) => r.get("m").properties) });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load concession commitments",
    });
  }
});

concessionLinksRouter.get("/commitments/:id/quarters", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("Commitment", req.params.id, scope);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (m:Commitment {id: $id})-[:BENEFITS]->(q:Quarter) WHERE q.archived = false RETURN q ORDER BY q.name`,
        { id: req.params.id },
      );
      res.json({ items: result.records.map((r) => r.get("q").properties) });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load benefiting quarters",
    });
  }
});

concessionLinksRouter.get("/communications/:id/about", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("CommunicationLog", req.params.id, scope);

    const session = getSession("READ");
    try {
      const [commitmentResult, workItemResult] = await Promise.all([
        session.run(`MATCH (l:CommunicationLog {id: $id})-[:ABOUT]->(m:Commitment) WHERE m.archived = false RETURN m`, {
          id: req.params.id,
        }),
        session.run(`MATCH (l:CommunicationLog {id: $id})-[:ABOUT]->(w:PublicWorksItem) WHERE w.archived = false RETURN w`, {
          id: req.params.id,
        }),
      ]);
      res.json({
        commitment: commitmentResult.records[0]?.get("m").properties ?? null,
        publicWorksItem: workItemResult.records[0]?.get("w").properties ?? null,
      });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load communication log links",
    });
  }
});
