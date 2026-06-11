import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
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
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/today';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn(email, password);
      toast.success('Welcome back!');
      navigate(returnTo, { replace: true });
    } catch (error) {
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
          <div className="type-display text-[26px] whitespace-nowrap text-ink">
            OPTI<span style={{ color: 'var(--hue-teal)' }}>GAINS</span>
          </div>
          <p className="text-[11.5px] font-semibold mt-1.5 tracking-[0.02em] text-muted-2">
            Performance OS · private build
          </p>
        </div>

        <div className="glass w-full max-w-sm mt-9 px-4 pt-[18px] pb-4 rise-in-2">
          <form onSubmit={handleSubmit}>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="!h-12 !rounded-xl mb-[9px]"
              autoComplete="email"
              required
            />
            <Input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="!h-12 !rounded-xl mb-[9px]"
              autoComplete="current-password"
              required
            />

            <button type="submit" disabled={loading} className="cta-coral w-full mt-1 disabled:opacity-60">
              {loading ? (
                <>
                  <LoadingSpinner size="small" className="mr-1" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>

            <div className="flex items-center justify-between mt-3 px-0.5">
              <Link
                to="/forgot-password"
                className="text-[11.5px] font-bold text-muted-2 hover:text-ink transition-colors inline-flex items-center py-3 px-2 -my-3 -mx-2"
              >
                Forgot password
              </Link>
              <span className="text-[11.5px] font-bold" style={{ color: 'var(--hue-teal)' }}>
                Private build
              </span>
            </div>
          </form>
        </div>
      </div>

      <div
        className="relative z-10 text-center text-[10.5px] font-semibold font-technical text-faint"
        style={{ paddingBottom: 'calc(1.75rem + env(safe-area-inset-bottom))' }}
      >
        OptiGainsOS · adaptive engine recomputes daily
      </div>
    </div>
  );
}
