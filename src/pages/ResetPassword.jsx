import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Lock, ArrowLeft } from 'lucide-react';
import { AuthShell, AuthHeader } from '@/pages/Login';
import { toast } from 'sonner';
import { passwordSchema } from '@/lib/validation';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Only a genuine PASSWORD_RECOVERY event unlocks the editable form. A plain
    // signed-in session must NOT expose the password reset fields.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setHasSession(true);
      else if (event !== 'INITIAL_SESSION') setHasSession(false);
    });
    // Fallback: a tokenless visit never fires PASSWORD_RECOVERY, so flip to the
    // invalid-link state after a short grace period instead of spinning forever.
    const timeout = setTimeout(() => {
      setHasSession((prev) => (prev === null ? false : prev));
    }, 2500);
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
    <AuthShell>
      <AuthHeader subtitle="Set a new password" />

      <div className="glass w-full max-w-sm mt-6 sm:mt-9 px-4 pt-5 pb-4 rise-in-2 min-h-[300px] flex flex-col justify-center">
        {hasSession === null ? (
          <div className="flex flex-col items-center py-6">
            <LoadingSpinner size="small" />
            <p className="text-ink-muted text-[13px] mt-3">Verifying your reset link…</p>
          </div>
        ) : !hasSession ? (
          <div className="text-center space-y-4 rise-in">
            <p className="text-ink-muted text-[13px]">
              This reset link is invalid or expired.
            </p>
            <Button asChild variant="volt" size="lg" className="w-full">
              <Link to="/forgot-password">Request a new link</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password" className="text-ink mb-1 block">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="confirmPassword" className="text-ink mb-1 block">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="volt"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoadingSpinner size="small" className="mr-2" />
                  Updating password…
                </>
              ) : (
                'Reset Password'
              )}
            </Button>
          </form>
        )}

        <div className="flex items-center justify-center mt-3 px-0.5">
          <Link
            to="/login"
            className="text-[13px] font-semibold text-secondary hover:text-ink active:text-ink transition-colors inline-flex items-center justify-center gap-2 min-h-[44px] px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
