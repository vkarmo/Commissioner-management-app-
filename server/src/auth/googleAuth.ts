import { OAuth2Client } from "google-auth-library";
import { getConfig } from "../config/runtimeConfig.js";

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
  sub: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const googleClientId = getConfig().googleClientId;
  if (!googleClientId) {
    throw new Error("Google sign-in is not configured on the server yet");
  }
  // Built per call (not cached at module scope) so a Google Client ID
  // saved later via the Setup Wizard takes effect without a restart.
  const client = new OAuth2Client(googleClientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: googleClientId,
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
