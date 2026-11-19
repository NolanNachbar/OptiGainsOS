import { filterPill } from "../filterPill";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Dumbbell, BookOpen, Activity, Waves, Bike, Footprints, Rows3, Repeat, AlertTriangle } from "lucide-react";
import { parseISO } from "date-fns";
import { workSets } from "@/utils/setTypes";

// Extracted from pages/Workouts.jsx (no behavior change).

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtPace(metersPerSecond, type, avgPaceSecPerKm) {
  // Use pre-computed pace from Garmin if available
  if (avgPaceSecPerKm && ['running', 'walking', 'hiking'].includes(type)) {
    const minPerMile = (avgPaceSecPerKm * 1.60934) / 60;
    const min = Math.floor(minPerMile);
    const sec = Math.round((minPerMile - min) * 60);
    return `${min}:${sec.toString().padStart(2, '0')} /mi`;
  }
  // Fallback: compute from speed
  if (!metersPerSecond || !['running', 'walking', 'hiking'].includes(type)) return null;
  const minPerMile = (1609.34 / metersPerSecond) / 60;
  const min = Math.floor(minPerMile);
  const sec = Math.round((minPerMile - min) * 60);
  return `${min}:${sec.toString().padStart(2, '0')} /mi`;
}

function fmtDistance(meters) {
  if (!meters) return null;
  const miles = meters / 1609.34;
  return miles >= 0.05 ? `${miles.toFixed(2)} mi` : null;
}

function dayLabel(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  if (d.getTime() === today.getTime()) return `TODAY, ${fmt}`;
  if (d.getTime() === yesterday.getTime()) return `YESTERDAY, ${fmt}`;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}

