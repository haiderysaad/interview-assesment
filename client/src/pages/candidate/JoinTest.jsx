import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";

const GOOGLE_SRC = "https://accounts.google.com/gsi/client";

function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SRC}"]`);
    const script = existing || document.createElement("script");
    script.addEventListener("load", resolve);
    script.addEventListener("error", reject);
    if (!existing) {
      script.src = GOOGLE_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export default function JoinTest() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    let active = true;
    api(`/candidate/join/${shareToken}`)
      .then((data) => active && setInfo(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [shareToken]);

  useEffect(() => {
    if (!info) return undefined;
    let active = true;
    loadGoogle()
      .then(() => {
        if (!active || !buttonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            setBusy(true);
            setError("");
            try {
              const { token } = await api(`/candidate/join/${shareToken}/login`, {
                method: "POST",
                body: { credential },
              });
              navigate(`/test/${token}`, { replace: true });
            } catch (e) {
              if (e.status === 403) navigate("/not-allowed", { replace: true });
              else {
                setError(e.message);
                setBusy(false);
              }
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
        });
      })
      .catch(() => active && setError("Could not load Google sign-in."));
    return () => {
      active = false;
    };
  }, [info, shareToken, navigate]);

  if (!info) {
    return (
      <main className="candidate-shell">
        <div className="candidate-message-card" role="status">
          {error ? <p className="candidate-error">{error}</p> : "Loading…"}
        </div>
      </main>
    );
  }

  return (
    <main className="candidate-shell">
      <section className="candidate-message-card">
        <span className="candidate-eyebrow">
          {info.hasAptitudeRound && info.hasTechnicalRound
            ? "INTERVIEW ASSESSMENT"
            : info.hasTechnicalRound
              ? "TECHNICAL ASSESSMENT"
              : "APTITUDE ASSESSMENT"}
        </span>
        <h1>{info.title}</h1>
        <p className="candidate-muted">{info.role}</p>
        <p>Sign in with the Google account you were invited with. This sign-in covers both rounds.</p>
        <div ref={buttonRef} style={{ display: "flex", justifyContent: "center", margin: "16px 0" }} />
        {busy && <p className="candidate-muted" role="status">Checking your access…</p>}
        {error && <p className="candidate-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}