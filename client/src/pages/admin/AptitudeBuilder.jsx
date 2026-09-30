import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";

let nextQuestionKey = 0;

function createQuestion() {
  return {
    key: ++nextQuestionKey,
    type: "SINGLE",
    text: "",
    options: ["", ""],
    correct: [],
    marks: 1,
    negativeMarks: 0,
  };
}

export default function AptitudeBuilder() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [round, setRound] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [shuffle, setShuffle] = useState({
    shuffleQuestions: false,
    shuffleOptions: false,
  });
  const [message, setMessage] = useState({ text: "", error: false });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;

    api(`/sessions/${id}`)
      .then((data) => {
        if (!active) return;

        const aptitudeRound = data.rounds.find(
          (item) => item.type === "APTITUDE",
        );
        setSession(data);
        setRound(aptitudeRound);
        if (aptitudeRound) {
          setQuestions(
            aptitudeRound.questions.map((question) => ({
              ...question,
              key: ++nextQuestionKey,
            })),
          );
          setShuffle({
            shuffleQuestions: aptitudeRound.shuffleQuestions,
            shuffleOptions: aptitudeRound.shuffleOptions,
          });
        }
      })
      .catch((error) => {
        if (active) setMessage({ text: error.message, error: true });
      });

    return () => {
      active = false;
    };
  }, [id]);

  const markChanged = () => {
    setDirty(true);
    setMessage({ text: "", error: false });
  };

  const updateQuestion = (key, patch) => {
    markChanged();
    setQuestions((current) =>
      current.map((question) =>
        question.key === key ? { ...question, ...patch } : question,
      ),
    );
  };

  const addQuestion = () => {
    markChanged();
    setQuestions((current) => [...current, createQuestion()]);
  };

  const removeQuestion = (key) => {
    markChanged();
    setQuestions((current) =>
      current.filter((question) => question.key !== key),
    );
  };

  const moveQuestion = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;

    markChanged();
    setQuestions((current) => {
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [
        reordered[nextIndex],
        reordered[index],
      ];
      return reordered;
    });
  };

  const duplicateQuestion = (index) => {
    markChanged();
    setQuestions((current) => {
      const question = current[index];
      const duplicate = {
        ...question,
        key: ++nextQuestionKey,
        options: [...question.options],
        correct: [...question.correct],
      };
      return [
        ...current.slice(0, index + 1),
        duplicate,
        ...current.slice(index + 1),
      ];
    });
  };

  const updateOption = (question, optionIndex, value) =>
    updateQuestion(question.key, {
      options: question.options.map((option, index) =>
        index === optionIndex ? value : option,
      ),
    });

  const removeOption = (question, optionIndex) =>
    updateQuestion(question.key, {
      options: question.options.filter((_, index) => index !== optionIndex),
      correct: question.correct
        .filter((answer) => answer !== optionIndex)
        .map((answer) => (answer > optionIndex ? answer - 1 : answer)),
    });

  const toggleCorrectAnswer = (question, optionIndex) => {
    if (question.type === "SINGLE") {
      updateQuestion(question.key, { correct: [optionIndex] });
      return;
    }

    updateQuestion(question.key, {
      correct: question.correct.includes(optionIndex)
        ? question.correct.filter((answer) => answer !== optionIndex)
        : [...question.correct, optionIndex],
    });
  };

  const updateShuffle = (key, value) => {
    markChanged();
    setShuffle((current) => ({ ...current, [key]: value }));
  };

  async function saveQuestions(event) {
    event.preventDefault();
    if (!round || saving || session.status !== "DRAFT") return;

    for (const [index, question] of questions.entries()) {
      const number = index + 1;
      if (!question.text.trim()) {
        setMessage({
          text: `Question ${number}: enter the question.`,
          error: true,
        });
        return;
      }
      if (
        question.options.length < 2 ||
        question.options.some((option) => !option.trim())
      ) {
        setMessage({
          text: `Question ${number}: add at least two non-empty options.`,
          error: true,
        });
        return;
      }
      if (
        question.correct.length === 0 ||
        (question.type === "SINGLE" && question.correct.length !== 1)
      ) {
        setMessage({
          text: `Question ${number}: select ${
            question.type === "SINGLE" ? "the correct answer" : "at least one correct answer"
          }.`,
          error: true,
        });
        return;
      }
    }

    setSaving(true);
    setMessage({ text: "", error: false });
    try {
      await api(`/sessions/${id}/rounds/${round.id}/questions`, {
        method: "PUT",
        body: {
          questions: questions.map(({ key: _key, ...question }) => question),
          ...shuffle,
        },
      });
      setDirty(false);
      setMessage({ text: "All changes saved.", error: false });
    } catch (error) {
      setMessage({ text: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <main className="aptitude-loading" role="status">
        {message.text || "Loading aptitude test…"}
      </main>
    );
  }

  if (!round) {
    return (
      <main className="aptitude-loading">
        <p>This session does not have an aptitude round.</p>
        <Link to="/admin">Back to sessions</Link>
      </main>
    );
  }

  const isReadOnly = session.status !== "DRAFT";
  const totalMarks = questions.reduce(
    (total, question) => total + (Number(question.marks) || 0),
    0,
  );

  return (
    <main className="aptitude-editor">
      <header className="aptitude-topbar">
        <div className="aptitude-topbar-inner">
          <Link className="aptitude-back" to="/admin" aria-label="Back to sessions">
            <span aria-hidden="true">←</span>
          </Link>
          <div className="aptitude-topbar-title">
            <strong>Aptitude test</strong>
            <span>{session.title}</span>
          </div>
          <div className="aptitude-topbar-actions">
            <span className={`aptitude-save-status${dirty ? " is-dirty" : ""}`}>
              {saving ? "Saving…" : dirty ? "Unsaved changes" : message.text && !message.error ? "Saved" : ""}
            </span>
            <button
              className="aptitude-save-button"
              type="submit"
              form="aptitude-form"
              disabled={isReadOnly || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </header>

      <form
        id="aptitude-form"
        className="aptitude-form"
        onSubmit={saveQuestions}
      >
        <section className="form-intro" aria-labelledby="aptitude-title">
          <div className="form-intro-accent" />
          <div className="form-intro-content">
            <span className="form-eyebrow">INTERVIEW ASSESSMENT</span>
            <h1 id="aptitude-title">{session.title}</h1>
            <p>
              Aptitude test <span aria-hidden="true">·</span>{" "}
              {round.durationMin} minutes
            </p>
            <div className="form-summary">
              <span>
                {questions.length}{" "}
                {questions.length === 1 ? "question" : "questions"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {totalMarks} {totalMarks === 1 ? "point" : "points"}
              </span>
            </div>
          </div>
        </section>

        {isReadOnly && (
          <div className="aptitude-notice" role="status">
            This session is {session.status.toLowerCase()}; its questions can no
            longer be edited.
          </div>
        )}

        <section className="form-settings" aria-labelledby="settings-title">
          <div>
            <h2 id="settings-title">Test settings</h2>
            <p>Choose how questions and answer options appear to candidates.</p>
          </div>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={shuffle.shuffleQuestions}
              disabled={isReadOnly}
              onChange={(event) =>
                updateShuffle("shuffleQuestions", event.target.checked)
              }
            />
            <span>Shuffle question order</span>
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={shuffle.shuffleOptions}
              disabled={isReadOnly}
              onChange={(event) =>
                updateShuffle("shuffleOptions", event.target.checked)
              }
            />
            <span>Shuffle answer options</span>
          </label>
        </section>

        {questions.length === 0 && (
          <section className="aptitude-empty">
            <div className="aptitude-empty-icon" aria-hidden="true">?</div>
            <h2>Add your first question</h2>
            <p>
              Write an aptitude question, add answer choices, and select the
              correct answer.
            </p>
            <button
              className="aptitude-primary-button"
              type="button"
              onClick={addQuestion}
              disabled={isReadOnly}
            >
              <span aria-hidden="true">＋</span> Add question
            </button>
          </section>
        )}

        {questions.map((question, index) => (
          <section
            className="question-card"
            key={question.key}
            aria-labelledby={`question-heading-${question.key}`}
          >
            <div className="question-card-header">
              <div className="question-number">
                <span>QUESTION {String(index + 1).padStart(2, "0")}</span>
                <h2 id={`question-heading-${question.key}`}>
                  Question {index + 1}
                </h2>
              </div>
              <div className="question-actions">
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => moveQuestion(index, -1)}
                  disabled={isReadOnly || index === 0}
                  aria-label={`Move question ${index + 1} up`}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => moveQuestion(index, 1)}
                  disabled={isReadOnly || index === questions.length - 1}
                  aria-label={`Move question ${index + 1} down`}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => duplicateQuestion(index)}
                  disabled={isReadOnly}
                  aria-label={`Duplicate question ${index + 1}`}
                  title="Duplicate question"
                >
                  ⧉
                </button>
                <button
                  className="icon-button danger-icon"
                  type="button"
                  onClick={() => removeQuestion(question.key)}
                  disabled={isReadOnly}
                  aria-label={`Delete question ${index + 1}`}
                  title="Delete question"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="question-main-fields">
              <label className="question-prompt">
                <span className="visually-hidden">Question text</span>
                <textarea
                  placeholder="Enter your question"
                  rows="2"
                  value={question.text}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    updateQuestion(question.key, { text: event.target.value })
                  }
                />
              </label>
              <label className="question-type">
                <span>Answer type</span>
                <select
                  value={question.type}
                  disabled={isReadOnly}
                  onChange={(event) => {
                    const type = event.target.value;
                    updateQuestion(question.key, {
                      type,
                      correct:
                        type === "SINGLE"
                          ? question.correct.slice(0, 1)
                          : question.correct,
                    });
                  }}
                >
                  <option value="SINGLE">Multiple choice</option>
                  <option value="MULTI">Checkboxes</option>
                </select>
              </label>
            </div>

            <div className="answer-list">
              <div className="answer-list-heading">
                <span>Answer options</span>
                <span className="answer-key-hint">
                  {question.type === "SINGLE"
                    ? "Select the correct answer"
                    : "Select all correct answers"}
                </span>
              </div>
              {question.options.map((option, optionIndex) => (
                <div className="answer-option" key={optionIndex}>
                  <input
                    className="correct-answer-input"
                    type={question.type === "SINGLE" ? "radio" : "checkbox"}
                    name={`correct-answer-${question.key}`}
                    checked={question.correct.includes(optionIndex)}
                    disabled={isReadOnly}
                    onChange={() =>
                      toggleCorrectAnswer(question, optionIndex)
                    }
                    aria-label={`Mark option ${optionIndex + 1} as correct`}
                  />
                  <input
                    className="answer-option-text"
                    type="text"
                    placeholder={`Option ${optionIndex + 1}`}
                    value={option}
                    disabled={isReadOnly}
                    onChange={(event) =>
                      updateOption(question, optionIndex, event.target.value)
                    }
                  />
                  {question.options.length > 2 && (
                    <button
                      className="remove-option-button"
                      type="button"
                      onClick={() => removeOption(question, optionIndex)}
                      disabled={isReadOnly}
                      aria-label={`Remove option ${optionIndex + 1}`}
                      title="Remove option"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                className="add-option-button"
                type="button"
                onClick={() =>
                  updateQuestion(question.key, {
                    options: [...question.options, ""],
                  })
                }
                disabled={isReadOnly}
              >
                <span aria-hidden="true">＋</span> Add option
              </button>
            </div>

            <div className="question-card-footer">
              <label className="points-field">
                <span>Points</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={question.marks}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    updateQuestion(question.key, {
                      marks: event.target.value,
                    })
                  }
                />
              </label>
              <label className="points-field">
                <span>Negative marks</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={question.negativeMarks}
                  disabled={isReadOnly}
                  onChange={(event) =>
                    updateQuestion(question.key, {
                      negativeMarks: event.target.value,
                    })
                  }
                />
              </label>
              <span className="correct-answer-note">
                {question.correct.length > 0
                  ? `${question.correct.length} correct ${
                      question.correct.length === 1 ? "answer" : "answers"
                    }`
                  : "No correct answer selected"}
              </span>
            </div>
          </section>
        ))}

        {questions.length > 0 && (
          <button
            className="add-question-card"
            type="button"
            onClick={addQuestion}
            disabled={isReadOnly}
          >
            <span className="add-question-symbol" aria-hidden="true">＋</span>
            Add question
          </button>
        )}

        {message.text && (
          <p
            className={`aptitude-message${message.error ? " is-error" : ""}`}
            role={message.error ? "alert" : "status"}
          >
            {message.text}
          </p>
        )}

        <footer className="aptitude-form-footer">
          <Link to="/admin">Back to sessions</Link>
          <button
            className="aptitude-primary-button"
            type="submit"
            disabled={isReadOnly || saving}
          >
            {saving ? "Saving…" : "Save questions"}
          </button>
        </footer>
      </form>
    </main>
  );
}
