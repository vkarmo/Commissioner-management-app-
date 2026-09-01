import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, scopeFromRequest } from "../middleware/auth.js";
import { OFFICE_STAFF } from "../schema/roleGroups.js";
import {
  createNode,
  getNode,
  listNodes,
  NotFoundError,
  relate,
  updateNode,
  ValidationError,
} from "../services/graphService.js";
import { distanceKm } from "../utils/geo.js";

/**
 * Fire Incident Reporting actions beyond plain CRUD (build prompt module 8):
 * nearest-water-point suggestions at intake, the two dispatch actions
 * ("Respond Locally" vs "Refer to LNFS"), and motorbike scout dispatch/
 * report-back. Each action is a single step because it both records a
 * relationship (or CommunicationLog entry) *and* advances status.
 */
export const fireIncidentActionsRouter = Router();
fireIncidentActionsRouter.use(requireAuth, requireRole(...OFFICE_STAFF));

fireIncidentActionsRouter.get("/:id/nearest-water-points", async (req, res) => {
  try {
    const scope = scopeFromRequest(req);
    const incident: any = await getNode("FireIncident", req.params.id, scope);
    const waterPoints = await listNodes({
      resource: "PublicWorksItem",
      scope,
      filters: { category: "water_point" },
      limit: 500,
    });

    const hasIncidentGps = typeof incident.gps_lat === "number" && typeof incident.gps_lng === "number";

    const ranked = (waterPoints as any[])
      .map((wp) => {
        const hasWpGps = typeof wp.gps_lat === "number" && typeof wp.gps_lng === "number";
        if (hasIncidentGps && hasWpGps) {
          return { ...wp, matchType: "gps", distanceKm: distanceKm(incident.gps_lat, incident.gps_lng, wp.gps_lat, wp.gps_lng) };
        }
        return { ...wp, matchType: wp.quarter && wp.quarter === incident.quarter ? "quarter" : "office", distanceKm: null };
      })
      .sort((a, b) => {
        if (a.matchType === "gps" && b.matchType === "gps") return a.distanceKm - b.distanceKm;
        if (a.matchType === "gps") return -1;
        if (b.matchType === "gps") return 1;
        if (a.matchType === "quarter" && b.matchType !== "quarter") return -1;
        if (b.matchType === "quarter" && a.matchType !== "quarter") return 1;
        return 0;
      })
      .slice(0, 5);

    res.json({ items: ranked });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : 500).json({
      error: err instanceof Error ? err.message : "Failed to find nearby water points",
    });
  }
});

const respondLocallySchema = z.object({ fireStationId: z.string().min(1) });

fireIncidentActionsRouter.post("/:id/respond-locally", async (req, res) => {
  const parsed = respondLocallySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    const station: any = await getNode("FireStation", parsed.data.fireStationId, scope);
    if (station.status !== "operational") {
      res.status(400).json({ error: "That fire station is not operational" });
      return;
    }
    await relate("RESPONDED_BY", "FireIncident", req.params.id, "FireStation", parsed.data.fireStationId, scope);
    const item = await updateNode({
      resource: "FireIncident",
      id: req.params.id,
      patch: { status: "responding" },
      scope,
      actorEmail: req.user!.email,
    });
    res.json({ item });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to dispatch locally",
    });
  }
});

const referSchema = z.object({
  fireAgencyId: z.string().min(1),
  notes: z.string().optional(),
  channel: z.enum(["phone", "radio", "sms", "whatsapp", "in_person", "letter", "email"]).default("phone"),
});

fireIncidentActionsRouter.post("/:id/refer", async (req, res) => {
  const parsed = referSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    const agency: any = await getNode("FireAgency", parsed.data.fireAgencyId, scope);

    await relate("REFERRED_TO", "FireIncident", req.params.id, "FireAgency", parsed.data.fireAgencyId, scope);

    const log = await createNode({
      resource: "CommunicationLog",
      props: {
        channel: parsed.data.channel,
        direction: "outbound",
        date: new Date().toISOString(),
        contact_name: agency.name,
        summary: parsed.data.notes || `Fire incident referred to ${agency.name}`,
      },
      scope,
      actorEmail: req.user!.email,
    });
    await relate("LINKED_TO", "FireIncident", req.params.id, "CommunicationLog", (log as any).id, scope);

    const item = await updateNode({
      resource: "FireIncident",
      id: req.params.id,
      patch: { status: "referred_to_lnfs" },
      scope,
      actorEmail: req.user!.email,
    });
    res.json({ item, communicationLog: log });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to refer incident",
    });
  }
});

/**
 * Motorbike scout dispatch: a fast, low-cost way to confirm what's
 * actually happening before committing a truck (or deciding to refer)
 * — an optional action alongside Respond Locally / Refer to LNFS, not a
 * gate in front of them. Dispatch just records who was sent; the scout's
 * report back (radio/WhatsApp) is logged separately once they call in.
 */
const dispatchScoutSchema = z.object({
  scoutType: z.enum(["Person", "Official"]),
  scoutId: z.string().min(1),
});

fireIncidentActionsRouter.post("/:id/dispatch-scout", async (req, res) => {
  const parsed = dispatchScoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    await getNode(parsed.data.scoutType, parsed.data.scoutId, scope);
    await relate("SCOUTED", parsed.data.scoutType, parsed.data.scoutId, "FireIncident", req.params.id, scope);
    const item = await updateNode({
      resource: "FireIncident",
      id: req.params.id,
      patch: { status: "scout_dispatched" },
      scope,
      actorEmail: req.user!.email,
    });
    res.json({ item });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to dispatch scout",
    });
  }
});

const scoutReportSchema = z.object({
  result: z.enum(["confirmed", "false_alarm"]),
  severity: z.enum(["minor", "moderate", "severe"]).optional(),
  channel: z.enum(["whatsapp", "radio"]),
  notes: z.string().optional(),
});

fireIncidentActionsRouter.post("/:id/scout-report", async (req, res) => {
  const parsed = scoutReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const scope = scopeFromRequest(req);
    const { result, severity, channel, notes } = parsed.data;

    const summary =
      `Scout report: ${result === "confirmed" ? "fire confirmed" : "false alarm"}` +
      (severity ? `, severity ${severity}` : "") +
      (notes ? ` — ${notes}` : "");

    const log = await createNode({
      resource: "CommunicationLog",
      props: { channel, direction: "inbound", date: new Date().toISOString(), summary },
      scope,
      actorEmail: req.user!.email,
    });
    await relate("LINKED_TO", "FireIncident", req.params.id, "CommunicationLog", (log as any).id, scope);

    const patch: Record<string, unknown> = {};
    if (severity) patch.severity = severity;
    if (result === "false_alarm") patch.status = "resolved";

    const item = Object.keys(patch).length
      ? await updateNode({ resource: "FireIncident", id: req.params.id, patch, scope, actorEmail: req.user!.email })
      : await getNode("FireIncident", req.params.id, scope);

    res.json({ item, communicationLog: log });
  } catch (err) {
    res.status(err instanceof NotFoundError ? 404 : err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof Error ? err.message : "Failed to log scout report",
    });
  }
});
