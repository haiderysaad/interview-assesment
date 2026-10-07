import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";

const CANDIDATE_CODE_MARKER = "{{CANDIDATE_CODE}}";

function indentAfterNewline(value, selectionStart) {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const indentation = value.slice(lineStart, selectionStart).match(/^\s*/)?.[0] ?? "";
  return `\n${indentation}`;
}

export default function TechnicalRound() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({});
  const [submittedCode, setSubmittedCode] = useState({});
  const [submittingQuestion, setSubmittingQuestion] = useState(null);

  useEffect(() => {
    let active = true;
    api(`/candidate/${token}/technical`)
      .then((data) => {
        if (active) {
          setInfo(data);
          setDrafts(Object.fromEntries(data.questions.map((question) => [
            question.id,
            {
              language: question.existingSubmission?.language ?? data.languages[0],
              codeByLanguage: question.existingSubmission
                ? { [question.existingSubmission.language]: question.existingSubmission.candidateCode }
                : {},
            },
          ])));
          setSubmittedCode(Object.fromEntries(data.questions.map((question) => [
            question.id,
            question.existingSubmission?.candidateCode ?? "",
          ])));
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  function updateDraft(questionId, patch) {
    setDrafts((current) => ({
      ...current,
      [questionId]: { ...current[questionId], ...patch },
    }));
  }

  function updateCode(questionId, language, code) {
    setDrafts((current) => ({
      ...current,
      [questionId]: {
        ...current[questionId],
        codeByLanguage: {
          ...current[questionId].codeByLanguage,
          [language]: code,
        },
      },
    }));
  }

  function handleEditorKeyDown(event, questionId, language) {
    const editor = event.currentTarget;
    if (event.key === "Tab") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const code = drafts[questionId].codeByLanguage[language] ?? "";
      updateCode(questionId, language, `${code.slice(0, start)}    ${code.slice(end)}`);
      requestAnimationFrame(() => {
        editor.selectionStart = start + 4;
        editor.selectionEnd = start + 4;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const code = drafts[questionId].codeByLanguage[language] ?? "";
      const insertion = indentAfterNewline(code, start);
      updateCode(questionId, language, `${code.slice(0, start)}${insertion}${code.slice(end)}`);
      requestAnimationFrame(() => {
        editor.selectionStart = start + insertion.length;
        editor.selectionEnd = start + insertion.length;
      });
    }
  }

  async function submitCode(questionId) {
    const draft = drafts[questionId];
    const code = draft?.codeByLanguage[draft.language] ?? "";
    const question = info.questions.find((item) => item.id === questionId);
    if (
      !code.trim() ||
      !question?.inputFormat?.trim() ||
      !question?.outputFormat?.trim() ||
      submittingQuestion
    ) return;
    setError("");
    setSubmittingQuestion(questionId);
    try {
      const result = await api(`/candidate/${token}/technical/submissions`, {
        method: "PUT",
        body: { questionId, language: draft.language, candidateCode: code },
      });
      if (result.submission?.language !== draft.language) {
        throw new Error(`The server saved this submission as ${result.submission?.language ?? "an unknown language"}, not ${draft.language}.`);
      }
      setSubmittedCode((current) => ({ ...current, [questionId]: code }));
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmittingQuestion(null);
    }
  }

  if (error || !info) {
    return (
      <main className="candidate-shell">
        <section className="candidate-message-card" role={error ? "alert" : "status"}>
          {error ? <p className="candidate-error">{error}</p> : "Loading technical round…"}
        </section>
      </main>
    );
  }

  return (
    <main className="candidate-shell technical-candidate-shell">
      <header className="technical-candidate-header">
        <span className="candidate-eyebrow">TECHNICAL ROUND</span>
        <h1>{info.title}</h1>
        <p>{info.role} · {info.candidateName}</p>
        <p className="candidate-muted">
          Aptitude complete. Submit your code for each problem; an administrator will review and run it.
        </p>
      </header>
      {info.questions.length === 0 ? (
        <section className="candidate-message-card">
          <h2>No technical questions yet</h2>
          <p className="candidate-muted">Contact the administrator for help.</p>
        </section>
      ) : info.questions.map((question, index) => {
        const draft = drafts[question.id] ?? { language: info.languages[0], codeByLanguage: {} };
        const code = draft.codeByLanguage[draft.language] ?? "";
        const template = question.starterCode?.[draft.language] ?? "";
        const templateParts = template.trim()
          ? template.split(CANDIDATE_CODE_MARKER)
          : ["", ""];
        const hasStarterCode = template.trim().length > 0;
        const fullProgram = `${templateParts[0]}${code}${templateParts[1]}`;
        return (
          <article className="technical-candidate-question" key={question.id}>
            <div className="technical-candidate-question-heading">
              <div>
                <span>PROBLEM {index + 1} · {question.difficulty}</span>
                <h2>{question.title}</h2>
              </div>
              <strong>{question.marks} pts</strong>
            </div>
            <p className="technical-candidate-statement">{question.statement}</p>
            <section className="technical-candidate-io-contract">
              <div>
                <strong>Input format · stdin</strong>
                <p>{question.inputFormat || "This legacy problem has no explicit stdin contract. Ask the administrator to clarify before submitting."}</p>
              </div>
              <div>
                <strong>Output format · stdout</strong>
                <p>{question.outputFormat || "This legacy problem has no explicit stdout contract. Ask the administrator to clarify before submitting."}</p>
              </div>
              <p className="technical-candidate-io-reminder">
                {hasStarterCode
                  ? "The protected starter code reads input, calls your solution, and prints its result. Write only the statements for the function body in the editable region; do not redeclare the function or add input/output code."
                  : "Submit a complete executable program: read the input format above and print the required output. A function definition alone produces no output."}
              </p>
            </section>
            {question.constraints.length > 0 && (
              <div className="technical-candidate-constraints">
                <strong>Constraints</strong>
                <ul>{question.constraints.map((constraint, constraintIndex) => (
                  <li key={`${question.id}-constraint-${constraintIndex}`}>{constraint}</li>
                ))}</ul>
              </div>
            )}
            {question.examples.map((example, exampleIndex) => (
              <section className="technical-candidate-example" key={`${question.id}-example-${exampleIndex}`}>
                <strong>Example {exampleIndex + 1}</strong>
                <div><span>Input</span><pre>{example.input}</pre></div>
                <div><span>Output</span><pre>{example.output}</pre></div>
                {example.explanation && <p>{example.explanation}</p>}
              </section>
            ))}
            <div className="technical-candidate-editor-toolbar">
              <label>
                Language
                <select
                  value={draft.language}
                  onChange={(event) => updateDraft(question.id, { language: event.target.value })}
                >
                  {info.languages.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </label>
              <span>{fullProgram.split("\n").length} lines</span>
            </div>
            <div className={`technical-code-editor${hasStarterCode ? " has-starter-code" : ""}`}>
              {hasStarterCode && templateParts[0] && (
                <pre className="technical-code-protected" aria-label="Protected starter code">{templateParts[0]}</pre>
              )}
              <textarea
                className={hasStarterCode ? "technical-code-editable-region" : "technical-code-full-editor"}
                aria-label={`Your code for ${question.title}`}
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
                value={code}
                onChange={(event) => updateCode(question.id, draft.language, event.target.value)}
                onKeyDown={(event) => handleEditorKeyDown(event, question.id, draft.language)}
                placeholder={hasStarterCode ? "Write your code in this protected region…" : "Write your complete program here…"}
                rows={hasStarterCode ? Math.max(4, code.split("\n").length + 2) : 16}
              />
              {hasStarterCode && templateParts[1] && (
                <pre className="technical-code-protected" aria-label="Protected starter code">{templateParts[1]}</pre>
              )}
            </div>
            <footer className="technical-candidate-submit">
              <span>
                {!question.inputFormat?.trim() || !question.outputFormat?.trim()
                  ? "Submission is disabled until the administrator defines stdin and stdout formats."
                  : submittedCode[question.id] === code && submittedCode[question.id]
                  ? "Submission saved"
                  : question.existingSubmission || submittedCode[question.id]
                    ? "You have unsaved edits."
                    : "Your code is only sent to the administrator when submitted."}
              </span>
              <button
                className="btn"
                type="button"
                onClick={() => submitCode(question.id)}
                disabled={
                  submittingQuestion !== null ||
                  !code.trim() ||
                  !question.inputFormat?.trim() ||
                  !question.outputFormat?.trim()
                }
              >
                {submittingQuestion === question.id ? "Submitting…" : "Submit code"}
              </button>
            </footer>
          </article>
        );
      })}
      {error && <p className="candidate-error" role="alert">{error}</p>}
    </main>
  );
}
