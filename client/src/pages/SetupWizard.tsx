import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { submitSetup, testNeo4jConnection, type SetupStatus } from "../api/setup";

interface SetupWizardProps {
  status: SetupStatus;
  onComplete: () => Promise<void> | void;
  /** Rendered inside the authenticated shell as a Settings page, not the pre-login gate. */
  embedded?: boolean;
}

interface FormState {
  neo4jUri: string;
  neo4jUsername: string;
  neo4jPassword: string;
  neo4jDatabase: string;
  googleClientId: string;
  jwtSecret: string;
  bootstrapSuperAdmins: string;
  bootstrapSuperAdminCounty: string;
  corsOrigin: string;
}

function initialFormState(status: SetupStatus): FormState {
  return {
    neo4jUri: status.neo4jUri || "",
    neo4jUsername: status.neo4jUsername || "neo4j",
    neo4jPassword: "",
    neo4jDatabase: status.neo4jDatabase || "neo4j",
    googleClientId: status.googleClientId || "",
    jwtSecret: "",
    bootstrapSuperAdmins: (status.bootstrapSuperAdmins || []).join(", "),
    bootstrapSuperAdminCounty: status.bootstrapSuperAdminCounty || "",
    corsOrigin: status.corsOrigin || "",
  };
}

export function SetupWizard({ status, onComplete, embedded }: SetupWizardProps) {
  const [form, setForm] = useState<FormState>(() => initialFormState(status));
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testNeo4jConnection({
        neo4jUri: form.neo4jUri,
        neo4jUsername: form.neo4jUsername,
        neo4jPassword: form.neo4jPassword,
        neo4jDatabase: form.neo4jDatabase,
      });
      setTestResult(result.ok ? { ok: true, message: "Connected." } : { ok: false, message: result.error || "Failed" });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof ApiError ? err.message : "Failed to reach the server" });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const emails = form.bootstrapSuperAdmins
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setError("At least one Super Admin email is required so someone can sign in first.");
      return;
    }
    setSaving(true);
    try {
      await submitSetup({
        neo4jUri: form.neo4jUri,
        neo4jUsername: form.neo4jUsername,
        neo4jPassword: form.neo4jPassword,
        neo4jDatabase: form.neo4jDatabase || "neo4j",
        googleClientId: form.googleClientId,
        jwtSecret: form.jwtSecret || undefined,
        bootstrapSuperAdmins: emails,
        bootstrapSuperAdminCounty: form.bootstrapSuperAdminCounty,
        corsOrigin: form.corsOrigin || undefined,
      });
      setDone(true);
      await onComplete();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save setup");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <form onSubmit={handleSubmit} className="record-form setup-form">
      <fieldset>
        <legend>Neo4j / AuraDB connection</legend>
        <label className="form-field">
          <span>Connection URI</span>
          <input
            value={form.neo4jUri}
            onChange={set("neo4jUri")}
            placeholder="neo4j+s://xxxxxxxx.databases.neo4j.io"
            required
          />
        </label>
        <label className="form-field">
          <span>Username</span>
          <input value={form.neo4jUsername} onChange={set("neo4jUsername")} required />
        </label>
        <label className="form-field">
          <span>Password</span>
          <input
            type="password"
            value={form.neo4jPassword}
            onChange={set("neo4jPassword")}
            placeholder={status.hasNeo4jPassword ? "Re-enter to change or confirm" : ""}
            required
          />
        </label>
        <label className="form-field">
          <span>Database name</span>
          <input value={form.neo4jDatabase} onChange={set("neo4jDatabase")} placeholder="neo4j" />
        </label>
        <div className="setup-test-row">
          <button type="button" onClick={handleTestConnection} disabled={testing}>
            {testing ? "Testing…" : "Test connection"}
          </button>
          {testResult && (
            <span className={testResult.ok ? "status-pill status-ok" : "status-pill status-offline"}>
              {testResult.message}
            </span>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Google Sign-In</legend>
        <label className="form-field">
          <span>Google OAuth Client ID</span>
          <input
            value={form.googleClientId}
            onChange={set("googleClientId")}
            placeholder="xxxxx.apps.googleusercontent.com"
            required
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>First Super Admin</legend>
        <label className="form-field">
          <span>Super Admin email(s), comma-separated</span>
          <input
            value={form.bootstrapSuperAdmins}
            onChange={set("bootstrapSuperAdmins")}
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="form-field">
          <span>County</span>
          <input
            value={form.bootstrapSuperAdminCounty}
            onChange={set("bootstrapSuperAdminCounty")}
            placeholder="Bomi"
            required
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Advanced (optional)</legend>
        <label className="form-field">
          <span>JWT signing secret</span>
          <input
            value={form.jwtSecret}
            onChange={set("jwtSecret")}
            placeholder={status.hasJwtSecret ? "Leave blank to keep the current secret" : "Leave blank to auto-generate"}
          />
        </label>
        <label className="form-field">
          <span>Allowed client origin (CORS)</span>
          <input value={form.corsOrigin} onChange={set("corsOrigin")} placeholder="http://localhost:5173" />
        </label>
      </fieldset>

      {error && <p className="form-error">{error}</p>}
      {done && <p className="muted">Saved. {embedded ? "" : "Redirecting to sign-in…"}</p>}
      <button type="submit" disabled={saving}>
        {saving ? "Saving…" : embedded ? "Save changes" : "Finish setup"}
      </button>
    </form>
  );

  if (embedded) return body;

  return (
    <div className="login-screen">
      <div className="setup-card">
        <h1>Set up Commissioner's Office</h1>
        <p className="muted">
          This runs once, before anyone can sign in. You can change these later from Settings as a Super Admin.
        </p>
        {body}
      </div>
    </div>
  );
}
