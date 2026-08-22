import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePublicConfig } from "../config/PublicConfigContext";
import { getSetupStatus, type SetupStatus } from "../api/setup";
import { SetupWizard } from "./SetupWizard";

const ADMIN_ROLES = new Set(["SuperAdmin", "CountySuperAdmin"]);

export function SettingsPage() {
  const { user } = useAuth();
  const { refresh } = usePublicConfig();
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    // Re-fetches with the admin's auth token attached, which unlocks the
    // full prefill (Neo4j URI/username/etc.) that GET /setup/status
    // withholds from unauthenticated callers once the app is configured.
    getSetupStatus().then(setStatus);
  }, []);

  if (!user || !ADMIN_ROLES.has(user.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="muted">
        Update the server's Neo4j connection, Google Sign-In client ID, or bootstrap Super Admins. The Neo4j
        password and JWT secret are never shown here — leave them blank to keep the current value.
      </p>
      {status ? (
        <SetupWizard
          status={status}
          embedded
          onComplete={async () => {
            const next = await getSetupStatus();
            setStatus(next);
            await refresh();
          }}
        />
      ) : (
        <p className="muted">Loading…</p>
      )}
    </div>
  );
}
