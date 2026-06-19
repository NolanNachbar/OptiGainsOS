import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { toast } from 'sonner';

// LOGIN — quiet, ambient, one glass card (the design's front door).
const AMBIENT = {
  background:
    'radial-gradient(480px 360px at 80% -10%, rgba(78,205,196,0.16), transparent 70%),' +
    'radial-gradient(420px 360px at -15% 45%, rgba(155,140,255,0.10), transparent 70%),' +
    'radial-gradient(560px 440px at 50% 120%, rgba(239,115,104,0.13), transparent 70%)',
};

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
    setLoading(true);

    try {
      await signIn(email, password);
      setErrorMsg('');
      toast.success('Welcome back!');
      navigate(returnTo, { replace: true });
    } catch (error) {
      setErrorMsg(error.message || 'Invalid email or password');
      toast.error(error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <div className="absolute inset-0 pointer-events-none" style={AMBIENT} />

      <div className="flex-1 flex flex-col items-center justify-center px-5 relative z-10 w-full">
        <div className="text-center rise-in">
          <h1 className="type-display text-[26px] whitespace-nowrap text-ink">
            OPTI<span style={{ color: 'var(--hue-teal)' }}>GAINS</span>
          </h1>
          <p className="text-[11.5px] font-semibold mt-1.5 tracking-[0.02em] text-muted-2">
            Performance OS · private build
          </p>
        </div>

        <div className="glass w-full max-w-sm mt-9 px-4 pt-[18px] pb-4 rise-in-2">
          <form onSubmit={handleSubmit}>
            <div className="mb-[9px]">
              <Label htmlFor="email" className="text-ink mb-1 block">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                className="!h-12 !rounded-xl"
                autoComplete="email"
                autoFocus
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? 'login-error' : undefined}
                required
              />
            </div>
            <div className="mb-[9px]">
              <Label htmlFor="password" className="text-ink mb-1 block">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                className="!h-12 !rounded-xl"
                autoComplete="current-password"
                aria-invalid={!!errorMsg}
                aria-describedby={errorMsg ? 'login-error' : undefined}
                required
              />
              {errorMsg && <p id="login-error" role="alert" className="text-bad text-sm mt-2">{errorMsg}</p>}
            </div>

            <Button type="submit" variant="volt" size="lg" className="w-full mt-1" disabled={loading}>
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
                className="text-[11.5px] font-bold text-muted-2 hover:text-ink transition-colors inline-flex items-center py-3 px-2 -my-3 -mx-2"
              >
                Forgot password
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
