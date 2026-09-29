import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, Timer, Calculator, MoreVertical, X } from "lucide-react";
import CalculatorsModal from "@/components/CalculatorsModal";

export default function WorkoutLoggingHeader({
  workoutTitle,
  // The focused exercise's name (Ledger rebuild, Step 5) — rendered at 24px
  // in the sticky header row alongside the meta line and Finish, mirroring
  // the mockup's .hdr. null/undefined (no exercises yet, or not logging)
  // just omits the name line.
  focusedExerciseName = null,
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
  weightUnit = "lbs",
  // A save to workout_sessions that did not land, and the retry for it. Until
  // now the only trace of a dropped write was a console.error, which on a phone
  // in a gym is no trace at all.
  saveFailed = false,
  onRetrySave = null,
  // Ledger compact meta line ("UPPER A · 38:12 · 7/18 SETS") — done/total set
  // counts, existing state only (WorkoutDetail already computes both).
  doneSets = 0,
  totalSets = 0,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCalculators, setShowCalculators] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const bottomBarRef = useRef(null);
  const topBarRef = useRef(null);
  const menuRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(false);

  // Computed early (before the clearance effects below, which now depend on
  // restRunning) so there's no temporal-dead-zone reference.
  const restActive = restTimer !== null && restTimer >= 0;
  const restUrgent = restActive && restTimer > 0 && restTimer <= 10;
  const restRunning = restActive && restTimer > 0;

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
    // The bottom bar is now ONLY the rest bar (Ledger rebuild) and unmounts
    // entirely — ref goes null — the instant rest ends, instead of collapsing
    // to a zero-height row within an always-mounted div. restRunning has to be
    // a dependency so this effect re-binds (or tears down) the observer on
    // that mount/unmount, not just on session start.
  }, [startTime, restRunning]);

  // Same measured-clearance pattern for the TOP bar. It's usually zero-height
  // on mobile (hasMobileTopContent false most of the session — see below), so
  // a page that reserves fixed padding for it (a guess like pt-16) leaves dead
  // space above the logger for most of the session, then risks true overlap
  // in the rare states where the bar does have content (post-rest "Rest 0:00",
  // a dropped save). Publish the real rendered height as --logging-top-clearance
  // so pages can pad exactly enough, in every state, instead of guessing.
  useEffect(() => {
    const root = document.documentElement;
    const el = topBarRef.current;
    if (!el) {
      root.style.setProperty("--logging-top-clearance", "0px");
      return;
    }
    const publish = () => {
      const rect = el.getBoundingClientRect();
      root.style.setProperty("--logging-top-clearance", `${Math.max(0, Math.ceil(rect.height))}px`);
    };
    publish();
    const raf = requestAnimationFrame(publish);
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", publish);
      root.style.setProperty("--logging-top-clearance", "0px");
    };
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

  // Close the kebab on an outside click/tap (no portal here — the header is
  // fixed near the top of the viewport with nothing to clip it, so a plain
  // absolutely-positioned panel is enough, unlike ExerciseCard's kebab which
  // needs a portal to escape a scrolling card).
  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenu]);

  // Depleting rest fraction — the filled portion shrinks as the timer runs
  // down. Guarded against a zero/short duration so the track never overflows.
  const restFraction = restActive && restDuration > 0
    ? Math.max(0, Math.min(1, restTimer / restDuration))
    : 0;

  // Live rest countdown chip, neutral ink, NOT teal. Teal (the single action
  // color) belongs to the armed +30s/Skip controls beside it; a teal countdown
  // made the read-only readout the brightest pixel in the row, out-shouting its
  // own controls. The number reads as primary ink, the Timer glyph as muted ink,
  // and urgency stays a system-tokened pulse (.rest-urgent), never a hue swap.
  const restCountdown = restActive ? (
    <div className={`flex items-center gap-1 font-technical ${restUrgent ? 'rest-urgent' : ''}`}>
      <Timer className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0 text-ink-muted" />
      <span className={`text-ink text-sm md:text-base tabular-nums ${restUrgent ? 'font-black' : 'font-extrabold'}`}>
        {restTimer === 0 ? '0:00' : formatRestTime(restTimer)}
      </span>
    </div>
  ) : null;

  // rtb-3: depleting rest progress track (mockup .restbar/.trk). Coordinator
  // review (r4d/step3): the teal fill was off-palette — the mockup's track
  // uses the off-white action fill (var(--color-brand), Tailwind `bg-brand`)
  // on a rule-colored track (bg-track, unchanged), same as every other
  // primary-fill element in the system. rtb-5: width transition still rides
  // the single system easing.
  const restProgressTrack = restActive ? (
    <div className="h-1 w-full rounded-full bg-track overflow-hidden">
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-500 [transition-timing-function:var(--ease)]"
        style={{ width: `${restFraction * 100}%` }}
      />
    </div>
  ) : null;

  // Plate/1RM calculators — mid-workout is exactly when they're needed (next
  // set's plate math during rest), and the global FAB that normally carries
  // them is suppressed on logging routes. Now a kebab item (was a standing
  // icon button) alongside Cancel — see actionMenu below.
  const calcButton = (
    <button
      type="button"
      onClick={() => { setShowCalculators(true); setOpenMenu(false); }}
      className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-ink-secondary hover:bg-[var(--glass-edge)] flex items-center gap-2"
    >
      <Calculator className="w-4 h-4" />
      Calculators
    </button>
  );

  // Header kebab — Cancel workout + Calculators (Ledger rebuild, Step 5):
  // both used to be standing controls in the bar; the mockup's header carries
  // only the meta line, name, and Finish, so anything else lives behind the
  // kebab instead.
  const actionMenu = (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpenMenu((v) => !v)}
        aria-label="More workout actions"
        className="min-h-[44px] min-w-[44px] lg:min-h-0 lg:h-9 lg:w-9"
      >
        <MoreVertical className="w-4 h-4" />
      </Button>
      {openMenu && (
        <div className="absolute right-0 top-full mt-1 glass-elevated rounded-xl overflow-hidden py-1 z-[10200] min-w-[170px] text-ink">
          {calcButton}
          <button
            type="button"
            onClick={() => { setShowConfirm(true); setOpenMenu(false); }}
            className="w-full px-3 py-2 min-h-[44px] text-left text-sm font-semibold text-bad hover:bg-bad/10 flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancel workout
          </button>
        </div>
      )}
    </div>
  );

  // Finish — the structural anchor. Off-white primary fill whenever it's the
  // live next action (canFinish), full stop: the earlier "grey out mid-rest"
  // treatment made Finish read as unavailable during rest even though it's
  // fully clickable, which the coordinator flagged as wrong (r4d/step3
  // review) — restRunning no longer touches its variant, only `disabled`
  // (isSaving/!canFinish) governs whether it's actually clickable. Exactly
  // one Finish element exists now (no responsive duplicate to CSS-hide),
  // since the header is a single row at every breakpoint.
  const finishButton = (
    <Button
      onClick={onFinish}
      disabled={isSaving || !canFinish}
      variant={canFinish ? "volt" : "dim"}
      className="min-h-[40px] lg:h-9 text-sm px-4 flex-shrink-0"
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
  );

  // Deliberately not a toast and not a dialog. A toast is gone before he racks
  // the bar, and a dialog in the middle of a set is worse than the problem. It
  // sits in the header for as long as the condition is true, says the reassuring
  // half first (the sets are on the device, nothing is lost), and doubles as the
  // retry button so the fix is one thumb-tap away.
  const saveWarning = saveFailed ? (
    <button
      type="button"
      onClick={() => onRetrySave?.()}
      className="flex items-center gap-1.5 rounded-lg bg-warn/[0.15] px-2 py-1 text-left rise-in mt-1"
      aria-label="Sets are saved on this device but not synced. Tap to retry."
    >
      <AlertTriangle className="w-3.5 h-3.5 text-warn flex-shrink-0" />
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-[11px] font-bold text-warn">Not synced</span>
        <span className="text-[10px] text-ink-muted truncate">Saved on this device. Tap to retry</span>
      </span>
    </button>
  ) : null;

  return (
    <>
      {/* ── Header: meta line + focused exercise name (24px) + Finish ──────
          Mockup .hdr — one row, every breakpoint, always reachable (fixed).
          Cancel/Calculators live in the kebab; the rest timer/controls live
          ONLY in the bottom rest bar below (never duplicated up here). */}
      <div
        ref={topBarRef}
        className="fixed top-0 left-0 right-0 z-[9998] border-x-0 glass-elevated glass-elevated--substacked"
        style={{ top: 'var(--layout-header-height, 0px)' }}
      >
        <div className="max-w-4xl mx-auto px-3 md:px-8 lg:pl-[248px] py-2">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 min-w-0 font-technical">
                <span className="text-[12px] font-bold uppercase tracking-[0.02em] text-ink-secondary truncate">
                  {workoutTitle}
                </span>
                {canFinish && (
                  <>
                    <span className="text-ink-faint text-[12px]">·</span>
                    <span className="text-ink text-[12px] font-extrabold tabular-nums whitespace-nowrap">
                      {formatTime(elapsedTime)}
                    </span>
                    <span className="text-ink-faint text-[12px]">·</span>
                    <span className="text-ink text-[12px] font-extrabold tabular-nums whitespace-nowrap">
                      {doneSets}/{totalSets} SETS
                    </span>
                  </>
                )}
              </div>
              {focusedExerciseName && (
                <h1 className="text-[19px] md:text-[24px] font-extrabold text-ink truncate mt-0.5 leading-tight">
                  {focusedExerciseName}
                </h1>
              )}
              {saveWarning}
            </div>
            {actionMenu}
            {finishButton}
          </div>
        </div>
      </div>

      {/* ── Rest bar (mobile + desktop) — the ONLY thing in the bottom bar
          now, and only while a rest timer is actually running. One row:
          timer icon · countdown · track · +30s · Skip, above the tab dock. */}
      {restRunning && (
        <div
          ref={bottomBarRef}
          className="fixed left-0 right-0 z-[9998] glass-elevated border-x-0 border-b-0 rise-in"
          style={{ bottom: 'var(--floating-chrome-bottom)' }}
        >
          <div className="max-w-4xl mx-auto px-3 py-2 lg:pl-[248px] flex items-center gap-3">
            {restCountdown}
            <div className="flex-1 min-w-0">{restProgressTrack}</div>
            <Button
              variant="ghost"
              onClick={() => onAddRestTime?.(30)}
              className="min-h-[44px] min-w-[56px] lg:min-h-0 lg:h-9 font-bold flex-shrink-0"
            >
              +30s
            </Button>
            <Button
              variant="volt"
              onClick={() => onSkipRest?.()}
              className="min-h-[44px] min-w-[56px] lg:min-h-0 lg:h-9 font-bold flex-shrink-0"
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      <CalculatorsModal
        isOpen={showCalculators}
        onClose={() => setShowCalculators(false)}
        weightUnit={weightUnit}
      />

      {showConfirm && (
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-ink-muted" />
                Cancel Workout?
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-ink-muted">
              Your progress for this workout will be lost. Are you sure you want to cancel?
            </p>
            {/* rtb-7: rendered via the shared Dialog primitive, which is already a
                bottom sheet flush to the safe-area on mobile (centered only at md+).
                gap-4 keeps >=16px between Keep Going (neutral outline) and the
                destructive Cancel Workout so the abort never sits a stray thumb from
                Keep Going. */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4 mt-2">
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
