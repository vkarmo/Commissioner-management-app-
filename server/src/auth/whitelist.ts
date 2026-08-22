import { getSession } from "../db/neo4j.js";
import { env } from "../config/env.js";
import type { Role } from "../schema/resources.js";
import type { GoogleProfile } from "./googleAuth.js";
import type { SessionUser } from "../types/index.js";

interface WhitelistEntryProps {
  email: string;
  role: Role;
  county: string;
  district?: string;
  active: boolean;
}

async function findWhitelistEntry(email: string): Promise<WhitelistEntryProps | null> {
  const session = getSession("READ");
  try {
    const result = await session.run(
      `MATCH (w:WhitelistEntry {email: $email, active: true}) RETURN w LIMIT 1`,
      { email },
    );
    if (result.records.length === 0) return null;
    return result.records[0].get("w").properties as WhitelistEntryProps;
  } finally {
    await session.close();
  }
}

async function upsertUser(profile: GoogleProfile, entry: WhitelistEntryProps): Promise<void> {
  const session = getSession("WRITE");
  try {
    await session.run(
      `MERGE (u:User {email: $email})
       ON CREATE SET u.id = randomUUID(), u.created_at = datetime().epochMillis
       SET u.google_sub = $sub,
           u.name = $name,
           u.picture = $picture,
           u.role = $role,
           u.county = $county,
           u.district = $district,
           u.last_login_at = $now`,
      {
        email: profile.email,
        sub: profile.sub,
        name: profile.name || null,
        picture: profile.picture || null,
        role: entry.role,
        county: entry.county,
        district: entry.district || null,
        now: new Date().toISOString(),
      },
    );
  } finally {
    await session.close();
  }
}

/**
 * Authorizes a Google-verified profile against the whitelist and returns
 * the session user, or null if the email is not (yet) whitelisted.
 *
 * Falls back to BOOTSTRAP_SUPER_ADMINS so the very first Super Admin can
 * log in and start whitelisting others without anyone hand-writing Cypher.
 */
export async function authorizeProfile(profile: GoogleProfile): Promise<SessionUser | null> {
  const entry = await findWhitelistEntry(profile.email);

  if (entry) {
    await upsertUser(profile, entry);
    return {
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      role: entry.role,
      county: entry.county,
      district: entry.district,
    };
  }

  if (env.auth.bootstrapSuperAdmins.includes(profile.email)) {
    const bootstrapEntry: WhitelistEntryProps = {
      email: profile.email,
      role: "SuperAdmin",
      county: env.auth.bootstrapSuperAdminCounty,
      active: true,
    };
    await upsertUser(profile, bootstrapEntry);
    return {
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      role: bootstrapEntry.role,
      county: bootstrapEntry.county,
    };
  }

  return null;
}
