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

  return (
    <>
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
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              {/* Workout Timer */}
              {startTime && (
                <div className="flex flex-col min-w-0">
                  <span className="text-[9.5px] uppercase text-ink-muted font-bold tracking-[0.08em]">Workout</span>
                  <div className="flex items-center gap-1 font-technical">
                    <Clock className="w-3 h-3 md:w-4 md:h-4 text-ink-muted flex-shrink-0" />
                    <span className="font-extrabold text-ink text-sm md:text-base">{formatTime(elapsedTime)}</span>
                  </div>
                </div>
              )}

              {/* Rest Timer */}
              {restTimer !== null && restTimer >= 0 && (
                <>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] uppercase text-ink-muted font-bold tracking-[0.08em]">Rest</span>
                    <div className="flex items-center gap-1 font-technical">
                      <Timer className={`w-3 h-3 md:w-4 md:h-4 flex-shrink-0 ${restTimer <= 10 ? 'text-warn' : 'text-teal'}`} />
                      <span className={`font-extrabold text-sm md:text-base ${restTimer <= 10 ? 'text-warn' : restTimer === 0 ? 'text-teal' : 'text-ink'}`}>
                        {restTimer === 0 ? 'Done!' : formatRestTime(restTimer)}
                      </span>
                    </div>
                  </div>
                  {/* Rest Timer Controls - Inline on mobile */}
                  {restTimer > 0 && (
                    <div className="flex gap-1.5 items-center">
                      <button
                        onClick={() => onAddRestTime?.(30)}
                        className="h-10 md:h-8 px-3.5 md:px-3 rounded-full bg-white/[0.07] border-[0.5px] border-white/10 text-[12px] font-bold font-technical text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.09)] hover:bg-white/[0.10] transition-colors"
                      >
                        +30s
                      </button>
                      <button
                        onClick={() => onSkipRest?.()}
                        className="h-10 md:h-8 px-3.5 md:px-3 rounded-full bg-white/[0.07] border-[0.5px] border-white/10 text-[12px] font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.09)] hover:bg-white/[0.10] transition-colors"
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 md:gap-2 flex-shrink-0">
              <Button
                variant="destructive"
                onClick={() => setShowConfirm(true)}
                size="sm"
                className="h-11 md:h-8 text-xs md:text-sm px-3 md:px-3"
              >
                <X className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1.5" />
                <span>Cancel</span>
              </Button>
              <Button
                onClick={onFinish}
                disabled={isSaving}
                size="sm"
                variant="volt"
                className="h-11 md:h-8 text-xs md:text-sm px-3 md:px-3"
                data-tutorial="finish-workout-btn"
              >
                {isSaving ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1.5" />
                    <span>Finish</span>
                  </>
                )}
              </Button>
            </div>
          </div>
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
