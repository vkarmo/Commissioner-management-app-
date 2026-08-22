import type { Role } from "../schema/resources.js";

export interface SessionUser {
  email: string;
  name?: string;
  picture?: string;
  role: Role;
  county: string;
  /** Absent for county-scoped roles, which see across districts in their county. */
  district?: string;
}

/** The tenant scope a request is authorized to read/write within. */
export interface Scope {
  county: string;
  district?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}
