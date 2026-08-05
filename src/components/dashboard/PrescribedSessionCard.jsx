import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Dumbbell, Activity, Waves, Zap, AlertTriangle, Check, Circle, ChevronDown, Plus,
} from "lucide-react";
import MorningCheckin from "@/components/dashboard/MorningCheckin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import { useCardioCompletions } from "@/hooks/useCardioCompletions";
import { useTodayGarminCardio } from "@/hooks/useTodayGarminCardio";

const mi = (m) => (m ? (m / 1609.34).toFixed(1) : null);
const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : null);

// Name a prescribed run by its type, not just its HR zone.
const RUN_TYPE_LABEL = {
  interval: "Intervals",
  threshold: "Threshold",
  tempo: "Tempo",
  long: "Long run",
  easy: "Easy run",
  recovery: "Recovery run",
};
// Interval/threshold sessions are NOT one continuous run — reps with recovery
// jogs. Showing "X mi" (duration ÷ pace) reads as a steady effort at race pace,
// which is impossible. For those, lead with duration + pace and surface the rep
// structure from notes instead of a bogus mileage number.
const QUALITY_RUNS = new Set(["interval", "threshold", "tempo"]);
// Drop the "Garmin Zx-Zy. " provenance prefix; keep the human structure text.
const runStructure = (notes) =>
  String(notes || "").replace(/^Garmin\s+[^.]*\.\s*/i, "").trim();

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
      className={`relative shrink-0 w-11 h-11 -my-1.5 rounded-full flex items-center justify-center transition-all duration-200 [transition-timing-function:var(--ease)] active:scale-95 ${
        done ? "bg-leaf text-ink" : "glass-inset text-ink-faint hover:text-ink-secondary"
      }`}
      aria-pressed={done}
      aria-label={done ? "Mark conditioning not done" : "Mark conditioning done"}
    >
      {done ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
    </button>
  );
}

