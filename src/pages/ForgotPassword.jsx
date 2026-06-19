import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Mail, ArrowLeft } from 'lucide-react';
import { AuthShell, AuthHeader } from '@/pages/Login';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await resetPassword(email);
      setEmailSent(true);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error) {
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeader subtitle="Reset your password" />

      <div className="glass w-full max-w-sm mt-auto sm:mt-9 px-4 pt-[18px] pb-4 rise-in-2">
        {emailSent ? (
          <div key="sent" className="text-center space-y-4 rise-in">
            <p className="type-display text-[15px] text-ink">Check your email</p>
            <p className="text-secondary text-[12.5px]">
              We've sent a password reset link to <span className="font-semibold text-ink">{email}</span>
            </p>
            <p className="text-secondary text-[11.5px]">
              Didn't receive the email? Check your spam folder or try again.
            </p>
            <Button
              onClick={() => setEmailSent(false)}
              variant="dark"
              size="lg"
              className="w-full"
            >
              Try another email
            </Button>
          </div>
        ) : (
          <form key="form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-ink mb-1 block">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  autoComplete="email"
                  autoFocus
                  required
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
                  Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </Button>
          </form>
        )}

        <div className="flex items-center justify-center mt-3 px-0.5">
          <Link
            to="/login"
            className="text-[13px] font-semibold text-secondary hover:text-ink transition-colors inline-flex items-center justify-center gap-2 min-h-[44px] px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
