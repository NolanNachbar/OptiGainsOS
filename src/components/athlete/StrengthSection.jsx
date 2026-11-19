import { AlertTriangle } from "lucide-react";
import { StallBadge } from "./athleteShared";
import { isStalled } from "./athleteUtils";

// ── Strength section ──────────────────────────────────────────────────────────

export default function StrengthSection({ data }) {
  // Only per-lift objects ({current_e1rm, target, stall_risk, ...}) are renderable.
  // Flat scalar shapes (e.g. {bench_1rm: 245} from a legacy/seed row) would render
  // as empty "Bench_1rm — lb" rows, so treat anything non-object as "no data".
  const liftKeys = data ? Object.keys(data).filter((k) => data[k] && typeof data[k] === "object") : [];
  if (liftKeys.length === 0) {
    return <p className="text-xs font-semibold text-muted-2">No strength data yet. Log workouts with key lifts to see estimates.</p>;
  }

  const LIFT_ORDER = ["Bench (paused comp)", "Squat (comp)", "Deadlift (conventional comp)"];
  const LIFT_LABEL = {
    "Bench (paused comp)": "bench",
    "Squat (comp)": "squat",
    "Deadlift (conventional comp)": "deadlift",
  };
  const sorted = LIFT_ORDER.filter(k => liftKeys.includes(k)).concat(liftKeys.filter(k => !LIFT_ORDER.includes(k)));

  return (
    <div>
      {sorted.map(lift => {
        const d = data[lift];
        const pct = d.target ? Math.min((d.current_e1rm / d.target) * 100, 100) : null;
        return (
          <div key={lift} className="py-2 border-t hairline first:border-t-0 first:pt-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-extrabold text-ink capitalize whitespace-nowrap">{LIFT_LABEL[lift] ?? lift}</span>
                <StallBadge risk={d.stall_risk} rate={d.progression_rate_lbs_per_week} />
              </div>
              <span className="font-technical text-xs font-bold text-muted-2 whitespace-nowrap">
                {d.current_e1rm}{d.target ? ` / ${d.target}` : ""} lb
                {d.eta_days != null && d.eta_days > 0 && ` · ETA ${d.eta_days}d`}
                {d.eta_days === 0 && " · target reached"}
              </span>
            </div>
            {pct != null && (
              <div className="h-1.5 bg-track rounded-full overflow-hidden mt-1.5">
                {/* Teal data-hue fill encodes progress-to-target so the bar reads
                    as a measure, not decoration. Here teal is used as the
                    data/positive hue; the single action color is off-white
                    (var(--color-brand) #ECEEF1), reserved for actual controls and
                    never spent on this readout. The fill width itself
                    differentiates each lift's ratio. Stall state stays on the
                    StallBadge, so no threshold tinting here. */}
                <div
                  className="h-full rounded-full bg-teal transition-[width] duration-200 ease-[var(--ease)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            <div className="flex items-center gap-3 font-technical text-caption font-semibold text-muted-2 mt-1">
              {d.progression_rate_lbs_per_week !== 0 && (
                <span className={d.progression_rate_lbs_per_week > 0 ? "text-teal" : "text-muted-2"}>
                  {d.progression_rate_lbs_per_week > 0 ? "+" : ""}{d.progression_rate_lbs_per_week} lbs/wk
                </span>
              )}
              {d.eta_days === 0 && <span className="text-teal">Target reached.</span>}
              <span>{d.sessions} sessions</span>
              {(() => {
                const cmd = d.progression_command;
                if (!cmd || cmd === "HOLD") return null;
                // A stalled lift can't honestly be told to add load: the badge and
                // the chip would contradict. Show the stall verdict instead.
                const stalled = isStalled(d.stall_risk, d.progression_rate_lbs_per_week);
                const text = stalled && cmd === "INCREASE_LOAD"
                  ? "Hold load until e1RM recovers"
                  : ({
                      INCREASE_LOAD: "Add load next session",
                      DELOAD: "Deload next session",
                      SWAP_EXERCISE: "Swap exercise",
                    }[cmd] ?? cmd);
                return (
                  // Non-imperative status chip so the verdict reads as state, not a CTA.
                  <span className="bg-charcoal-surface2 rounded-control px-2 py-0.5 text-caption font-semibold text-muted-2">
                    {text}
                  </span>
                );
              })()}
            </div>
            {d.progression_command && d.progression_command !== "HOLD" && (
              <p className="text-caption font-semibold text-faint mt-1 leading-snug">
                Basis: e1RM trend {d.progression_rate_lbs_per_week > 0 ? "+" : ""}{d.progression_rate_lbs_per_week ?? 0} lbs/wk over {d.sessions} sessions
                {d.stall_risk != null && `, stall risk ${Math.round(d.stall_risk * 100)}%`}.
              </p>
            )}
            {d.swap_suggestion && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-warn/10 border border-warn/20 px-2.5 py-2">
                <AlertTriangle className="w-3 h-3 text-warn shrink-0 mt-0.5" />
                <span className="text-caption font-semibold text-warn/90 leading-snug">
                  {d.swap_suggestion}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Hypertrophy section ───────────────────────────────────────────────────────
