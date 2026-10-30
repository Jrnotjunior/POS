import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const supabaseAuth = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export type SignInResult =
  | { status: 'authenticated'; session: Session }
  | { status: 'mfa_required'; factorId: string; challengeId: string }
  | { status: 'error'; message: string };

export async function getCurrentAccessToken(): Promise<string | null> {
  if (!supabaseAuth) return null;
  const { data, error } = await supabaseAuth.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  if (!supabaseAuth) return { status: 'error', message: 'POS authentication is not configured. Add the Supabase URL and publishable/anon key to the deployment environment.' };
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session) return { status: 'error', message: error?.message ?? 'Sign-in could not be completed.' };

  const { data: assurance, error: assuranceError } = await supabaseAuth.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) return { status: 'error', message: 'Could not verify your MFA status. Please try again.' };
  if (assurance.currentLevel === 'aal2') return { status: 'authenticated', session: data.session };

  const { data: factors, error: factorsError } = await supabaseAuth.auth.mfa.listFactors();
  if (factorsError) return { status: 'error', message: 'Could not load your MFA factors.' };
  const factor = factors.totp.find((item) => item.status === 'verified');
  if (!factor) return { status: 'error', message: 'A verified authenticator is required for POS access. Contact your restaurant administrator.' };
  const { data: challenge, error: challengeError } = await supabaseAuth.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError || !challenge) return { status: 'error', message: 'Could not start MFA verification. Please try again.' };
  return { status: 'mfa_required', factorId: factor.id, challengeId: challenge.id };
}

export async function verifySignInMfa(factorId: string, challengeId: string, code: string): Promise<SignInResult> {
  if (!supabaseAuth) return { status: 'error', message: 'POS authentication is not configured.' };
  const { data, error } = await supabaseAuth.auth.mfa.verify({ factorId, challengeId, code: code.replace(/\s/g, '') });
  if (error || !data.session) return { status: 'error', message: error?.message ?? 'The authenticator code was not accepted.' };
  const { data: assurance, error: assuranceError } = await supabaseAuth.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== 'aal2') return { status: 'error', message: 'MFA verification did not establish a privileged session. Please try again.' };
  return { status: 'authenticated', session: data.session };
}

export async function signOutPos(): Promise<void> {
  if (supabaseAuth) await supabaseAuth.auth.signOut();
}
