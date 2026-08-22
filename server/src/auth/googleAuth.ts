import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";

const client = new OAuth2Client(env.auth.googleClientId);

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
  sub: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!env.auth.googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured on the server");
  }
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.auth.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified) {
    throw new Error("Google account email is missing or unverified");
  }
  return {
    email: payload.email.toLowerCase(),
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub,
  };
}
