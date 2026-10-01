import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../api";

const fmt = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const emptyChecks = {
  fullscreen: false,
  webcam: false,
  screenShare: false,
};

export default function TakeTest() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [remaining, setRemaining] = useState(0);
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("saved");
  const [submitting, setSubmitting] = useState(false);
  const [checks, setChecks] = useState(emptyChecks);
  const [preparing, setPreparing] = useState(false);
  const webcamStream = useRef(null);
  const screenStream = useRef(null);
  const deadline = useRef(0);
  const lastSaved = useRef("{}");
  const saveQueue = useRef(Promise.resolve());
  const answersRef = useRef({});
  const submittedRef = useRef(false);

  useEffect(() => {
    let active = true;

    api(`/candidate/${token}`)
      .then((data) => {
        if (!active) return;
        setInfo(data);
        setPhase(data.state === "SUBMITTED" ? "done" : "intro");
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message);
        setPhase("error");
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(
    () => () => {
      webcamStream.current?.getTracks().forEach((track) => track.stop());
      screenStream.current?.getTracks().forEach((track) => track.stop());
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    },
    [],
  );

  useEffect(() => {
    const updateFullscreen = () => {
      if (!info?.proctoring.fullscreenRequired) return;
      setChecks((current) => ({
        ...current,
        fullscreen: Boolean(document.fullscreenElement),
      }));
    };

    document.addEventListener("fullscreenchange", updateFullscreen);
    updateFullscreen();
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, [info]);

  useEffect(() => {
    if (phase !== "test" || !info?.proctoring.blockCopyPaste) return undefined;

    const preventClipboard = (event) => event.preventDefault();
    const preventClipboardShortcuts = (event) => {
      if ((event.ctrlKey || event.metaKey) && ["c", "v", "x"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    const preventContextMenu = (event) => event.preventDefault();

    document.addEventListener("copy", preventClipboard);
    document.addEventListener("cut", preventClipboard);
    document.addEventListener("paste", preventClipboard);
    document.addEventListener("keydown", preventClipboardShortcuts);
    document.addEventListener("contextmenu", preventContextMenu);
    return () => {
      document.removeEventListener("copy", preventClipboard);
      document.removeEventListener("cut", preventClipboard);
      document.removeEventListener("paste", preventClipboard);
      document.removeEventListener("keydown", preventClipboardShortcuts);
      document.removeEventListener("contextmenu", preventContextMenu);
    };
  }, [info, phase]);

  function watchMediaStream(stream, kind) {
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error(kind === "webcam" ? "Camera access is required." : "Screen sharing is required.");
    }

    track.addEventListener(
      "ended",
      () => {
        setChecks((current) => ({ ...current, [kind]: false }));
      },
      { once: true },
    );
  }

  async function requestRequirements(required) {
    const requests = {};
    let requestError = "";

    if (required.fullscreenRequired) {
      try {
        if (!document.documentElement.requestFullscreen) {
          throw new Error("This browser does not support fullscreen mode.");
        }
        requests.fullscreen = document.documentElement.requestFullscreen();
      } catch (permissionError) {
        requests.fullscreen = Promise.reject(permissionError);
      }
    }
    if (required.webcamRequired) {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not support camera access.");
        }
        requests.webcam = navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (permissionError) {
        requests.webcam = Promise.reject(permissionError);
      }
    }
    if (required.screenShareRequired) {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          throw new Error("This browser does not support screen sharing.");
        }
        requests.screenShare = navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor" },
          audio: false,
        });
      } catch (permissionError) {
        requests.screenShare = Promise.reject(permissionError);
      }
    }

    const results = await Promise.all(
      Object.entries(requests).map(async ([kind, request]) => {
        try {
          const value = await request;
          if (kind === "webcam" || kind === "screenShare") {
            const streamKind = kind === "screenShare" ? "screenShare" : "webcam";
            watchMediaStream(value, streamKind);

            if (kind === "screenShare") {
              const surface = value.getVideoTracks()[0].getSettings().displaySurface;
              if (surface !== "monitor") {
                value.getTracks().forEach((track) => track.stop());
                throw new Error(
                  surface
                    ? "Choose your entire screen in the sharing picker, not a window or tab."
                    : "This browser cannot verify that the entire screen is being shared. Use a supported desktop browser.",
                );
              }
              screenStream.current?.getTracks().forEach((track) => track.stop());
              screenStream.current = value;
            } else {
              webcamStream.current?.getTracks().forEach((track) => track.stop());
              webcamStream.current = value;
            }
          }
          return { kind, ok: true };
        } catch (permissionError) {
          return {
            kind,
            ok: false,
            message:
              permissionError?.name === "NotAllowedError"
                ? "Allow the requested browser permission to continue."
                : permissionError?.message || "A required permission could not be enabled.",
          };
        }
      }),
    );

    const currentChecks = { ...checks };
    for (const result of results) {
      currentChecks[result.kind] = result.ok;
      if (!result.ok && !requestError) requestError = result.message;
    }
    setChecks(currentChecks);

    if (requestError) {
      setError(requestError);
      return false;
    }

    setError("");
    return true;
  }

  async function start() {
    if (preparing) return;
    const currentChecks = {
      ...checks,
      fullscreen: Boolean(document.fullscreenElement),
      webcam:
        !info.proctoring.webcamRequired ||
        webcamStream.current?.getVideoTracks().some((track) => track.readyState === "live"),
      screenShare:
        !info.proctoring.screenShareRequired ||
        screenStream.current?.getVideoTracks().some((track) => track.readyState === "live"),
    };
    const missing = requiredChecks(info.proctoring, currentChecks);
    if (missing.length > 0) {
      setChecks(currentChecks);
      setError("Enable each required permission before starting the test.");
      return;
    }

    setPreparing(true);
    setError("");

    try {
      const data = await api(`/candidate/${token}/start`, { method: "POST" });
      deadline.current = Date.now() + data.remainingSec * 1000;
      lastSaved.current = JSON.stringify(data.answers);
      answersRef.current = data.answers;
      setTest(data);
      setAnswers(data.answers);
      setRemaining(data.remainingSec);
      setSaveState("saved");
      setPhase("test");
    } catch (startError) {
      setError(startError.message);
    } finally {
      setPreparing(false);
    }
  }

  async function restoreRequirement(kind) {
    if (preparing) return;
    setPreparing(true);
    setError("");
    const required = {
      fullscreenRequired: kind === "fullscreen",
      webcamRequired: kind === "webcam",
      screenShareRequired: kind === "screenShare",
    };
    await requestRequirements(required);
    setPreparing(false);
  }

  async function submit(askFirst) {
    if (submittedRef.current || submitting) return;
    const missingRequirements = requiredChecks(info.proctoring, checks);
    if (askFirst && missingRequirements.length > 0) {
      setError("Restore the required browser permissions before submitting.");
      return;
    }
    if (
      askFirst &&
      !window.confirm("Submit your answers? You can't change them afterwards.")
    ) {
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await api(`/candidate/${token}/submit`, {
        method: "POST",
        body: { answers: answersRef.current },
      });
      webcamStream.current?.getTracks().forEach((track) => track.stop());
      screenStream.current?.getTracks().forEach((track) => track.stop());
      webcamStream.current = null;
      screenStream.current = null;
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      setPhase("done");
    } catch (submitError) {
      submittedRef.current = false;
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (phase !== "test") return undefined;

    const timer = window.setInterval(() => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setRemaining(secondsLeft);
      if (secondsLeft === 0) {
        window.clearInterval(timer);
        submit(false);
      }
    }, 1000);

    return () => window.clearInterval(timer);
    // The timer uses the current phase and the stable submit handler closure for this attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== "test") return undefined;

    const snapshot = JSON.stringify(answers);
    if (snapshot === lastSaved.current) return undefined;

    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      const saveRequest = saveQueue.current.then(() =>
        api(`/candidate/${token}/answers`, {
          method: "PUT",
          body: { answers },
        }),
      );
      saveQueue.current = saveRequest.catch(() => undefined);

      try {
        await saveRequest;
        lastSaved.current = snapshot;
        if (JSON.stringify(answersRef.current) === snapshot) {
          setSaveState("saved");
        }
      } catch {
        setSaveState("error");
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [answers, phase, token]);

  function updateAnswers(updated) {
    answersRef.current = updated;
    setAnswers(updated);
  }

  function choose(question, optionId) {
    const current = answersRef.current[question.id] || [];
    const selected =
      question.type === "SINGLE"
        ? [optionId]
        : current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
    const updated = { ...answersRef.current, [question.id]: selected };
    if (selected.length === 0) delete updated[question.id];
    updateAnswers(updated);
  }

  function clearAnswer(question) {
    const updated = { ...answersRef.current };
    delete updated[question.id];
    updateAnswers(updated);
  }

  const missingRequirements = info
    ? requiredChecks(info.proctoring, checks)
    : [];
  const permissionItems = info
    ? [
        {
          kind: "fullscreen",
          label: "Fullscreen mode",
          required: info.proctoring.fullscreenRequired,
          active: checks.fullscreen,
        },
        {
          kind: "webcam",
          label: "Webcam access",
          required: info.proctoring.webcamRequired,
          active: checks.webcam,
        },
        {
          kind: "screenShare",
          label: "Share your entire screen",
          required: info.proctoring.screenShareRequired,
          active: checks.screenShare,
        },
      ].filter((item) => item.required)
    : [];

  if (phase === "loading") {
    return (
      <main className="candidate-shell">
        <div className="candidate-message-card" role="status">
          Loading your test…
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="candidate-shell">
        <section className="candidate-message-card">
          <div className="candidate-brand-mark" aria-hidden="true">!</div>
          <span className="candidate-eyebrow">APTITUDE TEST</span>
          <h1>Test unavailable</h1>
          <p className="candidate-error" role="alert">{error}</p>
          <p className="candidate-muted">
            Please check that you opened the complete candidate link. If the
            problem continues, contact the person who invited you.
          </p>
        </section>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className="candidate-shell">
        <section className="candidate-message-card candidate-thank-you">
          <div className="candidate-brand-mark" aria-hidden="true">✓</div>
          <span className="candidate-eyebrow">RESPONSE RECORDED</span>
          <h1>Thank you{info ? `, ${info.candidateName}` : ""}</h1>
          <p>Your answers have been submitted successfully.</p>
          <p className="candidate-muted">
            You can close this window now. Your result will be available to the
            test administrator.
          </p>
        </section>
      </main>
    );
  }

  if (phase === "intro") {
    const isReady = info.state === "READY" || info.state === "IN_PROGRESS";
    return (
      <main className="candidate-shell">
        <div className="candidate-form">
          <section className="candidate-title-card">
            <div className="candidate-title-accent" />
            <div className="candidate-title-content">
              <span className="candidate-eyebrow">APTITUDE ASSESSMENT</span>
              <h1>{info.title}</h1>
              <p className="candidate-role">{info.role}</p>
              {info.description && (
                <p className="candidate-description">{info.description}</p>
              )}
              <div className="candidate-test-meta">
                <span>
                  {info.questionCount}{" "}
                  {info.questionCount === 1 ? "question" : "questions"}
                </span>
                <span aria-hidden="true">·</span>
                <span>{info.durationMin} minutes</span>
              </div>
            </div>
          </section>

          <section className="candidate-instructions">
            <h2>Hello, {info.candidateName}</h2>
            <p>
              Your test has {info.questionCount}{" "}
              {info.questionCount === 1 ? "question" : "questions"}. The timer starts
              when you begin and cannot be paused. Your answers are saved as you
              work, and the test submits automatically when time runs out.
            </p>
            <p>
              You can change your answers before submitting. For questions
              marked “Select all that apply,” choose every answer you think is
              correct.
            </p>
            {Object.values(info.proctoring).some(Boolean) && (
              <div className="candidate-permission-notice">
                <strong>Required before you begin</strong>
                {permissionItems.length > 0 && (
                  <ul className="candidate-permission-list">
                    {permissionItems.map((item) => (
                      <li key={item.kind}>
                        <span>{item.label}</span>
                        <span className={item.active ? "is-ready" : "is-needed"}>
                          {item.active ? "Ready" : "Required"}
                        </span>
                        {!item.active && (
                          <button
                            className="candidate-permission-button"
                            type="button"
                            onClick={() =>
                              restoreRequirement(item.kind)
                            }
                            disabled={preparing}
                          >
                            {preparing ? "Waiting…" : "Enable"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {info.proctoring.blockCopyPaste && (
                  <p className="candidate-permission-copy">
                    Copy and paste will be blocked automatically.
                  </p>
                )}
                <span>
                  The browser asks for each permission when you enable it.
                  Camera and screen media are not recorded or uploaded.
                </span>
              </div>
            )}
            {error && <p className="candidate-error" role="alert">{error}</p>}
            {info.state === "NOT_OPEN" && (
              <p className="candidate-state-message">
                This test opens {new Date(info.startsAt).toLocaleString()}.
              </p>
            )}
            {info.state === "CLOSED" && (
              <p className="candidate-error">This test is closed.</p>
            )}
            {isReady && (
              <button
                className="candidate-primary-button"
                type="button"
                onClick={start}
                disabled={preparing || missingRequirements.length > 0}
              >
                {preparing
                  ? "Checking permissions…"
                  : info.state === "IN_PROGRESS"
                    ? "Resume test"
                    : "Start test"}
              </button>
            )}
            {preparing && (
              <p className="candidate-state-message" role="status">
                Waiting for the required browser permissions…
              </p>
            )}
          </section>
          <p className="candidate-footer-note">
            Your responses are shared with the test administrator.
          </p>
        </div>
      </main>
    );
  }

  const answered = Object.keys(answers).length;
  const progress =
    test.questions.length === 0
      ? 0
      : Math.round((answered / test.questions.length) * 100);

  return (
    <main className="candidate-shell candidate-test-shell">
      <header className="candidate-test-header">
        <div className="candidate-test-header-inner">
          <div className="candidate-test-heading">
            <span className="candidate-eyebrow">APTITUDE ASSESSMENT</span>
            <strong>{info.title}</strong>
          </div>
          <div
            className={`candidate-timer${remaining <= 60 ? " is-low" : ""}`}
            aria-label={`${Math.floor(remaining / 60)} minutes and ${remaining % 60} seconds remaining`}
          >
            <span aria-hidden="true">◷</span> {fmt(remaining)}
          </div>
        </div>
        <div
          className="candidate-progress-track"
          role="progressbar"
          aria-label="Questions answered"
          aria-valuemin="0"
          aria-valuemax={test.questions.length}
          aria-valuenow={answered}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className="candidate-form candidate-active-form">
        <section className="candidate-title-card candidate-active-title">
          <div className="candidate-title-accent" />
          <div className="candidate-title-content">
            <span className="candidate-eyebrow">WELCOME, {info.candidateName}</span>
            <h1>{info.title}</h1>
            <div className="candidate-test-meta">
              <span>{answered} of {test.questions.length} answered</span>
              <span aria-hidden="true">·</span>
              <span>
                {saveState === "saving" && "Saving answers…"}
                {saveState === "saved" && "All changes saved"}
                {saveState === "error" && "Autosave failed; submitting sends your latest answers"}
              </span>
            </div>
            {info.proctoring.blockCopyPaste && (
              <p className="candidate-policy-note">
                Copying, pasting, and the context menu are disabled during this test.
              </p>
            )}
          </div>
        </section>

        {test.questions.map((question, index) => (
          <section
            className="candidate-question-card"
            key={question.id}
            aria-labelledby={`candidate-question-${question.id}`}
          >
            <div className="candidate-question-topline">
              <span>QUESTION {String(index + 1).padStart(2, "0")}</span>
              <span>{question.marks} {question.marks === 1 ? "point" : "points"}</span>
            </div>
            <h2 id={`candidate-question-${question.id}`}>{question.text}</h2>
            <p className="candidate-question-hint">
              {question.type === "MULTI" ? "Select all that apply" : "Select one answer"}
              {question.negativeMarks > 0 &&
                ` · −${question.negativeMarks} points for a wrong answer`}
            </p>
            <div className="candidate-answer-list">
              {question.options.map((option) => (
                <label className="candidate-answer-option" key={option.id}>
                  <input
                    type={question.type === "SINGLE" ? "radio" : "checkbox"}
                    name={`answer-${question.id}`}
                    checked={(answers[question.id] || []).includes(option.id)}
                    onChange={() => choose(question, option.id)}
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </div>
            {question.type === "SINGLE" && answers[question.id] && (
              <button
                className="candidate-clear-answer"
                type="button"
                onClick={() => clearAnswer(question)}
              >
                Clear answer
              </button>
            )}
          </section>
        ))}

        {error && <p className="candidate-error" role="alert">{error}</p>}
        <footer className="candidate-submit-row">
          <span>{answered} of {test.questions.length} answered</span>
          <button
            className="candidate-primary-button"
            type="button"
            onClick={() => submit(true)}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit test"}
          </button>
        </footer>
        <p className="candidate-footer-note">
          Your progress is saved automatically. You can submit when you’re ready.
        </p>
      </div>
        {missingRequirements.length > 0 && (
          <div className="candidate-requirement-overlay">
            <section
              className="candidate-requirement-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="requirements-title"
              aria-describedby="requirements-description"
            >
              <span className="candidate-eyebrow">TEST PAUSED</span>
              <h2 id="requirements-title">Restore required permissions</h2>
              <p id="requirements-description">
                This test requires the following to remain active. The timer keeps
                running while you restore them.
              </p>
              <ul className="candidate-requirement-list">
                {missingRequirements.map((requirement) => (
                  <li key={requirement.kind}>
                    <span>{requirement.label}</span>
                    <button
                      className="candidate-primary-button"
                      type="button"
                      onClick={() => restoreRequirement(requirement.kind)}
                      disabled={preparing}
                    >
                      {preparing ? "Waiting…" : requirement.action}
                    </button>
                  </li>
                ))}
              </ul>
              {error && <p className="candidate-error" role="alert">{error}</p>}
            </section>
          </div>
        )}
    </main>
  );
}

function requiredChecks(policy, checks) {
  return [
    {
        kind: "fullscreen",
        label: "Fullscreen mode",
        action: "Enter fullscreen",
        required: policy.fullscreenRequired,
        active: checks.fullscreen,
    },
    {
        kind: "webcam",
        label: "Webcam access",
        action: "Enable webcam",
        required: policy.webcamRequired,
        active: checks.webcam,
    },
    {
        kind: "screenShare",
        label: "Entire-screen sharing",
        action: "Share entire screen",
        required: policy.screenShareRequired,
        active: checks.screenShare,
    },
  ].filter((check) => check.required && !check.active);
}
