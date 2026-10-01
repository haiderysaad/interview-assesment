import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

export default function SessionList() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    api("/sessions")
      .then(setSessions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
      <div className="row">
        <h1>Interview Sessions</h1>
        <Link className="btn" to="/admin/sessions/new">+ New session</Link>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr><th>Title</th><th>Role</th><th>Rounds</th><th>Window</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.title}</td>
              <td>{s.role}</td>
              <td>{s.rounds.map((r) => r.type).join(" → ")}</td>
              <td>
                {new Date(s.startsAt).toLocaleString()} – {new Date(s.endsAt).toLocaleString()}
              </td>
              <td>{s.status}</td>
              <td>
                <div className="row-tight">
                  <Link to={`/admin/sessions/${s.id}`}>Manage</Link>
                {s.rounds.some((r) => r.type === "APTITUDE") && (
                  <Link to={`/admin/sessions/${s.id}/aptitude`}>Edit aptitude questions</Link>
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
          {!loading && !error && sessions.length === 0 && (
            <tr><td colSpan="6">No sessions yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}