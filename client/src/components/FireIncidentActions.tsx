import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import {
  dispatchScout,
  getNearestWaterPoints,
  referToAgency,
  respondLocally,
  submitScoutReport,
  type WaterPointSuggestion,
} from "../api/fireIncidents";

interface FireStation {
  id: string;
  name?: string;
  status: string;
}

interface FireAgency {
  id: string;
  name: string;
}

interface NamedRecord {
  id: string;
  full_name: string;
}

export function FireIncidentActions({ incidentId }: { incidentId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [waterPoints, setWaterPoints] = useState<WaterPointSuggestion[]>([]);
  const [stations, setStations] = useState<FireStation[]>([]);
  const [agencies, setAgencies] = useState<FireAgency[]>([]);
  const [people, setPeople] = useState<NamedRecord[]>([]);
  const [officials, setOfficials] = useState<NamedRecord[]>([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedAgency, setSelectedAgency] = useState("");
  const [referNotes, setReferNotes] = useState("");
  const [scoutType, setScoutType] = useState<"Person" | "Official">("Official");
  const [scoutId, setScoutId] = useState("");
  const [reportResult, setReportResult] = useState<"confirmed" | "false_alarm">("confirmed");
  const [reportSeverity, setReportSeverity] = useState<"" | "minor" | "moderate" | "severe">("");
  const [reportChannel, setReportChannel] = useState<"whatsapp" | "radio">("radio");
  const [reportNotes, setReportNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const [incident, wp, stationList, agencyList, peopleList, officialList] = await Promise.all([
        api.get<{ item: { status: string; severity?: string } }>(`/fire-incidents/${incidentId}`),
        getNearestWaterPoints(incidentId),
        api.get<{ items: FireStation[] }>("/fire-stations"),
        api.get<{ items: FireAgency[] }>("/fire-agencies"),
        api.get<{ items: NamedRecord[] }>("/people"),
        api.get<{ items: NamedRecord[] }>("/officials"),
      ]);
      setStatus(incident.item.status);
      setSeverity(incident.item.severity || null);
      setWaterPoints(wp.items);
      setStations(stationList.items);
      setAgencies(agencyList.items);
      setPeople(peopleList.items);
      setOfficials(officialList.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load fire response info (offline?)");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  const operationalStations = stations.filter((s) => s.status === "operational");
  const scoutOptions = scoutType === "Person" ? people : officials;

  const handleRespondLocally = async () => {
    if (!selectedStation) return;
    setBusy(true);
    setError(null);
    try {
      await respondLocally(incidentId, selectedStation);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to dispatch locally");
    } finally {
      setBusy(false);
    }
  };

  const handleRefer = async () => {
    if (!selectedAgency) return;
    setBusy(true);
    setError(null);
    try {
      await referToAgency(incidentId, selectedAgency, referNotes || undefined);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refer incident");
    } finally {
      setBusy(false);
    }
  };

  const handleDispatchScout = async () => {
    if (!scoutId) return;
    setBusy(true);
    setError(null);
    try {
      await dispatchScout(incidentId, scoutType, scoutId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to dispatch scout");
    } finally {
      setBusy(false);
    }
  };

  const handleScoutReport = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitScoutReport(incidentId, {
        result: reportResult,
        severity: reportSeverity || undefined,
        channel: reportChannel,
        notes: reportNotes || undefined,
      });
      setReportNotes("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to log scout report");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="fire-actions-panel">
      <h2>Response</h2>
      {error && <p className="form-error">{error}</p>}
      <p className="muted">
        Current status: {status}
        {severity ? ` · severity: ${severity}` : ""}
      </p>

      {waterPoints.length > 0 && (
        <div className="fire-actions-block">
          <h3>Nearest water points</h3>
          <p className="muted">For community bucket-brigade response while help is on the way.</p>
          <ul className="water-point-list">
            {waterPoints.map((wp) => (
              <li key={wp.id}>
                {wp.title}
                {wp.distanceKm !== null ? ` — ${wp.distanceKm.toFixed(1)} km` : wp.quarter ? ` — ${wp.quarter}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="fire-actions-block">
        <h3>Dispatch motorbike scout</h3>
        <p className="muted">
          Send someone fast to confirm what's actually happening before committing a truck or deciding to refer.
        </p>
        <div className="inline-controls">
          <select
            value={scoutType}
            onChange={(e) => {
              setScoutType(e.target.value as "Person" | "Official");
              setScoutId("");
            }}
          >
            <option value="Official">Official</option>
            <option value="Person">Person</option>
          </select>
          <select value={scoutId} onChange={(e) => setScoutId(e.target.value)}>
            <option value="">Select scout…</option>
            {scoutOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <button type="button" disabled={!scoutId || busy} onClick={handleDispatchScout}>
            {busy ? "Dispatching…" : "Dispatch Scout"}
          </button>
        </div>

        <h4 className="fire-actions-subheading">Log scout report</h4>
        <div className="inline-controls">
          <select value={reportResult} onChange={(e) => setReportResult(e.target.value as "confirmed" | "false_alarm")}>
            <option value="confirmed">Fire confirmed</option>
            <option value="false_alarm">False alarm</option>
          </select>
          <select
            value={reportSeverity}
            onChange={(e) => setReportSeverity(e.target.value as "" | "minor" | "moderate" | "severe")}
          >
            <option value="">Severity (optional)</option>
            <option value="minor">Minor</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
          <select value={reportChannel} onChange={(e) => setReportChannel(e.target.value as "whatsapp" | "radio")}>
            <option value="radio">Radio</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <textarea
          placeholder="Notes from the scout's report (optional)"
          value={reportNotes}
          onChange={(e) => setReportNotes(e.target.value)}
          rows={2}
        />
        <button type="button" disabled={busy} onClick={handleScoutReport}>
          {busy ? "Logging…" : "Log Scout Report"}
        </button>
      </div>

      {operationalStations.length > 0 && (
        <div className="fire-actions-block">
          <h3>Respond locally</h3>
          <p className="muted">Dispatch this office's own apparatus.</p>
          <div className="inline-controls">
            <select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value)}>
              <option value="">Select station…</option>
              {operationalStations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || "Fire Station"}
                </option>
              ))}
            </select>
            <button type="button" disabled={!selectedStation || busy} onClick={handleRespondLocally}>
              {busy ? "Dispatching…" : "Respond Locally"}
            </button>
          </div>
        </div>
      )}

      <div className="fire-actions-block">
        <h3>Refer to agency</h3>
        <p className="muted">
          {operationalStations.length > 0
            ? "For mutual aid on incidents beyond local capacity."
            : "This office has no operational station — referral is the default response."}
        </p>
        <div className="inline-controls">
          <select value={selectedAgency} onChange={(e) => setSelectedAgency(e.target.value)}>
            <option value="">Select agency…</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          placeholder="Notes for the referral communication log (optional)"
          value={referNotes}
          onChange={(e) => setReferNotes(e.target.value)}
          rows={2}
        />
        <button type="button" disabled={!selectedAgency || busy} onClick={handleRefer}>
          {busy ? "Referring…" : "Refer to LNFS"}
        </button>
      </div>
    </div>
  );
}
