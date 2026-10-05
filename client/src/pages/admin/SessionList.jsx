import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

export default function SessionList() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    api("/sessions")
      .then((data) => active && setSessions(data))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function refreshSessions() {
    setError("");
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  async function deleteSession(session) {
    const confirmed = window.confirm(
      `Permanently delete "${session.title}"? This also deletes its questions, candidates, test links, and results.`,
    );
    if (!confirmed || deletingId) return;

    setDeletingId(session.id);
    setError("");
    try {
      await api(`/sessions/${session.id}`, { method: "DELETE" });
      setSessions((current) =>
        current.filter((item) => item.id !== session.id),
      );
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="admin-eyebrow">YOUR WORKSPACE</span>
          <h1>Interview sessions</h1>
          <p>Set up assessments, invite candidates, and review results.</p>
        </div>
        <div className="page-heading-actions">
          <button
            className="ghost refresh-button"
            type="button"
            onClick={refreshSessions}
            disabled={loading}
          >
            <span aria-hidden="true">↻</span> {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link className="btn" to="/admin/sessions/new"><span aria-hidden="true">＋</span> New session</Link>
        </div>
      </div>
      {error && <p className="error admin-alert" role="alert">{error}</p>}

      <section className="admin-summary-card" aria-label="Session summary">
        <div className="admin-summary-copy">
          <span className="admin-eyebrow">SESSION OVERVIEW</span>
          <h2>Your hiring, at a glance.</h2>
          <p>Everything you need to keep your interview process moving.</p>
        </div>
        <div className="admin-summary-count">
          <span>{loading ? "—" : sessions.length}</span>
          <small>{sessions.length === 1 ? "active workspace session" : "sessions in your workspace"}</small>
        </div>
        <span className="admin-summary-decoration" aria-hidden="true">✳</span>
      </section>

      <section className="session-section">
        <div className="section-heading">
          <div>
            <h2>All sessions</h2>
            <p>Manage your interview assessments and candidates.</p>
          </div>
          {!loading && <span className="session-count">{sessions.length} total</span>}
        </div>

        {loading ? (
          <div className="admin-empty-state" role="status">
            <span className="loading-indicator" aria-hidden="true" />
            <strong>Loading sessions</strong>
            <span>Getting your workspace up to date…</span>
          </div>
        ) : error ? (
          <div className="admin-empty-state">
            <span className="empty-state-icon" aria-hidden="true">!</span>
            <strong>We couldn’t load your sessions</strong>
            <span>Check your connection and try again.</span>
            <button className="ghost" type="button" onClick={refreshSessions}>Try again</button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="admin-empty-state">
            <span className="empty-state-icon" aria-hidden="true">▦</span>
            <strong>Your first session starts here</strong>
            <span>Create an interview session to begin inviting candidates.</span>
            <Link className="btn" to="/admin/sessions/new">Create a session <span aria-hidden="true">→</span></Link>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr><th>SESSION</th><th>ROLE</th><th>INTERVIEW ROUNDS</th><th>AVAILABILITY</th><th>STATUS</th><th aria-label="Actions"></th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link className="session-title-link" to={`/admin/sessions/${s.id}`}>{s.title}</Link>
                      <small className="table-subtitle">{new Date(s.startsAt).toLocaleDateString()}</small>
                    </td>
                    <td>{s.role}</td>
                    <td><span className="rounds-summary">{s.rounds.map((r) => r.type.replace("_", " ")).join(" · ")}</span></td>
                    <td>
                      <span>{new Date(s.startsAt).toLocaleString()}</span>
                      <small className="table-subtitle">until {new Date(s.endsAt).toLocaleString()}</small>
                    </td>
                    <td><span className={`status-pill status-${s.status.toLowerCase()}`}>{s.status.toLowerCase()}</span></td>
                    <td>
                      <div className="row-tight session-actions">
                        <Link className="table-action" to={`/admin/sessions/${s.id}`}>Manage <span aria-hidden="true">→</span></Link>
                        {s.rounds.some((r) => r.type === "APTITUDE") && (
                          <Link className="table-action secondary-table-action" to={`/admin/sessions/${s.id}/aptitude`}>Questions</Link>
                        )}
                        <button
                          className="ghost danger-button"
                          type="button"
                          disabled={Boolean(deletingId)}
                          onClick={() => deleteSession(s)}
                        >
                          {deletingId === s.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}