import { Router } from "express";
import { z } from "zod";
import { createNode, ValidationError } from "../services/graphService.js";

/**
 * Phase 2 (build prompt): lets a future WhatsApp Business API / Twilio SMS
 * webhook create Case and FireIncident nodes directly, without a signed-in
 * clerk. There's no whitelisted Google account behind a webhook call, so
 * this doesn't go through requireAuth — instead it's gated by a static
 * shared secret (INTAKE_API_KEY). Unset by default: until an operator
 * sets it, these routes report 501 rather than accepting unauthenticated
 * writes, since a bot integration isn't wired up yet either way.
 */
export const intakeRouter = Router();

function checkIntakeKey(req: import("express").Request, res: import("express").Response): boolean {
  const configuredKey = process.env.INTAKE_API_KEY || "";
  if (!configuredKey) {
    res.status(501).json({
      error: "SMS/WhatsApp intake is not enabled on this server. Set INTAKE_API_KEY to turn it on.",
    });
    return false;
  }
  if (req.headers["x-intake-key"] !== configuredKey) {
    res.status(401).json({ error: "Invalid or missing intake key" });
    return false;
  }
  return true;
}

const caseIntakeSchema = z.object({
  county: z.string().min(1),
  district: z.string().min(1),
  caseType: z.string().min(1),
  quarter: z.string().optional(),
  reporterName: z.string().min(1),
  reporterPhone: z.string().optional(),
  respondentName: z.string().optional(),
  description: z.string().min(1),
  photoReference: z.string().optional(),
});

intakeRouter.post("/case", async (req, res) => {
  if (!checkIntakeKey(req, res)) return;
  const parsed = caseIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  try {
    const item = await createNode({
      resource: "Case",
      props: {
        case_number: `INTAKE-${Date.now()}`,
        type: input.caseType,
        status: "intake_pending",
        quarter: input.quarter,
        summary: input.description,
        reporter_name: input.reporterName,
        reporter_phone: input.reporterPhone,
        respondent_name: input.respondentName,
      },
      scope: { county: input.county, district: input.district },
      actorEmail: "intake-bot",
    });
    res.status(201).json({ item });
  } catch (err) {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to create case from intake",
    });
  }
});

const fireIntakeSchema = z.object({
  county: z.string().min(1),
  district: z.string().min(1),
  incidentType: z.string().min(1),
  quarter: z.string().optional(),
  reporterName: z.string().min(1),
  reporterPhone: z.string().optional(),
  description: z.string().min(1),
  photoReference: z.string().optional(),
});

intakeRouter.post("/fire-incident", async (req, res) => {
  if (!checkIntakeKey(req, res)) return;
  const parsed = fireIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  try {
    const item = await createNode({
      resource: "FireIncident",
      props: {
        incident_type: input.incidentType,
        quarter: input.quarter,
        date_reported: new Date().toISOString(),
        status: "reported",
        description: input.description,
        photo_reference: input.photoReference,
        reporter_name: input.reporterName,
        reporter_phone: input.reporterPhone,
      },
      scope: { county: input.county, district: input.district },
      actorEmail: "intake-bot",
    });
    res.status(201).json({ item });
  } catch (err) {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to create fire incident from intake",
    });
  }
});
