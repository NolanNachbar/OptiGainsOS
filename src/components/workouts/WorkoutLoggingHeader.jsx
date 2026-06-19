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
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
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

  // Rest controls (+30s / Skip) — shared between the desktop top bar and the
  // mobile bottom action bar so the markup stays single-sourced.
  const restControls = restActive && restTimer > 0 ? (
    <div className="flex gap-2 items-center">
      <Button
        variant="ghost"
        onClick={() => onAddRestTime?.(30)}
        className="min-h-[44px] lg:min-h-0 lg:h-9 px-4 text-[12.5px] font-bold font-technical"
      >
        +30s
      </Button>
      <Button
        variant="ghost"
        onClick={() => onSkipRest?.()}
        className="min-h-[44px] lg:min-h-0 lg:h-9 px-4 text-[12.5px] font-bold"
      >
        Skip
      </Button>
    </div>
  ) : null;

  // Cancel / Finish — Finish is the sole coral; Cancel is a neutral dim
  // affordance. The bad hue is reserved for the in-dialog confirm.
  const actionCluster = (
    <div className="flex items-center gap-3 lg:gap-2 flex-shrink-0">
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
        disabled={isSaving}
        variant="volt"
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

              {/* Rest Timer — teal throughout; urgency = pulse, not a hue swap */}
              {restActive && (
                <div className="flex flex-col min-w-0 rise-in">
                  <span className="text-[10px] uppercase text-ink-muted font-bold tracking-[0.08em]">Rest</span>
                  <div className={`flex items-center gap-1 font-technical ${restUrgent ? 'animate-pulse' : ''}`}>
                    <Timer className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0 text-teal" />
                    <span className={`text-teal text-sm md:text-base ${restUrgent ? 'font-black' : 'font-extrabold'}`}>
                      {restTimer === 0 ? 'Done!' : formatRestTime(restTimer)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Desktop-only action cluster + rest controls (top zone is fine
                with a mouse; on mobile these live in the bottom bar). */}
            <div className="hidden lg:flex items-center gap-3">
              {restControls}
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
        <div className="max-w-4xl mx-auto px-3 py-2.5 flex items-center justify-between gap-3">
          {restControls ? (
            restControls
          ) : (
            <span className="text-[10px] uppercase text-ink-faint font-bold tracking-[0.08em]">Logging</span>
          )}
          {actionCluster}
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
