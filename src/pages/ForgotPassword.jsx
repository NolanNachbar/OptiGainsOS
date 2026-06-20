import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
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

      <div className="glass w-full max-w-sm mt-6 sm:mt-9 px-4 pt-5 pb-4 rise-in-2">
        {emailSent ? (
          <div key="sent" className="text-center space-y-4 rise-in">
            <div className="glass-inset mx-auto flex h-12 w-12 items-center justify-center text-ink">
              <CheckCircle className="w-5 h-5" />
            </div>
            <p className="type-display text-[18px] text-ink">Check your email</p>
            <p className="text-secondary text-[12.5px]">
              We've sent a password reset link to <span className="font-semibold text-ink">{email}</span>
            </p>
            <p className="text-secondary text-[12.5px]">
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
          <form key="form" onSubmit={handleSubmit} className="space-y-4 rise-in">
            <p className="type-display text-[18px] text-ink text-center">Enter your email</p>
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

        <div className="flex items-center justify-center mt-3 pt-2 border-t border-charcoal-borderSoft px-0.5">
          <Link
            to="/login"
            className="text-[13px] font-semibold text-secondary hover:text-ink active:text-ink transition-colors duration-200 ease-[var(--ease)] inline-flex items-center justify-center gap-2 min-h-[44px] px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
