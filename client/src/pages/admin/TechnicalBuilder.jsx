import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";

let nextQuestionKey = 0;

function createQuestion(question = {}) {
  return {
    key: ++nextQuestionKey,
    id: question.id,
    title: question.title ?? "",
    difficulty: question.difficulty ?? "MEDIUM",
    statement: question.statement ?? "",
    inputFormat: question.inputFormat ?? "",
    outputFormat: question.outputFormat ?? "",
    starterCode: question.starterCode ?? {},
    constraints: question.constraints ?? [],
    examples: question.examples?.length
      ? question.examples.map((example) => ({ ...example }))
      : [{ input: "", output: "", explanation: "" }],
    testCases: question.testCases ?? [],
    marks: question.marks ?? 100,
  };
}

export default function TechnicalBuilder() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [round, setRound] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [view, setView] = useState("questions");
  const [message, setMessage] = useState({ text: "", error: false });
  const [analysisByKey, setAnalysisByKey] = useState({});
  const [reviewedTestsByKey, setReviewedTestsByKey] = useState({});
  const [starterLanguageByKey, setStarterLanguageByKey] = useState({});
  const [analyzingKey, setAnalyzingKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const questionsRef = useRef(null);

  useEffect(() => {
    let active = true;
    api(`/sessions/${id}`)
      .then((data) => {
        if (!active) return;
        setSession(data);
        const technicalRound = data.rounds.find((item) => item.type === "TECHNICAL");
        setRound(technicalRound ?? null);
        setQuestions((technicalRound?.technicalQuestions ?? []).map(createQuestion));
      })
      .catch((error) => {
        if (active) setMessage({ text: error.message, error: true });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const isReadOnly = session?.status !== "DRAFT";

  function markChanged() {
    setDirty(true);
    setMessage({ text: "", error: false });
  }

  function updateQuestion(key, patch) {
    markChanged();
    setAnalysisByKey((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setQuestions((current) =>
      current.map((question) =>
        question.key === key
          ? {
              ...question,
              ...(Object.keys(patch).some((field) =>
                ["title", "difficulty", "statement", "constraints", "examples"].includes(field),
              ) && {
                inputFormat: "",
                outputFormat: "",
                starterCode: {},
                testCases: [],
              }),
              ...patch,
            }
          : question,
      ),
    );
  }

  function updateStarterCode(question, language, value) {
    updateQuestion(question.key, {
      starterCode: { ...question.starterCode, [language]: value },
    });
  }

  function addQuestion() {
    if (isReadOnly) return;
    markChanged();
    setView("questions");
    setQuestions((current) => [...current, createQuestion()]);
    window.requestAnimationFrame(() =>
      questionsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    );
  }

  function removeQuestion(key) {
    markChanged();
    setAnalysisByKey((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setQuestions((current) => current.filter((question) => question.key !== key));
  }

  function updateExample(question, exampleIndex, field, value) {
    updateQuestion(question.key, {
      examples: question.examples.map((example, index) =>
        index === exampleIndex ? { ...example, [field]: value } : example,
      ),
    });
  }

  function addExample(question) {
    updateQuestion(question.key, {
      examples: [...question.examples, { input: "", output: "", explanation: "" }],
    });
  }

  function removeExample(question, exampleIndex) {
    updateQuestion(question.key, {
      examples: question.examples.filter((_, index) => index !== exampleIndex),
    });
  }

  function updateTestCase(question, testIndex, field, value) {
    markChanged();
    setReviewedTestsByKey((current) => ({ ...current, [question.key]: false }));
    setQuestions((current) =>
      current.map((item) =>
        item.key === question.key
          ? {
              ...item,
              testCases: item.testCases.map((testCase, index) =>
                index === testIndex ? { ...testCase, [field]: value } : testCase,
              ),
            }
          : item,
      ),
    );
  }

  function addTestCase(question) {
    if (question.testCases.length >= 30) return;
    markChanged();
    setReviewedTestsByKey((current) => ({ ...current, [question.key]: false }));
    setQuestions((current) =>
      current.map((item) =>
        item.key === question.key
          ? {
              ...item,
              testCases: [
                ...item.testCases,
                { input: "", expectedOutput: "", category: "Additional case", rationale: "" },
              ],
            }
          : item,
      ),
    );
  }

  function removeTestCase(question, testIndex) {
    if (question.testCases.length <= 10) return;
    markChanged();
    setReviewedTestsByKey((current) => ({ ...current, [question.key]: false }));
    setQuestions((current) =>
      current.map((item) =>
        item.key === question.key
          ? { ...item, testCases: item.testCases.filter((_, index) => index !== testIndex) }
          : item,
      ),
    );
  }

  async function analyzeQuestion(question, index) {
    if (!round || analyzingKey !== null || isReadOnly) return;

    const number = index + 1;
    if (!question.title.trim()) {
      setMessage({ text: `Question ${number}: enter a title before analyzing.`, error: true });
      return;
    }
    if (!question.statement.trim()) {
      setMessage({ text: `Question ${number}: enter the problem description before analyzing.`, error: true });
      return;
    }
    if (
      question.examples.length === 0 ||
      question.examples.some((example) => !example.input.trim() || !example.output.trim())
    ) {
      setMessage({ text: `Question ${number}: every question needs an example with input and expected output.`, error: true });
      return;
    }

    setMessage({ text: "", error: false });
    setAnalyzingKey(question.key);
    setAnalysisByKey((current) => ({ ...current, [question.key]: { loading: true } }));
    try {
      const analysis = await api(
        `/sessions/${id}/rounds/${round.id}/technical-questions/analyze`,
        {
          method: "POST",
          body: {
            question: {
              title: question.title,
              difficulty: question.difficulty,
              statement: question.statement,
              inputFormat: "",
              outputFormat: "",
              starterCode: question.starterCode,
              examples: question.examples,
              marks: Number(question.marks),
              constraints: typeof question.constraints === "string"
                ? question.constraints.split("\n").map((constraint) => constraint.trim()).filter(Boolean)
                : question.constraints,
            },
          },
        },
      );
      if (analysis.valid) {
        setQuestions((current) =>
          current.map((item) =>
            item.key === question.key
              ? {
                  ...item,
                    inputFormat: analysis.inputFormat,
                    outputFormat: analysis.outputFormat,
                    starterCode: analysis.starterCode,
                    testCases: analysis.testCases,
                }
              : item,
          ),
        );
        setReviewedTestsByKey((current) => ({ ...current, [question.key]: false }));
      }
      setAnalysisByKey((current) => ({ ...current, [question.key]: analysis }));
    } catch (error) {
      setAnalysisByKey((current) => {
        const next = { ...current };
        delete next[question.key];
        return next;
      });
      setMessage({ text: error.message, error: true });
    } finally {
      setAnalyzingKey(null);
    }
  }

  async function saveQuestions(event) {
    event.preventDefault();
    if (!round || saving || isReadOnly) return;

    for (const [index, question] of questions.entries()) {
      const number = index + 1;
      if (!question.title.trim()) {
        setMessage({ text: `Question ${number}: enter a title.`, error: true });
        return;
      }
      if (!question.statement.trim()) {
        setMessage({ text: `Question ${number}: enter the problem description.`, error: true });
        return;
      }
      if (!question.inputFormat.trim() || !question.outputFormat.trim()) {
        setMessage({ text: `Question ${number}: analyze with Gemini to generate the program input and output formats.`, error: true });
        return;
      }
      const invalidStarter = Object.values(question.starterCode).some((starter) =>
        starter.trim() && starter.split("{{CANDIDATE_CODE}}").length !== 2
      );
      if (invalidStarter) {
        setMessage({
          text: `Question ${number}: every non-empty starter-code template must contain exactly one {{CANDIDATE_CODE}} marker.`,
          error: true,
        });
        return;
      }
      if (question.examples.length === 0) {
        setMessage({ text: `Question ${number}: add at least one example.`, error: true });
        return;
      }
      if (question.examples.some((example) => !example.input.trim() || !example.output.trim())) {
        setMessage({ text: `Question ${number}: every example needs input and expected output.`, error: true });
        return;
      }
      if (!Number.isInteger(Number(question.marks)) || Number(question.marks) < 1) {
        setMessage({ text: `Question ${number}: points must be a whole number greater than 0.`, error: true });
        return;
      }
      if (!analysisByKey[question.key]?.valid) {
        setMessage({
          text: `Question ${number}: analyze it with Gemini and resolve any reported issues before saving.`,
          error: true,
        });
        return;
      }
      if (question.testCases.length < 10 || question.testCases.length > 30) {
        setMessage({
          text: `Question ${number}: keep between 10 and 30 test cases.`,
          error: true,
        });
        return;
      }
      if (question.testCases.some((testCase) =>
        !testCase.input.trim() ||
        !testCase.expectedOutput.trim() ||
        !testCase.category.trim() ||
        !testCase.rationale.trim()
      )) {
        setMessage({
          text: `Question ${number}: complete the input, expected output, category, and rationale for every test case.`,
          error: true,
        });
        return;
      }
      if (!reviewedTestsByKey[question.key]) {
        setMessage({
          text: `Question ${number}: review the generated expected outputs before saving.`,
          error: true,
        });
        return;
      }
    }

    setSaving(true);
    setMessage({ text: "", error: false });
    try {
      await api(`/sessions/${id}/rounds/${round.id}/technical-questions`, {
        method: "PUT",
        body: {
          questions: questions.map((question) => ({
            title: question.title,
            difficulty: question.difficulty,
            statement: question.statement,
            inputFormat: question.inputFormat,
            outputFormat: question.outputFormat,
            starterCode: question.starterCode,
            constraints: typeof question.constraints === "string"
              ? question.constraints.split("\n").map((constraint) => constraint.trim()).filter(Boolean)
              : question.constraints,
            examples: question.examples,
            testCases: question.testCases,
            marks: Number(question.marks),
            validationToken: analysisByKey[question.key].validationToken,
          })),
        },
      });
      setDirty(false);
      setMessage({ text: "Technical questions saved.", error: false });
    } catch (error) {
      setMessage({ text: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="aptitude-loading" role="status">Loading technical round…</main>;
  }

  if (message.error && !session) {
    return <main className="aptitude-loading"><p className="error">{message.text}</p><Link to="/admin">Back to sessions</Link></main>;
  }

  if (!round) {
    return <main className="aptitude-loading"><p>This session does not have a technical round.</p><Link to={`/admin/sessions/${id}`}>Back to session</Link></main>;
  }

  return (
    <main className="technical-workspace">
      <header className="technical-topbar">
        <Link className="aptitude-back" to={`/admin/sessions/${id}`} aria-label="Back to session">
          <span aria-hidden="true">←</span>
        </Link>
        <div className="aptitude-topbar-title">
          <strong>Technical round</strong>
          <span>{session.title}</span>
        </div>
        <div className="aptitude-topbar-actions">
          <span className={`aptitude-save-status${dirty ? " is-dirty" : ""}`}>
            {saving ? "Saving…" : dirty ? "Unsaved changes" : message.text && !message.error ? "Saved" : ""}
          </span>
          <button
            className="aptitude-save-button"
            type="submit"
            form="technical-form"
            disabled={isReadOnly || saving || analyzingKey !== null}
          >
            {saving ? "Saving…" : "Save questions"}
          </button>
        </div>
      </header>

      <div className="technical-page">
        <section className="technical-hero">
          <div>
            <span className="admin-eyebrow">CODING CHALLENGES</span>
            <h1>{session.title}</h1>
            <p>Create coding problems with clear examples and expected outputs for candidates.</p>
          </div>
          <div className="technical-hero-count">
            <strong>{questions.length}</strong>
            <span>{questions.length === 1 ? "question" : "questions"}</span>
          </div>
        </section>

        {isReadOnly && (
          <p className="aptitude-notice" role="status">
            This session is {session.status.toLowerCase()}; its technical questions can no longer be edited.
          </p>
        )}

        <nav className="technical-actions" aria-label="Technical round actions">
          <button
            className="btn"
            type="button"
            onClick={addQuestion}
            disabled={isReadOnly}
          >
            <span aria-hidden="true">＋</span> Add question
          </button>
          <button
            className={`technical-tab${view === "ranking" ? " is-active" : ""}`}
            type="button"
            onClick={() => setView("ranking")}
            aria-pressed={view === "ranking"}
          >
            <span aria-hidden="true">↕</span> Ranking
          </button>
          <button
            className="technical-tab"
            type="button"
            disabled
            title="Graph downloads will be available after candidate code submissions are supported."
          >
            <span aria-hidden="true">▥</span> Download graph
          </button>
        </nav>
        <p className="technical-ai-note">
          Gemini reads the problem and examples to infer stdin/stdout formats, create runnable starter code in four languages, and draft 10 varied test cases. Review the generated code and expected outputs before saving. Problem content is sent to Google only when you choose Analyze.
        </p>

        {view === "ranking" ? (
          <section className="technical-empty" aria-live="polite">
            <span className="empty-state-icon" aria-hidden="true">↕</span>
            <h2>Rankings will appear here</h2>
            <p>Candidate code submissions and execution results aren’t connected yet. Rankings and graph downloads will be enabled when that round is implemented.</p>
            <button className="ghost" type="button" onClick={() => setView("questions")}>Back to questions</button>
          </section>
        ) : (
          <form id="technical-form" onSubmit={saveQuestions}>
            <div className="technical-section-heading">
              <div>
                <h2>Problem set</h2>
                <p>Write the prompt candidates will see, then add examples with input and expected output.</p>
              </div>
              <span>{questions.length} total</span>
            </div>

            {questions.length === 0 && (
              <section className="technical-empty">
                <span className="empty-state-icon" aria-hidden="true">⌘</span>
                <h2>No coding problems yet</h2>
                <p>Add your first problem to define its prompt, constraints, and examples.</p>
                <button className="btn" type="button" onClick={addQuestion} disabled={isReadOnly}>
                  <span aria-hidden="true">＋</span> Add first question
                </button>
              </section>
            )}

            <div className="technical-question-list" ref={questionsRef}>
              {questions.map((question, index) => {
                const questionLocked = isReadOnly || analyzingKey === question.key;
                return (
                  <section className="technical-question-card" key={question.key}>
                  <header className="technical-question-header">
                    <div className="question-number">
                      <span>CODING QUESTION {String(index + 1).padStart(2, "0")}</span>
                      <h2>Problem {index + 1}</h2>
                    </div>
                    <button
                      className="ghost danger-button"
                      type="button"
                      onClick={() => removeQuestion(question.key)}
                      disabled={questionLocked}
                    >
                      Remove
                    </button>
                  </header>

                  <div className="technical-field-grid">
                    <label>
                      Problem title
                      <input
                        value={question.title}
                        placeholder="e.g. Two Sum"
                        disabled={questionLocked}
                        onChange={(event) => updateQuestion(question.key, { title: event.target.value })}
                      />
                    </label>
                    <label>
                      Difficulty
                      <select
                        value={question.difficulty}
                        disabled={questionLocked}
                        onChange={(event) => updateQuestion(question.key, { difficulty: event.target.value })}
                      >
                        <option value="EASY">Easy</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HARD">Hard</option>
                      </select>
                    </label>
                  </div>

                  <label className="technical-statement-field">
                    Problem description
                    <textarea
                      rows="6"
                      value={question.statement}
                      placeholder="Describe the problem, required behavior, and return value."
                      disabled={questionLocked}
                      onChange={(event) => updateQuestion(question.key, { statement: event.target.value })}
                    />
                  </label>

                  {(question.inputFormat || question.outputFormat) && (
                    <div className="technical-io-generated">
                      <strong>Gemini-inferred program format</strong>
                      <div className="technical-io-generated-grid">
                        <p><b>stdin</b>{question.inputFormat}</p>
                        <p><b>stdout</b>{question.outputFormat}</p>
                      </div>
                    </div>
                  )}

                  <section className="technical-starter-code">
                    <div className="technical-starter-code-heading">
                      <div>
                        <h3>Gemini-generated starter code</h3>
                        <p>
                          Gemini infers program input/output and generates a runnable scaffold for each language. Review the scaffold; candidates can only change the <code>{"{{CANDIDATE_CODE}}"}</code> region.
                        </p>
                      </div>
                      <label>
                        Language
                        <select
                          value={starterLanguageByKey[question.key] ?? "python3"}
                          disabled={questionLocked}
                          onChange={(event) =>
                            setStarterLanguageByKey((current) => ({
                              ...current,
                              [question.key]: event.target.value,
                            }))
                          }
                        >
                          <option value="python3">Python</option>
                          <option value="javascript">JavaScript</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                      </label>
                    </div>
                    <textarea
                      rows="8"
                      value={question.starterCode[starterLanguageByKey[question.key] ?? "python3"] ?? ""}
                      placeholder="Starter code will be generated by Gemini when you analyze this problem."
                      disabled={questionLocked}
                      onChange={(event) =>
                        updateStarterCode(
                          question,
                          starterLanguageByKey[question.key] ?? "python3",
                          event.target.value,
                        )
                      }
                      spellCheck="false"
                    />
                  </section>

                  <label className="technical-statement-field">
                    Constraints <span className="technical-field-hint">One constraint per line (optional)</span>
                    <textarea
                      rows="3"
                      value={Array.isArray(question.constraints) ? question.constraints.join("\n") : question.constraints}
                      placeholder="2 ≤ nums.length ≤ 10⁴&#10;-10⁹ ≤ nums[i] ≤ 10⁹"
                      disabled={questionLocked}
                      onChange={(event) => updateQuestion(question.key, { constraints: event.target.value })}
                    />
                  </label>

                  <div className="technical-example-heading">
                    <div><h3>Examples</h3><p>Provide sample input and the expected output.</p></div>
                    <button className="ghost" type="button" onClick={() => addExample(question)} disabled={questionLocked}>
                      <span aria-hidden="true">＋</span> Add example
                    </button>
                  </div>

                  {question.examples.map((example, exampleIndex) => (
                    <div className="technical-example-card" key={`${question.key}-example-${exampleIndex}`}>
                      <div className="technical-example-title">
                        <strong>Example {exampleIndex + 1}</strong>
                        {question.examples.length > 1 && (
                          <button
                            className="technical-remove-example"
                            type="button"
                            onClick={() => removeExample(question, exampleIndex)}
                            disabled={questionLocked}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="technical-example-grid">
                        <label>
                          Input
                          <textarea
                            rows="3"
                            value={example.input}
                            placeholder={"nums = [2, 7, 11, 15]\ntarget = 9"}
                            disabled={questionLocked}
                            onChange={(event) => updateExample(question, exampleIndex, "input", event.target.value)}
                          />
                        </label>
                        <label>
                          Expected output
                          <textarea
                            rows="3"
                            value={example.output}
                            placeholder="[0, 1]"
                            disabled={questionLocked}
                            onChange={(event) => updateExample(question, exampleIndex, "output", event.target.value)}
                          />
                        </label>
                      </div>
                      <label className="technical-statement-field">
                        Explanation <span className="technical-field-hint">Optional</span>
                        <textarea
                          rows="2"
                          value={example.explanation}
                          placeholder="Explain why this is the expected output."
                          disabled={questionLocked}
                          onChange={(event) => updateExample(question, exampleIndex, "explanation", event.target.value)}
                        />
                      </label>
                    </div>
                  ))}

                  <div className="technical-question-footer">
                    <label className="points-field">
                      <span>Points</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={question.marks}
                        disabled={questionLocked}
                        onChange={(event) => updateQuestion(question.key, { marks: event.target.value })}
                      />
                    </label>
                    <button
                      className="technical-analyze-button"
                      type="button"
                      onClick={() => analyzeQuestion(question, index)}
                      disabled={isReadOnly || analyzingKey !== null || saving}
                    >
                      {analyzingKey === question.key ? "Analyzing with Gemini…" : "Analyze with Gemini"}
                    </button>
                  </div>
                  {analysisByKey[question.key] && !analysisByKey[question.key].loading && (
                    <div
                      className={`technical-analysis${analysisByKey[question.key].valid ? " is-valid" : " is-invalid"}`}
                      role={analysisByKey[question.key].valid ? "status" : "alert"}
                    >
                      <strong>
                        {analysisByKey[question.key].valid ? "Problem statement looks clear" : "Please revise this problem"}
                      </strong>
                      <p>{analysisByKey[question.key].summary}</p>
                      {analysisByKey[question.key].issues.length > 0 && (
                        <ul>
                          {analysisByKey[question.key].issues.map((issue, issueIndex) => (
                            <li key={`issue-${issueIndex}`}>{issue}</li>
                          ))}
                        </ul>
                      )}
                      {analysisByKey[question.key].suggestions.length > 0 && (
                        <div className="technical-analysis-suggestions">
                          <span>Suggestions</span>
                          <ul>
                            {analysisByKey[question.key].suggestions.map((suggestion, suggestionIndex) => (
                              <li key={`suggestion-${suggestionIndex}`}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {question.testCases.length > 0 && (
                    <section className="technical-test-suite" aria-label={`Test cases for problem ${index + 1}`}>
                      <div className="technical-test-suite-heading">
                        <div>
                          <h3>Generated test cases</h3>
                          <p>
                            {question.testCases.length} cases covering normal, boundary, and problem-specific edge inputs.
                            Review and correct every expected output.
                          </p>
                        </div>
                        <span>{question.testCases.length} cases</span>
                      </div>
                      <div className="technical-test-case-list">
                        {question.testCases.map((testCase, testIndex) => (
                          <article className="technical-test-case" key={`${question.key}-test-${testIndex}`}>
                            <div className="technical-test-case-header">
                              <strong>Case {testIndex + 1}</strong>
                              <label>
                                Category
                                <input
                                  value={testCase.category}
                                  disabled={questionLocked}
                                  onChange={(event) => updateTestCase(question, testIndex, "category", event.target.value)}
                                />
                              </label>
                              {question.testCases.length > 10 && (
                                <button
                                  className="technical-remove-example"
                                  type="button"
                                  onClick={() => removeTestCase(question, testIndex)}
                                  disabled={questionLocked}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="technical-example-grid">
                              <label>
                                Input
                                <textarea
                                  rows="3"
                                  value={testCase.input}
                                  disabled={questionLocked}
                                  onChange={(event) => updateTestCase(question, testIndex, "input", event.target.value)}
                                />
                              </label>
                              <label>
                                Expected output
                                <textarea
                                  rows="3"
                                  value={testCase.expectedOutput}
                                  disabled={questionLocked}
                                  onChange={(event) => updateTestCase(question, testIndex, "expectedOutput", event.target.value)}
                                />
                              </label>
                            </div>
                            <label className="technical-test-rationale">
                              Why this case matters
                              <input
                                value={testCase.rationale}
                                disabled={questionLocked}
                                onChange={(event) => updateTestCase(question, testIndex, "rationale", event.target.value)}
                              />
                            </label>
                          </article>
                        ))}
                      </div>
                      {question.testCases.length < 30 && (
                        <button
                          className="ghost technical-add-test"
                          type="button"
                          onClick={() => addTestCase(question)}
                          disabled={questionLocked}
                        >
                          ＋ Add test case
                        </button>
                      )}
                      <label className="technical-review-confirmation">
                        <input
                          type="checkbox"
                          checked={Boolean(reviewedTestsByKey[question.key])}
                          disabled={questionLocked}
                          onChange={(event) =>
                            setReviewedTestsByKey((current) => ({
                              ...current,
                              [question.key]: event.target.checked,
                            }))
                          }
                        />
                        <span>I reviewed the test inputs and verified every expected output.</span>
                      </label>
                    </section>
                  )}
                  </section>
                );
              })}
            </div>

            {message.text && (
              <p className={`aptitude-message${message.error ? " is-error" : ""}`} role={message.error ? "alert" : "status"}>
                {message.text}
              </p>
            )}

            <footer className="aptitude-form-footer">
              <Link to={`/admin/sessions/${id}`}>Back to session</Link>
              <button className="aptitude-primary-button" type="submit" disabled={isReadOnly || saving}>
                {saving ? "Saving…" : "Save technical questions"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </main>
  );
}
