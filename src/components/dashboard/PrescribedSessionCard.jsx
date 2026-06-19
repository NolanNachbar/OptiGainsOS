import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Dumbbell, Activity, Waves, Zap, AlertTriangle, Check, Circle, ChevronDown,
} from "lucide-react";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import { useCardioCompletions } from "@/hooks/useCardioCompletions";
import { useTodayGarminCardio } from "@/hooks/useTodayGarminCardio";

const mi = (m) => (m ? (m / 1609.34).toFixed(1) : null);
const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : null);

// The engine's full daily session — computed by mpc_prescriber.py /
// session_generator.py and written to training_prescription.prescription —
// surfaced here for the first time. Previously the app discarded the engine's
// actual recommendation and showed only the static program template.
//
// Shape (training_prescription row):
//   mpc_action, mpc_intensity, w_pst, w_str, rationale, interference_warning,
//   interference {interference_level, anabolic_window},
//   prescription {session_type, split, strength_block[], calisthenics_block{},
//                 run_block{}, swim_block{}}

const ACTION_LABEL = {
  REST: "Rest", LIGHT: "Light", CARDIO: "Cardio", CALISTHENICS: "Calisthenics",
  STRENGTH: "Strength", MIXED: "Mixed", TWO_A_DAY: "Two-a-Day", DELOAD: "Deload",
};

function titleCase(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Humanize any raw engine enums the rationale string interpolates verbatim
// (e.g. "Prescribed TWO_A_DAY action…") so users never see SCREAMING_SNAKE copy.
function humanizeRationale(s) {
  return String(s || "").replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (m) => ACTION_LABEL[m] || titleCase(m));
}

function intensityBadge(intensity) {
  if (intensity == null) return null;
  if (intensity >= 1.05) return { label: `${intensity.toFixed(2)}× intensity`, color: "var(--hue-teal)" };
  if (intensity < 0.85) return { label: `${intensity.toFixed(2)}× back off`, color: "var(--warn)" };
  return { label: `${Number(intensity).toFixed(2)}× intensity`, color: "var(--hue-teal)" };
}

function ExerciseRow({ ex }) {
  const reps = ex.reps ?? ex.rep_target;
  const rir = ex.rir ?? ex.rir_target;
  const load = ex.load_lbs;
  return (
    <div className="data-row">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-ink truncate">{ex.name}</div>
        <div className="font-technical text-[11px] font-semibold text-muted-2 mt-px whitespace-nowrap">
          {ex.sets}×{reps}{rir != null && ` · RIR ${rir}`}
        </div>
      </div>
      {load > 0 && (
        <span className="pill-value text-ink">
          {load}<small className="text-[9.5px] font-semibold text-muted-2"> lb</small>
        </span>
      )}
    </div>
  );
}

