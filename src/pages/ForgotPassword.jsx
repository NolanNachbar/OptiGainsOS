import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { AuthShell, AuthHeader, AuthPanel } from '@/pages/Login';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate through the inline #email-error path (role=alert, text-ink)
    // instead of the native OS tooltip — mirrors Login.jsx.
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email);
      setEmailSent(true);
      toast.success('Reset email sent. Check your inbox.');
    } catch (error) {
      toast.error(error.message || 'Could not send the reset email. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeader title="Reset password" meta="We email a reset link" />

      <AuthPanel>
        {emailSent ? (
          <div key="sent" className="text-center space-y-4 rise-in">
            <CheckCircle aria-hidden="true" className="mx-auto h-5 w-5 text-leaf" />
            <p className="text-emph font-semibold text-ink">Check your email</p>
            <p className="text-caption text-ink-muted">
              Reset link sent to <span className="font-semibold text-ink">{email}</span>
            </p>
            <p className="text-caption text-ink-muted">
              Not there? Check spam or try another address.
            </p>
            <Button
              onClick={() => setEmailSent(false)}
              variant="primary"
              size="lg"
              className="w-full"
            >
              Try another email
            </Button>
          </div>
        ) : (
          <form key="form" onSubmit={handleSubmit} className="space-y-4 rise-in" noValidate>
            <p className="text-body text-ink-muted text-center">Enter the email on your account. The link arrives by email.</p>
            <div>
              <Label htmlFor="email" className="text-micro font-semibold tracking-[0.08em] text-ink-muted mb-1 block">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(''); }}
                  className="pl-10"
                  autoComplete="email"
                  autoFocus
                  aria-invalid={!!errorMsg}
                  aria-describedby={errorMsg ? 'email-error' : undefined}
                />
              </div>
              {errorMsg && <p id="email-error" role="alert" className="text-body text-bad mt-1">{errorMsg}</p>}
            </div>

            <Button
              type="submit"
              variant="primary"
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

        <div className="flex items-center justify-center mt-4 pt-2 border-t border-charcoal-borderSoft px-0.5">
          <Link
            to="/login"
            className="text-body font-semibold text-ink-muted hover:text-ink active:text-ink transition-colors duration-base ease-out inline-flex items-center justify-center gap-2 min-h-[44px] px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </AuthPanel>
    </AuthShell>
  );
}
