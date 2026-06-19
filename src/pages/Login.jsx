import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';

// ── Shared auth composition ────────────────────────────────────────────────
// One ambient field + one header recipe for Login / ForgotPassword /
// ResetPassword. Kept byte-identical across the three paired screens so the
// front door reads as a single surface (single 24px wordmark, text-ink brand).
const AMBIENT = {
  background:
    'radial-gradient(480px 360px at 80% -10%, rgba(78,205,196,0.16), transparent 70%),' +
    'radial-gradient(420px 360px at -15% 45%, rgba(155,140,255,0.10), transparent 70%),' +
    'radial-gradient(560px 440px at 50% 120%, rgba(239,115,104,0.13), transparent 70%)',
};

export function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <div className="absolute inset-0 pointer-events-none" style={AMBIENT} />
      <div className="flex-1 flex flex-col items-center justify-end sm:justify-center px-5 pt-[8vh] pb-[max(2rem,env(safe-area-inset-bottom))] sm:pt-0 sm:pb-0 relative z-10 w-full">
        {children}
      </div>
    </div>
  );
}

export function AuthHeader({ subtitle }) {
  return (
    <div className="text-center rise-in">
      <h1 className="type-display text-[28px] sm:text-[24px] whitespace-nowrap text-ink">OPTIGAINS</h1>
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
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                className="pl-10"
                autoComplete="email"
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? 'login-error' : undefined}
                required
              />
            </div>
          </div>
          <div className="mb-2">
            <Label htmlFor="password" className="text-ink mb-1 block">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
              autoComplete="current-password"
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? 'login-error' : undefined}
              required
            />
            {errorMsg && <p id="login-error" role="alert" className="text-brand text-sm mt-2">{errorMsg}</p>}
          </div>

          <Button type="submit" variant="volt" size="lg" className="w-full mt-1 active:scale-[.99]" disabled={loading}>
            {loading ? (
              <>
                <LoadingSpinner size="small" className="mr-1" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <div className="flex items-center justify-center mt-3 px-0.5">
            <Link
              to="/forgot-password"
              className="text-[13px] font-semibold text-secondary hover:text-ink active:text-ink transition-colors inline-flex items-center justify-center min-h-[44px] px-2"
            >
              Forgot password
            </Link>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
