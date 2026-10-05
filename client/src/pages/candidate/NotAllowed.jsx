export default function NotAllowed() {
  return (
    <main className="candidate-shell">
      <section className="candidate-message-card">
        <div className="candidate-brand-mark" aria-hidden="true">!</div>
        <span className="candidate-eyebrow">ACCESS DENIED</span>
        <h1>You are not allowed to give this test</h1>
        <p className="candidate-muted">
          The Google account you signed in with is not on the candidate list.
          Contact the person who invited you.
        </p>
      </section>
    </main>
  );
}