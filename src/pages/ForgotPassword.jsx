import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Mail, ArrowLeft } from 'lucide-react';
import Logo from '@/components/Logo';
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: '#080B10' }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(480px 360px at 80% -10%, rgba(78,205,196,0.16), transparent 70%),' +
            'radial-gradient(560px 440px at 50% 120%, rgba(239,115,104,0.13), transparent 70%)',
        }}
      />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <Logo className="w-14 h-14 mx-auto mb-4" />
          <h1 className="type-display text-[24px] text-[#F2F4F7]">
            OPTI<span style={{ color: '#5EDCD2' }}>GAINS</span>
          </h1>
          <p className="text-[11.5px] font-semibold mt-1.5 text-[rgba(242,244,247,0.5)]">Reset your password</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-ink text-center">
              {emailSent ? 'Check Your Email' : 'Forgot Password'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="text-center space-y-4">
                <p className="text-ink-muted">
                  We've sent a password reset link to <span className="font-medium text-ink">{email}</span>
                </p>
                <p className="text-ink-muted text-sm">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <Button
                  onClick={() => setEmailSent(false)}
                  variant="outline"
                  className="w-full bg-charcoal-elevated border-charcoal-border text-ink hover:bg-charcoal-elevated"
                >
                  Try another email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-ink">Email</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="volt"
                  className="w-full font-bold"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <LoadingSpinner size="small" className="mr-2" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-brand hover:opacity-80 font-bold inline-flex items-center gap-2 transition-opacity"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
