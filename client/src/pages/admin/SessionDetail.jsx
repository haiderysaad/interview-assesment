import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "" });
  const [copied, setCopied] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => {
    setError("");
    setReloadKey((key) => key + 1);
  };

  useEffect(() => {
    let active = true;
    Promise.all([api(`/sessions/${id}`), api(`/sessions/${id}/results`)])
      .then(([s, r]) => {
        if (!active) return;
        setSession(s);
        setResults(r);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (session?.status !== "PUBLISHED") return undefined;

    let active = true;
    const refreshResults = async () => {
      try {
        const updatedResults = await api(`/sessions/${id}/results`);
        if (active) {
          setResults(updatedResults);
          setError("");
        }
      } catch (refreshError) {
        if (active) setError(refreshError.message);
      }
    };

    const timer = window.setInterval(refreshResults, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id, session?.status]);

  async function setStatus(status) {
    const text = status === "PUBLISHED"
      ? "Publish this session? Questions can't be edited afterwards."
      : "Close this session? No new candidates can start.";
    if (!window.confirm(text)) return;
    setError("");
    try {
      await api(`/sessions/${id}/status`, { method: "PATCH", body: { status } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function addCandidate(e) {
    e.preventDefault();
    setError("");
    try {
      await api(`/sessions/${id}/candidates`, { method: "POST", body: form });
      setForm({ name: "", email: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteSession() {
    const confirmed = window.confirm(
      `Permanently delete "${session.title}"? This also deletes its questions, candidates, test links, and results.`,
    );
    if (!confirmed || deleting) return;

    setDeleting(true);
    setError("");
    try {
      await api(`/sessions/${id}`, { method: "DELETE" });
      navigate("/admin", { replace: true });
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
    }
  }

  async function copyShareLink() {
    const link = `${window.location.origin}/join/${session.shareToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", link);
    }
  }

  if (!session || !results)
    return <div className="page">{error ? <p className="error">{error}</p> : "Loading…"}</div>;

  const submittedCandidates = results.candidates.filter(
    (candidate) => candidate.status === "SUBMITTED",
  );
  const scoredCandidates = submittedCandidates.filter(
    (candidate) => typeof candidate.percentage === "number",
  );
  const averagePercentage =
    scoredCandidates.length > 0
      ? Math.round(
          scoredCandidates.reduce(
            (sum, candidate) => sum + candidate.percentage,
            0,
          ) / scoredCandidates.length,
        )
      : null;

  return (
    <div className="page">
      <Link to="/admin">← Back</Link>
      <div className="row">
        <h1>{session.title}</h1>
        <strong>{session.status}</strong>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="row-tight">
        {session.status === "DRAFT" && (
          <>
            {session.rounds.some((round) => round.type === "APTITUDE") && (
              <Link className="btn" to={`/admin/sessions/${id}/aptitude`}>Edit aptitude questions</Link>
            )}
            {session.rounds.some((round) => round.type === "TECHNICAL") && (
              <Link className="btn" to={`/admin/sessions/${id}/technical`}>Edit technical questions</Link>
            )}
            <button className="btn" type="button" onClick={() => setStatus("PUBLISHED")}>Publish</button>
          </>
        )}
        {session.status === "PUBLISHED" && (
          <button className="btn" type="button" onClick={() => setStatus("CLOSED")}>Close session</button>
        )}
        <button className="ghost" type="button" onClick={load}>Refresh</button>
        <button
          className="ghost danger-button"
          type="button"
          onClick={deleteSession}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete session"}
        </button>
      </div>
      {session.status === "DRAFT" && (
        <p>Candidate links only work after you publish. {results.questionCount} question(s) saved.</p>
      )}
      {session.status === "PUBLISHED" && (
        <p className="results-refresh-note">
          Candidate scores refresh automatically every 10 seconds.
        </p>
      )}

      <section className="results-overview" aria-label="Candidate results summary">
        <div className="results-metric">
          <span>Candidates</span>
          <strong>{results.candidates.length}</strong>
        </div>
        <div className="results-metric">
          <span>Tests submitted</span>
          <strong>{submittedCandidates.length}</strong>
        </div>
        <div className="results-metric">
          <span>Average score</span>
          <strong>{averagePercentage === null ? "—" : `${averagePercentage}%`}</strong>
        </div>
      </section>

      {session.rounds.some((round) => round.type === "TECHNICAL") && (
        <section className="technical-review-entry">
          <div>
            <strong>Technical submissions</strong>
            <p>Review candidate code, request syntax suggestions, and run submissions against test cases.</p>
          </div>
          <Link className="btn" to={`/admin/sessions/${id}/technical-review`}>
            Open technical review
          </Link>
        </section>
      )}

      <div className="row-tight">
        <input readOnly value={`${window.location.origin}/join/${session.shareToken}`}
          onFocus={(e) => e.target.select()} />
        <button className="btn" type="button" onClick={copyShareLink}>
          {copied ? "Copied" : "Copy test link"}
        </button>
      </div>
      <p><small>One link for all candidates. They must sign in with a Google email listed below.</small></p>

      {session.status !== "CLOSED" && (
        <form className="row" onSubmit={addCandidate}>
          <input placeholder="Candidate name" value={form.name} required
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input type="email" placeholder="Candidate email" value={form.email} required
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <button className="btn" type="submit">Add candidate</button>
        </form>
      )}

      <table>
        <thead>
          <tr><th>Candidate</th><th>Aptitude status</th><th>Aptitude score</th><th>%</th><th>Tests</th><th>Runtime</th><th>Memory</th><th>Combined</th><th>Rank</th><th>Submitted</th></tr>
        </thead>
        <tbody>
          {[...results.candidates].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)).map((c) => (
            <tr key={c.id}>
              <td>{c.name}<br /><small>{c.email}</small></td>
              <td>
  {c.status.replace("_", " ")}{c.autoSubmitted && " (auto)"}
  {c.removedReason && <><br /><small className="error">Removed: {c.removedReason.replace("_", " ")}</small></>}
</td>
              <td>{c.status === "SUBMITTED" ? `${c.score} / ${c.totalMarks}` : "—"}</td>
              <td>{c.percentage !== null ? `${c.percentage}%` : "—"}</td>
              <td>{c.techTotal > 0 ? `${c.techPassed} / ${c.techTotal}` : "Not evaluated"}</td>
              <td>{c.techTotal > 0 ? `${Number(c.techRuntime).toFixed(3)}s` : "—"}</td>
              <td>{c.techTotal > 0 ? c.techMemory : "—"}</td>
              <td>{c.combined !== null ? `${c.combined}%` : "—"}</td>
              <td>{c.rank ? `#${c.rank}` : "—"}</td>
              <td>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
          {results.candidates.length === 0 && <tr><td colSpan="10">No candidates yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}