import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { getNearestWaterPoints, referToAgency, respondLocally, type WaterPointSuggestion } from "../api/fireIncidents";

interface FireStation {
  id: string;
  name?: string;
  status: string;
}

interface FireAgency {
  id: string;
  name: string;
}

export function FireIncidentActions({ incidentId }: { incidentId: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [waterPoints, setWaterPoints] = useState<WaterPointSuggestion[]>([]);
  const [stations, setStations] = useState<FireStation[]>([]);
  const [agencies, setAgencies] = useState<FireAgency[]>([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedAgency, setSelectedAgency] = useState("");
  const [referNotes, setReferNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const [incident, wp, stationList, agencyList] = await Promise.all([
        api.get<{ item: { status: string } }>(`/fire-incidents/${incidentId}`),
        getNearestWaterPoints(incidentId),
        api.get<{ items: FireStation[] }>("/fire-stations"),
        api.get<{ items: FireAgency[] }>("/fire-agencies"),
      ]);
      setStatus(incident.item.status);
      setWaterPoints(wp.items);
      setStations(stationList.items);
      setAgencies(agencyList.items);
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

  if (!loaded) return null;

  return (
    <div className="fire-actions-panel">
      <h2>Response</h2>
      {error && <p className="form-error">{error}</p>}
      <p className="muted">Current status: {status}</p>

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
