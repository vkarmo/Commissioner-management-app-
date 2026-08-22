import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createNode, getNode, listNodes, NotFoundError, updateNode, ValidationError } from "../services/graphService.js";
import { ALL_ROLES, OFFICE_ROLES } from "../schema/resources.js";
import { ANY_ADMIN } from "../schema/roleGroups.js";

/**
 * Whitelist management. A SuperAdmin (office-scoped) may only invite users
 * into their own county+district; a CountySuperAdmin may invite into any
 * district within their county, including county-scoped roles.
 */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(...ANY_ADMIN));

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ALL_ROLES),
  district: z.string().optional(),
});

adminRouter.get("/whitelist", async (req, res) => {
  const scope = { county: req.user!.county };
  const items = await listNodes({
    resource: "WhitelistEntry",
    scope,
    includeArchived: true,
    filters: { county: req.user!.county },
  });
  const visible = req.user!.district
    ? items.filter((i: any) => i.district === req.user!.district)
    : items;
  res.json({ items: visible });
});

adminRouter.post("/whitelist", async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, role, district } = parsed.data;

  const isOfficeRole = (OFFICE_ROLES as readonly string[]).includes(role);
  if (isOfficeRole && !district) {
    res.status(400).json({ error: "Office-scoped roles require a district" });
    return;
  }
  if (req.user!.district && district !== req.user!.district) {
    res.status(403).json({ error: "SuperAdmins may only invite users into their own district" });
    return;
  }

  try {
    const item = await createNode({
      resource: "WhitelistEntry",
      props: {
        email: email.toLowerCase(),
        role,
        county: req.user!.county,
        district: isOfficeRole ? district : undefined,
        active: true,
        invited_by: req.user!.email,
      },
      scope: { county: req.user!.county },
      actorEmail: req.user!.email,
    });
    res.status(201).json({ item });
  } catch (err) {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to create whitelist entry",
    });
  }
});

adminRouter.patch("/whitelist/:id/deactivate", async (req, res) => {
  try {
    // WhitelistEntry is unscoped in the graph service (it *defines* scope
    // rather than living inside one), so ownership must be checked here
    // before allowing a write, not left to the generic scope filter.
    const existing: any = await getNode("WhitelistEntry", req.params.id, { county: "*" });
    if (existing.county !== req.user!.county) {
      res.status(403).json({ error: "Cannot manage whitelist entries outside your own county" });
      return;
    }
    if (req.user!.district && existing.district !== req.user!.district) {
      res.status(403).json({ error: "Cannot manage whitelist entries outside your own district" });
      return;
    }
    const item = await updateNode({
      resource: "WhitelistEntry",
      id: req.params.id,
      patch: { active: false },
      scope: { county: req.user!.county },
      actorEmail: req.user!.email,
    });
    res.json({ item });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to deactivate whitelist entry",
    });
  }
});
