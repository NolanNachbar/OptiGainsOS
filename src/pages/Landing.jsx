import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import SEO from '@/components/SEO';
import Logo from '@/components/Logo';
import {
  Dumbbell,
  Calendar,
  TrendingUp,
  Brain,
  Users,
  WifiOff,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';

const HERO_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAdZKJmXN0yEW_kdsIJNJF2jvegXoaQpVR2IRnlaBAmrxrUSWs4shl-IfgFS69C4RZb94hBQw_Z34IKp3klQ40GT5uWJaw6vyCYUA6QSsuhrbwgc3TtX_8G2A72hqs47omzpcyAks3aCbxWOotVurTE4n6EzcdvYamUtsoscLr3HZpcoP7wXHtWdEYRfCmBF-l4bCT0CfQzAVb-GsJCaL9EkEltUxVpieqVhxtMG18RE6eT5sWunbQCGnRU0i4wlmI90UmvZ2aCDRM';

const features = [
  {
    icon: Dumbbell,
    title: 'Smart Workout Tracking',
    description:
      "Intelligent logging that predicts your next set's weight based on real-time fatigue analysis and historic volume.",
  },
  {
    icon: Calendar,
    title: 'Program Builder',
    description:
      'Advanced periodization tools for strength, hypertrophy, or endurance. Build blocks that evolve with your progress.',
  },
  {
    icon: TrendingUp,
    title: 'PR Tracking',
    description:
      'Automated milestone detection for 1RM, volume records, and rep maxes. Celebrate the small victories in the grind.',
  },
  {
    icon: Brain,
    title: 'ML Recommendations',
    description:
      'Machine learning algorithms analyze your recovery patterns to suggest optimal rest days or intensity adjustments.',
  },
  {
    icon: Users,
    title: 'Social Features',
    description:
      'Competitive leaderboards and collaborative training groups. Find your tribe and push each other to the limit.',
  },
  {
    icon: WifiOff,
    title: 'PWA Offline',
    description:
      'No connection, no problem. Our offline-first architecture ensures your data is saved even in basement iron paradises.',
  },
];


export default function Landing() {
  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <SEO
        title="Tactical Workout Tracking & Training Programs"
        description="The tactical workout tracking platform for serious lifters. Track PRs, build programs, log nutrition, and get ML-powered exercise recommendations. Free forever."
        keywords="workout tracker, fitness app, strength training, progressive overload, PR tracking, workout programs, bodybuilding, powerlifting, gym app, exercise tracker"
      />

      {/* Fixed Header */}
      <header className="fixed top-0 w-full bg-[#121212]/90 backdrop-blur-xl border-b border-[#2a2a2a] z-50">
        <div className="flex justify-between items-center px-4 md:px-8 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Logo className="w-8 h-8" />
            <span className="text-[#ccff00] font-bold tracking-tight text-lg">
              Vektor
            </span>
          </div>
          <Link to="/signup">
            <Button variant="volt" className="text-xs tracking-widest uppercase">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 md:px-8">
          <div className="absolute inset-0 z-0">
            <img
              className="w-full h-full object-cover opacity-30"
              src={HERO_IMAGE}
              alt="Elite athlete training"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/70 to-transparent" />
          </div>
          <div className="relative z-10 text-center max-w-4xl">
            <span className="text-[#ccff00] text-xs tracking-[0.3em] uppercase mb-6 block font-medium">
              Engineered for Serious Lifters
            </span>
            <h1 className="text-5xl sm:text-7xl md:text-9xl font-bold text-white mb-8 leading-none tracking-tight uppercase">
              Track. Grind.
              <br />
              <span
                className="text-[#ccff00]"
                style={{ textShadow: '0 0 40px rgba(204,255,0,0.4)' }}
              >
                Dominate.
              </span>
            </h1>
            <p className="text-lg text-[#a0a0a0] max-w-xl mx-auto mb-10">
              Precision metrics meet relentless effort. The tactical command center for athletes who
              track every rep, every set, every PR.
            </p>
            <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="bg-[#ccff00] hover:bg-[#d9ff1a] text-black px-10 py-6 text-sm tracking-widest uppercase font-bold transition-all active:scale-95"
                >
                  Get Started
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-[#1a1a1a]/5 backdrop-blur-md text-white px-10 py-6 text-sm tracking-widest uppercase hover:bg-[#1a1a1a]/10 transition-all active:scale-95"
                >
                  Sign In
                  <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-24 px-4 md:px-8 max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-bold uppercase tracking-tight mb-4">
              Reliable Tools for the{' '}
              <span className="text-[#ccff00]">Unstoppable</span>
            </h2>
            <p className="text-[#a0a0a0] text-lg max-w-2xl text-center mx-auto">
              Built to withstand the most grueling sessions. Every feature is precision-calibrated
              to optimize your physical peak performance.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8 flex flex-col gap-4 items-center text-center hover:border-[rgba(204,255,0,0.25)] transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-[#ccff00]/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-[#ccff00]" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-wide">{feature.title}</h3>
                <p className="text-[#a0a0a0] text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-4 md:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-[#ccff00] rounded-3xl p-8 md:p-16 flex flex-col items-center text-center overflow-hidden relative">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_white,_transparent)]" />
              <h2 className="text-4xl sm:text-5xl md:text-7xl font-bold text-black mb-6 leading-none uppercase tracking-tight z-10">
                Ready to Transform?
              </h2>
              <p className="text-black/70 text-lg max-w-2xl mb-10 z-10">
                Join elite athletes tracking their journey to the top. No gimmicks, just
                data-driven results.
              </p>
              <Link to="/signup" className="z-10">
                <Button
                  size="lg"
                  className="bg-black text-[#ccff00] hover:bg-black/80 px-10 py-6 text-sm tracking-widest uppercase font-bold shadow-xl active:scale-95 transition-all"
                >
                  Start Your Program
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-16 bg-[#121212] border-t border-charcoal-border">
        <div className="flex flex-col md:flex-row justify-between items-center px-4 md:px-8 max-w-7xl mx-auto gap-6">
          <div className="flex flex-col gap-1 items-center md:items-start">
            <div className="font-bold text-[#ccff00] tracking-tight">Vektor</div>
            <p className="text-[#555555] text-xs">© 2025 Vektor. Built for the elite.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
