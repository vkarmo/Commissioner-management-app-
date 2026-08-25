import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { getParcelDetail, type ParcelDetail } from "../api/landRecords";

export function ParcelDetailPanel({ parcelId }: { parcelId: string }) {
  const [detail, setDetail] = useState<ParcelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getParcelDetail(parcelId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load parcel detail (offline?)"));
  }, [parcelId]);

  if (error) return <p className="muted">{error}</p>;
  if (!detail) return null;

  return (
    <div className="fire-actions-panel">
      <h2>Land Records</h2>

      {detail.openDisputes.length > 0 && (
        <p className="dispute-flag">⚠ Subject of {detail.openDisputes.length} open dispute(s)</p>
      )}

      <div className="fire-actions-block">
        <h3>Deed history</h3>
        {detail.deeds.length === 0 ? (
          <p className="muted">No deeds on file for this parcel.</p>
        ) : (
          <ul>
            {detail.deeds.map((d) => (
              <li key={d.id as string}>
                {d.deed_number as string} ({d.type as string}, {d.issue_date as string})
                {d.owner ? ` — held by ${(d.owner as any).full_name}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fire-actions-block">
        <h3>Adjacent parcels</h3>
        {detail.adjacentParcels.length === 0 ? (
          <p className="muted">No adjacency recorded.</p>
        ) : (
          <ul>
            {detail.adjacentParcels.map((p) => (
              <li key={p.id as string}>{(p.parcel_ref as string) || p.id as string}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
