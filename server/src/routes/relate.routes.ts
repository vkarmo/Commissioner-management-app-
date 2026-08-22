import { Router } from "express";
import { z } from "zod";
import { requireAuth, scopeFromRequest } from "../middleware/auth.js";
import { NotFoundError, relate, ValidationError } from "../services/graphService.js";
import { RESOURCES, type ResourceName } from "../schema/resources.js";

export const relateRouter = Router();
relateRouter.use(requireAuth);

const relateSchema = z.object({
  type: z.string().min(1),
  from: z.object({ resource: z.string(), id: z.string() }),
  to: z.object({ resource: z.string(), id: z.string() }),
});

function isResourceName(name: string): name is ResourceName {
  return name in RESOURCES;
}

relateRouter.post("/", async (req, res) => {
  const parsed = relateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type, from, to } = parsed.data;
  if (!isResourceName(from.resource) || !isResourceName(to.resource)) {
    res.status(400).json({ error: "Unknown resource in relationship" });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    const result = await relate(type, from.resource, from.id, to.resource, to.id, scope);
    res.json(result);
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
    } else if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
    } else {
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: "Unexpected server error" });
    }
  }
});
