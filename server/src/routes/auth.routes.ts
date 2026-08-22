import { Router } from "express";
import { z } from "zod";
import { verifyGoogleIdToken } from "../auth/googleAuth.js";
import { authorizeProfile } from "../auth/whitelist.js";
import { issueSessionToken } from "../auth/session.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const googleLoginSchema = z.object({ idToken: z.string().min(10) });

authRouter.post("/google", async (req, res) => {
  const parsed = googleLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "idToken is required" });
    return;
  }

  try {
    const profile = await verifyGoogleIdToken(parsed.data.idToken);
    const user = await authorizeProfile(profile);
    if (!user) {
      res.status(403).json({
        error: "This Google account is not whitelisted for the Commissioner's Office system. Contact your Super Admin.",
      });
      return;
    }
    const token = issueSessionToken(user);
    res.json({ token, user });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : "Google sign-in failed" });
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
