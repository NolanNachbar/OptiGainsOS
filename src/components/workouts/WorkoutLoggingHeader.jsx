import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CheckCircle2, AlertTriangle, Timer, ChevronLeft } from "lucide-react";

// MacroFactor-referenced rebuild (Phase A, design-reference only — no MF
// logos/icons/assets): header is now the four things that matter mid-set
// (back · duration · rest pill · Finish), a thin 2px set-progress bar
// underneath, and an optional muted workout-name line under that. Finish is
// demoted from "the anchor" to "compact, always reachable" — it stays the
// only element in the whole app named exactly "Finish" (train-logger e2e
// depends on getByRole('button', { name: 'Finish', exact: true })).
// Cancel workout / Calculators moved OUT of this component entirely — they
// now live in the focused exercise's own kebab (WorkoutDetail owns that
// state and renders CalculatorsModal + the cancel-confirm Dialog at the page
// level), matching Nolan's Phase A spec ("a kebab for the rest: reorder,
// favorite, delete, Notes & cues, calculators, cancel workout").
export default function WorkoutLoggingHeader({
  workoutTitle,
  // Leaves the logger without ending the workout — the in-progress session
  // stays in D1/local state exactly as it does today when the app is closed
  // and reopened mid-workout (WorkoutDetail's own resume-session dialog
  // picks it back up next visit). The auto-save effect fires synchronously
  // on every exerciseLogs change (no debounce), so a plain back-navigation
  // right after a checked set is already saved by the time this click lands.
  onBack = null,
  onFinish,
  isSaving = false,
  startTime = null,
  restTimer = null,
  onSkipRest = null,
  onAddRestTime = null,
  // Empty workout → Finish is a dead-end; render it inert until there's
  // something to log so only the Add CTA reads as the live action.
  canFinish = true,
  // A save to workout_sessions that did not land, and the retry for it.
  saveFailed = false,
  onRetrySave = null,
  doneSets = 0,
  totalSets = 0,
  // Exercise chip strip (Phase A): [{ name, done }], the focused index, and
  // a setter. Lives inside this same fixed bar (not a second fixed element)
  // so the existing --logging-top-clearance measurement already accounts
  // for it with zero extra plumbing.
  exercises = null,
  focusedExerciseIndex = 0,
  onSelectExercise = null,
}) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showRestPopover, setShowRestPopover] = useState(false);
  const topBarRef = useRef(null);
  const restPopoverRef = useRef(null);
  const stripRef = useRef(null);
  const chipRefs = useRef([]);

  // Auto-scroll the strip so the focused chip is always in view — on
  // mount and whenever focus moves (manual tap or auto-advance).
  useEffect(() => {
    const chip = chipRefs.current[focusedExerciseIndex];
    if (chip) chip.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [focusedExerciseIndex]);

  const restActive = restTimer !== null && restTimer >= 0;
  const restUrgent = restActive && restTimer > 0 && restTimer <= 10;

  // Measured-clearance pattern (unchanged from Step 5) for the fixed top bar
  // — pages pad by the bar's real height instead of a guessed constant.
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

  // Phase A drops the floating bottom rest bar entirely — rest lives as a
  // header pill now, so nothing floats over content and there is no bottom
  // bar left to measure. Pages that used --logging-bar-clearance for bottom
  // padding just get 0 from here on.
  useEffect(() => {
    document.documentElement.style.setProperty("--logging-bar-clearance", "0px");
  }, []);

  useEffect(() => {
    if (!startTime) return;
    let timeoutId;
    const tick = () => {
      const elapsedMs = Date.now() - startTime;
      setElapsedTime(Math.floor(elapsedMs / 1000));
      const msToNextSecond = 1000 - (elapsedMs % 1000);
      timeoutId = setTimeout(tick, msToNextSecond);
    };
    tick();
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

  useEffect(() => {
    if (!showRestPopover) return;
    const onDocClick = (e) => {
      if (restPopoverRef.current && !restPopoverRef.current.contains(e.target)) setShowRestPopover(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showRestPopover]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatRestTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const setCount = totalSets > 0 ? Math.max(0, Math.min(1, doneSets / totalSets)) : 0;

  const saveWarning = saveFailed ? (
    <button
      type="button"
      onClick={() => onRetrySave?.()}
      className="flex items-center gap-1.5 rounded-lg bg-warn/[0.15] px-2 py-1 text-left rise-in mt-1 mx-3 md:mx-8"
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
      <div
        ref={topBarRef}
        className="fixed top-0 left-0 right-0 z-[9998] border-x-0 glass-elevated glass-elevated--substacked"
        style={{ top: 'var(--layout-header-height, 0px)' }}
      >
        {/* Safe-area fix (coordinator, r4f): pt-2 alone left the clock/Rest/
            Finish row under the iOS status bar when this runs as an
            installed PWA (no browser chrome to push it down) — Finish sat
            under the wifi/battery glyphs and was untappable. Inline style
            (not a Tailwind pt-[...] arbitrary class) to match Layout.jsx's
            already-working header pattern exactly: a Tailwind arbitrary
            class turns into a *separate, CSS-escaped* selector, and the
            iphone-sim probe's env()-rewrite only rewrites plain (unescaped)
            "env(" text — it never touches the escaped selector, so the
            rewritten class name on the element stops matching its own
            (unrewritten) selector and the rule silently fails to apply in
            probe screenshots (verified: computed padding-top came back 0px
            with the class form, and the header visibly ran the elapsed-time
            readout under the status bar). An inline style has no separate
            selector to fall out of sync with, so it rewrites cleanly here
            exactly as it already does for Layout.jsx. env() reads 0 on
            Linux/WebKit probes; iphone-sim rewrites it to the calibrated
            inset for screenshots, same as the real per-device value would
            apply. The bar's real (now taller) height still gets measured by
            the ResizeObserver below into --logging-top-clearance, so the
            page's content offset follows automatically. */}
        <div
          className="max-w-4xl mx-auto px-3 md:px-8 lg:pl-[248px]"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
        >
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                aria-label="Leave logger (workout stays in progress)"
                className="min-h-[44px] min-w-[44px] lg:min-h-0 lg:h-9 lg:w-9 -ml-2 flex-shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}

            <div className="font-technical font-extrabold text-ink text-sm md:text-base tabular-nums flex-shrink-0">
              {formatTime(elapsedTime)}
            </div>

            <div className="flex-1" />

            {/* Rest pill — idle reads "Rest", running reads the countdown.
                Tapping opens a small popover with the existing +30s/Skip
                controls plus ±10s (addRestTime already takes a signed second
                count and the tick clamps at 0, so this needed no new
                persistence). */}
            <div className="relative flex-shrink-0" ref={restPopoverRef}>
              <button
                type="button"
                onClick={() => restActive && setShowRestPopover((v) => !v)}
                disabled={!restActive}
                className={`flex items-center gap-1.5 rounded-full px-2.5 min-h-[36px] font-technical border transition-colors ${
                  restActive
                    ? `border-charcoal-border bg-[var(--glass-edge)] ${restUrgent ? 'rest-urgent' : ''}`
                    : 'border-transparent text-ink-faint'
                }`}
                aria-label={restActive ? `Rest, ${formatRestTime(restTimer)} remaining` : 'Rest timer idle'}
              >
                <Timer className="w-3.5 h-3.5 flex-shrink-0 text-ink-muted" />
                <span className={`text-sm tabular-nums ${restActive ? 'text-ink font-extrabold' : 'text-ink-faint font-semibold'}`}>
                  {restActive ? (restTimer === 0 ? '0:00' : formatRestTime(restTimer)) : 'Rest'}
                </span>
              </button>
              {showRestPopover && restActive && (
                <div className="absolute right-0 top-full mt-1 glass-elevated rounded-xl overflow-hidden p-2 z-[10200] flex items-center gap-1.5 text-ink">
                  <Button
                    variant="ghost"
                    onClick={() => onAddRestTime?.(-10)}
                    className="min-h-[40px] px-2.5 font-bold text-xs"
                  >
                    −10s
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onAddRestTime?.(10)}
                    className="min-h-[40px] px-2.5 font-bold text-xs"
                  >
                    +10s
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onAddRestTime?.(30)}
                    className="min-h-[40px] px-2.5 font-bold text-xs"
                  >
                    +30s
                  </Button>
                  <Button
                    variant="volt"
                    onClick={() => { onSkipRest?.(); setShowRestPopover(false); }}
                    className="min-h-[40px] px-2.5 font-bold text-xs"
                  >
                    Skip
                  </Button>
                </div>
              )}
            </div>

            <Button
              onClick={onFinish}
              disabled={isSaving || !canFinish}
              variant={canFinish ? "volt" : "dim"}
              // Button's shared baseStyles apply disabled:opacity-50 to every
              // variant uniformly, which stacks on top of "dim"'s already-
              // muted ink/border and reads as a washed-out smear rather than
              // a legible inert outline (coordinator, r4f). Override back to
              // full opacity here only — "dim" itself is already the correct
              // outlined/ghost inert look (transparent fill, charcoal-border
              // ring, muted ink), it just needs to not ALSO get the generic
              // disabled fade on top of it.
              className="min-h-[36px] lg:h-9 text-sm px-3.5 flex-shrink-0 disabled:opacity-100"
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

          {/* Thin 2px set-progress bar, then the workout name demoted to a
              small muted line underneath (mockup's meta line, minus the
              elapsed/set-count figures, which now live as the duration
              readout + this bar itself). */}
          <div className="h-[2px] w-full rounded-full bg-track overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500 [transition-timing-function:var(--ease)]"
              style={{ width: `${setCount * 100}%` }}
            />
          </div>
          {workoutTitle && (
            <div className="text-[11px] font-bold uppercase tracking-[0.02em] text-ink-muted truncate py-1">
              {workoutTitle}
              {totalSets > 0 && <span className="text-ink-faint"> · {doneSets}/{totalSets} sets</span>}
            </div>
          )}

          {/* Exercise chip strip (Phase A, MF-referenced): a horizontally-
              scrolling row of every exercise in the workout, so the athlete
              can jump to any of them without leaving the logger. Focused
              chip is outlined off-white; done chips read muted with a small
              check. Tap-to-focus calls the same onSelectExercise the page
              already uses for manual focus changes. */}
          {exercises && exercises.length > 0 && (
            <div
              ref={stripRef}
              className="flex gap-1.5 overflow-x-auto pb-2 pt-0.5 -mx-3 px-3 md:-mx-8 md:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Exercises in this workout"
            >
              {exercises.map((ex, i) => {
                const focused = i === focusedExerciseIndex;
                return (
                  <button
                    key={i}
                    ref={(el) => { chipRefs.current[i] = el; }}
                    type="button"
                    role="tab"
                    aria-selected={focused}
                    data-testid={`exercise-chip-${i}`}
                    onClick={() => onSelectExercise?.(i)}
                    className={`flex-shrink-0 min-h-[32px] px-3 rounded-full text-xs font-bold whitespace-nowrap border transition-colors flex items-center gap-1 ${
                      focused
                        ? 'border-white/90 text-ink bg-[var(--glass-edge)]'
                        : ex.done
                        ? 'border-transparent text-ink-faint bg-track'
                        : 'border-transparent text-ink-muted bg-track'
                    }`}
                  >
                    {ex.done && <CheckCircle2 className="w-3 h-3 text-leaf flex-shrink-0" />}
                    {ex.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {saveWarning}
      </div>
    </>
  );
}
