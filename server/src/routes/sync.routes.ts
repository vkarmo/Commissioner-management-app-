import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import {
  createNode,
  getNode,
  listNodes,
  NotFoundError,
  ScopeError,
  updateNode,
  ValidationError,
} from "../services/graphService.js";
import { RESOURCES, type ResourceName } from "../schema/resources.js";
import { getSession } from "../db/neo4j.js";
import { OFFICE_STAFF } from "../schema/roleGroups.js";

/**
 * Applies the client's offline mutation queue (Dexie) against the graph.
 *
 * Each mutation carries the client-generated UUID it wants for the entity
 * (so offline-created records keep a stable id across the sync boundary)
 * and, for updates, the `baseUpdatedAt` the client last saw. If the server
 * record has moved on since then, we don't silently overwrite — we flag a
 * SyncConflict for clerk review and apply last-write-wins only once that
 * review happens (design recap §1: "queue-then-commit, SyncConflict
 * flagging, last-write-wins with clerk review").
 */
export const syncRouter = Router();
syncRouter.use(requireAuth);

const mutationSchema = z.object({
  clientMutationId: z.string(),
  resource: z.string(),
  operation: z.enum(["create", "update"]),
  entityId: z.string(),
  payload: z.record(z.unknown()),
  clientUpdatedAt: z.string(),
  baseUpdatedAt: z.string().optional(),
});

const batchSchema = z.object({ mutations: z.array(mutationSchema).max(200) });

function isResourceName(name: string): name is ResourceName {
  return name in RESOURCES;
}

async function flagConflict(params: {
  resource: ResourceName;
  entityId: string;
  county: string;
  district?: string;
  clientValue: unknown;
  serverValue: unknown;
  clientUpdatedAt: string;
  serverUpdatedAt: string;
}) {
  const session = getSession("WRITE");
  try {
    await session.run(
      `CREATE (c:SyncConflict {
        id: randomUUID(), entity_label: $label, entity_id: $entityId,
        county: $county, district: $district,
        client_value: $clientValue, server_value: $serverValue,
        client_updated_at: $clientUpdatedAt, server_updated_at: $serverUpdatedAt,
        resolved: false, created_at: $now, updated_at: $now, archived: false
      })`,
      {
        label: params.resource,
        entityId: params.entityId,
        county: params.county,
        district: params.district || null,
        clientValue: JSON.stringify(params.clientValue),
        serverValue: JSON.stringify(params.serverValue),
        clientUpdatedAt: params.clientUpdatedAt,
        serverUpdatedAt: params.serverUpdatedAt,
        now: new Date().toISOString(),
      },
    );
  } finally {
    await session.close();
  }
}

syncRouter.post("/batch", async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scope = scopeFromRequest(req);
  const actorEmail = req.user!.email;
  const results: Array<Record<string, unknown>> = [];

  for (const m of parsed.data.mutations) {
    if (!isResourceName(m.resource)) {
      results.push({ clientMutationId: m.clientMutationId, status: "error", error: "Unknown resource" });
      continue;
    }

    try {
      if (m.operation === "create") {
        let alreadyApplied = false;
        try {
          const existing = await getNode(m.resource, m.entityId, scope);
          alreadyApplied = true;
          results.push({ clientMutationId: m.clientMutationId, status: "applied", item: existing });
        } catch (err) {
          if (!(err instanceof NotFoundError)) throw err;
        }
        if (!alreadyApplied) {
          const item = await createNode({
            resource: m.resource,
            props: { ...m.payload, id: m.entityId },
            scope,
            actorEmail,
          });
          results.push({ clientMutationId: m.clientMutationId, status: "applied", item });
        }
        continue;
      }

      // operation === "update"
      try {
        const item = await updateNode({
          resource: m.resource,
          id: m.entityId,
          patch: m.payload,
          scope,
          actorEmail,
          expectedUpdatedAt: m.baseUpdatedAt,
        });
        results.push({ clientMutationId: m.clientMutationId, status: "applied", item });
      } catch (err) {
        if (err instanceof NotFoundError && m.baseUpdatedAt) {
          // Could be a real conflict (record changed) or genuinely missing/out
          // of scope. Distinguish by re-fetching without the concurrency check.
          const current = await getNode(m.resource, m.entityId, scope).catch(() => null);
          if (current) {
            await flagConflict({
              resource: m.resource,
              entityId: m.entityId,
              county: scope.county,
              district: scope.district,
              clientValue: m.payload,
              serverValue: current,
              clientUpdatedAt: m.clientUpdatedAt,
              serverUpdatedAt: (current as any).updated_at,
            });
            results.push({
              clientMutationId: m.clientMutationId,
              status: "conflict",
              serverItem: current,
            });
            continue;
          }
        }
        throw err;
      }
    } catch (err) {
      const status = err instanceof NotFoundError ? 404 : err instanceof ScopeError ? 403 : err instanceof ValidationError ? 400 : 500;
      results.push({
        clientMutationId: m.clientMutationId,
        status: "error",
        httpStatus: status,
        error: err instanceof Error ? err.message : "Sync mutation failed",
      });
    }
  }

  res.json({ results });
});

syncRouter.get("/conflicts", requireRole(...OFFICE_STAFF), async (req, res) => {
  const scope = scopeFromRequest(req);
  const filters: Record<string, string> = { county: scope.county };
  if (scope.district) filters.district = scope.district;
  const items = await listNodes({ resource: "SyncConflict", scope, includeArchived: true, filters });
  res.json({ items });
});

syncRouter.patch("/conflicts/:id/resolve", requireRole(...OFFICE_STAFF), async (req, res) => {
  const scope = scopeFromRequest(req);
  const existing: any = await getNode("SyncConflict", req.params.id, scope);
  if (existing.county !== scope.county || (scope.district && existing.district !== scope.district)) {
    res.status(403).json({ error: "Cannot resolve a sync conflict outside your scope" });
    return;
  }
  const item = await updateNode({
    resource: "SyncConflict",
    id: req.params.id,
    patch: { resolved: true, resolved_by: req.user!.email, resolved_at: new Date().toISOString() },
    scope,
    actorEmail: req.user!.email,
  });
  res.json({ item });
});
