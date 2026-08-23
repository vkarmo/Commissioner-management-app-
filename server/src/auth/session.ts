import jwt from "jsonwebtoken";
import { getConfig } from "../config/runtimeConfig.js";
import type { SessionUser } from "../types/index.js";

export function issueSessionToken(user: SessionUser): string {
  const config = getConfig();
  return jwt.sign(user, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifySessionToken(token: string): SessionUser {
  return jwt.verify(token, getConfig().jwtSecret) as SessionUser;
}
