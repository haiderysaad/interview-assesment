import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { api } from "../../api";

export default function AdminGate() {
  const [ok, setOk] = useState(() => (sessionStorage.getItem("adminKey") ? null : false));
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

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

  if (ok === null) return <main className="page">Loading…</main>;
  if (ok) return <Outlet />;
  return (
    <form className="page" onSubmit={login}>
      <h1>Admin login</h1>
      {error && <p className="error">{error}</p>}
      <label>
        Admin key
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus required />
      </label>
      <button className="btn" type="submit">Sign in</button>
    </form>
  );
}