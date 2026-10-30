import { useState, type FormEvent } from 'react';
import { signInWithPassword, verifySignInMfa, signOutPos, type SignInResult } from './supabaseAuth';

type Props = { onAuthenticated: () => void };

export function PosSignIn({ onAuthenticated }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfa, setMfa] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleResult(result: SignInResult) {
    if (result.status === 'error') {
      setError(result.message);
      return;
    }
    if (result.status === 'mfa_required') {
      setMfa({ factorId: result.factorId, challengeId: result.challengeId });
      setError('');
      return;
    }
    setError('');
    onAuthenticated();
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await handleResult(await signInWithPassword(email, password));
    } catch {
      setError('Sign-in could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfa || busy) return;
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await handleResult(await verifySignInMfa(mfa.factorId, mfa.challengeId, otp.trim()));
    } catch {
      setError('MFA verification could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function backToSignIn() {
    await signOutPos();
    setMfa(null);
    setOtp('');
    setPassword('');
    setError('');
  }

  return (
    <main className="pos-auth-page">
      <section className="pos-auth-card" aria-labelledby="pos-auth-title">
        <a className="pos-auth-brand" href="https://app.web2table.io/" aria-label="Web2table workspace">
          <img src="https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png" alt="" />
          <span>Web<span>2</span>table <small>POINT OF SALE</small></span>
        </a>
        <p className="pos-eyebrow">WEB2TABLE WORKSPACE</p>
        <h1 id="pos-auth-title">{mfa ? 'Verify it’s you' : 'Sign in to POS'}</h1>
        <p className="pos-auth-subtitle">
          {mfa
            ? 'Enter the 6-digit code from your verified authenticator app to continue securely.'
            : 'Use your existing Web2table account. Your restaurant and branch access will be verified by the POS service.'}
        </p>
        {mfa ? (
          <form className="pos-auth-form" onSubmit={submitMfa}>
            <label htmlFor="pos-mfa-code">Authenticator code
              <input id="pos-mfa-code" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required autoFocus />
            </label>
            {error && <p className="pos-auth-error" role="alert">{error}</p>}
            <button type="submit" disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
            <button className="pos-auth-secondary" type="button" onClick={() => void backToSignIn()} disabled={busy}>Use another account</button>
          </form>
        ) : (
          <form className="pos-auth-form" onSubmit={submitCredentials}>
            <label htmlFor="pos-email">Email address
              <input id="pos-email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label htmlFor="pos-password">Password
              <input id="pos-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            {error && <p className="pos-auth-error" role="alert">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
          </form>
        )}
        <p className="pos-auth-security" role="note">POS requires a verified authenticator. Sign-in is handled by Supabase; branch access and permissions are checked server-side. No service-role key is used in this app.</p>
      </section>
    </main>
  );
}
