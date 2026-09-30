import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../../api";

const ROUND_TYPES = [
  { type: "APTITUDE", label: "Aptitude test" },
  { type: "TECHNICAL", label: "Technical round" },
  { type: "AI_INTERVIEW", label: "AI interview" },
];

export default function CreateSession() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "", role: "", description: "", startsAt: "", endsAt: "",
  });
  const [rounds, setRounds] = useState({
    APTITUDE: { on: true, durationMin: 30 },
    TECHNICAL: { on: false, durationMin: 60 },
    AI_INTERVIEW: { on: false, durationMin: 20 },
  });
  const [proctoring, setProctoring] = useState({
    fullscreenRequired: true,
    webcamRequired: true,
    screenShareRequired: true,
    blockCopyPaste: true,
    maxTabSwitches: 3,
  });

  const setField = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const session = await api("/sessions", {
        method: "POST",
        body: {
          ...form,
          startsAt: form.startsAt && new Date(form.startsAt).toISOString(),
          endsAt: form.endsAt && new Date(form.endsAt).toISOString(),
          rounds: ROUND_TYPES.filter((r) => rounds[r.type].on).map((r) => ({
            type: r.type,
            durationMin: rounds[r.type].durationMin,
          })),
          proctoring,
        },
      });
      const aptitudeRound = session.rounds.find(
        (round) => round.type === "APTITUDE",
      );
      navigate(
        aptitudeRound
          ? `/admin/sessions/${session.id}/aptitude`
          : "/admin",
      );
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="page" onSubmit={submit}>
      <Link to="/admin">← Back</Link>
      <h1>New interview session</h1>
      {error && <p className="error">{error}</p>}

      <label>Title<input name="title" value={form.title} onChange={setField} /></label>
      <label>Role<input name="role" value={form.role} onChange={setField} placeholder="e.g. Backend Developer" /></label>
      <label>Description<textarea name="description" value={form.description} onChange={setField} /></label>
      <div className="row">
        <label>Opens at<input type="datetime-local" name="startsAt" value={form.startsAt} onChange={setField} /></label>
        <label>Closes at<input type="datetime-local" name="endsAt" value={form.endsAt} onChange={setField} /></label>
      </div>

      <h2>Rounds (in order)</h2>
      {ROUND_TYPES.map((r) => (
        <div className="row" key={r.type}>
          <label className="check">
            <input
              type="checkbox"
              checked={rounds[r.type].on}
              onChange={(e) => setRounds({ ...rounds, [r.type]: { ...rounds[r.type], on: e.target.checked } })}
            />
            {r.label}
          </label>
          <input
            type="number" min="1" style={{ width: 80 }}
            value={rounds[r.type].durationMin}
            onChange={(e) => setRounds({ ...rounds, [r.type]: { ...rounds[r.type], durationMin: e.target.value } })}
          />
          <span>min</span>
        </div>
      ))}

      <h2>Proctoring</h2>
      {[
        ["fullscreenRequired", "Require fullscreen"],
        ["webcamRequired", "Require webcam"],
        ["screenShareRequired", "Require full screen share"],
        ["blockCopyPaste", "Block copy / paste"],
      ].map(([key, label]) => (
        <label className="check" key={key}>
          <input
            type="checkbox"
            checked={proctoring[key]}
            onChange={(e) => setProctoring({ ...proctoring, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <label>Max tab switches before auto-flag
        <input
          type="number" min="0" style={{ width: 80 }}
          value={proctoring.maxTabSwitches}
          onChange={(e) => setProctoring({ ...proctoring, maxTabSwitches: Number(e.target.value) })}
        />
      </label>

      <button className="btn" type="submit">Create session</button>
    </form>
  );
}