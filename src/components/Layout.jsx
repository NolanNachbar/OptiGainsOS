import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useUserQueries";
import { Activity, Dumbbell, BarChart3, UtensilsCrossed, HeartPulse, Calculator, Brain } from "lucide-react";
import { format } from "date-fns";
import CalculatorsModal from "@/components/CalculatorsModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import QuickCapture from "@/components/QuickCapture";

// Decision-first IA: Today (the home) → Train → Fuel → Body → Analyze.
// Each top-level section owns a set of sub-routes; `matches` drives active state.
// `children` are the section's sub-tabs, surfaced in the desktop sidebar as an
// indented column under the active section (deep-linked via path or ?tab=).
//
// `mobileStrip` opts a section into the Layout-level mobile sub-tab strip (a
// horizontal pill row under the mobile header that mirrors the desktop sidebar
// children). Only set it on sections whose children are *separate routes* with
// no in-page tab strip of their own (Body, Analyze). Train and Fuel render
// their own in-page <SubTabs>, so a Layout strip there would duplicate.
const qp = (loc, key, dflt = "") => new URLSearchParams(loc.search).get(key) || dflt;

const navigationItems = [
  { title: "Today", url: "/today", icon: Activity,
    matches: ["/today"] },
  { title: "Train", url: "/train", icon: Dumbbell,
    matches: ["/train", "/workouts", "/program-builder", "/create-workout",
              "/quick-workout", "/weekly-schedule", "/schedule", "/workout-detail", "/program/"],
    children: [
      { label: "Schedule", url: "/train?tab=schedule",
        active: (l) => l.pathname.startsWith("/train") && qp(l, "tab", "schedule") === "schedule" },
      { label: "Library", url: "/train?tab=library",
        active: (l) => l.pathname.startsWith("/train") && qp(l, "tab") === "library" },
      { label: "Programs", url: "/train?tab=programs",
        active: (l) => l.pathname.startsWith("/train") && qp(l, "tab") === "programs" },
      { label: "Activity", url: "/train?tab=activity-log",
        active: (l) => l.pathname.startsWith("/train") && qp(l, "tab") === "activity-log" },
    ] },
  { title: "Fuel", url: "/fuel", icon: UtensilsCrossed,
    matches: ["/fuel", "/food-tracker", "/supplements", "/log"],
    // Mirror Fuel's in-page SubTabs exactly: Nutrition / Body / Hydration.
    // (The page reads ?tab=body and ?tab=hydration; the old "wellness" alias
    // silently resolved to Body and there was no Hydration entry at all.)
    children: [
      { label: "Nutrition", url: "/fuel",
        active: (l) => l.pathname.startsWith("/fuel") && !["body", "hydration"].includes(qp(l, "tab")) },
      { label: "Body", url: "/fuel?tab=body",
        active: (l) => l.pathname.startsWith("/fuel") && qp(l, "tab") === "body" },
      { label: "Hydration", url: "/fuel?tab=hydration",
        active: (l) => l.pathname.startsWith("/fuel") && qp(l, "tab") === "hydration" },
    ] },
  { title: "Body", url: "/athlete-state", icon: HeartPulse,
    matches: ["/athlete-state", "/recovery", "/physique"],
    mobileStrip: true,
    children: [
      { label: "State", url: "/athlete-state",
        active: (l) => l.pathname.startsWith("/athlete-state") },
      { label: "Recovery", url: "/recovery",
        active: (l) => l.pathname.startsWith("/recovery") },
      { label: "Physique", url: "/physique",
        active: (l) => l.pathname.startsWith("/physique") },
    ] },
  // Analyze reads as Brief + History only. Career was cut from the IA; Mind
  // keeps a single entry point (the in-page Mind & Learning card on /insights),
  // so neither is promoted to a nav sub-tab here. /mind and /career still match
  // so the section stays highlighted when those routes are reached.
  // Analyze is demoted out of the 5-slot dock (dock:false): per the IA audit
  // both Body and Analyze are over-promoted review surfaces, and a 4-slot dock
  // reads cleaner with less per-slot crowding. Analyze still owns its sidebar
  // entry, route matching, and the mobile sub-tab strip — only the dock icon
  // is dropped. Reach it via the sidebar (desktop) or its strip pills (mobile).
  { title: "Analyze", url: "/insights", icon: BarChart3, dock: false,
    matches: ["/insights", "/brief-history", "/mind", "/career"],
    mobileStrip: true,
    children: [
      { label: "Daily Brief", url: "/insights",
        active: (l) => l.pathname.startsWith("/insights") },
      { label: "Brief History", url: "/brief-history",
        active: (l) => l.pathname.startsWith("/brief-history") },
    ] },
];

