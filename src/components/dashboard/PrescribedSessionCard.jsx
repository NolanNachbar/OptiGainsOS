import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  Cpu, Dumbbell, Activity, Waves, Zap, ChevronRight, AlertTriangle, Check, Circle,
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

function intensityBadge(intensity) {
  if (intensity == null) return null;
  if (intensity >= 1.05) return { label: `Push ${intensity.toFixed(2)}×`, cls: "text-emerald-400 bg-emerald-500/10" };
  if (intensity < 0.85) return { label: `Back off ${intensity.toFixed(2)}×`, cls: "text-amber-400 bg-amber-500/10" };
  return { label: `${Number(intensity).toFixed(2)}×`, cls: "text-slate-300 bg-white/5" };
}

function ExerciseRow({ ex }) {
  const reps = ex.reps ?? ex.rep_target;
  const rir = ex.rir ?? ex.rir_target;
  const load = ex.load_lbs;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-white/[6%] last:border-0">
      <span className="text-sm text-white truncate">{ex.name}</span>
      <span className="text-[11px] font-technical text-slate-400 shrink-0 whitespace-nowrap">
        {ex.sets}×{reps}
        {rir != null && <span className="text-slate-600"> @{rir} RIR</span>}
        {load > 0 && <span className="text-brand ml-1.5">{load} lb</span>}
      </span>
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
      className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
        done ? "bg-emerald-500 text-white" : "text-slate-600 hover:text-slate-300"
      }`}
      aria-pressed={done}
      aria-label={done ? "Mark conditioning not done" : "Mark conditioning done"}
    >
      {done ? <Check className="w-3 h-3" /> : <Circle className="w-4 h-4" />}
    </button>
  );
}

export default function PrescribedSessionCard({ today }) {
  const { prescription } = useTodayPrescription(today);
  const { isDone, toggle } = useCardioCompletions(today);
  const { match: garminMatch } = useTodayGarminCardio(today);
  if (!prescription) return null;

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
  const wPst = prescription.w_pst != null ? Math.round(Number(prescription.w_pst) * 100) : null;
  const wStr = prescription.w_str != null ? Math.round(Number(prescription.w_str) * 100) : null;

  const titleText = action === "REST"
    ? "Rest Day"
    : `${ACTION_LABEL[action] || titleCase(action)}${p.split ? ` — ${titleCase(p.split)}` : ""}`;

  const calItems = Object.entries(cal).filter(([, v]) => v && (v.sets || v.reps_each));
  const isRest = action === "REST";

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
          <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center" title="Auto-detected from Garmin">
            <Check className="w-3 h-3" />
          </span>
        ) : (
          <CardioDoneToggle done={manualDone} onToggle={() => toggle(name)} />
        )}
        {icon}
        <span className={done ? "text-slate-500 line-through" : "text-white"}>{label}</span>
        {g && (
          <span className="ml-auto text-[11px] font-technical text-emerald-400 whitespace-nowrap">
            {mi(g.distance_meters) ? `${mi(g.distance_meters)} mi` : "done"}
            {mmss(g.duration_seconds) ? ` · ${mmss(g.duration_seconds)}` : ""}
            <span className="text-slate-600"> · Garmin</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <Card className="glass-elevated border-brand/20">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-4 h-4 text-brand" />
          <span className="text-[10px] uppercase tracking-widest text-brand font-bold">Engine Prescription</span>
          {iBadge && (
            <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${iBadge.cls}`}>
              {iBadge.label}
            </span>
          )}
        </div>

        {/* Title + rationale */}
        <h3 className="text-lg font-bold text-white leading-tight">{titleText}</h3>
        {prescription.rationale && (
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{prescription.rationale}</p>
        )}

        {/* Deadline weighting + anabolic window — the "why today looks like this" line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px]">
          {wPst != null && wStr != null && (
            <span className="text-slate-500">
              Focus split <span className="font-technical text-slate-300">{wPst}% conditioning · {wStr}% strength</span>
            </span>
          )}
          {interference.anabolic_window && !isRest && (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <Zap className="w-3 h-3" /> Anabolic window open — lift now
            </span>
          )}
          {interference.interference_level === "HIGH" && (
            <span className="text-amber-400 font-semibold">High interference — protect the lift</span>
          )}
        </div>

        {/* Strength block */}
        {strength.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              <Dumbbell className="w-3 h-3" /> Lifts
            </div>
            <div>
              {strength.map((ex, i) => <ExerciseRow key={i} ex={ex} />)}
            </div>
          </div>
        )}

        {/* Calisthenics */}
        {calItems.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              <Activity className="w-3 h-3" /> Calisthenics
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {calItems.map(([name, v]) => (
                <span key={name} className="text-sm text-white">
                  {titleCase(name)} <span className="text-[11px] font-technical text-slate-400">{v.sets}×{v.reps_each}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Run + Swim — completion driven by actual Garmin activity */}
        {(run || swim) && (
          <div className="mt-3 flex flex-col gap-2">
            {run && renderCardio({
              kind: "run",
              name: `${run.zone} run`,
              icon: <Activity className="w-3.5 h-3.5 text-brand shrink-0" />,
              label: (
                <>
                  {run.zone} run · <span className="font-technical text-slate-300">{run.session_miles} mi</span>
                  {run.pace && <span className="text-slate-500"> · {run.pace}</span>}
                </>
              ),
            })}
            {swim && renderCardio({
              kind: "swim",
              name: `swim ${swim.meters}m`,
              icon: <Waves className="w-3.5 h-3.5 text-sky-400 shrink-0" />,
              label: (
                <>
                  <span className="font-technical text-slate-300">{swim.meters} m</span>
                  {swim.stroke && <span className="text-slate-500"> {swim.stroke}</span>}
                </>
              ),
            })}
          </div>
        )}

        {/* Overreach / interference warnings */}
        {(overreach.overreaching || prescription.interference_warning) && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/[8%] px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              {overreach.overreaching
                ? "Overreaching flagged (HRV down / RHR up). The engine forced recovery — honor it."
                : prescription.interference_warning}
            </p>
          </div>
        )}

        {/* Act on it */}
        {!isRest && (
          <Link to="/quick-workout" className="mt-3 flex items-center justify-center gap-1.5 w-full h-10 rounded-xl bg-brand/10 text-brand text-sm font-semibold hover:bg-brand/15 transition-colors">
            Log this session <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
