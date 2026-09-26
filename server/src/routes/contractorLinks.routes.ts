import { Router } from "express";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF, COUNTY_AGGREGATE_READERS } from "../schema/roleGroups.js";
import { getNode, NotFoundError } from "../services/graphService.js";
import { getSession } from "../db/neo4j.js";

/**
 * Phase 2 (schema-patch spec, 2026-09-26): read-only convenience so the
 * client can show what a PublicWorksItem/Expenditure is currently linked
 * to before offering a picker — mirrors landRecords.routes.ts's `/detail`
 * pattern. Setting the link itself goes through the existing generic
 * POST /api/relate (BUILT_BY/PAID_TO/FOR are already allowlisted), same
 * as every other relationship in the app.
 */
export const contractorLinksRouter = Router();
const READ_ROLES = [...OFFICE_STAFF, ...COUNTY_AGGREGATE_READERS];
contractorLinksRouter.use(requireAuth, requireRole(...READ_ROLES));

contractorLinksRouter.get("/public-works/:id/contractor", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("PublicWorksItem", req.params.id, scope);

    const session = getSession("READ");
    try {
      const result = await session.run(
        `MATCH (w:PublicWorksItem {id: $id})-[:BUILT_BY]->(k:Contractor) WHERE k.archived = false RETURN k`,
        { id: req.params.id },
      );
      res.json({ contractor: result.records[0]?.get("k").properties ?? null });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load contractor link",
    });
  }
});

contractorLinksRouter.get("/expenditures/:id/links", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    await getNode("Expenditure", req.params.id, scope);

    const session = getSession("READ");
    try {
      const [contractorResult, workItemResult] = await Promise.all([
        session.run(`MATCH (e:Expenditure {id: $id})-[:PAID_TO]->(k:Contractor) WHERE k.archived = false RETURN k`, {
          id: req.params.id,
        }),
        session.run(`MATCH (e:Expenditure {id: $id})-[:FOR]->(w:PublicWorksItem) WHERE w.archived = false RETURN w`, {
          id: req.params.id,
        }),
      ]);
      res.json({
        contractor: contractorResult.records[0]?.get("k").properties ?? null,
        publicWorksItem: workItemResult.records[0]?.get("w").properties ?? null,
      });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load expenditure links",
    });
  }
});
