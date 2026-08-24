import { Router } from "express";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF } from "../schema/roleGroups.js";
import { getDriver } from "../db/neo4j.js";
import { getConfig } from "../config/runtimeConfig.js";
import { getNode, NotFoundError } from "../services/graphService.js";

/**
 * Land Records extras beyond plain Parcel CRUD (build prompt module 2):
 * deed history, adjacent parcels, and open disputes for one parcel, so the
 * client can render "View deed history and adjacent parcels" / "Flag
 * parcels currently subject to dispute" without three round trips.
 */
export const landRecordsRouter = Router();
landRecordsRouter.use(requireAuth, requireRole(...OFFICE_STAFF));

landRecordsRouter.get("/:id/detail", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    const parcel = await getNode("Parcel", req.params.id, scope);

    const session = getDriver().session({ database: getConfig().neo4jDatabase });
    try {
      const [deedsResult, adjacentResult, disputesResult] = await Promise.all([
        session.run(
          `MATCH (d:Deed)-[:COVERS]->(p:Parcel {id: $id})
           OPTIONAL MATCH (owner:Person)-[:HOLDS]->(d)
           RETURN d, owner ORDER BY d.issue_date DESC`,
          { id: req.params.id },
        ),
        session.run(
          `MATCH (p:Parcel {id: $id})-[:ADJACENT_TO]-(other:Parcel)
           RETURN DISTINCT other`,
          { id: req.params.id },
        ),
        session.run(
          `MATCH (p:Parcel {id: $id})-[:SUBJECT_OF]->(d:Dispute)
           WHERE d.status = 'open'
           RETURN d`,
          { id: req.params.id },
        ),
      ]);

      res.json({
        parcel,
        deeds: deedsResult.records.map((r) => ({
          ...r.get("d").properties,
          owner: r.get("owner")?.properties ?? null,
        })),
        adjacentParcels: adjacentResult.records.map((r) => r.get("other").properties),
        openDisputes: disputesResult.records.map((r) => r.get("d").properties),
      });
    } finally {
      await session.close();
    }
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to load parcel detail",
    });
  }
});
