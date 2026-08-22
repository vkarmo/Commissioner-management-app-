import { useEffect, useState } from "react";
import { db } from "../db/db";
import { flushQueue } from "../db/sync";

export function OfflineIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const tick = async () => {
      const count = await db.mutations.where("status").anyOf("pending", "error", "syncing").count();
      setPending(count);
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, []);

  if (online && pending === 0) {
    return <span className="status-pill status-ok">Online · synced</span>;
  }

  return (
    <span className={`status-pill ${online ? "status-syncing" : "status-offline"}`}>
      {online ? `Syncing ${pending} change${pending === 1 ? "" : "s"}…` : `Offline · ${pending} queued`}
      {online && pending > 0 && (
        <button type="button" onClick={() => void flushQueue()} className="link-button">
          retry now
        </button>
      )}
    </span>
  );
}
