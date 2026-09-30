import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api";

let uid = 0;
const newQuestion = () => ({
  key: ++uid, type: "SINGLE", text: "", options: ["", ""], correct: [], marks: 1, negativeMarks: 0,
});

export default function AptitudeBuilder() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [round, setRound] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [shuffle, setShuffle] = useState({ shuffleQuestions: false, shuffleOptions: false });
  const [msg, setMsg] = useState({ text: "", error: false });

  useEffect(() => {
    api(`/sessions/${id}`)
      .then((s) => {
        const r = s.rounds.find((r) => r.type === "APTITUDE");
        setSession(s);
        setRound(r);
        if (r) {
          setQuestions(r.questions.map((q) => ({ ...q, key: ++uid })));
          setShuffle({ shuffleQuestions: r.shuffleQuestions, shuffleOptions: r.shuffleOptions });
        }
      })
      .catch((e) => setMsg({ text: e.message, error: true }));
  }, [id]);

  const update = (key, patch) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  const remove = (key) => setQuestions((qs) => qs.filter((q) => q.key !== key));
  const move = (i, dir) =>
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const duplicate = (i) =>
    setQuestions((qs) => {
      const q = qs[i];
      const copy = { ...q, key: ++uid, options: [...q.options], correct: [...q.correct] };
      return [...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)];
    });

  const setOption = (q, oi, value) =>
    update(q.key, { options: q.options.map((o, i) => (i === oi ? value : o)) });
  const addOption = (q) => update(q.key, { options: [...q.options, ""] });
  const removeOption = (q, oi) =>
    update(q.key, {
      options: q.options.filter((_, i) => i !== oi),
      correct: q.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)),
    });
  const toggleCorrect = (q, oi) => {
    if (q.type === "SINGLE") return update(q.key, { correct: [oi] });
    update(q.key, {
      correct: q.correct.includes(oi) ? q.correct.filter((c) => c !== oi) : [...q.correct, oi],
    });
  };

  async function save() {
    setMsg({ text: "", error: false });
    try {
      await api(`/sessions/${id}/rounds/${round.id}/questions`, {
        method: "PUT",
        body: { questions: questions.map(({ key: _key, ...q }) => q), ...shuffle },
      });
      setMsg({ text: "Saved", error: false });
    } catch (e) {
      setMsg({ text: e.message, error: true });
    }
  }

  if (!session) return <p className="page">{msg.text || "Loading…"}</p>;
  if (!round) return <p className="page">This session has no aptitude round.</p>;

  const total = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  return (
    <div className="page">
      <Link to="/admin">← Back</Link>
      <h1>{session.title}: aptitude questions</h1>
      <p>{round.durationMin} min · {questions.length} questions · {total} marks</p>

      <div className="row">
        <label className="check">
          <input
            type="checkbox"
            checked={shuffle.shuffleQuestions}
            onChange={(e) => setShuffle({ ...shuffle, shuffleQuestions: e.target.checked })}
          />
          Shuffle question order
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={shuffle.shuffleOptions}
            onChange={(e) => setShuffle({ ...shuffle, shuffleOptions: e.target.checked })}
          />
          Shuffle options
        </label>
      </div>

      {questions.map((q, i) => (
        <div className="card" key={q.key}>
          <div className="row">
            <strong>Question {i + 1}</strong>
            <div className="row-tight">
              <button type="button" className="ghost" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="ghost" onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="ghost" onClick={() => duplicate(i)}>Duplicate</button>
              <button type="button" className="ghost" onClick={() => remove(q.key)}>Delete</button>
            </div>
          </div>

          <textarea
            placeholder="Question text"
            value={q.text}
            onChange={(e) => update(q.key, { text: e.target.value })}
          />

          <label>Type
            <select
              value={q.type}
              onChange={(e) =>
                update(q.key, {
                  type: e.target.value,
                  correct: e.target.value === "SINGLE" ? q.correct.slice(0, 1) : q.correct,
                })
              }
            >
              <option value="SINGLE">Single choice</option>
              <option value="MULTI">Multiple choice</option>
            </select>
          </label>

          {q.options.map((opt, oi) => (
            <div className="row" key={oi}>
              <input
                type={q.type === "SINGLE" ? "radio" : "checkbox"}
                name={`correct-${q.key}`}
                checked={q.correct.includes(oi)}
                onChange={() => toggleCorrect(q, oi)}
                title="Mark as correct"
              />
              <input
                style={{ flex: 1 }}
                placeholder={`Option ${oi + 1}`}
                value={opt}
                onChange={(e) => setOption(q, oi, e.target.value)}
              />
              {q.options.length > 2 && (
                <button type="button" className="ghost" onClick={() => removeOption(q, oi)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="ghost" onClick={() => addOption(q)}>+ Add option</button>

          <div className="row">
            <label>Marks
              <input type="number" min="0" value={q.marks}
                onChange={(e) => update(q.key, { marks: e.target.value })} />
            </label>
            <label>Negative marks
              <input type="number" min="0" step="0.25" value={q.negativeMarks}
                onChange={(e) => update(q.key, { negativeMarks: e.target.value })} />
            </label>
          </div>
        </div>
      ))}

      <button type="button" className="ghost" onClick={() => setQuestions([...questions, newQuestion()])}>
        + Add question
      </button>
      <button type="button" className="btn" onClick={save}>Save questions</button>
      {msg.text && <p className={msg.error ? "error" : "success"}>{msg.text}</p>}
    </div>
  );
}