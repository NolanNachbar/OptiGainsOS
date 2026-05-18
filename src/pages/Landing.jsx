import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import SEO from '@/components/SEO';
import Logo from '@/components/Logo';
import { Brain, Activity, Apple, Trophy, ArrowRight, ChevronRight } from 'lucide-react';

const HERO_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDTV-5cLsSCwnJ1UPhQAeHjt_gncqL_spi9B3GwJqCOgLM_h3k_0dLeLHxOOaLzoFt8ITQr6WWbb2SdNreg3dmGBvnLPAsdXqUrsj4MT3D814IJZBiCN8WVOI4661p9Uw9bxD3lSR_XT-GfsGrMLu4BlcBeSLMEFVql-mK_HPqNh_1jBpl5Fue7Mi4HMUiwwNZCqx64bMtGbSaiWIsXmLPhddR3IOfgjJ3BXmQOqNt-q7DtRjZqBDkGYSABvoPGyaRG1gzbci3TUAw';

const FEATURES = [
  {
    icon: Brain,
    title: 'Adaptive Programming',
    body: 'Your session data drives real-time programming adjustments. Volume, intensity, and exercise selection adapt to where you actually are — not where a static template assumes you should be.',
  },
  {
    icon: Activity,
    title: 'Recovery Tracking',
    body: 'Mathematical fatigue modeling applies exponential decay curves to your training history to predict muscle readiness — no subjective sliders required.',
  },
  {
    icon: Apple,
    title: 'Nutrition Coaching',
    body: 'Macro targets update weekly based on your actual weight trend vs. your goal. Bayesian TDEE estimation derived from your own data, not a formula.',
  },
];

const LEADERBOARD = [
  { rank: '01', initials: 'A.K.', name: 'Alex K.', pts: '2,481', active: true },
  { rank: '02', initials: 'J.M.', name: 'Jamie M.', pts: '2,104', active: true },
  { rank: '03', initials: 'R.T.', name: 'Ryan T.',  pts: '1,992', active: false },
];

const CHART_BARS = [40, 55, 75, 90, 85, 60, 45, 95, 100, 80, 30, 20];

