import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { SessionUser } from "../types/index.js";

export function issueSessionToken(user: SessionUser): string {
  return jwt.sign(user, env.auth.jwtSecret, { expiresIn: env.auth.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifySessionToken(token: string): SessionUser {
  return jwt.verify(token, env.auth.jwtSecret) as SessionUser;
}
