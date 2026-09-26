import { Router } from "express";
import {
  archiveNode,
  createNode,
  getNode,
  listNodes,
  NotFoundError,
  ScopeError,
  updateNode,
  ValidationError,
} from "../services/graphService.js";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import type { ResourceName, Role } from "../schema/resources.js";

export interface ResourceRouterOptions {
  readRoles: Role[];
  writeRoles: Role[];
  /**
   * When set, POST / responds 410 Gone with this message instead of
   * creating a node — for a retired resource (Dispute, Phase 1.5) that
   * still needs read/update/archive access for existing records.
   */
  createDisabledMessage?: string;
}

function handleError(err: unknown, res: import("express").Response) {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
  } else if (err instanceof ScopeError) {
    res.status(403).json({ error: err.message });
  } else if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
  } else {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "Unexpected server error" });
  }
}

/**
 * Builds a standard CRUD router for one resource in the schema allowlist.
 * All scope filtering happens in graphService — this layer only checks
 * role membership and wires HTTP <-> service calls.
 */
export function createResourceRouter(
  resource: ResourceName,
  { readRoles, writeRoles, createDisabledMessage }: ResourceRouterOptions,
) {
  const router = Router();

  router.use(requireAuth);

  if (createDisabledMessage) {
    router.post("/", requireRole(...writeRoles), (_req, res) => {
      res.status(410).json({ error: createDisabledMessage });
    });
  }

  router.get("/", requireRole(...readRoles), async (req, res) => {
    try {
      const scope = scopeFromRequest(req);
      const { limit, offset, includeArchived, ...filters } = req.query as Record<string, string>;
      const items = await listNodes({
        resource,
        scope,
        includeArchived: includeArchived === "true",
        filters,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      res.json({ items });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get("/:id", requireRole(...readRoles), async (req, res) => {
    try {
      const scope = scopeFromRequest(req);
      const item = await getNode(resource, req.params.id, scope);
      res.json({ item });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.post("/", requireRole(...writeRoles), async (req, res) => {
    try {
      const scope = scopeFromRequest(req);
      const item = await createNode({ resource, props: req.body, scope, actorEmail: req.user!.email });
      res.status(201).json({ item });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.patch("/:id", requireRole(...writeRoles), async (req, res) => {
    try {
      const scope = scopeFromRequest(req);
      const { expectedUpdatedAt, ...patch } = req.body;
      const item = await updateNode({
        resource,
        id: req.params.id,
        patch,
        scope,
        actorEmail: req.user!.email,
        expectedUpdatedAt,
      });
      res.json({ item });
    } catch (err) {
      handleError(err, res);
    }
  });

  router.delete("/:id", requireRole(...writeRoles), async (req, res) => {
    try {
      const scope = scopeFromRequest(req);
      const item = await archiveNode(resource, req.params.id, scope, req.user!.email);
      res.json({ item });
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
