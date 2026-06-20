import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X, CheckCircle2, AlertTriangle, Clock, Timer } from "lucide-react";

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
  const elapsedCluster = startTime ? (
    <div className="flex items-center gap-1.5 font-technical min-w-0">
      <Clock className="w-3.5 h-3.5 text-ink-muted flex-shrink-0" />
      <span className="font-extrabold text-ink text-sm tabular-nums">{formatTime(elapsedTime)}</span>
    </div>
  ) : null;

  // Cancel / Finish — Finish is the sole coral; Cancel is a neutral dim
  // affordance. The bad hue is reserved for the in-dialog confirm.
  const actionCluster = (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Button
        variant="dim"
        onClick={() => setShowConfirm(true)}
        className="min-h-[44px] lg:min-h-0 lg:h-9 text-sm px-4 lg:px-3"
      >
        <X className="w-3.5 h-3.5 mr-1.5" />
        <span>Cancel</span>
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
      <div className="fixed top-0 left-0 right-0 z-[9998] glass-elevated border-x-0 border-t-0" style={{ top: 'var(--layout-header-height, 0px)' }}>
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
              {/* Workout Timer */}
              {startTime && (
                <div className="flex flex-col min-w-0">
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
        className="lg:hidden fixed left-0 right-0 z-[9998] glass-elevated border-x-0 border-b-0 rise-in"
        style={{ bottom: 'calc(var(--dock-clearance, 80px) + env(safe-area-inset-bottom))' }}
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
