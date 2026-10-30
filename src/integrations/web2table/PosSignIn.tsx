type Props = { onAuthenticated: () => void };

/**
 * No credentials are collected in the POS. Authentication belongs to the
 * main Web2table workspace; this guard only asks the user to retry after
 * returning to that workspace. A valid shared Supabase session is picked up
 * automatically by PosApp.
 */
export function PosSignIn({ onAuthenticated }: Props) {
  return (
    <main className="pos-auth-page">
      <section className="pos-auth-card" aria-labelledby="pos-auth-title">
        <a className="pos-auth-brand" href="/" aria-label="Web2table">
          <img src="https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png" alt="" />
          <span>Web<span>2</span>table <small>POINT OF SALE</small></span>
        </a>
        <p className="pos-eyebrow">WEB2TABLE WORKSPACE</p>
        <h1 id="pos-auth-title">Continue to POS</h1>
        <p className="pos-auth-subtitle">Use your existing Web2table login. POS does not have a separate password.</p>
        <p className="pos-auth-security" role="status">If you are already signed in, retry below. Otherwise sign in to Web2table first, then open POS from your workspace.</p>
        <button type="button" onClick={() => { onAuthenticated(); window.location.reload(); }}>Check existing session</button>
      </section>
    </main>
  );
}
