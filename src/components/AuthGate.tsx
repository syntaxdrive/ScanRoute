import React, { useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { PlanTier, QuotaSummary, SupabaseIssue, UserProfile } from '../types/qr';

interface AuthGateProps {
  supabaseEnabled: boolean;
  bootstrapRequired: boolean;
  supabaseIssue?: SupabaseIssue | null;
  onAuthenticated: (
    token: string,
    user: UserProfile,
    quota: QuotaSummary | null,
    issue?: SupabaseIssue | null
  ) => void;
  onBackToPublic: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  supabaseEnabled,
  bootstrapRequired,
  supabaseIssue,
  onAuthenticated,
  onBackToPublic,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(
    bootstrapRequired ? 'register' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [plan, setPlan] = useState<PlanTier>('business');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);

    try {
      const sb = getSupabaseClient();
      if (supabaseEnabled && sb) {
        if (mode === 'register') {
          const { data, error: sbErr } = await sb.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: {
                business_name: businessName.trim(),
                plan,
              },
            },
          });
          if (sbErr) throw new Error(sbErr.message);
          const token = data.session?.access_token;
          if (!token) {
            setInfo(
              'Account created. Check your email to confirm your address, then sign in.'
            );
            setMode('login');
            return;
          }
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const meData = (await meRes.json()) as {
            user: UserProfile;
            quota: QuotaSummary | null;
            supabaseIssue?: SupabaseIssue | null;
            error?: string;
          };
          if (!meRes.ok) throw new Error(meData.error || 'Unable to load profile.');
          onAuthenticated(token, meData.user, meData.quota, meData.supabaseIssue);
          return;
        }

        const { data, error: sbErr } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (sbErr) throw new Error(sbErr.message);
        const token = data.session?.access_token;
        if (!token) throw new Error('Unable to establish session.');

        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meData = (await meRes.json()) as {
          user: UserProfile;
          quota: QuotaSummary | null;
          supabaseIssue?: SupabaseIssue | null;
          error?: string;
        };
        if (!meRes.ok) throw new Error(meData.error || 'Unable to load profile.');
        onAuthenticated(token, meData.user, meData.quota, meData.supabaseIssue);
        return;
      }

      // Server-backed auth (local scrypt OR Supabase server fallback when VITE_SUPABASE_ANON_KEY is absent)
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          businessName: businessName.trim(),
          plan,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        user?: UserProfile;
        quota?: QuotaSummary | null;
        supabaseIssue?: SupabaseIssue | null;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        throw new Error(data.error || 'Authentication failed.');
      }
      onAuthenticated(data.token, data.user, data.quota ?? null, data.supabaseIssue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="max-w-md w-full mx-auto space-y-5">
        <button
          type="button"
          onClick={onBackToPublic}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to ScanRoute Website
        </button>

        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="space-y-1.5 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-2 text-xs font-medium text-sky-700">
              <Lock className="w-3.5 h-3.5" />
              <span>ScanRoute Workspace</span>
            </div>
            <h1 className="text-lg font-bold text-slate-900">
              {bootstrapRequired
                ? 'Set Up Your Workspace Owner Account'
                : mode === 'login'
                  ? 'Sign in to ScanRoute'
                  : 'Create a Client Account'}
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              {bootstrapRequired
                ? 'Choose your owner email and password to claim this workspace and unlock QR management, client inquiries, and hosting setup.'
                : mode === 'login'
                  ? 'Access your dynamic QR routes, live scan analytics, and printable flyers.'
                  : 'Choose a plan tier to manage your business QR routes with enforced plan quotas.'}
            </p>
          </div>

          {!bootstrapRequired && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-md">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`py-1.5 text-xs font-medium rounded-sm cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
                className={`py-1.5 text-xs font-medium rounded-sm cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {supabaseIssue && (
            <div className="p-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md leading-relaxed">
              {supabaseIssue.message}
            </div>
          )}
          {error && (
            <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
              {error}
            </div>
          )}
          {info && (
            <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label htmlFor="auth-biz" className="block text-xs font-medium text-slate-700 mb-1">
                    {bootstrapRequired ? 'Workspace / Company Name' : 'Business Name'}
                  </label>
                  <input
                    id="auth-biz"
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder={bootstrapRequired ? 'ScanRoute HQ' : 'Harbor Street Bistro'}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                </div>

                {!bootstrapRequired && (
                  <div>
                    <label htmlFor="auth-plan" className="block text-xs font-medium text-slate-700 mb-1">
                      Account Plan
                    </label>
                    <select
                      id="auth-plan"
                      value={plan}
                      onChange={(e) => setPlan(e.target.value as PlanTier)}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    >
                      <option value="starter">Starter ($12/mo — 5 routes, 10k scans)</option>
                      <option value="business">Business ($29/mo — 35 routes, 100k scans)</option>
                      <option value="agency">Agency ($79/mo — 250 routes, unlimited scans)</option>
                    </select>
                  </div>
                )}
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 mb-1">
                Password (min 8 characters)
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {submitting
                ? 'Please wait...'
                : bootstrapRequired
                  ? 'Claim Owner Workspace'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