// Small inline "mark done" toggle for a prescribed conditioning session,
// backed by the cardio_completions table (persists + syncs across devices).
function CardioDoneToggle({ done, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative shrink-0 w-11 h-11 -my-1.5 rounded-full flex items-center justify-center transition-colors ${
        done ? "bg-leaf text-ink" : "glass-inset text-ink-faint hover:text-ink-secondary"
      }`}
      aria-pressed={done}
      aria-label={done ? "Mark conditioning not done" : "Mark conditioning done"}
    >
      {done ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
    </button>
  );
}

export default function PrescribedSessionCard({ today, loggedToday = false, demoteCta = false }) {
  const { prescription } = useTodayPrescription(today);
  const [liftsOpen, setLiftsOpen] = useState(false);
  // Pre-train check-in: free-text the athlete enters before lifting. Carried
  // into the logger as a "PRE:" session note, which notes_parser.py reads to
  // steer future programming.
  const [preNote, setPreNote] = useState("");
  const { isDone, toggle } = useCardioCompletions(today);
  const { match: garminMatch } = useTodayGarminCardio(today);
  // No engine prescription yet — own the single off-script fallback so logging a
  // workout is never buried (Today no longer renders its own duplicate ghost).
  if (!prescription) {
    return (
      <Link to="/quick-workout" className="cta-ghost w-full">
        Log a workout
      </Link>
    );
  }

  const action = prescription.mpc_action;
  const p = prescription.prescription || {};
  const strength = p.strength_block || [];
  const cal = p.calisthenics_block || {};
  const run = p.run_block;
  const swim = p.swim_block;
  const interference = prescription.interference || {};
  const overreach = prescription.overreach || {};

  const intensity = prescription.mpc_intensity != null ? Number(prescription.mpc_intensity) : null;
  const iBadge = intensityBadge(intensity);

  // Deadline weighting (w_pst = conditioning/PST emphasis, w_str = strength).
  // Round ONE side and derive the other as 100-minus so the displayed pair
  // always sums to exactly 100 (rounding each independently can yield 101%).
  const haveWeights = prescription.w_pst != null && prescription.w_str != null;
  const wPst = haveWeights ? Math.round(Number(prescription.w_pst) * 100) : null;
  const wStr = haveWeights ? 100 - wPst : null;

  const titleText = action === "REST"
    ? "Rest Day"
    : `${ACTION_LABEL[action] || titleCase(action)}${p.split ? ` — ${titleCase(p.split)}` : ""}`;

  const calItems = Object.entries(cal).filter(([, v]) => v && (v.sets || v.reps_each));
  const isRest = action === "REST";

  // Carry the engine's prescribed lifts (load/reps/RIR) into the logger.
  const prescribedExercises = strength.map((ex) => ({
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps ?? ex.rep_target,
    rir: ex.rir ?? ex.rir_target,
    targetWeight: ex.load_lbs,
  }));

  // A prescribed conditioning line. Completion is driven by the real Garmin
  // activity (what you actually did); the manual toggle is only a fallback for
  // when Garmin didn't capture the session.
  const renderCardio = ({ kind, name, icon, label }) => {
    const g = garminMatch(kind);
    const manualDone = isDone(name);
    const done = !!g || manualDone;
    return (
      <div key={kind} className="flex items-center gap-2 text-sm">
        {g ? (
          <span className="shrink-0 w-11 h-11 -my-1.5 rounded-full bg-leaf text-ink flex items-center justify-center" title="Auto-detected from Garmin">
            <Check className="w-4 h-4" />
          </span>
        ) : (
          <CardioDoneToggle done={manualDone} onToggle={() => toggle(name)} />
        )}
        {icon}
        <span className={done ? "text-ink-faint line-through" : "text-ink"}>{label}</span>
        {g && (
          <span className="ml-auto text-[11px] font-technical text-leaf whitespace-nowrap">
            {mi(g.distance_meters) ? `${mi(g.distance_meters)} mi` : "done"}
            {mmss(g.duration_seconds) ? ` · ${mmss(g.duration_seconds)}` : ""}
            <span className="text-ink-faint"> · Garmin</span>
          </span>
        )}
      </div>
    );
  };

  return (
    // Plain glass div (not Card/CardContent) — CardContent's default pt-0
    // fights custom py-* classes and lets the title touch the card edge.
    <div className="glass px-4 pt-4 pb-4 sm:px-5">
        {/* Title row — session name left, intensity multiplier right (teal) */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="type-display text-lg line-clamp-2">{titleText}</h3>
          {iBadge && (
            <span className="font-technical text-[12px] font-bold whitespace-nowrap shrink-0 mt-0.5" style={{ color: iBadge.color }}>
              {iBadge.label}
            </span>
          )}
        </div>
        {prescription.rationale && (
          <p className="text-[12px] font-medium text-muted-2 mt-1 leading-relaxed">{humanizeRationale(prescription.rationale)}</p>
        )}

        {/* Deadline weighting + anabolic window — the "why today looks like this" line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px]">
          {wPst != null && wStr != null && (
            <span className="text-ink-faint">
              Focus split <span className="font-technical text-ink-secondary">{wPst}% conditioning · {wStr}% strength</span>
            </span>
          )}
          {interference.anabolic_window && !isRest && (
            <span className="text-ok font-semibold flex items-center gap-1">
              <Zap className="w-3 h-3" /> Anabolic window open — lift now
            </span>
          )}
          {interference.interference_level === "HIGH" && (
            <span className="text-warn font-semibold">High interference — protect the lift</span>
          )}
        </div>

        {/* Strength block — collapsed by default on mobile (disclosure),
            always expanded on desktop */}
        {strength.length > 0 && (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setLiftsOpen((o) => !o)}
              className="w-full flex items-center gap-1.5 section-label mb-1 min-h-[44px] py-2 lg:min-h-0 lg:py-0 lg:pointer-events-none"
              aria-expanded={liftsOpen}
            >
              <Dumbbell className="w-3 h-3" /> Lifts
              <span className="font-technical normal-case tracking-normal text-muted-2">· {strength.length}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 ml-auto lg:hidden transition-transform duration-200 ${liftsOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div className={`${liftsOpen ? "block rise-in lg:animate-none" : "hidden"} lg:block`}>
              {strength.map((ex, i) => <ExerciseRow key={i} ex={ex} />)}
            </div>
          </div>
        )}

        {/* Calisthenics */}
        {calItems.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 section-label mb-1">
              <Activity className="w-3 h-3" /> Calisthenics
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {calItems.map(([name, v]) => (
                <span key={name} className="text-[13px] font-bold text-ink">
                  {titleCase(name)} <span className="font-technical text-[11px] font-semibold text-muted-2">{v.sets}×{v.reps_each}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Run + Swim — completion driven by actual Garmin activity */}
        {(run || swim) && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 section-label mb-1">
              <Waves className="w-3 h-3" /> Conditioning
            </div>
            <div className="flex flex-col gap-2">
            {run && renderCardio({
              kind: "run",
              name: `${run.zone} run`,
              icon: <Activity className="w-3.5 h-3.5 text-info shrink-0" />,
              label: (
                <>
                  {run.zone} run · <span className="font-technical text-ink-secondary">{run.session_miles} mi</span>
                  {run.pace && (
                    <span className="text-ink-faint">
                      {" · "}{run.pace}{/^\d+:\d{2}$/.test(String(run.pace)) ? "/mi" : ""}
                    </span>
                  )}
                </>
              ),
            })}
            {swim && renderCardio({
              kind: "swim",
              name: `swim ${swim.meters}m`,
              icon: <Waves className="w-3.5 h-3.5 text-info shrink-0" />,
              label: (
                <>
                  <span className="font-technical text-ink-secondary">{swim.meters} m</span>
                  {swim.stroke && <span className="text-ink-faint"> {swim.stroke}</span>}
                </>
              ),
            })}
            </div>
          </div>
        )}

        {/* Overreach / interference warnings */}
        {(overreach.overreaching || prescription.interference_warning) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warn/[8%] px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
            <p className="text-[11px] text-warn opacity-90 leading-relaxed">
              {overreach.overreaching
                ? "Overreaching flagged (HRV down / RHR up). The engine forced recovery — honor it."
                : prescription.interference_warning}
            </p>
          </div>
        )}

        {/* Already trained today — a single compact completion ROW (status +
            "log another" in one line) instead of a stacked banner + full-width
            ghost, so the done state stays glanceable and doesn't nag. */}
        {!isRest && loggedToday && (
          <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-leaf/[0.12] px-3 min-h-[44px] text-sm font-semibold text-leaf">
            <Check className="w-4 h-4 shrink-0" />
            <span>Logged today — nice work.</span>
            <Link
              to="/quick-workout"
              state={{ prescribedSession: { title: titleText, exercises: prescribedExercises } }}
              className="ml-auto text-brand font-semibold whitespace-nowrap"
            >
              Log another
            </Link>
          </div>
        )}

        {/* Ad-hoc log — on a rest day the engine prescribes nothing to begin, but
            an athlete may still train off-script. Surface a neutral (non-coral)
            ghost link so logging a workout is never buried, without competing
            with the coral primary that owns the train days. */}
        {isRest && (
          <Link to="/quick-workout" className="cta-ghost mt-3.5 w-full">
            Log a workout
          </Link>
        )}

        {/* Pre-train check-in + Begin Session — carry the prescribed lifts AND
            the pre-train note into the logger (saved as a PRE: session note). */}
        {!isRest && !loggedToday && (
          <>
            {strength.length > 0 && (
              <div className="mt-3.5">
                <label htmlFor="pre-train-note" className="section-label flex items-center gap-1.5 mb-1.5">
                  <Check className="w-3 h-3" /> Pre-train check-in
                </label>
                <textarea
                  id="pre-train-note"
                  value={preNote}
                  onChange={(e) => setPreNote(e.target.value)}
                  rows={2}
                  placeholder="Anything to flag before you train? sleep, soreness, energy…"
                  className="w-full glass-inset px-3 py-2 text-[13px] text-ink placeholder:text-faint resize-none focus-visible:ring-1 focus-visible:ring-brand"
                />
              </div>
            )}
            <Link
              to="/quick-workout"
              state={{
                prescribedSession: { title: titleText, exercises: prescribedExercises },
                preNote: preNote.trim() || undefined,
              }}
              className={`${demoteCta ? "cta-ghost" : "cta-coral"} w-full ${strength.length > 0 ? "mt-2.5" : "mt-3.5"}`}
            >
              Begin Session
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3.5 2.5v9l8-4.5-8-4.5Z" fill="currentColor"/></svg>
            </Link>
          </>
        )}
    </div>
  );
}
