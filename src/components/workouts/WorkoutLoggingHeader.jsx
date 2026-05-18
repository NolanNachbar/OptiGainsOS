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
      <div className="fixed top-0 left-0 right-0 z-[9998] bg-[#121212] border-b border-[#2a2a2a]" style={{ top: 'var(--layout-header-height, 0px)' }}>
        <div className="max-w-4xl mx-auto px-3 md:px-8 py-2">
          {/* Workout Title (when scrolled) - Desktop Only */}
          {showTitleInHeader && (
            <h2 className="hidden md:block font-semibold text-white text-base mb-2 truncate animate-in fade-in slide-in-from-top-2 duration-200">
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
                  <span className="text-[11px] md:text-xs uppercase text-[#555555] font-medium tracking-wide">Workout</span>
                  <div className="flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 md:w-4 md:h-4 text-[#ccff00] flex-shrink-0" />
                    <span className="font-semibold text-white text-sm md:text-base">{formatTime(elapsedTime)}</span>
                  </div>
                </div>
              )}

              {/* Rest Timer */}
              {restTimer !== null && restTimer >= 0 && (
                <>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] md:text-xs uppercase text-[#555555] font-medium tracking-wide">Rest</span>
                    <div className="flex items-center gap-1 font-mono">
                      <Timer className={`w-3 h-3 md:w-4 md:h-4 flex-shrink-0 ${restTimer <= 10 ? 'text-[#fbbf24]' : restTimer === 0 ? 'text-[#4ade80]' : 'text-[#555555]'}`} />
                      <span className={`font-semibold text-sm md:text-base ${restTimer <= 10 ? 'text-[#fbbf24]' : restTimer === 0 ? 'text-[#4ade80]' : 'text-white'}`}>
                        {restTimer === 0 ? 'Done!' : formatRestTime(restTimer)}
                      </span>
                    </div>
                  </div>
                  {/* Rest Timer Controls - Inline on mobile */}
                  {restTimer > 0 && (
                    <div className="flex gap-1 items-center">
                      <button
                        onClick={() => onAddRestTime?.(30)}
                        className="text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded bg-[#202020] hover:bg-[#242424] text-[#a0a0a0] hover:text-white border border-[#2a2a2a] font-medium"
                      >
                        +30s
                      </button>
                      <button
                        onClick={() => onSkipRest?.()}
                        className="text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded bg-[#202020] hover:bg-[#242424] text-[#a0a0a0] hover:text-white border border-[#2a2a2a] font-medium"
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
              <Button
                variant="destructive"
                onClick={() => setShowConfirm(true)}
                size="sm"
                className="h-7 md:h-8 text-xs md:text-sm px-2 md:px-3 transition-all hover:scale-105"
              >
                <X className="w-3 h-3 md:w-3.5 md:h-3.5 md:mr-1.5" />
                <span className="hidden md:inline">Cancel</span>
              </Button>
              <Button
                onClick={onFinish}
                disabled={isSaving}
                size="sm"
                variant="volt"
                className="h-7 md:h-8 text-xs md:text-sm px-2 md:px-3 transition-all hover:scale-105"
                data-tutorial="finish-workout-btn"
              >
                {isSaving ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 md:mr-1.5" />
                    <span className="hidden md:inline">Finish</span>
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
                <AlertTriangle className="w-5 h-5 text-[#f87171]" />
                Cancel Workout?
              </DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-[#a0a0a0]">
              Your progress for this workout will be lost. Are you sure you want to cancel?
            </p>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirm(false)}
              >
                Keep Going
              </Button>
              <Button
                variant="destructive"
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
