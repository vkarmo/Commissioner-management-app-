export function ConnectionProblem({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Can't reach the server</h1>
        <p className="muted">{error}</p>
        <p className="muted">Check that the API server is running and reachable, then retry.</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}
