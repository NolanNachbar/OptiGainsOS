import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Lock } from 'lucide-react';
import Logo from '@/components/Logo';
import { toast } from 'sonner';
import { passwordSchema } from '@/lib/validation';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true);
      else if (event !== 'INITIAL_SESSION') setHasSession(false);
    });
    // Fallback: a tokenless visit never fires PASSWORD_RECOVERY, so flip to the
    // invalid-link state after a grace period instead of spinning forever.
    const timeout = setTimeout(() => {
      setHasSession((prev) => (prev === null ? false : prev));
    }, 5000);
    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate password
    try {
      passwordSchema.parse(password);
    } catch (error) {
      toast.error(error.issues?.[0]?.message || 'Invalid password');
      return;
    }

    // Check password match
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast.success('Password updated successfully!');
      navigate('/today', { replace: true });
    } catch (error) {
      if (error.message?.includes('Auth session missing')) {
        toast.error('This reset link is invalid or expired. Please request a new one.');
      } else {
        toast.error(error.message || 'Failed to reset password');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(480px 360px at 80% -10%, rgba(78,205,196,0.16), transparent 70%),' +
            'radial-gradient(560px 440px at 50% 120%, rgba(239,115,104,0.13), transparent 70%)',
        }}
      />
      <div className="w-full max-w-md relative z-10 rise-in">
        <div className="text-center mb-8">
          <Logo className="w-14 h-14 mx-auto mb-4" />
          <h1 className="type-display text-[24px] text-ink">
            OPTI<span style={{ color: 'var(--hue-teal)' }}>GAINS</span>
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-ink text-center">Reset Password</CardTitle>
          </CardHeader>
          <CardContent>
            {hasSession === null ? (
              <div className="flex flex-col items-center py-6">
                <LoadingSpinner size="small" />
                <p className="text-ink-muted text-[13px] mt-3">Verifying your reset link…</p>
              </div>
            ) : !hasSession ? (
              <div className="text-center space-y-4">
                <p className="text-ink-muted">
                  This reset link is invalid or expired.
                </p>
                <Button asChild variant="volt" size="lg" className="w-full font-bold !h-12 !rounded-xl">
                  <Link to="/forgot-password">Request a new link</Link>
                </Button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password" className="text-ink">New Password</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-ink">Confirm Password</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="volt"
                size="lg"
                className="w-full font-bold !h-12 !rounded-xl"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="small" className="mr-2" />
                    Updating password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </form>
            )}

            <div className="mt-6 text-center">
              <p className="text-ink-muted">
                Remember your password?{' '}
                <Link to="/login" className="text-brand hover:text-ink transition-colors font-medium inline-flex items-center py-3 px-2 -my-3 -mx-2">
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
