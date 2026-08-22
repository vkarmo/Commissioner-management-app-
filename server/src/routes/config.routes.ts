import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createNode, listNodes, ValidationError } from "../services/graphService.js";
import { ANY_ADMIN } from "../schema/roleGroups.js";

/**
 * County / District / Quarter are reference data, not scoped per-tenant —
 * every authenticated user can read them (needed for dropdowns), but only
 * admins can add new ones, and only within their own county (design recap
 * §5: configuration lives in per-county config, not hardcoded).
 */
export const configRouter = Router();
configRouter.use(requireAuth);

configRouter.get("/counties", async (req, res) => {
  const items = await listNodes({ resource: "County", scope: { county: "*" } });
  res.json({ items });
});

configRouter.get("/districts", async (req, res) => {
  const county = typeof req.query.county === "string" ? req.query.county : undefined;
  const items = await listNodes({
    resource: "District",
    scope: { county: "*" },
    filters: county ? { county } : {},
  });
  res.json({ items });
});

configRouter.get("/quarters", async (req, res) => {
  const district = typeof req.query.district === "string" ? req.query.district : undefined;
  const items = await listNodes({
    resource: "Quarter",
    scope: { county: "*" },
    filters: district ? { district } : {},
  });
  res.json({ items });
});

configRouter.post("/counties", requireRole(...ANY_ADMIN), async (req, res) => {
  try {
    const item = await createNode({
      resource: "County",
      props: { name: req.body.name },
      scope: { county: req.body.name },
      actorEmail: req.user!.email,
    });
    res.status(201).json({ item });
  } catch (err) {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to create county",
    });
  }
});

configRouter.post("/districts", requireRole(...ANY_ADMIN), async (req, res) => {
  if (req.body.county !== req.user!.county) {
    res.status(403).json({ error: "Can only add districts within your own county" });
    return;
  }
  try {
    const item = await createNode({
      resource: "District",
      props: { name: req.body.name, county: req.body.county },
      scope: { county: req.body.county },
      actorEmail: req.user!.email,
    });
    res.status(201).json({ item });
  } catch (err) {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to create district",
    });
  }
});

configRouter.post("/quarters", requireRole(...ANY_ADMIN), async (req, res) => {
  const { name, district, county } = req.body;
  if (county !== req.user!.county) {
    res.status(403).json({ error: "Can only add quarters within your own county" });
    return;
  }
  if (req.user!.district && req.user!.district !== district) {
    res.status(403).json({ error: "Can only add quarters within your own district" });
    return;
  }
  try {
    const item = await createNode({
      resource: "Quarter",
      props: { name, district, county },
      scope: { county },
      actorEmail: req.user!.email,
    });
    res.status(201).json({ item });
  } catch (err) {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to create quarter",
    });
  }
});
