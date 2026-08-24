import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF } from "../schema/roleGroups.js";
import { getNode, listNodes, NotFoundError, updateNode } from "../services/graphService.js";

/**
 * Community Registry (build prompt module 3): a quarter/town chief
 * directory with basic population and contact data per quarter. Quarter
 * is reference data (see config.routes.ts), not itself tenant-scoped, so
 * — same as WhitelistEntry/SyncConflict — ownership is checked by hand
 * here rather than relying on graphService's scope filter.
 */
export const communityRouter = Router();
communityRouter.use(requireAuth, requireRole(...OFFICE_STAFF));

communityRouter.get("/quarters", async (req, res) => {
  const scope = scopeFromRequest(req);
  const filters: Record<string, string> = { county: scope.county };
  if (scope.district) filters.district = scope.district;
  const items = await listNodes({ resource: "Quarter", scope, filters });
  res.json({ items });
});

const updateSchema = z.object({
  chief_name: z.string().optional(),
  chief_phone: z.string().optional(),
  population: z.number().optional(),
});

communityRouter.patch("/quarters/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    const existing: any = await getNode("Quarter", req.params.id, scope);
    if (existing.county !== scope.county || (scope.district && existing.district !== scope.district)) {
      res.status(403).json({ error: "Cannot edit a quarter outside your own office" });
      return;
    }
    const item = await updateNode({
      resource: "Quarter",
      id: req.params.id,
      patch: parsed.data,
      scope,
      actorEmail: req.user!.email,
    });
    res.json({ item });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to update quarter",
    });
  }
});
