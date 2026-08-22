import { v4 as uuid } from "uuid";
import { int } from "neo4j-driver";
import { getSession } from "../db/neo4j.js";
import { getResourceDef, isRelationshipAllowed, ResourceName } from "../schema/resources.js";
import type { Scope } from "../types/index.js";

export class ScopeError extends Error {}
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

/**
 * Every value written to the graph passes through here as a Cypher
 * parameter, never string-interpolated — the only string interpolation
 * anywhere in this module is the node LABEL, and that always comes from
 * `getResourceDef`, which throws on anything not in the schema allowlist.
 */

function assertKnownKeys(resource: ResourceName, props: Record<string, unknown>) {
  const def = getResourceDef(resource);
  const allowed = new Set(def.properties.map((p) => p.key));
  for (const key of Object.keys(props)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Unknown property "${key}" for ${resource}`);
    }
  }
}

function assertRequired(resource: ResourceName, props: Record<string, unknown>) {
  const def = getResourceDef(resource);
  for (const p of def.properties) {
    if (p.required && (props[p.key] === undefined || props[p.key] === null)) {
      throw new ValidationError(`Missing required property "${p.key}" for ${resource}`);
    }
  }
}

/** Applies the tenant scope filter a caller is authorized to see. */
function scopeClause(resource: ResourceName, scope: Scope): { clause: string; params: Record<string, unknown> } {
  const def = getResourceDef(resource);
  if (!def.scoped) {
    return { clause: "", params: {} };
  }
  if (scope.district) {
    return {
      clause: "AND n.county = $scopeCounty AND n.district = $scopeDistrict",
      params: { scopeCounty: scope.county, scopeDistrict: scope.district },
    };
  }
  // County-scoped role: any district within the county.
  return {
    clause: "AND n.county = $scopeCounty",
    params: { scopeCounty: scope.county },
  };
}

export interface CreateOptions {
  resource: ResourceName;
  props: Record<string, unknown>;
  scope: Scope;
  actorEmail: string;
}

export async function createNode({ resource, props, scope, actorEmail }: CreateOptions) {
  const def = getResourceDef(resource);
  const now = new Date().toISOString();
  const id = (props.id as string) || uuid();

  const fullProps: Record<string, unknown> = {
    ...props,
    id,
    created_at: now,
    updated_at: now,
    created_by: actorEmail,
    updated_by: actorEmail,
    archived: false,
  };

  if (def.scoped) {
    fullProps.county = props.county || scope.county;
    if (scope.district) {
      fullProps.district = props.district || scope.district;
    }
    if (fullProps.county !== scope.county) {
      throw new ScopeError("Cannot create a record outside your assigned county");
    }
    if (scope.district && fullProps.district !== scope.district) {
      throw new ScopeError("Cannot create a record outside your assigned district");
    }
  }

  assertKnownKeys(resource, fullProps);
  assertRequired(resource, fullProps);

  const session = getSession("WRITE");
  try {
    const result = await session.run(
      `CREATE (n:${def.label} $props) RETURN n`,
      { props: fullProps },
    );
    return result.records[0].get("n").properties;
  } finally {
    await session.close();
  }
}

export async function getNode(resource: ResourceName, id: string, scope: Scope) {
  const def = getResourceDef(resource);
  const { clause, params } = scopeClause(resource, scope);
  const session = getSession("READ");
  try {
    const result = await session.run(
      `MATCH (n:${def.label} {id: $id}) WHERE true ${clause} RETURN n`,
      { id, ...params },
    );
    if (result.records.length === 0) {
      throw new NotFoundError(`${resource} ${id} not found`);
    }
    return result.records[0].get("n").properties;
  } finally {
    await session.close();
  }
}

export interface ListOptions {
  resource: ResourceName;
  scope: Scope;
  includeArchived?: boolean;
  filters?: Record<string, string>;
  limit?: number;
  offset?: number;
}

export async function listNodes({
  resource,
  scope,
  includeArchived = false,
  filters = {},
  limit = 50,
  offset = 0,
}: ListOptions) {
  const def = getResourceDef(resource);
  const { clause, params } = scopeClause(resource, scope);

  const filterClauses: string[] = [];
  const filterParams: Record<string, unknown> = {};
  const allowedKeys = new Set(def.properties.map((p) => p.key));
  for (const [key, value] of Object.entries(filters)) {
    if (!allowedKeys.has(key)) continue;
    const paramKey = `f_${key}`;
    filterClauses.push(`n.${key} = $${paramKey}`);
    filterParams[paramKey] = value;
  }
  if (!includeArchived) {
    filterClauses.push("(n.archived = false OR n.archived IS NULL)");
  }

  const whereExtra = filterClauses.length ? `AND ${filterClauses.join(" AND ")}` : "";

  const session = getSession("READ");
  try {
    const result = await session.run(
      `MATCH (n:${def.label}) WHERE true ${clause} ${whereExtra}
       RETURN n ORDER BY n.created_at DESC
       SKIP $offset LIMIT $limit`,
      { ...params, ...filterParams, offset: int(offset), limit: int(limit) },
    );
    return result.records.map((r) => r.get("n").properties);
  } finally {
    await session.close();
  }
}

export interface UpdateOptions {
  resource: ResourceName;
  id: string;
  patch: Record<string, unknown>;
  scope: Scope;
  actorEmail: string;
  /** Optimistic concurrency: if set, update fails unless current updated_at matches. */
  expectedUpdatedAt?: string;
}

export async function updateNode({
  resource,
  id,
  patch,
  scope,
  actorEmail,
  expectedUpdatedAt,
}: UpdateOptions) {
  const def = getResourceDef(resource);
  const { clause, params } = scopeClause(resource, scope);

  const safePatch = { ...patch };
  delete safePatch.id;
  delete safePatch.created_at;
  delete safePatch.created_by;
  delete safePatch.county;
  delete safePatch.district;

  assertKnownKeys(resource, safePatch);

  const now = new Date().toISOString();
  const fullPatch = { ...safePatch, updated_at: now, updated_by: actorEmail };

  const concurrencyClause = expectedUpdatedAt ? "AND n.updated_at = $expectedUpdatedAt" : "";

  const session = getSession("WRITE");
  try {
    const result = await session.run(
      `MATCH (n:${def.label} {id: $id}) WHERE true ${clause} ${concurrencyClause}
       SET n += $patch
       RETURN n`,
      {
        id,
        ...params,
        patch: fullPatch,
        ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
      },
    );
    if (result.records.length === 0) {
      throw new NotFoundError(`${resource} ${id} not found, out of scope, or was modified concurrently`);
    }
    return result.records[0].get("n").properties;
  } finally {
    await session.close();
  }
}

export async function archiveNode(resource: ResourceName, id: string, scope: Scope, actorEmail: string) {
  return updateNode({
    resource,
    id,
    patch: { archived: true, archived_at: new Date().toISOString() },
    scope,
    actorEmail,
  });
}

export async function relate(
  type: string,
  fromResource: ResourceName,
  fromId: string,
  toResource: ResourceName,
  toId: string,
  scope: Scope,
) {
  if (!isRelationshipAllowed(type, fromResource, toResource)) {
    throw new ValidationError(`Relationship ${type} from ${fromResource} to ${toResource} is not allowed`);
  }
  const fromDef = getResourceDef(fromResource);
  const toDef = getResourceDef(toResource);
  const fromScopeClause = scopeClause(fromResource, scope);
  const toScopeClause = scopeClause(toResource, scope);

  const session = getSession("WRITE");
  try {
    const result = await session.run(
      `MATCH (a:${fromDef.label} {id: $fromId}) WHERE true ${fromScopeClause.clause.replace(/n\./g, "a.")}
       MATCH (b:${toDef.label} {id: $toId}) WHERE true ${toScopeClause.clause.replace(/n\./g, "b.")}
       MERGE (a)-[r:${type}]->(b)
       RETURN a, b`,
      { fromId, toId, ...fromScopeClause.params, ...toScopeClause.params },
    );
    if (result.records.length === 0) {
      throw new NotFoundError("One or both endpoints not found or out of scope");
    }
    return { ok: true };
  } finally {
    await session.close();
  }
}
