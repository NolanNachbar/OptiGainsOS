import { useState, useRef, useEffect } from "react";
import { cn } from "@/components/ui";

// MF-scale RIR effort tint (0 red, 1-2 amber, 3-4 green, 5+ blue) -- same
// scale as ExerciseCard's rirCell. Every class string below appears here
// literally (not built via template interpolation) because Tailwind's JIT
// scanner only picks up arbitrary-value classes it can see verbatim in the
// source -- a `bg-[${var}]` built at runtime would silently generate no CSS.
function rirPillTint(val, active) {
  if (val <= 0) return active ? "bg-bad text-charcoal" : "bg-bad/15 text-bad";
  if (val <= 2) return active ? "bg-warn text-charcoal" : "bg-warn/15 text-warn";
  if (val <= 4) return active ? "bg-leaf text-charcoal" : "bg-leaf/15 text-leaf";
  return active ? "bg-info text-charcoal" : "bg-info/15 text-info";
}

// Phase B: Ledger-styled bottom-sheet keypad for weight/reps/RIR, referenced
// on MacroFactor Workouts / Strong / Hevy. Exists because a PWA's native
// on-screen numeric keyboard covers roughly half an iOS screen with no
// reliable Next/Done key. The real <input> stays focused and editable the
// whole time (inputMode="none" just suppresses the OS keyboard) -- every key
// here calls preventDefault() in onPointerDown so tapping it never steals
// DOM focus away from that input, and every value still commits through the
// exact same commitWeight/commitReps/commitRir functions a hardware
// keyboard's onChange would call.
export default function KeypadSheet({
  activeField, exercise, weightUnit, isHold, showRIR, rirRequired, lastPerformance,
  commitWeight, commitReps, commitRir, onClose, onDone, focusField,
  scrollActiveIntoView,
}) {
  const { setIndex, field } = activeField;
  const set = exercise.sets[setIndex];
  const [buffer, setBuffer] = useState("");
  const [fresh, setFresh] = useState(true);
  const sheetRef = useRef(null);
  const touchStartY = useRef(null);

  // Re-seed the buffer whenever the active field changes (a new set, or
  // weight -> reps -> rir advance on the SAME set).
  useEffect(() => {
    let initial;
    if (field === "weight") initial = set?.weight;
    else if (field === "reps") initial = isHold ? set?.duration_s : set?.reps;
    else initial = set?.rir != null ? set.rir : (set?.rpe != null ? 10 - set.rpe : null);
    setBuffer(initial == null ? "" : String(initial));
    setFresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIndex, field]);

  // Publish this sheet's real height into --logging-bar-clearance so the
  // page's existing bottom padding / scroll-margin (WorkoutDetail.jsx,
  // QuickWorkout.jsx both already read this var) keeps the focused row
  // visible above the sheet instead of the sheet covering it. Revert to 0
  // on unmount (matches WorkoutLoggingHeader's Phase A baseline).
  useEffect(() => {
    const root = document.documentElement;
    const el = sheetRef.current;
    if (!el) return undefined;
    const publish = () => root.style.setProperty("--logging-bar-clearance", `${el.offsetHeight}px`);
    publish();
    // handleInputFocus's own scroll already ran (or is running) by this
    // point, but it fired before --logging-bar-clearance had this sheet's
    // real height -- inputMode="none" means no visualViewport resize
    // happens to re-trigger it. Re-scroll once the sheet's true height is
    // published, so the active row lands above the sheet, not under it.
    requestAnimationFrame(() => scrollActiveIntoView?.());
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--logging-bar-clearance", "0px");
    };
    // Intentionally mount-only: re-running this on every scrollActiveIntoView
    // identity change (a new inline function each parent render) would
    // re-publish/re-scroll constantly instead of once when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dismiss on an outside tap -- deliberately NOT calling preventDefault or
  // stopPropagation, so a tap that lands on, say, the "Mark set complete"
  // checkbox both closes the sheet AND still completes that click.
  useEffect(() => {
    const onPointerDown = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const commit = (nextBuf) => {
    if (field === "weight") commitWeight(setIndex, nextBuf);
    else if (field === "reps") commitReps(setIndex, nextBuf);
    else commitRir(setIndex, nextBuf);
  };

  const pressDigit = (d) => {
    if (field === "rir") return; // RIR uses the pill strip, not digits.
    const next = fresh ? d : buffer + d;
    // Mirror commitWeight's 2000 clamp in the display too, so a fat-fingered
    // extra digit doesn't show 9999 on the sheet while 2000 is what actually
    // gets saved underneath it.
    const shown = field === "weight" && parseFloat(next) > 2000 ? "2000" : next;
    setBuffer(shown);
    setFresh(false);
    commit(next);
  };

  const pressDot = () => {
    if (field !== "weight" || buffer.includes(".")) return; // reps are integer-only.
    const next = fresh ? "0." : buffer + ".";
    setBuffer(next);
    setFresh(false);
    commit(next);
  };

  const pressBackspace = () => {
    if (field === "rir") return;
    const next = buffer.slice(0, -1);
    setBuffer(next);
    setFresh(next === "");
    commit(next);
  };

  const increment = weightUnit === "kg" ? 2.5 : 5;
  const pressStep = (dir) => {
    const current = buffer === "" ? 0 : parseFloat(buffer) || 0;
    const next = Math.min(2000, Math.max(0, Math.round((current + dir * increment) * 100) / 100));
    const nextStr = String(next);
    setBuffer(nextStr);
    setFresh(true);
    commit(nextStr);
  };

  const fieldOrder = showRIR ? ["weight", "reps", "rir"] : ["weight", "reps"];
  const isLastField = field === fieldOrder[fieldOrder.length - 1];

  const goNext = () => {
    if (isLastField) {
      onClose();
      onDone(setIndex);
      return;
    }
    focusField(fieldOrder[fieldOrder.indexOf(field) + 1]);
  };

  const pickRir = (val) => {
    // Mirrors pressDigit: fills the buffer/commits the value, same as typing
    // a digit for weight/reps. It does NOT close the sheet or finish the set
    // on its own anymore -- that was the inconsistency (a pill tap used to
    // commit-and-finish in one tap, unlike weight/reps needing an explicit
    // Next/Done). Finishing now always goes through the same Done button.
    const str = String(val);
    setBuffer(str);
    setFresh(false);
    commitRir(setIndex, str);
  };

  const label =
    field === "weight" ? `Set ${set?.set_number ?? ""} · Weight`
    : field === "reps" ? `Set ${set?.set_number ?? ""} · ${isHold ? "Sec" : "Reps"}`
    : `Set ${set?.set_number ?? ""} · RIR${rirRequired ? " · required on top sets" : ""}`;

  const prevText =
    field === "weight" && lastPerformance?.lastWeight
      ? `Prev ${lastPerformance.lastWeight} ${weightUnit}`
      : field === "reps" && lastPerformance?.lastReps
      ? `Prev ${lastPerformance.lastReps}`
      : null;

  // Driven off the same `buffer` the header number shows (not `set.rir` directly), so a
  // pill tap highlights immediately like a typed digit does, without waiting on the
  // commit round-trip through the parent's state.
  const currentRir = buffer !== "" ? Number(buffer) : null;

  const key = "min-h-[52px] rounded-control bg-[var(--key-surface)] text-[var(--key-text)] text-title font-numeral tabular-nums flex items-center justify-center transition-[transform,background-color] duration-fast ease-out active:scale-[0.94] active:bg-[var(--key-surface-active)] motion-reduce:transition-none motion-reduce:active:scale-100 touch-manipulation select-none";
  const stop = (e) => e.preventDefault();

  return (
    <div
      ref={sheetRef}
      role="group"
      aria-label="Set entry keypad"
      className="fixed inset-x-0 bottom-0 z-[70] bg-charcoal-surface2 border-t border-charcoal-border rounded-t-control shadow-elev-3 pb-[env(safe-area-inset-bottom,0px)]"
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        if (touchStartY.current == null) return;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        touchStartY.current = null;
        if (dy > 60) onClose();
      }}
    >
      <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-pill bg-track" aria-hidden="true" />

      <div className="flex items-end justify-between px-4 pt-1 pb-3">
        <div>
          <div className="text-micro text-ink-muted">{label}</div>
          <div className="mt-1 flex gap-1" aria-hidden="true">
            {fieldOrder.map((f) => (
              <span key={f} className={cn("h-0.5 w-6 rounded-pill transition-colors duration-base ease-out motion-reduce:transition-none", f === field ? "bg-brand" : "bg-track")} />
            ))}
          </div>
          <div className="text-hero font-numeral tabular-nums text-[var(--key-text)] mt-2">
            {buffer === "" ? "—" : buffer}
          </div>
        </div>
        {prevText && <div className="text-caption font-numeral tabular-nums text-ink-muted pb-1">{prevText}</div>}
      </div>

      {field === "rir" ? (
        // Same outer grid-cols-4 shape as weight/reps below: a col-span-3 input
        // area on the left, a col-span-1 confirm button on the right, in the
        // SAME position every field uses. A pill tap now only fills the buffer
        // (like a digit) -- it no longer commits-and-finishes the set by
        // itself, so the confirm step is consistent across all three fields.
        <div className="px-4 pb-4 grid grid-cols-4 gap-1.5">
          {/* Six pills (0-5+), not seven: RIR 5+ earns zero stimulus credit in
              the engine, so 6+ was a redundant value. Six fit at >=44pt wide. */}
          <div className="col-span-3 flex gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onPointerDown={stop}
                onClick={() => pickRir(v)}
                aria-label={`RIR ${v === 5 ? "5+" : v}`}
                className={cn("flex-1 min-h-[52px] rounded-control text-title font-numeral tabular-nums touch-manipulation select-none transition-[transform,background-color] duration-fast ease-out active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100", rirPillTint(v, v === 5 ? currentRir >= 5 : currentRir === v))}
              >
                {v === 5 ? "5+" : v}
              </button>
            ))}
          </div>
          <div className="col-span-1 flex flex-col gap-1.5">
            {/* RIR is optional data, not a gate on completion -- Done still
                works with no pill picked. */}
            <button
              type="button"
              onPointerDown={stop}
              onClick={goNext}
              aria-label="Done, mark set complete"
              className="flex-1 min-h-[52px] rounded-control bg-brand text-[var(--key-ink-on-brand)] text-emph flex items-center justify-center shadow-elev-2 transition-transform duration-fast ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 touch-manipulation select-none"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-4 grid grid-cols-4 gap-1.5">
          <div className="col-span-3 grid grid-cols-3 gap-1.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onPointerDown={stop} onClick={() => pressDigit(d)} className={key}>
                {d}
              </button>
            ))}
            <button
              type="button"
              onPointerDown={stop}
              onClick={pressDot}
              disabled={field !== "weight"}
              aria-label="Decimal point"
              className={cn(key, field !== "weight" && "opacity-30")}
            >
              .
            </button>
            <button type="button" onPointerDown={stop} onClick={() => pressDigit("0")} className={key}>0</button>
            <button type="button" onPointerDown={stop} onClick={pressBackspace} aria-label="Backspace" className={key}>⌫</button>
          </div>
          <div className="col-span-1 flex flex-col gap-1.5">
            {field === "weight" && (
              <div className="flex gap-1.5">
                <button type="button" onPointerDown={stop} onClick={() => pressStep(-1)} aria-label={`Decrease by ${increment}`} className={cn(key, "flex-1")}>−</button>
                <button type="button" onPointerDown={stop} onClick={() => pressStep(1)} aria-label={`Increase by ${increment}`} className={cn(key, "flex-1")}>+</button>
              </div>
            )}
            <button
              type="button"
              onPointerDown={stop}
              onClick={goNext}
              aria-label={isLastField ? "Done, mark set complete" : "Next field"}
              className="flex-1 min-h-[52px] rounded-control bg-brand text-[var(--key-ink-on-brand)] text-emph flex items-center justify-center shadow-elev-2 transition-transform duration-fast ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 touch-manipulation select-none"
            >
              {isLastField ? "Done" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