export default function PrescribedSessionCard({ today, loggedToday = false, demoteCta = false, programWorkout = null, todayCheckin = null }) {
  const { prescription } = useTodayPrescription(today);
  const navigate = useNavigate();
  // Check-in gate — the subjective check-in rides the start-workout flow (it is
  // no longer a standalone row on Today). Starting a session with no check-in
  // logged today opens the check-in sheet first; saving (or skipping) then
  // continues into the logger. Holds {to, state} while the sheet is open.
  const [checkinGate, setCheckinGate] = useState(null);
  const beginSession = (to, state) => {
    if (!todayCheckin?.energy) setCheckinGate({ to, state });
    else navigate(to, state ? { state } : undefined);
  };
  const continueToSession = () => {
    const gate = checkinGate;
    setCheckinGate(null);
    if (gate) navigate(gate.to, gate.state ? { state: gate.state } : undefined);
  };
  const checkinGateSheet = checkinGate && (
    <Dialog open onOpenChange={(open) => { if (!open) setCheckinGate(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick check-in first</DialogTitle>
        </DialogHeader>
        {/* Inside the sheet the check-in IS the live step, so it keeps its
            primary CTA; saving continues straight into the session. */}
        <MorningCheckin today={today} existingCheckin={null} onComplete={continueToSession} />
        <button
          type="button"
          onClick={continueToSession}
          className="min-h-[44px] w-full text-[12px] font-semibold text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
        >
          Skip, straight to the session
        </button>
      </DialogContent>
    </Dialog>
  );
  // When today is a scheduled program day, route the session CTAs to the program
  // logger (source=program) so the workout completes the program day and drives
  // progression — instead of /quick-workout, which logs it as an ad-hoc session.
  const programHref = programWorkout
    ? `/workout-detail?source=program&enrollmentId=${programWorkout.enrollmentId}&programWorkoutId=${programWorkout.programWorkoutId}`
    : null;
  const [liftsOpen, setLiftsOpen] = useState(false);
  // Pre-train check-in: free-text the athlete enters before lifting. Carried
  // into the logger as a "PRE:" session note, which notes_parser.py reads to
  // steer future programming.
  const [preNote, setPreNote] = useState("");
  // Pre-train note collapses behind a quiet disclosure so Begin Session sits
  // immediately under the prescription summary (the textarea no longer pushes
  // the primary action down two rows on every train day).
  const [noteOpen, setNoteOpen] = useState(false);
  const { isDone, toggle } = useCardioCompletions(today);
  const { match: garminMatch } = useTodayGarminCardio(today);
  // No engine prescription yet — own the single off-script fallback so logging a
  // workout is never buried (Today no longer renders its own duplicate ghost).
  if (!prescription) {
    // No engine prescription, but a program day is scheduled — surface it as the
    // day's workout (routed to the program logger), not a generic "log a workout".
    if (programHref) {
      // Once logged, show a completion row instead of a live link — a second tap
      // would otherwise re-log and double-advance the program (it has no
      // engine-prescribed completion swap to fall back on).
      if (loggedToday) {
        return (
          <div className="flex items-center gap-2 rounded-lg bg-leaf/[0.12] px-3 min-h-[44px] text-sm font-semibold text-leaf">
            <Check className="w-4 h-4 shrink-0" /> Logged today, nice work.
          </div>
        );
      }
      return (
        <>
          <button type="button" onClick={() => beginSession(programHref)} className={`${demoteCta ? "cta-ghost" : "cta-action"} w-full`}>
            Begin program workout
          </button>
          {checkinGateSheet}
        </>
      );
    }
    return (
      <Link to="/quick-workout" className="cta-ghost w-full">
        Log a workout
      </Link>
    );
  }

  const action = prescription.mpc_action;
  const p = prescription.prescription || {};
  const cal0 = p.calisthenics_block || {};
  // ── One owner for "which lifts": the approved plan ────────────────────────
  // mpc_prescriber pins today's prescription to program_workouts.exercises, so
  // in steady state strength_block already equals the plan. It can't on the day
  // a new week is approved, though — the prescription was computed at 4am
  // against the plan that was live then, and the next compute is tomorrow. So
  // join here too: movements come from the plan, and the engine's row for that
  // movement supplies the autoregulated sets/reps/RIR/load. A planned lift the
  // prescription has no row for falls back to the plan's own rep/RIR targets
  // with no load. Today and the Train tab therefore render the same list the
  // moment a plan changes, not a compute cycle later.
  const planned = (action === "REST" ? [] : (programWorkout?.exercises || []))
    .filter((e) => (e.sets || 0) > 0);
  const engineByName = new Map((p.strength_block || []).map((ex) => [ex.name, ex]));
  const strength = planned.length
    ? planned.map((e) => engineByName.get(e.name) || {
        name: e.name,
        sets: e.sets,
        reps: e.rep_target,
        rir: e.rir_target,
        load_lbs: 0,
        rest_seconds: e.rest_seconds,
        notes: e.notes,
      })
    : (p.strength_block || []);
  // When the plan owns the list, its calisthenics movements are already IN that
  // list — keeping the prescription's separate block would render pull-ups twice
  // under two different names.
  const cal = planned.length ? {} : cal0;
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
    : `${ACTION_LABEL[action] || titleCase(action)}${p.split ? `, ${titleCase(p.split)}` : ""}`;

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
              <Zap className="w-3 h-3" /> Anabolic window open, lift now
            </span>
          )}
          {interference.interference_level === "HIGH" && (
            <span className="text-warn font-semibold">High interference, protect the lift</span>
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
                className={`w-3.5 h-3.5 ml-auto lg:hidden transition-transform duration-200 [transition-timing-function:var(--ease)] ${liftsOpen ? "rotate-180" : ""}`}
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
              label: (() => {
                const rtype = String(run.run_type || "").toLowerCase();
                const rname = RUN_TYPE_LABEL[rtype] || `${run.zone} run`;
                const isQuality = QUALITY_RUNS.has(rtype);
                const paceUnit = /^\d+:\d{2}$/.test(String(run.pace)) ? "/mi" : "";
                const structure = runStructure(run.notes);
                return (
                  <span className="flex flex-col gap-0.5">
                    <span>
                      {rname}
                      {isQuality
                        ? (run.duration_minutes ? <span className="font-technical text-ink-secondary">{` · ~${run.duration_minutes} min`}</span> : null)
                        : (run.session_miles ? <span className="font-technical text-ink-secondary">{` · ${run.session_miles} mi`}</span> : null)}
                      {run.pace && <span className="text-ink-faint">{` · ${run.pace}${paceUnit}`}</span>}
                    </span>
                    {structure && <span className="text-[11px] text-ink-faint leading-snug">{structure}</span>}
                    {programHref && (
                      <Link to={programHref} className="text-[11px] text-info hover:underline w-fit">
                        View run details →
                      </Link>
                    )}
                  </span>
                );
              })(),
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
                ? "Overreaching flagged (HRV down / RHR up). The engine forced recovery, honor it."
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
            <span>Logged today, nice work.</span>
            <Link
              to="/quick-workout"
              state={{ prescribedSession: { title: titleText, exercises: prescribedExercises } }}
              className="ml-auto -my-2 min-h-[44px] flex items-center text-brand font-semibold whitespace-nowrap"
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
          <button type="button" onClick={() => beginSession("/quick-workout")} className="cta-ghost mt-3.5 w-full">
            Log a workout
          </button>
        )}

        {/* Pre-train check-in + Begin Session — carry the prescribed lifts AND
            the pre-train note into the logger (saved as a PRE: session note). */}
        {!isRest && !loggedToday && (
          <>
            <button
              type="button"
              onClick={() => beginSession(programHref || "/quick-workout", programHref ? undefined : {
                prescribedSession: { title: titleText, exercises: prescribedExercises },
                preNote: preNote.trim() || undefined,
              })}
              className={`${demoteCta ? "cta-ghost" : "cta-action"} w-full mt-3.5`}
            >
              Begin Session
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3.5 2.5v9l8-4.5-8-4.5Z" fill="currentColor"/></svg>
            </button>
            {strength.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setNoteOpen((o) => !o)}
                  className="w-full flex items-center gap-1.5 section-label min-h-[44px] py-2 text-muted-2 hover:text-ink-secondary transition-colors duration-200 [transition-timing-function:var(--ease)]"
                  aria-expanded={noteOpen}
                  aria-controls="pre-train-note"
                >
                  {preNote.trim() ? <Check className="w-3 h-3 text-leaf" /> : <Plus className="w-3 h-3" />}
                  {preNote.trim() ? "Pre-train note added" : "Add a note"}
                  <ChevronDown
                    className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 [transition-timing-function:var(--ease)] ${noteOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {noteOpen && (
                  <textarea
                    id="pre-train-note"
                    value={preNote}
                    onChange={(e) => setPreNote(e.target.value)}
                    rows={2}
                    autoFocus
                    placeholder="Anything to flag before you train? sleep, soreness, energy…"
                    className="w-full glass-inset rise-in px-3 py-2 mt-1 text-[13px] text-ink placeholder:text-faint resize-none focus-visible:ring-1 focus-visible:ring-brand"
                  />
                )}
              </div>
            )}
          </>
        )}
        {checkinGateSheet}
    </div>
  );
}