function isNavActive(item, pathname) {
  return (item.matches || [item.url]).some(
    (p) => pathname === p || pathname.startsWith(p)
  );
}

function Wordmark({ size = 17 }) {
  return (
    <span className="type-display select-none whitespace-nowrap" style={{ fontSize: size }}>
      OPTI<span style={{ color: "var(--hue-teal)" }}>GAINS</span>
    </span>
  );
}

// Days remaining to the PST deadline (Aug 31). Rolls to next year once passed.
function daysToPST() {
  const now = new Date();
  let target = new Date(now.getFullYear(), 7, 31);
  if (target < now) target = new Date(now.getFullYear() + 1, 7, 31);
  return Math.max(0, Math.ceil((target - now) / 86400000));
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { profile } = useProfile();
  const [showCalculators, setShowCalculators] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const mobileHeaderRef = useRef(null);
  const stripScrollRef = useRef(null);
  const [stripOverflows, setStripOverflows] = useState(false);
  const pstDays = useMemo(() => daysToPST(), []);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const mobileHeader = mobileHeaderRef.current;
      let height = 0;
      if (mobileHeader && getComputedStyle(mobileHeader).display !== "none") {
        height = mobileHeader.getBoundingClientRect().height;
      }
      document.documentElement.style.setProperty("--layout-header-height", `${height}px`);
    };

    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);
    return () => window.removeEventListener("resize", updateHeaderHeight);
  }, []);

  // Gate the right-edge scroll-fade behind a real overflow check so it never
  // renders a false "scrollable" affordance when the strip's pills already fit
  // (e.g. on /today, which has no sub-tab pills — only the two utilities).
  useEffect(() => {
    const el = stripScrollRef.current;
    if (!el) {
      setStripOverflows(false);
      return;
    }
    const measure = () => setStripOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [location.pathname, location.search]);

  const pageDisplayName = {
    Today: "Today",
    Fuel: "Fuel",
    Train: "Train",
    Insights: "Analyze",
    Physique: "Physique",
    Workouts: "Train",
    FoodTracker: "Fuel",
    Schedule: "Schedule",
    WeeklySchedule: "Schedule",
    Mind: "Mind",
    Career: "Career",
    Profile: "Profile",
    WorkoutDetail: "Workout",
    QuickWorkout: "Quick Workout",
    CreateWorkout: "Create Workout",
    ProgramDetail: "Program",
    ProgramBuilder: "Program Builder",
    AthleteState: "Body",
    Recovery: "Recovery",
    BriefHistory: "Brief History",
  }[currentPageName] || currentPageName || "Home";

  // Per-page contextual subtitle for the mobile header. Defaults to today's
  // date; a page can override (or `null` to suppress) when the date is
  // misleading — e.g. a history list isn't "today".
  const pageSubtitle = {
    BriefHistory: "Last 30 AI-generated daily briefs",
  };
  const mobileSubtitle = Object.prototype.hasOwnProperty.call(pageSubtitle, currentPageName)
    ? pageSubtitle[currentPageName]
    : format(new Date(), "EEEE, MMMM d");

  // The active top-level section. Its cross-route children populate the mobile
  // sub-tab strip when the section opts in (mobileStrip:true); sections with an
  // in-page <SubTabs> (Train/Fuel) or none (Today) show no pills.
  const activeSection = navigationItems.find((item) => isNavActive(item, location.pathname));
  const hasSubTabs = activeSection?.mobileStrip && activeSection.children?.length;

  // The mobile dock carries only the primary sections (dock !== false). Demoted
  // sections (Analyze) stay in the sidebar + mobile sub-tab strip but drop the
  // dock slot, so the dock reads cleaner with fewer, larger thumb targets.
  const dockItems = navigationItems.filter((item) => item.dock !== false);

  // Layout-owned utilities (calculators / stream-note). These used to live only
  // inside the dead FAB; they now sit in the mobile strip so they have a
  // persistent, reachable home. Weigh-In was dropped here — it is already a
  // thumb-zone Quick Action on /today, so a second global entry was redundant.
  const utilities = [
    { label: "Calc", icon: Calculator, onClick: () => setShowCalculators(true) },
    { label: "Note", icon: Brain, onClick: () => setShowNoteModal(true) },
  ];

  return (
    <>
      <div className="min-h-screen flex w-full">
        {/* Desktop — floating glass sidebar (the dk-side) */}
        <aside
          className="hidden lg:flex flex-col w-[216px] shrink-0 sticky top-4 ml-4 my-4 rounded-3xl surface px-3.5 pt-[22px] pb-4"
          style={{ height: "calc(100vh - 2rem)" }}
        >
          <Link to="/today" className="flex items-center gap-2.5 px-2.5 pb-[18px]">
            <Logo className="w-7 h-7" />
            <Wordmark />
          </Link>

          <nav className="flex flex-col gap-[3px]">
            {navigationItems.map((item) => {
              const isActive = isNavActive(item, location.pathname);
              return (
                <div key={item.title}>
                  <Link
                    to={item.url}
                    className={`flex items-center gap-[11px] px-3 py-2.5 rounded-lg text-[13.5px] font-bold transition-colors duration-150 ${
                      isActive
                        ? "text-[var(--brand-tint)] bg-brand/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                        : "text-ink-faint hover:text-ink"
                    }`}
                  >
                    <item.icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.7} />
                    {item.title}
                  </Link>
                  {/* Sub-tabs of the active section, indented off the parent */}
                  {isActive && item.children && (
                    <div className="ml-[27px] pl-3 my-1 border-l border-white/[0.08] flex flex-col gap-px">
                      {item.children.map((c) => {
                        const on = c.active(location);
                        return (
                          <Link
                            key={c.label}
                            to={c.url}
                            className={`px-2 py-[5px] rounded-md text-[12px] font-bold transition-colors duration-150 ${
                              on
                                ? "text-ink bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                                : "text-ink-faint hover:text-ink-muted"
                            }`}
                          >
                            {c.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="mt-auto px-2.5">
            <span className="chip-gold block text-center !rounded-md !py-2 font-extrabold">
              {pstDays} days to PST
            </span>
            <div className="flex items-center justify-between mt-3.5 px-0.5">
              <span className="font-technical text-[10.5px] font-semibold text-ink-faint uppercase tracking-[0.08em]">
                {format(new Date(), "EEE MMM d")}
              </span>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Link to="/profile">
                  <UserAvatar
                    url={profile?.avatar_url}
                    username={profile?.username}
                    size="sm"
                    className="w-7 h-7 text-xs border border-charcoal-border"
                  />
                </Link>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          {/* Mobile top header — title voice + the gold deadline chip. Pad the
              top by the safe-area inset so it sits below the status bar. */}
          <header
            ref={mobileHeaderRef}
            data-mobile-header
            className="px-[18px] py-2.5 sticky top-0 z-[9998] flex items-center gap-3 lg:hidden backdrop-blur-xl"
            style={{
              paddingTop: "calc(0.625rem + env(safe-area-inset-top))",
              background: "color-mix(in srgb, var(--color-bg) 82%, transparent)",
            }}
          >
            <div className="flex-1 min-w-0">
              <h1 className="type-display text-[22px] truncate">{pageDisplayName}</h1>
              {mobileSubtitle && (
                <div className="text-[12px] font-semibold text-muted-2 truncate">
                  {mobileSubtitle}
                </div>
              )}
            </div>
            <span className="chip-gold">{pstDays} days · PST</span>
            <Link to="/profile" className="shrink-0 flex items-center justify-center h-11 w-11 -mr-1.5" aria-label="Profile">
              <UserAvatar
                url={profile?.avatar_url}
                username={profile?.username}
                size="sm"
                className="w-8 h-8 text-xs border border-charcoal-border"
              />
            </Link>
          </header>

          {/* Mobile utility / sub-tab strip — mirrors the desktop sidebar
              children for the active section (Body/Analyze sub-routes) AND
              carries the Calculators / Stream-Note utilities (formerly orphaned
              in the dead FAB) so they're reachable from every section. Both the
              sub-tab pills and the utilities use the same labeled-pill recipe so
              the utilities read as named actions, not mystery glyphs. On routes
              with no sub-tabs the utilities right-align (ml-auto) to keep the
              compact h-11 band from reading as a half-empty toolbar. A trailing
              fade is shown only when the row actually overflows. */}
          <div
            className="lg:hidden sticky z-[9997] glass-elevated border-x-0 border-t-0 rounded-none"
            style={{ top: "var(--layout-header-height, 0px)" }}
          >
            <div className="relative">
              <div ref={stripScrollRef} className="flex items-center gap-1.5 px-[18px] h-11 overflow-x-auto no-scrollbar">
                {hasSubTabs && activeSection.children.map((c) => {
                  const on = c.active(location);
                  return (
                    <Link
                      key={c.label}
                      to={c.url}
                      className={`shrink-0 px-3 h-9 inline-flex items-center rounded-full text-[11px] font-bold uppercase tracking-[0.06em] whitespace-nowrap transition-colors duration-150 ${
                        on
                          ? "text-[var(--brand-tint)] bg-brand/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                          : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      {c.label}
                    </Link>
                  );
                })}
                {hasSubTabs && (
                  <span className="shrink-0 w-px h-5 mx-1 bg-track" aria-hidden="true" />
                )}
                {utilities.map((u, i) => (
                  <button
                    key={u.label}
                    type="button"
                    onClick={u.onClick}
                    className={`shrink-0 px-3 h-9 inline-flex items-center gap-1.5 rounded-full pill-value !shadow-none text-[11px] font-bold uppercase tracking-[0.06em] text-ink-muted hover:text-ink active:scale-95 transition-[color,transform] duration-150 [transition-timing-function:var(--ease)] ${
                      !hasSubTabs && i === 0 ? "ml-auto" : ""
                    }`}
                  >
                    <u.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                    {u.label}
                  </button>
                ))}
              </div>
              {/* Right-edge scroll-fade — only when the row truly overflows, so
                  it never paints a false "scrollable" hint (e.g. on /today).
                  Non-interactive so taps pass through. */}
              {stripOverflows && (
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-8"
                  style={{ background: "linear-gradient(to right, transparent, var(--color-bg))" }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          {/* Main content. Bottom padding is the shared --dock-clearance token
              (+ a small gap + safe-area) rather than a magic 7rem, so the dock
              offset is single-sourced with the sticky save-bar / footer
              consumers (Profile save bar, ProgramBuilder footer). */}
          <main
            className="flex-1 flex flex-col min-h-0 lg:pb-0"
            style={{ paddingBottom: "calc(var(--dock-clearance) + 32px + env(safe-area-inset-bottom))" }}
          >
            <div className="flex-1 min-h-0">{children}</div>
          </main>
        </div>
      </div>

      {/* Mobile — the floating liquid-glass dock (4 primary sections; Analyze
          is demoted to the sidebar/strip, so the grid auto-sizes to the dock
          items rather than a hard-coded 5 columns). */}
      <nav
        className="glass-elevated z-[9999] lg:hidden rounded-full grid px-[9px] py-2"
        style={{
          position: "fixed",
          left: 18,
          right: 18,
          bottom: "calc(12px + env(safe-area-inset-bottom))",
          transform: "translateZ(0)",
          gridTemplateColumns: `repeat(${dockItems.length}, minmax(0, 1fr))`,
        }}
      >
        {dockItems.map((item) => {
          const isActive = isNavActive(item, location.pathname);
          return (
            <Link
              key={item.title}
              to={item.url}
              className={`flex flex-col items-center gap-[2px] py-1 rounded-full min-w-0 transition-colors duration-150 ${
                isActive
                  ? "text-[var(--brand-tint)] bg-brand/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              <item.icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.7} />
              <span className="text-[9.5px] font-bold">{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* The floating action button was removed: it rendered on zero real landing
          routes (pure dead weight) and a free-floating coral action competed with
          every page's native add action, breaking the "coral is THE single action
          color" rule. Its surviving entry points — Calculators and Stream-Note —
          now live as labeled pills in the mobile utility strip above. (Weigh-In
          was dropped: it is already a thumb-zone Quick Action on /today.) */}
      <CalculatorsModal
        isOpen={showCalculators}
        onClose={() => setShowCalculators(false)}
        weightUnit={profile?.weight_unit || "lbs"}
      />
      <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
        <DialogContent className="max-w-md flex flex-col">
          <DialogHeader>
            <DialogTitle>Stream to Second Brain</DialogTitle>
            <DialogDescription>
              A quick thought, dropped straight into your inbox.
            </DialogDescription>
          </DialogHeader>
          {/* Anchor the capture surface to the sheet bottom so the Capture action
              lands in the thumb zone on mobile bottom sheets. */}
          <div className="mt-auto pt-2">
            <QuickCapture
              embedded
              domain="general"
              placeholder="What's on your mind?"
              onCapture={() => setShowNoteModal(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
