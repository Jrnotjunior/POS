import { useState, type FormEvent } from 'react';
import { signInWithPassword, verifySignInMfa } from './supabaseAuth';

type Props = { onAuthenticated: () => void };

export function PosSignIn({ onAuthenticated }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = challenge
        ? await verifySignInMfa(challenge.factorId, challenge.challengeId, code)
        : await signInWithPassword(email, password);
      if (result.status === 'authenticated') {
        onAuthenticated();
      } else if (result.status === 'mfa_required') {
        setChallenge({ factorId: result.factorId, challengeId: result.challengeId });
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage('Sign-in could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pos-auth-page">
      <section className="pos-auth-card" aria-labelledby="pos-auth-title">
        <a className="pos-auth-brand" href="#register" aria-label="Web2table POS">
          <img src="https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png" alt="" />
          <span>Web<span>2</span>table <small>POINT OF SALE</small></span>
        </a>
        <p className="pos-eyebrow">SECURE WORKSPACE</p>
        <h1 id="pos-auth-title">{challenge ? 'Verify it’s you' : 'Sign in to POS'}</h1>
        <p className="pos-auth-subtitle">{challenge ? 'Enter the current six-digit code from your verified authenticator app.' : 'Use your Web2table staff account. Multi-factor authentication is required.'}</p>
        <form onSubmit={submit} className="pos-auth-form">
          {!challenge && <>
            <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          </>}
          {challenge && <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9 ]/g, ''))} required autoFocus /></label>}
          {message && <p className="pos-auth-error" role="alert">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Please wait…' : challenge ? 'Verify and continue' : 'Sign in securely'}</button>
          {challenge && <button type="button" className="pos-auth-secondary" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setMessage(''); }}>Back to sign in</button>}
        </form>
        <p className="pos-auth-security">Access is restricted to authorized restaurant owners until cashier permissions are provisioned. Your session must pass MFA.</p>
      </section>
    </main>
  );
}
