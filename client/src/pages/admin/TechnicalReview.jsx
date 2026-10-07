import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";

export default function TechnicalReview() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [panel, setPanel] = useState("CODE");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const [sessionData, results] = await Promise.all([
      api(`/sessions/${id}`),
      api(`/sessions/${id}/results`),
    ]);
    setSession(sessionData);
    setCandidates(results.candidates);
    const nextCandidateId = results.candidates.some((candidate) => candidate.id === selectedCandidateId)
      ? selectedCandidateId
      : results.candidates[0]?.id ?? "";
    setSelectedCandidateId(nextCandidateId);
    const nextSubmissions = results.candidates.find((candidate) => candidate.id === nextCandidateId)?.technicalSubmissions ?? [];
    setSelectedSubmissionId((current) =>
      nextSubmissions.some((submission) => submission.id === current)
        ? current
        : nextSubmissions[0]?.id ?? "",
    );
  }, [id, selectedCandidateId]);

  useEffect(() => {
    let active = true;
    Promise.all([api(`/sessions/${id}`), api(`/sessions/${id}/results`)])
      .then(([sessionData, results]) => {
        if (!active) return;
        setSession(sessionData);
        setCandidates(results.candidates);
        const firstCandidate = results.candidates[0];
        setSelectedCandidateId(firstCandidate?.id ?? "");
        setSelectedSubmissionId(firstCandidate?.technicalSubmissions[0]?.id ?? "");
      })
      .catch((requestError) => active && setError(requestError.message));
    return () => {
      active = false;
    };
  }, [id]);

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId);
  const submissions = selectedCandidate?.technicalSubmissions ?? [];
  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId);

  const submittedCount = useMemo(
    () => candidates.reduce((count, candidate) => count + candidate.technicalSubmissions.length, 0),
    [candidates],
  );

  async function refresh() {
    setError("");
    try {
      await load();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function requestSyntaxSuggestion() {
    if (!selectedSubmission || busy) return;
    if (!window.confirm("Send this candidate's code to Gemini for a syntax-only suggestion? The original submission will be preserved.")) return;
    setBusy("suggest");
    setError("");
    try {
      await api(`/sessions/${id}/technical-submissions/${selectedSubmission.id}/suggest-syntax-fix`, {
        method: "POST",
      });
      await load();
      setPanel("EVALUATION");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function evaluate(version) {
    if (!selectedSubmission || busy) return;
    if (
      version === "AI_SUGGESTED" &&
      (!selectedSubmission.suggestedCode || !selectedSubmission.suggestionChanged)
    ) return;
    const versionLabel = version === "AI_SUGGESTED" ? "Gemini-suggested" : "original";
    if (!window.confirm(`Run the ${versionLabel} code against all test cases? Each case uses one JDoodle credit.`)) return;
    setBusy(version);
    setError("");
    try {
      await api(`/sessions/${id}/technical-submissions/${selectedSubmission.id}/evaluate`, {
        method: "POST",
        body: { version },
      });
      await load();
      setPanel("EVALUATION");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  if (!session) {
    return <main className="technical-review-loading">{error || "Loading technical review…"}</main>;
  }

  return (
    <main className="technical-review-page">
      <header className="technical-review-topbar">
        <div className="technical-review-brand">
          <Link to={`/admin/sessions/${id}`} aria-label="Back to session">←</Link>
          <div>
            <strong>Technical review</strong>
            <span>{session.title}</span>
          </div>
        </div>
        <nav className="technical-review-tabs" aria-label="Submission view">
          <button
            className={panel === "CODE" ? "is-active" : ""}
            type="button"
            onClick={() => setPanel("CODE")}
          >
            Code
          </button>
          <button
            className={panel === "EVALUATION" ? "is-active" : ""}
            type="button"
            onClick={() => setPanel("EVALUATION")}
          >
            Evaluation
          </button>
        </nav>
        <button className="technical-review-refresh" type="button" onClick={refresh} disabled={Boolean(busy)}>
          Refresh
        </button>
      </header>

      <div className="technical-review-layout">
        <aside className="technical-review-sidebar">
          <div className="technical-review-sidebar-heading">
            <div>
              <span>CANDIDATES</span>
              <strong>{candidates.length}</strong>
            </div>
            <small>{submittedCount} submissions</small>
          </div>
          <div className="technical-review-candidate-list">
            {candidates.map((candidate) => (
              <button
                className={`technical-review-candidate${candidate.id === selectedCandidateId ? " is-selected" : ""}`}
                key={candidate.id}
                type="button"
                onClick={() => {
                  setSelectedCandidateId(candidate.id);
                  setSelectedSubmissionId(candidate.technicalSubmissions[0]?.id ?? "");
                }}
              >
                <span className="technical-review-avatar">
                  {candidate.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span className="technical-review-candidate-copy">
                  <strong>{candidate.name}</strong>
                  <small>{candidate.email}</small>
                  <small>{candidate.technicalSubmissions.length
                    ? `${candidate.technicalSubmissions.length} code submission${candidate.technicalSubmissions.length === 1 ? "" : "s"}`
                    : "No code submitted"}
                  </small>
                </span>
                <span className="technical-review-candidate-arrow" aria-hidden="true">›</span>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="technical-review-empty-sidebar">No candidates have been added to this session.</p>
            )}
          </div>
          <Link className="technical-review-back-link" to={`/admin/sessions/${id}`}>
            Back to session dashboard
          </Link>
        </aside>

        <section className="technical-review-content">
          {error && <p className="technical-review-error" role="alert">{error}</p>}
          {!selectedCandidate ? (
            <div className="technical-review-empty">
              <span>SUBMISSION REVIEW</span>
              <h1>Select a candidate</h1>
              <p>Choose a candidate from the list to view their code and evaluation.</p>
            </div>
          ) : (
            <>
              <div className="technical-review-heading">
                <div>
                  <span>SUBMISSION REVIEW</span>
                  <h1>{selectedCandidate.name}</h1>
                  <p>{selectedCandidate.email}</p>
                </div>
                <label>
                  Problem
                  <select
                    value={selectedSubmissionId}
                    onChange={(event) => setSelectedSubmissionId(event.target.value)}
                    disabled={submissions.length === 0}
                  >
                    {submissions.length === 0 && <option value="">No submitted solutions</option>}
                    {submissions.map((submission) => (
                      <option key={submission.id} value={submission.id}>{submission.questionTitle}</option>
                    ))}
                  </select>
                </label>
              </div>

              {!selectedSubmission ? (
                <div className="technical-review-empty">
                  <span>NO SUBMISSION</span>
                  <h2>Waiting for candidate code</h2>
                  <p>This candidate has not submitted a solution for a technical problem yet.</p>
                </div>
              ) : panel === "CODE" ? (
                <section className="technical-review-panel">
                  <div className="technical-review-code-toolbar">
                    <div>
                      <span className="technical-review-language">{selectedSubmission.language}</span>
                      <span>Submitted {new Date(selectedSubmission.submittedAt).toLocaleString()}</span>
                    </div>
                    <span className="technical-review-version">Original submission</span>
                  </div>
                  <pre className="technical-review-code">{selectedSubmission.code}</pre>
                  <div className="technical-review-actions">
                    <p>Original candidate code is preserved. Gemini suggestions are kept separately and require review.</p>
                    <button
                      className="technical-review-secondary"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={requestSyntaxSuggestion}
                    >
                      {busy === "suggest" ? "Asking Gemini…" : "Suggest syntax correction"}
                    </button>
                    <button
                      className="technical-review-primary"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => evaluate("ORIGINAL")}
                    >
                      {busy === "ORIGINAL" ? "Running tests…" : "Evaluate original code"}
                    </button>
                  </div>
                </section>
              ) : (
                <section className="technical-review-panel technical-review-evaluation">
                  <div className="technical-review-evaluation-heading">
                    <div>
                      <span>EXECUTION RESULTS</span>
                      <h2>{selectedSubmission.evaluation
                        ? selectedSubmission.evaluation.status.replaceAll("_", " ")
                        : "Not evaluated yet"}
                      </h2>
                    </div>
                    {selectedSubmission.evaluation && (
                      <div className="technical-review-metrics">
                        <span><strong>{selectedSubmission.evaluation.passedCount}/{selectedSubmission.evaluation.totalCases}</strong> tests</span>
                        <span><strong>{Number(selectedSubmission.evaluation.cpuTime ?? 0).toFixed(3)}s</strong> runtime</span>
                        <span><strong>{(Number(selectedSubmission.evaluation.memory ?? 0) / 1024).toFixed(1)} KB</strong> memory</span>
                        <small>{selectedSubmission.evaluation.codeVersion === "AI_SUGGESTED" ? "AI-assisted code" : "Original code"}</small>
                      </div>
                    )}
                  </div>

                  {selectedSubmission.suggestedCode && (
                    <div className="technical-review-suggestion">
                      <div>
                        <strong>Gemini syntax suggestion</strong>
                        <span>{selectedSubmission.suggestionChanged ? "Review before running; may affect behavior." : "Gemini found no syntax change to suggest."}</span>
                      </div>
                      {selectedSubmission.suggestionChanged && (
                        <button
                          className="technical-review-secondary"
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => evaluate("AI_SUGGESTED")}
                        >
                          {busy === "AI_SUGGESTED" ? "Running tests…" : "Evaluate suggested code"}
                        </button>
                      )}
                    </div>
                  )}

                  {selectedSubmission.evaluation ? (
                    <div className="technical-review-case-list">
                      {selectedSubmission.evaluation.results.map((result) => (
                        <article className={`technical-review-case${result.passed ? " is-passed" : " is-failed"}`} key={result.index}>
                          <div>
                            <strong>Test case {result.index}</strong>
                            <span>{result.category || "Test case"}</span>
                            <b>{result.errorType || (result.passed ? "Passed" : "Failed")}</b>
                          </div>
                          <div className="technical-review-case-outputs">
                            <section><small>EXPECTED OUTPUT</small><pre>{result.expectedOutput}</pre></section>
                            <section><small>ACTUAL OUTPUT</small><pre>{result.actualOutput || "(no output)"}</pre></section>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="technical-review-empty">
                      <span>NO EVALUATION</span>
                      <h2>Run the candidate code</h2>
                      <p>Each test case uses one JDoodle credit. You can evaluate the original submission or inspect a Gemini syntax suggestion first.</p>
                      <button
                        className="technical-review-primary"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => evaluate("ORIGINAL")}
                      >
                        {busy === "ORIGINAL" ? "Running tests…" : "Evaluate original code"}
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
