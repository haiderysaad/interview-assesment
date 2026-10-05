import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { api } from "../../api";

const WORKSPACE_DATE = new Date().toLocaleDateString(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function AdminGate() {
  const [ok, setOk] = useState(() => (sessionStorage.getItem("adminKey") ? null : false));
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const location = useLocation();

  useEffect(() => {
    if (!sessionStorage.getItem("adminKey")) return;
    api("/admin/check")
      .then(() => setOk(true))
      .catch(() => {
        sessionStorage.removeItem("adminKey");
        setOk(false);
      });
  }, []);

  async function login(e) {
    e.preventDefault();
    setError("");
    sessionStorage.setItem("adminKey", key);
    try {
      await api("/admin/check");
      setOk(true);
    } catch (err) {
      sessionStorage.removeItem("adminKey");
      setError(err.message);
    }
  }

  if (ok === null) {
    return (
      <main className="admin-auth-shell">
        <div className="admin-auth-card" role="status">Checking admin access…</div>
      </main>
    );
  }
  if (ok) {
    if (location.pathname.includes("/aptitude")) return <Outlet />;

    const pageTitle = location.pathname.endsWith("/new")
      ? "Create a session"
      : location.pathname.includes("/aptitude")
        ? "Question builder"
        : location.pathname === "/admin"
          ? "Overview"
          : "Session details";

    return (
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <Link className="admin-brand" to="/admin" aria-label="Interview desk home">
            <span className="admin-brand-mark">i</span>
            <span>interview<span className="admin-brand-light">desk</span></span>
          </Link>
          <div className="admin-workspace-label">WORKSPACE</div>
          <nav className="admin-navigation" aria-label="Main navigation">
            <Link
              className={`admin-nav-link${location.pathname === "/admin" ? " is-active" : ""}`}
              to="/admin"
            >
              <span className="admin-nav-icon" aria-hidden="true">▦</span>
              <span>Sessions</span>
            </Link>
          </nav>
          <div className="admin-sidebar-bottom">
            <div className="admin-help-card">
              <span className="admin-help-icon" aria-hidden="true">✳</span>
              <strong>Ready when you are</strong>
              <span>Build thoughtful interviews, all in one place.</span>
            </div>
            <div className="admin-profile">
              <span className="admin-avatar">AD</span>
              <span><strong>Administrator</strong><small>Workspace owner</small></span>
            </div>
          </div>
        </aside>

        <div className="admin-main">
          <header className="admin-topbar">
            <div className="admin-breadcrumb">
              <span>Workspace</span><span aria-hidden="true">/</span><strong>{pageTitle}</strong>
            </div>
            <div className="admin-topbar-right">
              <span className="admin-date"><span aria-hidden="true">◷</span>{WORKSPACE_DATE}</span>
              <span className="admin-topbar-avatar" aria-label="Administrator">AD</span>
            </div>
          </header>
          <main className="admin-content"><Outlet /></main>
        </div>
      </div>
    );
  }

  return (
    <main className="admin-auth-shell">
      <form className="admin-auth-card" onSubmit={login}>
        <Link className="admin-brand admin-auth-brand" to="/" aria-label="Interview desk">
          <span className="admin-brand-mark">i</span>
          <span>interview<span className="admin-brand-light">desk</span></span>
        </Link>
        <span className="admin-eyebrow">WORKSPACE ACCESS</span>
        <h1>Welcome back</h1>
        <p className="admin-auth-description">Sign in to manage your interview sessions.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <label>
          Admin key
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus required />
        </label>
        <button className="btn" type="submit">Continue <span aria-hidden="true">→</span></button>
        <span className="admin-auth-footnote">Private workspace · Secure access</span>
      </form>
    </main>
  );
}