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
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "", role: "", description: "", startsAt: "", endsAt: "",
  });
  const [rounds, setRounds] = useState({
    APTITUDE: { on: true, durationMin: 30 },
    TECHNICAL: { on: true, durationMin: 60 },
    AI_INTERVIEW: { on: false, durationMin: 20 },
  });
  const [proctoring, setProctoring] = useState({
    fullscreenRequired: true,
    webcamRequired: true,
    screenShareRequired: true,
    blockCopyPaste: true,
    maxTabSwitches: 3,
    maxFullscreenExits: 1,
  });

  const setField = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
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
      const technicalRound = session.rounds.find(
        (round) => round.type === "TECHNICAL",
      );
      navigate(
        aptitudeRound
          ? `/admin/sessions/${session.id}/aptitude`
          : technicalRound
            ? `/admin/sessions/${session.id}/technical`
            : "/admin",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="page" onSubmit={submit}>
      <Link to="/admin">← Back</Link>
      <h1>New interview session</h1>
      {error && <p className="error">{error}</p>}

      <label>Title<input name="title" value={form.title} onChange={setField} required /></label>
      <label>Role<input name="role" value={form.role} onChange={setField} placeholder="e.g. Backend Developer" required /></label>
      <label>Description<textarea name="description" value={form.description} onChange={setField} /></label>
      <div className="row">
        <label>Opens at<input type="datetime-local" name="startsAt" value={form.startsAt} onChange={setField} required /></label>
        <label>Closes at<input type="datetime-local" name="endsAt" value={form.endsAt} onChange={setField} required /></label>
      </div>

      <h2>Required rounds: aptitude, then technical</h2>
      {ROUND_TYPES.map((r) => (
        <div className="row" key={r.type}>
          <label className="check">
            <input
              type="checkbox"
              checked={rounds[r.type].on}
              disabled={r.type === "APTITUDE" || r.type === "TECHNICAL"}
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
      <label>Max tab switches before auto-flag (0 = removed on first)
        <input
          type="number" min="0" style={{ width: 80 }}
          value={proctoring.maxTabSwitches}
          onChange={(e) => setProctoring({ ...proctoring, maxTabSwitches: Number(e.target.value) })}
        />
      </label>
      {proctoring.fullscreenRequired && (
        <label>Max fullscreen exits before auto-flag (0 = removed on first)
          <input
            type="number" min="0" style={{ width: 80 }}
            value={proctoring.maxFullscreenExits}
            onChange={(e) => setProctoring({ ...proctoring, maxFullscreenExits: Number(e.target.value) })}
          />
        </label>
      )}

      <button className="btn" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create session"}</button>
    </form>
  );
}