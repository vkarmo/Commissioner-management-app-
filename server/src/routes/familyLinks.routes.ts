import { Router } from "express";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF } from "../schema/roleGroups.js";
import { getNode, NotFoundError } from "../services/graphService.js";
import { getSession } from "../db/neo4j.js";

/**
 * Phase 3 (schema-patch spec, 2026-09-26): read-only convenience so the
 * client can show who/what is currently linked before offering a picker
 * — same pattern as contractorLinks.routes.ts. Adding a link goes through
 * the existing generic POST /api/relate (MEMBER_OF/PARTY_TO/WITNESS_IN
 * are already allowlisted), same as every other relationship in the app.
 */
export const familyLinksRouter = Router();
familyLinksRouter.use(requireAuth, requireRole(...OFFICE_STAFF));

familyLinksRouter.get("/families/:id/members", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("Family", req.params.id, scope);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (p:Person)-[:MEMBER_OF]->(f:Family {id: $id}) WHERE p.archived = false RETURN p ORDER BY p.full_name`,
        { id: req.params.id },
      );
      res.json({ items: result.records.map((r) => r.get("p").properties) });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load family members",
    });
  }
});

familyLinksRouter.get("/cases/:id/families", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("Case", req.params.id, scope);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (f:Family)-[:PARTY_TO]->(c:Case {id: $id}) WHERE f.archived = false RETURN f ORDER BY f.name`,
        { id: req.params.id },
      );
      res.json({ items: result.records.map((r) => r.get("f").properties) });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load case parties",
    });
  }
});

familyLinksRouter.get("/hearings/:id/witnesses", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("Hearing", req.params.id, scope);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (p:Person)-[:WITNESS_IN]->(h:Hearing {id: $id}) WHERE p.archived = false RETURN p ORDER BY p.full_name`,
        { id: req.params.id },
      );
      res.json({ items: result.records.map((r) => r.get("p").properties) });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load hearing witnesses",
    });
  }
});