function groupByDay(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const label = dayLabel(entry.date);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

// ─── Entry cards ─────────────────────────────────────────────────────────────

function StrengthEntryCard({ entry }) {
  // ONE dominant datum (train-activity-3): the heaviest signal of the session
  // (Volume when logged, else Sets, else Exercises) reads as a hero figure in
  // the header; everything else is a subordinate caption. Below it, a STABLE
  // 4-cell scaffold (train-activity-5) — Exercises / Sets / Volume / Duration
  // always render in the same columns, missing values shown as a faint em-dash —
  // so today's freshly-logged entry never reflows as stats fill in.
  const hero = entry.volume
    ? { label: 'Volume', value: Math.round(entry.volume).toLocaleString(), suffix: 'lbs' }
    : entry.sets > 0
      ? { label: 'Sets', value: entry.sets }
      : { label: 'Exercises', value: entry.exerciseCount };

  const cells = [
    { label: 'Exercises', value: entry.exerciseCount || '—' },
    { label: 'Sets', value: entry.sets > 0 ? entry.sets : '—' },
    { label: 'Volume', value: entry.volume ? Math.round(entry.volume).toLocaleString() : '—', suffix: entry.volume ? 'lbs' : null },
    { label: 'Duration', value: entry.duration || '—' },
  ];

  const body = (
    <>
      <div className="flex items-center p-4 pb-3 gap-3">
        <div className="w-9 h-9 rounded-full bg-track flex items-center justify-center shrink-0 text-ink-muted">
          <Dumbbell className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-semibold text-ink truncate">{entry.title}</h4>
          <span className="section-label">{hero.label}</span>
        </div>
        {/* Dominant figure — the row's one hero metric. */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="font-technical font-numeral text-[28px] leading-none text-ink whitespace-nowrap">{hero.value}</span>
          {hero.suffix && <span className="text-[11px] text-ink-muted uppercase">{hero.suffix}</span>}
        </div>
      </div>
      {/* Stable 4-cell scaffold. Dividers derive from grid position so a wrapped
          row never leaves an orphaned left hairline. Subordinate to the hero:
          smaller values, so the header figure stays dominant. */}
      <div className="grid grid-cols-4 gap-y-3 px-4 pb-4 border-t hairline pt-3">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={`flex flex-col ${i % 4 !== 0 ? 'border-l hairline pl-4' : ''}`}
          >
            <span className="section-label">{cell.label}</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`font-technical font-bold text-[15px] whitespace-nowrap ${cell.value === '—' ? 'text-ink-faint' : 'text-ink-secondary'}`}>{cell.value}</span>
              {cell.suffix && <span className="text-[11px] text-ink-muted uppercase">{cell.suffix}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
  // Only link when the source workout still exists; otherwise render a static,
  // de-emphasised tile so it doesn't read as a tappable button.
  if (entry.workoutId) {
    return (
      <Link
        to={`/workout-detail?id=${entry.workoutId}`}
        className="block relative overflow-hidden tile tile-interactive transition-transform duration-200 ease-[var(--ease)] active:scale-[0.99]"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="relative overflow-hidden tile">
      {body}
    </div>
  );
}

function ActivityTypeIcon({ type, className = "w-4 h-4" }) {
  const props = { className };
  switch (type) {
    case 'running':    return <Footprints {...props} />;
    case 'swimming':   return <Waves {...props} />;
    case 'cycling':    return <Bike {...props} />;
    case 'walking':    return <Footprints {...props} />;
    case 'hiking':     return <Footprints {...props} />;
    case 'rowing':     return <Rows3 {...props} />;
    case 'elliptical': return <Repeat {...props} />;
    case 'strength':   return <Dumbbell {...props} />;
    default:           return <Activity {...props} />;
  }
}

function CardioEntryCard({ entry }) {
  const typeLabel = entry.activityType
    ? entry.activityType.charAt(0).toUpperCase() + entry.activityType.slice(1)
    : 'Cardio';
  const distance = fmtDistance(entry.distance);
  const duration = fmtDuration(entry.movingTime);
  const pace = fmtPace(entry.avgSpeed, entry.activityType, entry.avgPaceSecPerKm);

  // ONE dominant datum to mirror the strength row (train-activity-3): Distance
  // leads when present, else Time, else Avg HR. The rest become subordinate cells.
  const hero = distance
    ? { label: typeLabel, value: distance }
    : duration
      ? { label: typeLabel, value: duration }
      : entry.avgHeartrate
        ? { label: typeLabel, value: Math.round(entry.avgHeartrate), suffix: 'bpm' }
        : { label: typeLabel, value: '—' };

  // Build only the cells we have, then drive dividers off grid position so a
  // 3-col grid never leaves orphaned left hairlines on wrapped rows.
  const cells = [];
  if (duration) cells.push({ label: 'Time', value: duration });
  if (pace) cells.push({ label: 'Pace', value: pace });
  if (entry.avgHeartrate) cells.push({ label: 'Avg HR', value: Math.round(entry.avgHeartrate), suffix: 'bpm' });
  if (entry.aerobicEffect != null) cells.push({ label: 'Aerobic Effect', value: Number(entry.aerobicEffect).toFixed(1) });

  return (
    <div className="tile">
      <div className="flex items-center p-4 pb-3 gap-3">
        <div className="w-9 h-9 rounded-full bg-carb/15 flex items-center justify-center shrink-0 text-carb">
          <ActivityTypeIcon type={entry.activityType} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-semibold text-ink truncate">{entry.title}</h4>
          <p className="section-label">{hero.label}</p>
        </div>
        {/* Dominant figure — the row's one hero metric. */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="font-technical font-numeral text-[28px] leading-none text-ink whitespace-nowrap">{hero.value}</span>
          {hero.suffix && <span className="text-[11px] text-ink-muted uppercase">{hero.suffix}</span>}
        </div>
      </div>

      {cells.length > 0 && (
        <div className="grid grid-cols-3 gap-y-3 px-4 pb-4 border-t hairline pt-3">
          {cells.map((cell, i) => (
            <div
              key={cell.label}
              className={`flex flex-col ${i % 3 !== 0 ? 'border-l hairline pl-4' : ''}`}
            >
              <span className="section-label">{cell.label}</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-technical font-bold text-[15px] text-ink-secondary">{cell.value}</span>
                {cell.suffix && <span className="text-[11px] text-ink-muted uppercase">{cell.suffix}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity Log Tab ────────────────────────────────────────────────────────

export function ActivityLogTab({ workoutLogs, cardioSessions, workouts, isLoading, error, onRetry }) {
  const [filter, setFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(8);

  if (isLoading) {
    // Skeletons mirror the real surfaces they stand in for: the weekly summary is
    // .glass-elevated, each entry is a .tile (train-activity-4) — not raw bg-track
    // boxes — so the loading state reads as the page's own scaffold dimming in.
    return (
      <div className="space-y-3">
        <div className="h-20 glass-elevated rounded-[20px] pulse-loop" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 tile pulse-loop" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="tile px-4 py-8 text-center">
        <AlertTriangle className="w-10 h-10 text-warn mx-auto mb-3" />
        <h3 className="text-base font-semibold text-ink mb-1">Couldn't load your activity</h3>
        <p className="text-sm text-ink-muted mb-4">Something went wrong fetching your workout history.</p>
        <Button variant="outline" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  const strengthEntries = workoutLogs.map(log => {
    const workout = workouts.find(w => w.id === log.workout_id);
    const logExercises = log.exercises || [];
    const totalSets = logExercises.reduce((sum, ex) => {
      if (Array.isArray(ex.sets)) return sum + workSets(ex.sets).length;
      return sum + (Number(ex.sets) || 0);
    }, 0);
    const totalVolume = logExercises.reduce((sum, ex) => {
      if (!Array.isArray(ex.sets)) return sum;
      return sum + workSets(ex.sets).reduce((s, set) => s + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
    }, 0);
    // Distinct titles: when the source workout is gone (or never had a name),
    // derive a title from the logged content (lead exercise + count) so stacked
    // rows don't all read as the generic 'Workout'.
    const leadExercise = logExercises[0]?.name;
    const derivedTitle = leadExercise
      ? `${leadExercise}${logExercises.length > 1 ? ` +${logExercises.length - 1}` : ''}`
      : 'Strength session';
    return {
      type: 'strength',
      id: log.id,
      workoutId: log.workout_id || null,
      date: log.log_date ? parseISO(log.log_date) : new Date(log.created_at),
      title: workout?.title || derivedTitle,
      exerciseCount: logExercises.length,
      exercises: logExercises,
      sets: totalSets,
      // Guard implausible timer data (< 2 min or > 5 h) before surfacing it.
      duration:
        log.duration_seconds && log.duration_seconds >= 120 && log.duration_seconds <= 18000
          ? fmtDuration(log.duration_seconds)
          : null,
      volume: totalVolume > 0 ? totalVolume : null,
    };
  });

  const cardioEntries = cardioSessions.map(session => ({
    type: 'cardio',
    id: session.id,
    date: parseISO(session.activity_date),
    title: session.name || session.activity_type,
    activityType: session.activity_type,
    distance: session.distance_meters,
    movingTime: session.duration_seconds,
    avgSpeed: session.avg_speed_mps,
    avgPaceSecPerKm: session.avg_pace_sec_per_km,
    avgHeartrate: session.avg_hr,
    trainingLoad: session.training_load,
    aerobicEffect: session.aerobic_effect,
    rawSession: session,
  }));

  const allEntries = [
    ...(filter !== 'cardio' ? strengthEntries : []),
    ...(filter !== 'strength' ? cardioEntries : []),
  ].sort((a, b) => b.date - a.date);

  // Weekly summary (last 7 days)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const thisWeek = allEntries.filter(e => e.date >= cutoff);
  const weekStrength = thisWeek.filter(e => e.type === 'strength').length;
  const weekCardio = thisWeek.filter(e => e.type === 'cardio').length;
  const weekMiles = thisWeek
    .filter(e => e.type === 'cardio' && e.distance)
    .reduce((sum, e) => sum + e.distance / 1609.34, 0);

  const grouped = groupByDay(allEntries.slice(0, visibleCount));

  return (
    <>
      {/* Weekly Summary — elevated above the tile feed so it reads as a header,
          not just another entry. */}
      <div className="flex items-stretch gap-4 p-4 glass-elevated rounded-[20px] mb-4">
        {/* Hero: This Week */}
        <div className="flex flex-col justify-center shrink-0 pr-4 border-r hairline">
          <span className="section-label mb-1">This Week</span>
          <span className="hero-metric text-[28px] text-ink">
            {thisWeek.length}<span className="text-[12px] font-semibold text-ink-muted ml-1 align-baseline">sess</span>
          </span>
        </div>
        {/* Secondary cells — no redundant 'sess' suffix (the hero owns the unit). */}
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="flex flex-col justify-center">
            <span className="section-label mb-0.5">Strength</span>
            <span className="font-technical font-bold text-[17px] text-ink">{weekStrength}</span>
          </div>
          <div className="flex flex-col justify-center">
            <span className="section-label mb-0.5">Cardio</span>
            <span className="font-technical font-bold text-[17px] text-ink">{weekCardio}</span>
          </div>
          <div className="flex flex-col justify-center">
            <span className="section-label mb-0.5">Distance</span>
            <span className="font-technical font-bold text-[17px] text-ink">
              {weekMiles > 0 ? weekMiles.toFixed(1) : 0}<span className="text-[12px] font-semibold text-ink-muted ml-1 align-baseline">mi</span>
            </span>
          </div>
        </div>
      </div>

      {/* Filter pills — one non-wrapping row preceding the feed. */}
      <div className="flex flex-nowrap gap-2 mb-4 overflow-x-auto no-scrollbar">
        {[['all', 'All'], ['strength', 'Strength'], ['cardio', 'Cardio']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`shrink-0 ${filterPill(filter === val)}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {allEntries.length === 0 ? (
        <div className="tile px-4 py-8 text-center">
          <Activity className="w-10 h-10 text-ink-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-ink mb-1">No activity yet</h3>
          <p className="text-sm text-ink-muted mb-2">
            {filter === 'cardio'
              ? 'Cardio sessions sync automatically from Garmin each morning.'
              : filter === 'strength'
              ? 'Complete a workout to see it here.'
              : 'Complete workouts, cardio syncs from Garmin overnight.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-[var(--dock-clearance)] md:pb-6">
          {grouped.map(({ label, entries }, i) => (
            // Stagger the first few day groups so the feed cascades in on
            // var(--ease) rather than landing all at once.
            <section key={label} className={`${['rise-in', 'rise-in-2', 'rise-in-3'][Math.min(i, 2)]} ${i > 0 ? 'border-t hairline pt-3' : ''}`}>
              {/* Day header — its own tier (heavier + brighter) so it reads above
                  the in-card stat captions that share .section-label. */}
              <h3 className="section-label !font-extrabold text-ink mb-2.5">{label}</h3>
              <div className="space-y-2">
                {entries.map(entry =>
                  entry.type === 'strength' ? (
                    <StrengthEntryCard key={entry.id} entry={entry} />
                  ) : (
                    <CardioEntryCard
                      key={entry.id}
                      entry={entry}
                    />
                  )
                )}
              </div>
            </section>
          ))}
          {allEntries.length > visibleCount && (
            <div className="flex justify-center pt-4">
              <Button variant="dim" size="lg" className="min-h-[44px] active:scale-[0.97]" onClick={() => setVisibleCount(v => v + 8)}>
                Load <span className="font-technical mx-1">{Math.min(8, allEntries.length - visibleCount)}</span> more
                <span className="ml-1.5 text-ink-faint font-technical">· {allEntries.length - visibleCount} left</span>
              </Button>
            </div>
          )}
        </div>
      )}

    </>
  );
}

// One shared build-out prompt for the Library tab: the same glass card and
// action pair backs both the empty state and the all-shown "fill the void"
// prompt, so the two read as one unit instead of two near-twins.
export function LibraryBuildPrompt({ title, subtitle, showActions = true }) {
  return (
    <div className="glass px-4 py-12 text-center">
      <div className="w-14 h-14 rounded-full bg-track flex items-center justify-center mx-auto mb-4">
        <Dumbbell className="w-7 h-7 text-ink-muted" />
      </div>
      <h3 className="text-base font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-muted mb-5 max-w-xs mx-auto">{subtitle}</p>
      {showActions && (
        <div className="flex justify-center gap-2">
          <Link to="/create-workout">
            <Button variant="primary" className="min-h-[44px] active:scale-[0.97]">
              <Plus className="w-4 h-4 mr-2" />
              Create Custom
            </Button>
          </Link>
          <Link to="/program-builder">
            <Button variant="outline" className="min-h-[44px] active:scale-[0.97]">
              <BookOpen className="w-4 h-4 mr-2" />
              Program Builder
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export function ProgramsEmptyState({ icon: Icon, title, subtitle, action }) {
  // A self-sized empty card (no forced viewport-height floor): icon, copy, and
  // the action stack together with even spacing so the card reads as one compact
  // prompt instead of a tall band with the CTA stranded at the bottom edge. Rises
  // in on the system easing.
  return (
    <div className="rise-in glass px-4 py-12 text-center flex flex-col items-center">
      <div className="w-14 h-14 rounded-full bg-track flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-ink-muted" />
      </div>
      <h3 className="text-base font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-secondary max-w-xs mx-auto">{subtitle}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}