import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useProfile } from "@/hooks/useUserQueries";
import { Activity, Dumbbell, BarChart3, UtensilsCrossed, HeartPulse } from "lucide-react";
import { format } from "date-fns";
import CalculatorsModal from "@/components/CalculatorsModal";
import WeighInModal from "@/components/WeighInModal";
import FloatingActionButton from "@/components/ui/FloatingActionButton";
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
    matches: ["/athlete-state", "/recovery", "/physique", "/coach"],
    mobileStrip: true,
    children: [
      { label: "State", url: "/athlete-state",
        active: (l) => l.pathname.startsWith("/athlete-state") },
      { label: "Recovery", url: "/recovery",
        active: (l) => l.pathname.startsWith("/recovery") },
      { label: "Physique", url: "/physique",
        active: (l) => l.pathname.startsWith("/physique") },
      { label: "Coach", url: "/coach",
        active: (l) => l.pathname.startsWith("/coach") },
    ] },
  // Analyze reads as Brief + History only. Career was cut from the IA (no nav
  // surface, App.jsx keeps the bare /career route registered but unlinked); Mind
  // keeps a single entry point (the in-page Mind & Learning card on /insights),
  // so neither is promoted to a nav sub-tab here. /mind still matches so the
  // section stays highlighted when that route is reached. /career is deliberately
  // NOT matched: it was hijacking the Analyze sub-tab strip + dock highlight for
  // a route that is not a genuine Analyze child. As an IA orphan it now resolves
  // to no activeSection (no strip, no dock highlight) until it earns its own home.
  // Analyze is demoted out of the 5-slot dock (dock:false): per the IA audit
  // both Body and Analyze are over-promoted review surfaces, and a 4-slot dock
  // reads cleaner with less per-slot crowding. Analyze still owns its sidebar
  // entry, route matching, and the mobile sub-tab strip — only the dock icon
  // is dropped. Reach it via the sidebar (desktop) or its strip pills (mobile).
  { title: "Analyze", url: "/insights", icon: BarChart3, dock: false,
    matches: ["/insights", "/brief-history", "/mind"],
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

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { profile } = useProfile();
  const [showCalculators, setShowCalculators] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showWeighIn, setShowWeighIn] = useState(false);
  const mobileHeaderRef = useRef(null);
  const stripScrollRef = useRef(null);
  const [stripOverflows, setStripOverflows] = useState(false);

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
    // Count-neutral: the page renders the real (often small) brief count, so a
    // hardcoded "Last 30" would contradict a list that frequently shows 1.
    BriefHistory: "AI-generated daily briefs",
    // Career is an IA orphan with its own in-page header; suppress the default
    // date subtitle so a misleading "today's date" doesn't print under its title.
    Career: null,
    // Fuel renders FoodTracker's own interactive date-nav pill (prev/next day +
    // 'Today' jump). The passive header date subtitle just duplicates it, so
    // suppress it here and let the functional pill own the date affordance.
    Fuel: null,
  };
  const mobileSubtitle = Object.prototype.hasOwnProperty.call(pageSubtitle, currentPageName)
    ? pageSubtitle[currentPageName]
    : format(new Date(), "EEEE, MMMM d");

  // The active top-level section. Its cross-route children populate the mobile
  // sub-tab strip when the section opts in (mobileStrip:true); sections with an
  // in-page <SubTabs> (Train/Fuel) or none (Today) show no pills.
  const activeSection = navigationItems.find((item) => isNavActive(item, location.pathname));
  // Render the sub-tab strip only when there's a genuine active section that opts
  // into the strip AND the current route is a real child of it (one of the
  // children's `active` predicates fires). This stops an IA orphan that merely
  // shares a `matches` prefix — or a section route with no matching child tab —
  // from painting an empty/half-active pill row.
  const hasSubTabs = !!(
    activeSection?.mobileStrip &&
    activeSection.children?.some((c) => c.active(location))
  );

  // The mobile dock carries only the primary sections (dock !== false). Demoted
  // sections (Analyze) stay in the sidebar + mobile sub-tab strip but drop the
  // dock slot, so the dock reads cleaner with fewer, larger thumb targets.
  // BUT the dock must always answer "you are here": when the active section is a
  // demoted one (e.g. /insights → Analyze), it lights no primary slot, leaving
  // the whole dock muted under an "Analyze" title. To restore the signal without
  // re-promoting the section everywhere, append the active demoted section as a
  // transient extra dock slot only while it's the current surface.
  const primaryDockItems = navigationItems.filter((item) => item.dock !== false);
  const activeIsDemoted = activeSection && activeSection.dock === false;
  const dockItems = activeIsDemoted
    ? [...primaryDockItems, activeSection]
    : primaryDockItems;

  // The global FAB floats above the dock on the Today home + Train, suppressed on
  // focused/logging routes and on surfaces with their own coral CTA. Hoist the
  // predicate so the content padding below can reserve clearance for the FAB's
  // floated footprint via --fab-clearance — otherwise the last in-flow card (e.g.
  // Train's Rest Day card) ends under the FAB and the teal '+' bleeds over its
  // corner. The FAB itself (FloatingActionButton.jsx) hugs the viewport's
  // bottom-right gutter (right-3, 48px body, tucked low toward the dock) so its
  // body intrudes minimally on the content column during scroll; --fab-clearance
  // single-sources the bottom reservation so screens don't each pad by hand.
  const showFab = !["/create-workout", "/quick-workout", "/program-builder", "/workout-detail",
    "/profile", "/onboarding", "/login", "/forgot-password", "/reset-password",
    "/fuel", "/food-tracker",
    "/athlete-state", "/recovery", "/physique", "/coach",
    "/insights", "/brief-history", "/mind", "/career"].some((p) => location.pathname.startsWith(p));

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
            <div className="flex items-center justify-between px-0.5">
              <span className="font-technical text-[10.5px] font-semibold text-ink-faint uppercase tracking-[0.08em]">
                {format(new Date(), "EEE MMM d")}
              </span>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Link to="/profile">
                  <UserAvatar
                    url={profile?.avatar_url}
                    name={profile?.display_name || profile?.username}
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
            className="px-[18px] py-2.5 sticky top-0 z-[9998] flex items-center gap-3 lg:hidden"
            style={{
              // max() gives a 0.75rem (12px) minimum so the title clears the
              // status bar even when env(safe-area-inset-top) resolves to 0
              // (non-notch viewports + the audit harness), and adds the real
              // inset on notch devices so 'Quick Workout' is never clipped at
              // its top edge. items-center shares this inset with the avatar
              // pill on the right, so it isn't pressed to the very top edge.
              paddingTop: "max(0.75rem, calc(0.5rem + env(safe-area-inset-top, 0px)))",
              background: "var(--color-bg)",
            }}
          >
            <div className="flex-1 min-w-0">
              <h1 className="type-display text-[22px] truncate">{pageDisplayName}</h1>
              {mobileSubtitle && (
                // text-ink-secondary (72%) not text-muted-2 (50%): the date
                // subtitle read too dim on charcoal; secondary is the AA-safe
                // secondary-contrast tier.
                <div className="text-[12px] font-semibold text-ink-secondary truncate">
                  {mobileSubtitle}
                </div>
              )}
            </div>
            <Link to="/profile" className="shrink-0 flex items-center justify-center h-11 w-11 -mr-1.5" aria-label="Profile">
              <UserAvatar
                url={profile?.avatar_url}
                name={profile?.display_name || profile?.username}
                size="sm"
                className="w-8 h-8 text-xs border border-charcoal-border"
              />
            </Link>
          </header>

          {/* Mobile sub-tab strip — mirrors the desktop sidebar children for the
              active section (Body / Analyze sub-routes only). It renders ONLY when
              the section opts in AND a child tab is active, so it never paints an
              empty band on sections that own their in-page tabs (Train/Fuel) or
              have none (Today). The Calculators / Stream-Note utilities are not
              duplicated here, they live in the global FAB's fan-out menu, so the
              row stays a clean tab strip instead of an orphaned 'Tools' toolbar. */}
          {hasSubTabs && (
            <div
              className="lg:hidden sticky z-[9997] glass-elevated border-x-0 border-t-0 rounded-none"
              style={{ top: "var(--layout-header-height, 0px)" }}
            >
              <div className="relative">
                {/* h-12 band + min-h-[44px] pills so every tab meets the 44px touch
                    minimum. pr-[18px] keeps the last pill off the viewport edge so a
                    trailing tab is never flush-clipped, and lets the scroll-fade sit
                    over padding. */}
                <div ref={stripScrollRef} className="flex items-center gap-1.5 pl-[18px] pr-[18px] h-12 overflow-x-auto no-scrollbar">
                  {activeSection.children.map((c) => {
                    const on = c.active(location);
                    return (
                      <Link
                        key={c.label}
                        to={c.url}
                        // Active sub-tab is a NEUTRAL selected pill, not coral.
                        // Coral is the single primary-action color and the dock's
                        // sole 'you are here'; a coral sub-tab fill would both
                        // out-shout real CTAs and paint a second coral active
                        // state for the same section. Neutral glass-edge fill +
                        // full-ink label reads as selected without borrowing coral.
                        className={`shrink-0 px-3 min-h-[44px] inline-flex items-center rounded-full text-[11px] font-bold uppercase tracking-[0.06em] whitespace-nowrap transition-colors duration-150 ${
                          on
                            ? "text-ink bg-[var(--glass-edge)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                            // Inactive: text-ink-secondary (0.72) not text-ink-muted
                            // (0.50). Muted fell below AA 4.5:1 on the glass-elevated
                            // track for labels like 'DAILY BRIEF'; secondary clears
                            // it while still reading dimmer than the active pill.
                            : "text-ink-secondary hover:text-ink"
                        }`}
                      >
                        {c.label}
                      </Link>
                    );
                  })}
                </div>
                {/* Right-edge scroll-fade — only when the row truly overflows, so
                    it never paints a false "scrollable" hint. Non-interactive so
                    taps pass through. */}
                {stripOverflows && (
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 w-8"
                    style={{ background: "linear-gradient(to right, transparent, var(--color-bg))" }}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          )}

          {/* Main content. Bottom padding is the shared --dock-clearance token
              (+ a small gap + safe-area) rather than a magic 7rem, so the dock
              offset is single-sourced with the sticky save-bar / footer
              consumers (Profile save bar, ProgramBuilder footer). */}
          <main className="flex-1 flex flex-col min-h-0">
            {/* Dock/FAB bottom clearance lives on the CONTENT div, not <main>.
                <main> is flex-1 + min-h-0, so on a short page it collapses to the
                remaining viewport height and any paddingBottom set on it gets
                clipped; on a tall scrolling page (Recovery/AthleteState) the
                content overflows past main's box and main's padding never reaches
                below the last card, so the HRV sparkline / BODY ANALYTICS card
                slid under the floating dock. Pinning the clearance to the actual
                content wrapper makes the reserved space travel WITH the content
                so the last in-flow element always clears the dock (lg: no dock,
                so drop it). When the floated FAB is present, reserve its full
                footprint (--fab-clearance) instead of the dock-only clearance. */}
            <div
              className="flex-1 min-h-0 content-bottom-clearance"
              style={{ "--content-pb": showFab
                ? "var(--fab-clearance)"
                : "calc(var(--dock-clearance) + 32px + env(safe-area-inset-bottom))" }}
            >
              {children}
            </div>
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

      {/* Floating action button — quick global add (workout/food/weigh-in/note).
          Shown on the Today home; suppressed on focused form/logging routes and on
          Fuel/FoodTracker, which carry their own coral add FAB, so two coral FABs
          never share a screen. Also suppressed on the read-only review surfaces
          (Body / Analyze / Career), where a global '+' has no clear add intent,
          collides with data tiles and brief cards, and on Career/Physique would be
          a second coral action competing with the screen's own coral CTA. */}
      {showFab && (
        <FloatingActionButton
          onWeighIn={() => setShowWeighIn(true)}
          onCalculators={() => setShowCalculators(true)}
          onStreamNote={() => setShowNoteModal(true)}
        />
      )}
      <WeighInModal open={showWeighIn} onOpenChange={setShowWeighIn} />
      <CalculatorsModal
        isOpen={showCalculators}
        onClose={() => setShowCalculators(false)}
        weightUnit={profile?.weight_unit || "lbs"}
      />
      {/* sheetMinHeight="" opts this content-sparse capture sheet out of the
          default min-h-[40dvh] floor, otherwise the floor left a dead gap above
          the textarea. QuickCapture (embedded) already carries its own mt-auto so
          the Capture action self-anchors to the sheet bottom (thumb zone); the old
          mt-auto pt-2 wrapper was redundant. focusHue="violet" gives the capture
          field the Second-Brain (sleep/mind) identity hue on focus. */}
      <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
        <DialogContent className="max-w-md flex flex-col" sheetMinHeight="">
          <DialogHeader>
            <DialogTitle>Stream to Second Brain</DialogTitle>
            <DialogDescription>
              A quick thought, dropped straight into your inbox.
            </DialogDescription>
          </DialogHeader>
          <QuickCapture
            embedded
            domain="general"
            placeholder="What's on your mind?"
            focusHue="violet"
            onCapture={() => setShowNoteModal(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