function MacroRing({ pct, color, label }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  return (
    <div className="text-center">
      <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="transparent" stroke="#2a2a2a" strokeWidth="4" />
          <circle
            cx="40" cy="40" r={r} fill="transparent"
            stroke={color} strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute font-['IBM_Plex_Mono'] text-xs font-semibold text-white">{pct}%</span>
      </div>
      <span className="block mt-2 font-['IBM_Plex_Mono'] text-[10px] tracking-widest uppercase" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#131313] text-white font-['IBM_Plex_Sans',sans-serif]">
      <SEO
        title="Vektor — Precision Training & Nutrition Tracking"
        description="Adaptive workout programming, mathematical recovery tracking, and data-driven nutrition coaching. Built for athletes who take training seriously."
        keywords="workout tracker, fitness app, strength training, progressive overload, PR tracking, adaptive programming, nutrition tracking, RIR training"
      />

      {/* Nav */}
      <header className="fixed top-0 w-full z-50 bg-[#131313]/90 backdrop-blur-xl border-b border-[#2a2a2a]">
        <div className="flex justify-between items-center h-16 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Logo className="w-7 h-7" />
            <span className="text-[#ccff00] font-bold tracking-tight text-lg uppercase">Vektor</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {['Performance', 'Training', 'Nutrition'].map((label) => (
              <span
                key={label}
                className="font-['IBM_Plex_Mono'] text-[11px] tracking-[0.15em] uppercase text-[#a0a0a0] hover:text-white transition-colors cursor-default"
              >
                {label}
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase text-[#a0a0a0] hover:text-white h-9">
                Sign In
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="volt" className="font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase h-9 px-5 active:scale-95 transition-all">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-16">

        {/* Hero */}
        <section className="relative h-[90vh] flex items-center overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={HERO_IMAGE}
              alt="High performance training"
              className="w-full h-full object-cover grayscale brightness-50"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-[#131313]/40 to-transparent" />
          </div>
          <div className="relative z-10 px-6 md:px-8 max-w-7xl mx-auto w-full">
            <div className="max-w-2xl">
              <span className="inline-block font-['IBM_Plex_Mono'] text-[11px] tracking-[0.15em] uppercase text-[#ccff00] mb-5 bg-[#ccff00]/10 px-3 py-1 border border-[#ccff00]/20">
                System Status: Optimized
              </span>
              <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold uppercase tracking-tight leading-[1.05] mb-6">
                Own Your <span className="text-[#ccff00]">Evolution.</span>
              </h1>
              <p className="text-[#a0a0a0] text-lg max-w-lg mb-8 leading-relaxed">
                Precision tracking, adaptive programming, and data-driven nutrition coaching for athletes who take training seriously.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/signup">
                  <Button variant="volt" className="px-8 py-5 font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase font-bold active:scale-95 transition-all">
                    Get Started
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline" className="border-white/20 text-white px-8 py-5 font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase hover:bg-white/5 active:scale-95 transition-all">
                    Sign In
                    <ChevronRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Cards */}
        <section className="py-20 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="bg-[#1a1a1a] border border-[#2a2a2a] border-l-[3px] border-l-[#ccff00] p-7 hover:border-t-[#ccff00]/20 hover:border-r-[#ccff00]/20 hover:border-b-[#ccff00]/20 transition-colors"
                style={{ borderLeftColor: '#ccff00' }}
              >
                <Icon className="w-6 h-6 text-[#ccff00] mb-5" />
                <h3 className="text-lg font-semibold text-white mb-3 tracking-tight">{title}</h3>
                <p className="text-[#a0a0a0] text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data Preview */}
        <section className="py-20 bg-[#0e0e0e]">
          <div className="px-6 md:px-8 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

              {/* Left — readiness + rings */}
              <div className="lg:col-span-5">
                <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight mb-4">
                  Daily Readiness
                </h2>
                <p className="text-[#a0a0a0] text-sm leading-relaxed mb-8">
                  Mathematical recovery scoring derived from your training history and logged sleep. Know exactly how much you have in the tank before you touch a bar.
                </p>
                <div className="flex items-end gap-2 mb-8">
                  <span className="font-['IBM_Plex_Mono'] text-6xl font-bold text-[#ccff00] leading-none">88</span>
                  <span className="font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase text-[#a0a0a0] pb-2">/ 100 Readiness</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <MacroRing pct={80} color="#ccff00" label="Protein" />
                  <MacroRing pct={60} color="#ec6a06" label="Carbs" />
                  <MacroRing pct={40} color="#f87171" label="Fat" />
                </div>
              </div>

              {/* Right — intensity chart */}
              <div className="lg:col-span-7">
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden">
                  <div className="border-b border-[#2a2a2a] px-5 py-3 flex justify-between items-center bg-[#161616]">
                    <span className="font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase text-[#a0a0a0]">
                      Session Intensity
                    </span>
                    <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#ccff00]">THIS WEEK</span>
                  </div>
                  <div className="h-56 px-5 pb-0 pt-5 flex items-end gap-1.5">
                    {CHART_BARS.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 transition-all"
                        style={{
                          height: `${h}%`,
                          backgroundColor: h >= 85 ? '#ec6a06' : h >= 65 ? '#ccff00' : '#2a2a2a',
                        }}
                      />
                    ))}
                  </div>
                  <div className="px-5 py-3 bg-[#161616] flex justify-between">
                    <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#555555]">Mon</span>
                    <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#ccff00]">Peak Load</span>
                    <span className="font-['IBM_Plex_Mono'] text-[11px] text-[#555555]">Sun</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Leaderboard */}
        <section className="py-20 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Trophy className="w-5 h-5 text-[#ccff00]" />
            <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight">Top Performers</h2>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a]">
            <div className="grid grid-cols-12 px-5 py-3 font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase text-[#555555] border-b border-[#2a2a2a]">
              <div className="col-span-1">Rank</div>
              <div className="col-span-7">Athlete</div>
              <div className="col-span-2 text-right">Output</div>
              <div className="col-span-2 text-right">Status</div>
            </div>
            {LEADERBOARD.map(({ rank, initials, name, pts, active }, i) => (
              <div
                key={rank}
                className={`grid grid-cols-12 px-5 py-4 items-center hover:bg-[#202020] transition-colors ${i < LEADERBOARD.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}
              >
                <div className="col-span-1 font-['IBM_Plex_Mono'] text-lg font-semibold text-[#ccff00]">{rank}</div>
                <div className="col-span-7 flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#2a2a2a] border border-[#333] flex items-center justify-center font-['IBM_Plex_Mono'] text-xs text-[#a0a0a0]">
                    {initials}
                  </div>
                  <span className="font-semibold text-white tracking-tight">{name}</span>
                </div>
                <div className="col-span-2 text-right font-['IBM_Plex_Mono'] text-base font-semibold">
                  {pts}<span className="text-xs text-[#555555] ml-1">pts</span>
                </div>
                <div className="col-span-2 text-right">
                  {active ? (
                    <span className="font-['IBM_Plex_Mono'] text-[10px] tracking-widest uppercase text-[#ccff00] bg-[#ccff00]/10 border border-[#ccff00]/30 px-2 py-1">
                      Active
                    </span>
                  ) : (
                    <span className="font-['IBM_Plex_Mono'] text-[10px] tracking-widest uppercase text-[#555555] bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-1">
                      Offline
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 md:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-[#ccff00] p-10 md:p-16 flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_white,_transparent)]" />
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-black uppercase tracking-tight leading-tight mb-5 z-10">
                Start Tracking.<br />Start Adapting.
              </h2>
              <p className="text-black/60 text-base max-w-xl mb-8 z-10">
                Free to use. No gimmicks. Just the math that gets you stronger.
              </p>
              <Link to="/signup" className="z-10">
                <Button className="bg-black hover:bg-black/80 !text-[#ccff00] px-10 py-5 font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase font-bold active:scale-95 transition-all">
                  Create Free Account
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="bg-[#0e0e0e] border-t border-[#2a2a2a] py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 px-6 md:px-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Logo className="w-6 h-6" />
            <span className="font-['IBM_Plex_Mono'] text-[11px] tracking-widest uppercase text-[#ccff00] font-bold">Vektor</span>
          </div>
          <p className="font-['IBM_Plex_Mono'] text-[11px] text-[#555555]">© 2025 Vektor. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/login" className="font-['IBM_Plex_Mono'] text-[11px] text-[#555555] hover:text-[#a0a0a0] transition-colors">
              Sign In
            </Link>
            <Link to="/signup" className="font-['IBM_Plex_Mono'] text-[11px] text-[#555555] hover:text-[#a0a0a0] transition-colors">
              Sign Up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
