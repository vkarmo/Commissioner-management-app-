/**
 * Phase 2 (schema-patch spec, 2026-09-26): PublicWorksItem.status was a
 * free string; this maps it onto the canonical five values (`planned`,
 * `in_progress`, `stalled`, `completed`, `cancelled`) wherever the
 * existing value is an obvious synonym. Anything not obviously mappable
 * — notably `funded`, used by earlier data and genuinely ambiguous
 * between "planned" and "in_progress" — is left untouched and reported
 * for a person to decide, never guessed.
 *
 * Idempotent: a PublicWorksItem already on a canonical value is excluded
 * from the scan, so running this twice changes nothing on the second run.
 *
 * Usage: npm run migrate:normalize-status   (dry run first against a
 * seeded local database — see the spec's "ask before running against a
 * real database.")
 */
import { getSession, closeDriver } from "../db/neo4j.js";
import { updateNode } from "../services/graphService.js";

export const CANONICAL_STATUSES = ["planned", "in_progress", "stalled", "completed", "cancelled"] as const;

const SYNONYMS: Record<string, string> = {
  "in progress": "in_progress",
  inprogress: "in_progress",
  complete: "completed",
  done: "completed",
  finished: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  abandoned: "cancelled",
  "on hold": "stalled",
  paused: "stalled",
  halted: "stalled",
  "not started": "planned",
  new: "planned",
  proposed: "planned",
};

function normalize(status: string): string {
  return status
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

export interface StatusReviewItem {
  id: string;
  status: string;
}

export interface NormalizeStatusResult {
  scanned: number;
  mapped: number;
  review: StatusReviewItem[];
}

export async function runNormalizePublicWorksStatus(): Promise<NormalizeStatusResult> {
  const session = getSession("READ");
  let rows;
  try {
    rows = await session.run(
      `MATCH (w:PublicWorksItem)
       WHERE w.archived = false AND NOT w.status IN $canonical
       RETURN w.id AS id, w.status AS status, w.county AS county, w.district AS district`,
      { canonical: [...CANONICAL_STATUSES] },
    );
  } finally {
    await session.close();
  }

  const result: NormalizeStatusResult = { scanned: rows.records.length, mapped: 0, review: [] };

  for (const record of rows.records) {
    const id = record.get("id") as string;
    const status = record.get("status") as string;
    const county = record.get("county") as string;
    const district = record.get("district") as string;
    const mapped = SYNONYMS[normalize(status)];

    if (mapped) {
      await updateNode({
        resource: "PublicWorksItem",
        id,
        patch: { status: mapped },
        scope: { county, district },
        actorEmail: "migration-normalize-status",
      });
      result.mapped += 1;
    } else {
      result.review.push({ id, status });
    }
  }

  return result;
}

function printReport(result: NormalizeStatusResult) {
  // eslint-disable-next-line no-console
  console.log(`normalize-status: scanned ${result.scanned} non-canonical PublicWorksItem status value(s).`);
  // eslint-disable-next-line no-console
  console.log(`normalize-status: mapped ${result.mapped} to a canonical value.`);
  if (result.review.length) {
    // eslint-disable-next-line no-console
    console.log(`\nnormalize-status review — no obvious mapping (${result.review.length}):`);
    for (const r of result.review) {
      // eslint-disable-next-line no-console
      console.log(`  - PublicWorksItem ${r.id}: status="${r.status}"`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runNormalizePublicWorksStatus()
    .then(printReport)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("normalize-status failed:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      void closeDriver();
    });
}
