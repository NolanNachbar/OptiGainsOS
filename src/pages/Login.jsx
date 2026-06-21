import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';

// ── Shared auth composition ────────────────────────────────────────────────
// One header recipe for Login / ForgotPassword / ResetPassword. Kept identical
// across the three paired screens so the front door reads as a single surface.
// CLEAN: flat charcoal background — depth comes from surface tone + shadow on
// the card, never from an ambient gradient/glow.

export function AuthShell({ children }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] relative w-full"
      style={{ background: 'var(--color-bg)' }}
    >
      {children}
    </div>
  );
}

export function AuthHeader({ subtitle }) {
  // Brand mark + wordmark composed as one centered unit so the hero reads
  // intentional instead of a badge floating over a dark void.
  return (
    <div className="flex flex-col items-center text-center rise-in">
      <div
        className="h-12 w-12 rounded-2xl flex items-center justify-center type-display text-[22px] text-[var(--color-action-dark)]"
        style={{ background: 'var(--color-brand)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }}
        aria-hidden="true"
      >
        O
      </div>
      <h1 className="type-display text-[28px] sm:text-[24px] whitespace-nowrap text-ink mt-4">OPTIGAINS</h1>
      {subtitle && (
        <p className="text-[12px] font-semibold mt-1.5 tracking-[0.04em] text-muted-2">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/today';

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate through the inline #login-error path (role=alert, text-brand)
    // instead of the native OS tooltip.
    if (!email.trim() || !password) {
      setErrorMsg('Enter your email and password');
      return;
    }

    setLoading(true);

    try {
      await signIn(email, password);
      setErrorMsg('');
      toast.success('Welcome back');
      navigate(returnTo, { replace: true });
    } catch (error) {
      setErrorMsg(error.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeader subtitle="Performance OS · private build" />

      <div className="glass w-full max-w-sm mt-6 sm:mt-9 px-4 pt-5 pb-4 rise-in-2">
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-2.5">
            <Label htmlFor="email" className="text-ink mb-1 block">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              className="placeholder:!text-ink-muted"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
              autoComplete="email"
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? 'login-error' : undefined}
            />
          </div>
          <div className="mb-2">
            <Label htmlFor="password" className="text-ink mb-1 block">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              className="placeholder:!text-ink-muted"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
              autoComplete="current-password"
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? 'login-error' : undefined}
            />
          </div>

          {errorMsg && <p id="login-error" role="alert" className="text-brand text-[13px] mb-2">{errorMsg}</p>}

          <Button
            type="submit"
            variant="volt"
            size="lg"
            className="w-full mt-1 active:scale-[.99] bg-none bg-[var(--color-brand)] [box-shadow:0_6px_18px_rgba(var(--color-brand-rgb)/0.22),inset_0_1px_0_rgba(255,255,255,0.35)]"
            disabled={loading}
          >
            {loading ? (
              <>
                <LoadingSpinner size="small" className="mr-1" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <Link
            to="/forgot-password"
            className="cta-ghost w-full mt-2.5 text-[13.5px] font-bold text-ink hover:text-ink active:text-ink"
          >
            Forgot password
          </Link>
        </form>
      </div>
    </AuthShell>
  );
}
