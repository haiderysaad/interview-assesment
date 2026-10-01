import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";

export default function SessionDetail() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "" });
  const [copied, setCopied] = useState("");

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

  async function copyLink(token) {
    const link = `${window.location.origin}/test/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(token);
      setTimeout(() => setCopied(""), 1500);
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
            <Link className="btn" to={`/admin/sessions/${id}/aptitude`}>Edit questions</Link>
            <button className="btn" type="button" onClick={() => setStatus("PUBLISHED")}>Publish</button>
          </>
        )}
        {session.status === "PUBLISHED" && (
          <button className="btn" type="button" onClick={() => setStatus("CLOSED")}>Close session</button>
        )}
        <button className="ghost" type="button" onClick={load}>Refresh</button>
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
          <tr><th>Candidate</th><th>Status</th><th>Score</th><th>%</th><th>Submitted</th><th>Test link</th></tr>
        </thead>
        <tbody>
          {results.candidates.map((c) => (
            <tr key={c.id}>
              <td>{c.name}<br /><small>{c.email}</small></td>
              <td>{c.status.replace("_", " ")}{c.autoSubmitted && " (auto)"}</td>
              <td>{c.status === "SUBMITTED" ? `${c.score} / ${c.totalMarks}` : "—"}</td>
              <td>{c.percentage !== null ? `${c.percentage}%` : "—"}</td>
              <td>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
              <td>
                <button className="ghost" type="button" onClick={() => copyLink(c.token)}>
                  {copied === c.token ? "Copied" : "Copy link"}
                </button>
              </td>
            </tr>
          ))}
          {results.candidates.length === 0 && <tr><td colSpan="6">No candidates yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}