import { Activity } from "lucide-react";
import { isRunEx } from "./workoutDetailUtils";

// Extracted from WorkoutDetail.jsx (no behavior change).
const CARDIO_TYPE_LABEL = {
  interval: "Intervals", threshold: "Threshold", tempo: "Tempo",
  long: "Long run", easy: "Easy run", recovery: "Recovery run",
};
const cardioStructure = (notes) => String(notes || "").replace(/^Garmin\s+[^.]*\.\s*/i, "").trim();

// Renders a program day's conditioning (run/swim) sessions. Reads the real
// cardio_sessions shape (activity_type / run_type / zone / duration_minutes /
// pace / notes) plus any run-named exercises. Shared by logging + view mode so
// the run detail — type, pace, and rep structure — is visible either way.
export default function CardioSessions({ programWorkout }) {
  const runExercises = (programWorkout?.exercises || []).filter(isRunEx).map((ex) => ({
    _name: ex.name, run_type: ex.run_type || null, zone: ex.zone || null,
    duration_minutes: ex.duration_minutes || null, time_of_day: ex.time_of_day || null,
    pace: ex.pace || null, notes: ex.notes || null,
  }));
  const allCardio = [...runExercises, ...(programWorkout?.cardio_sessions || [])];
  if (allCardio.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="section-label">Conditioning</p>
      {allCardio.map((c, i) => {
        const rtype = String(c.run_type || "").toLowerCase();
        const name = c._name || CARDIO_TYPE_LABEL[rtype] || (c.zone ? `${c.zone} ${c.activity_type || "run"}` : "Run");
        const structure = cardioStructure(c.notes);
        const meta = [
          c.duration_minutes ? `${c.duration_minutes} min` : null,
          c.pace ? `${c.pace}${/^\d+:\d{2}$/.test(String(c.pace)) ? "/mi" : ""}` : null,
          c.zone || null,
          c.time_of_day && c.time_of_day !== "anytime" ? c.time_of_day.toUpperCase() : null,
        ].filter(Boolean).join(" · ");
        return (
          <div key={`cardio-${i}`} className="flex items-start justify-between px-3.5 py-3 glass-inset">
            <div className="flex items-start gap-2.5">
              <Activity className="w-4 h-4 text-carb mt-0.5 shrink-0" />
              <div>
                <p className="text-body font-bold text-ink">{name}</p>
                {meta && <p className="font-technical text-caption font-semibold text-ink-muted">{meta}</p>}
                {structure && <p className="text-caption text-ink-muted mt-0.5 leading-snug">{structure}</p>}
              </div>
            </div>
            <span className="text-micro text-ink-muted border border-charcoal-border rounded-full px-2.5 py-1 shrink-0">Cardio</span>
          </div>
        );
      })}
    </div>
  );
}
