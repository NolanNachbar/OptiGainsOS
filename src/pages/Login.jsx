import Logo from '@/components/Logo';
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Card, PageHeader, cn } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';

// Shared auth composition for Login / ForgotPassword / ResetPassword.
// Flat field, the Gauge mark centred over a single column, one primary action.
export function AuthShell({ children }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-charcoal px-gutter pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <main className="w-full max-w-sm flex flex-col gap-6">{children}</main>
    </div>
  );
}

export function AuthHeader({ title, meta }) {
  return (
    <div className="flex flex-col items-center rise-in">
      <Logo className="h-14 w-14" aria-hidden="true" alt="" />
      <PageHeader
        className="px-0 pt-6 pb-0 justify-center [&>div]:text-center"
        eyebrow="OptiGains"
        title={title}
        meta={meta}
      />
    </div>
  );
}

export function AuthPanel({ children, className }) {
  return <Card className={cn('px-gutter py-6 border-x-0 sm:border-x rise-in-2', className)}>{children}</Card>;
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
      <AuthHeader title="Sign in" meta="Private build" />

      <AuthPanel>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="email" className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
              autoComplete="email"
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? 'login-error' : undefined}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="password" className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
              autoComplete="current-password"
              aria-invalid={!!errorMsg}
              aria-describedby={errorMsg ? 'login-error' : undefined}
            />
          </div>

          {errorMsg && <p id="login-error" role="alert" className="text-body text-bad">{errorMsg}</p>}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <LoadingSpinner size="small" className="mr-1" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <Button asChild variant="link" size="default" className="w-full text-ink-muted">
            <Link to="/forgot-password">Forgot password</Link>
          </Button>
        </form>
      </AuthPanel>
    </AuthShell>
  );
}
