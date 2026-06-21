import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, Clock, Timer } from "lucide-react";

export default function WorkoutLoggingHeader({
  workoutTitle,
  showTitleInHeader,
  onCancel,
  onFinish,
  isSaving = false,
  startTime = null,
  restTimer = null,
  restDuration = 90,
  onSkipRest = null,
  onAddRestTime = null,
  // Empty workout → Finish is a dead-end; render it inert until there's
  // something to log so only the Add CTA reads as the live coral action.
  canFinish = true,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const bottomBarRef = useRef(null);

  // Publish the mobile bottom action bar's true footprint (its rendered height
  // PLUS the dock clearance + safe-area it floats above) as --logging-bar-clearance.
  // BLOCKER fix: the bar floats over page content because consumers padded with a
  // hardcoded guess (pb-32) that's shorter than dock-clearance + bar height, so the
  // first set-entry row sits under it. Pages can now pad with this measured token so
  // content always clears the bar regardless of one/two-row state. Re-measures when
  // the bar grows a second row (rest active) so the clearance tracks layout.
  useEffect(() => {
    const root = document.documentElement;
    const el = bottomBarRef.current;
    if (!el) {
      root.style.setProperty("--logging-bar-clearance", "0px");
      return;
    }
    // Distance from the viewport bottom to the bar's TOP edge — this single value
    // is exactly the bottom padding content needs to clear the bar (it already folds
    // in the bar's height plus the dock-clearance + safe-area it floats above).
    const publish = () => {
      const rect = el.getBoundingClientRect();
      // The bar is lg:hidden (display:none on desktop) → a zero-height rect. In
      // that state report 0 clearance, not innerHeight, so desktop pages aren't
      // padded by a phantom bar.
      // +8px buffer so the last set row always ends clearly ABOVE the bar (not
      // flush against its top edge / half-tucked under it) on mobile.
      const clearance = rect.height === 0
        ? 0
        : Math.max(0, Math.ceil(window.innerHeight - rect.top)) + 8;
      root.style.setProperty("--logging-bar-clearance", `${clearance}px`);
    };
    publish();
    // The first paint can measure before layout settles (rect.top stale → too
    // small a clearance). A rAF re-measure after the initial frame corrects an
    // under-measured first value.
    const raf = requestAnimationFrame(publish);
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    // orientationchange fires on rotate before resize settles on some mobile
    // browsers; re-measure so a landscape↔portrait flip doesn't strand a stale
    // clearance that hides the last row.
    window.addEventListener("orientationchange", publish);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", publish);
      window.removeEventListener("orientationchange", publish);
      root.style.setProperty("--logging-bar-clearance", "0px");
    };
    // ResizeObserver catches the one-row → two-row (rest active) height change and
    // resize catches viewport/safe-area shifts, so startTime alone (bar mount) is the
    // only re-run trigger needed.
  }, [startTime]);

  useEffect(() => {
    if (!startTime) return;

    let timeoutId;
    // Phase-aligned tick: a plain 1000ms setInterval drifts off the wall-clock
    // second boundary (the first tick fires ~1000ms after mount, not at the next
    // whole second), so the readout visibly stutters — skipping or doubling a
    // second. Instead we always recompute elapsed from Date.now() and schedule
    // the NEXT tick at the next whole-second boundary, so the displayed second
    // flips exactly when the real clock second does.
    const tick = () => {
      const elapsedMs = Date.now() - startTime;
      setElapsedTime(Math.floor(elapsedMs / 1000));
      // ms remaining until the next whole second of elapsed time.
      const msToNextSecond = 1000 - (elapsedMs % 1000);
      timeoutId = setTimeout(tick, msToNextSecond);
    };
    tick();

    // Background tabs throttle timers, so the readout freezes while hidden;
    // recompute immediately on return so it never shows a stale time, then the
    // tick chain re-aligns itself to the boundary.
    const resync = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timeoutId);
        tick();
      }
    };
    document.addEventListener("visibilitychange", resync);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [startTime]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatRestTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const restActive = restTimer !== null && restTimer >= 0;
  const restUrgent = restActive && restTimer > 0 && restTimer <= 10;
  const restRunning = restActive && restTimer > 0;

  // Depleting rest fraction — teal filled portion shrinks as the timer runs
  // down. Guarded against a zero/short duration so the track never overflows.
  const restFraction = restActive && restDuration > 0
    ? Math.max(0, Math.min(1, restTimer / restDuration))
    : 0;

  // Live rest countdown chip — teal coach hue throughout; urgency is a
  // system-tokened pulse (.rest-urgent), not a hue swap. Reused inline in the
  // mobile bottom bar so the countdown sits next to its own controls.
  const restCountdown = restActive ? (
    <div className={`flex items-center gap-1 font-technical ${restUrgent ? 'rest-urgent' : ''}`}>
      <Timer className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0 text-teal" />
      <span className={`text-teal text-sm md:text-base tabular-nums ${restUrgent ? 'font-black' : 'font-extrabold'}`}>
        {restTimer === 0 ? '0:00' : formatRestTime(restTimer)}
      </span>
    </div>
  ) : null;

  // Depleting rest progress track — the bg-track material (one shared "empty
  // track" token) with a teal filled portion that drains over the rest period.
  // Communicates remaining rest at a glance so the +30s/Skip controls can step
  // down to a thin secondary row without losing the live signal.
  const restProgressTrack = restActive ? (
    <div className="h-1.5 w-full rounded-full bg-track overflow-hidden">
      <div
        className="h-full rounded-full bg-teal transition-[width] duration-500 ease-[cubic-bezier(.2,.7,.3,1)]"
        style={{ width: `${restFraction * 100}%` }}
      />
    </div>
  ) : null;

  // Rest controls (+30s / Skip). Uniform gap-2; full 44px tap height on mobile
  // (no size="sm") so they match the Cancel/Finish rhythm. The mobile bottom
  // bar renders these on their own thin secondary row (the countdown + track
  // live above), so withCountdown only applies to the desktop top bar's inline
  // cluster.
  const restControls = (withCountdown) => restRunning ? (
    <div className="flex gap-2 items-center min-w-0">
      {withCountdown && restCountdown}
      <Button
        variant="ghost"
        onClick={() => onAddRestTime?.(30)}
        className="min-h-[44px] lg:min-h-0 lg:h-9 font-bold"
      >
        +30s
      </Button>
      <Button
        variant="ghost"
        onClick={() => onSkipRest?.()}
        className="min-h-[44px] lg:min-h-0 lg:h-9 font-bold"
      >
        Skip
      </Button>
    </div>
  ) : null;

  // Live elapsed-workout clock cluster — a real datum reused in BOTH mobile
  // bottom-bar states (rest active and no-rest) so the left slot is never dead
  // space and the two layouts stay symmetric.
  // TASTE fix: at session start (zero sets logged, !canFinish) the ticking 0:01
  // next to a coral Finish is premature emphasis — a live clock and a bright CTA
  // competing before anything's been logged. Hold the clock until there's real
  // progress (canFinish), the same threshold that earns Finish its coral, so the
  // bar stays calm on entry and both go live together once the first set lands.
  const elapsedCluster = startTime && canFinish ? (
    <div className="flex items-center gap-1.5 font-technical min-w-0">
      <Clock className="w-3.5 h-3.5 text-ink-muted flex-shrink-0" />
      <span className="font-extrabold text-ink text-sm tabular-nums">{formatTime(elapsedTime)}</span>
    </div>
  ) : null;

  // Cancel / Finish — Finish is the structural anchor (bordered when inert,
  // coral once it's the live next action). Cancel is a recessive text-only
  // escape hatch: no border box, no icon, muted ink, so the abort never reads
  // stronger than Finish. The bad hue is reserved for the in-dialog confirm.
  const actionCluster = (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Button
        // `plain` = chrome-free (no fill, no border box) so Cancel reads as a
        // recessive text-only escape hatch. `ghost`/glassGhost gave it a solid
        // boxed pill that out-emphasized Finish — inverted hierarchy. Cancel must
        // never carry more visual weight than the Finish anchor beside it.
        variant="plain"
        onClick={() => setShowConfirm(true)}
        className="min-h-[44px] lg:min-h-0 lg:h-9 text-sm px-3 text-ink-muted font-medium"
      >
        Cancel
      </Button>
      <Button
        onClick={onFinish}
        disabled={isSaving || !canFinish}
        // Finish earns coral only when it's the live next action. Two cases drop
        // it to neutral glass: (1) an empty workout (Finish is inert — the live
        // Add input owns the only coral); (2) an ACTIVE rest countdown — mid-rest
        // the athlete is resting, not finishing, so a bright coral Finish would
        // be the brightest pixel competing with the live rest timer. It re-earns
        // coral once rest ends.
        variant={canFinish && !restRunning ? "volt" : "dim"}
        className="min-h-[44px] lg:min-h-0 lg:h-9 text-sm px-5 lg:px-4 flex-1 lg:flex-none"
        data-tutorial="finish-workout-btn"
      >
        {isSaving ? (
          <LoadingSpinner size="small" />
        ) : (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            <span>Finish</span>
          </>
        )}
      </Button>
    </div>
  );

  return (
    <>
      {/* ── Top bar: read-only timers (+ actions on desktop only) ────────── */}
      <div className="fixed top-0 left-0 right-0 z-[9998] glass-elevated glass-elevated--substacked border-x-0" style={{ top: 'var(--layout-header-height, 0px)' }}>
        <div className="max-w-4xl mx-auto px-3 md:px-8 py-2">
          {/* Workout Title (when scrolled) - Desktop Only */}
          {showTitleInHeader && (
            <h2 className="hidden md:block font-extrabold tracking-[-0.01em] text-ink text-base mb-2 truncate animate-in fade-in slide-in-from-top-2 duration-200">
              {workoutTitle}
            </h2>
          )}

          {/* Main Row */}
          <div className="flex items-center justify-between gap-2">
            {/* Timers */}
            <div className="flex items-center gap-3 md:gap-4 min-w-0">
              {/* NOTE: the mobile left slot intentionally carries NO session title.
                  The Layout chrome already prints the page/session name directly
                  above this bar, so restating workoutTitle here stacked the same
                  string twice within ~100px (e.g. "Quick Workout" over "Quick
                  Workout"). The session name lives in the chrome above and the
                  scrollable body title; this strip stays quiet (the bottom action
                  bar carries the live clock / rest countdown). */}

              {/* Workout Timer — hidden on mobile (the bottom bar's elapsedCluster
                  carries the live elapsed clock there); desktop keeps it up top
                  next to the rest timer. Mirrors the Rest block's lg-gating so the
                  same datum never renders twice on a phone. */}
              {startTime && (
                <div className="hidden lg:flex flex-col min-w-0">
                  <span className="text-[10px] uppercase text-ink-muted font-bold tracking-[0.08em]">Workout</span>
                  <div className="flex items-center gap-1 font-technical">
                    <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-ink-muted flex-shrink-0" />
                    <span className="font-extrabold text-ink text-sm md:text-base">{formatTime(elapsedTime)}</span>
                  </div>
                </div>
              )}

              {/* Rest Timer — teal throughout; urgency = pulse, not a hue swap.
                  While running it's hidden on mobile (lg:flex) so the countdown
                  renders ONCE in the thumb-zone bottom bar; desktop keeps it
                  here next to the workout clock. */}
              {restActive && (
                <div className={`${restRunning ? 'hidden lg:flex' : 'flex'} flex-col min-w-0 rise-in`}>
                  <span className="text-[10px] uppercase text-ink-muted font-bold tracking-[0.08em]">Rest</span>
                  {restCountdown}
                </div>
              )}
            </div>

            {/* Desktop-only action cluster + rest controls (top zone is fine
                with a mouse; on mobile these live in the bottom bar). */}
            <div className="hidden lg:flex items-center gap-3">
              {restControls(false)}
              {actionCluster}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom action bar (mobile only) — thumb zone, above the dock ─── */}
      <div
        ref={bottomBarRef}
        className="lg:hidden fixed left-0 right-0 z-[9998] glass-elevated border-x-0 border-b-0 rise-in"
        // Sit on the shared --floating-chrome-bottom token (= dock's full
        // painted footprint + safe-area + a 12px breathing gap), so every
        // floated action bar shares ONE clearance value above the dock instead
        // of each hand-adding its own gap. The token already folds in the
        // safe-area inset, so don't re-add env(safe-area-inset-bottom) here or
        // it's double-counted.
        style={{ bottom: 'var(--floating-chrome-bottom)' }}
      >
        <div className="max-w-4xl mx-auto px-3 py-2.5 flex flex-col gap-2">
          {restRunning ? (
            <>
              {/* Rest row: countdown + depleting track + its own +30s / Skip
                  controls live together on one line — the rest timer owns its
                  controls. Cancel / Finish drop to the action row below so the
                  two concerns never crowd into one crammed 5-element line. */}
              <div className="flex items-center gap-2 min-w-0">
                {restCountdown}
                <div className="flex-1 min-w-0">{restProgressTrack}</div>
                {restControls(false)}
              </div>
              {/* Action row mirrors the no-rest layout below: the live elapsed
                  clock owns the left slot (justify-between) so this row isn't
                  ~50% dead space and the two states stay visually symmetric. */}
              <div className="flex items-center justify-between gap-2">
                {elapsedCluster ?? <span />}
                {actionCluster}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              {/* No rest active → carry the live elapsed timer here (a real
                  datum), never a dead static label. */}
              {elapsedCluster}
              {actionCluster}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-bad" />
                Cancel Workout?
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-ink-muted">
              Your progress for this workout will be lost. Are you sure you want to cancel?
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
              >
                Keep Going
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="flex-1"
                onClick={() => {
                  setShowConfirm(false);
                  onCancel();
                }}
              >
                Cancel Workout
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
