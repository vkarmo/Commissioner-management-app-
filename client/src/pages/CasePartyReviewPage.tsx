import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  confirmCaseParty,
  createCasePartyPerson,
  listCasePartyReview,
  type CasePartyReviewItem,
  type PersonCandidate,
} from "../api/casePartyReview";

/**
 * Phase 1.4 (schema-patch spec, 2026-09-25): a clerk's queue for turning
 * SMS/WhatsApp intake's free-text reporter/respondent names into real
 * Person links. Confirming a suggested match, or adding a new Person, is
 * always an explicit clerk action — nothing here auto-links on name alone.
 */
function NewPersonForm({ onCreate }: { onCreate: (fullName: string, phone: string) => Promise<void> }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!fullName.trim()) return;
        setBusy(true);
        try {
          await onCreate(fullName.trim(), phone.trim());
          setFullName("");
          setPhone("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <button type="submit" disabled={busy || !fullName.trim()}>
        Create &amp; link
      </button>
    </form>
  );
}

function PartySection({
  label,
  nameText,
  candidates,
  onConfirm,
  onCreate,
}: {
  label: string;
  nameText: string;
  candidates: PersonCandidate[];
  onConfirm: (personId: string) => Promise<void>;
  onCreate: (fullName: string, phone: string) => Promise<void>;
}) {
  return (
    <div className="party-section">
      <h4>
        {label}: {nameText || "(no name given)"}
      </h4>
      {candidates.length === 0 ? (
        <p className="muted">No matching Person found in your records.</p>
      ) : (
        <ul className="candidate-list">
          {candidates.map((c) => (
            <li key={c.id}>
              {c.full_name} {c.phone ? `(${c.phone})` : ""}{" "}
              <span className="muted">{c.match_type === "phone" ? "matched by phone" : "matched by name"}</span>{" "}
              <button type="button" onClick={() => onConfirm(c.id)}>
                Confirm
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Not one of these? Create a new person record and link it:</p>
      <NewPersonForm onCreate={onCreate} />
    </div>
  );
}

export function CasePartyReviewPage() {
  const [items, setItems] = useState<CasePartyReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listCasePartyReview()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the review queue"));
  };

  useEffect(load, []);

  return (
    <div>
      <h1>Case Party Review</h1>
      <p className="muted">
        Cases filed via SMS/WhatsApp intake, or with a reporter/respondent name that isn't linked to a Person
        record yet. Confirm a suggested match or create a new person — never auto-linked on name alone.
      </p>
      {error && <p className="form-error">{error}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items && items.length === 0 && <p className="muted">Nothing to review.</p>}
      {items?.map((item) => (
        <div key={item.case.id} className="review-card">
          <div className="page-header">
            <h3>{item.case.case_number}</h3>
            <Link to={`/cases/${item.case.id}`}>Open case</Link>
          </div>
          <p className="muted">{(item.case.summary as string) || ""}</p>
          {item.reporterUnresolved && (
            <PartySection
              label="Reporter"
              nameText={(item.case.reporter_name as string) || ""}
              candidates={item.reporterCandidates}
              onConfirm={async (personId) => {
                await confirmCaseParty(item.case.id, "reporter", personId);
                load();
              }}
              onCreate={async (fullName, phone) => {
                await createCasePartyPerson(item.case.id, "reporter", fullName, phone || undefined);
                load();
              }}
            />
          )}
          {item.respondentUnresolved && (
            <PartySection
              label="Respondent"
              nameText={(item.case.respondent_name as string) || ""}
              candidates={item.respondentCandidates}
              onConfirm={async (personId) => {
                await confirmCaseParty(item.case.id, "respondent", personId);
                load();
              }}
              onCreate={async (fullName, phone) => {
                await createCasePartyPerson(item.case.id, "respondent", fullName, phone || undefined);
                load();
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
