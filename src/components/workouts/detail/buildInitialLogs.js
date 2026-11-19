import { getLastExercisePerformance } from "@/utils/exerciseStats";
import { currentE1rm, loadForTarget } from "@/utils/e1rm";
import { blockProgressionWeight, exerciseProgressionWeight, doubleSeed } from "@/utils/progressionRules";
import { applyEquipmentProfile } from "@/utils/equipmentProfile";
import { isRunEx, scaleWeightToReps, parseRepTarget, parseRirFromNotes, parseRirTarget, baseLiftName } from "./workoutDetailUtils";

// Seeds the logger's exercise rows when a logging session starts.
// Extracted verbatim from WorkoutDetail.jsx's init effect (no behavior change).
export function buildInitialLogs({ workout, isProgramSource, programWorkout, enrollment, progressionTargetsMap, allWorkoutLogs, engineByName, todayPrescription, equipmentProfile, weightUnit }) {
  let initialLogs;

    // `sets` arrives in two shapes across sources: a COUNT (number, e.g. seeded
    // templates `sets: 4`) or an ARRAY of set objects (real saved workouts /
    // log format). Array.from({length: <array>}) coerces the array to NaN for
    // length != 1, seeding ZERO rows — so multi-set exercises rendered with
    // nothing to log. Normalize to a count for both init paths.
    const resolveSetCount = (sets, fallback = 3) =>
      Array.isArray(sets) ? (sets.length || fallback) : (Number(sets) || fallback);

    if (isProgramSource && programWorkout?.exercises && enrollment) {
      // Program mode: initialize with set types and target weights
      // The weekly plan is only regenerated on Sunday, so an equipment_profile
      // change mid-week leaves it listing movements the athlete can't perform.
      // The daily engine re-filters against the profile every run, so when
      // today's prescription exists, treat its movement list as authoritative
      // and drop anything the plan still carries that the engine dropped.
      // Guarded on a non-empty block so a missing/failed prescription seeds
      // the full plan rather than an empty session.
      // Filtering only SUBTRACTS, which is right while the engine pinned today
      // to the plan. On a re-planned day it isn't: the plan was written for a
      // full gym, the engine rebuilt the session from what's actually available
      // and SUBSTITUTED (Zercher Squat for a racked squat on a Casper day).
      // Those substitutes are absent from the plan, so subtracting would seed a
      // logger missing exactly the lifts he's about to do. plan_pinned, stamped
      // by session_generator, says which case this is. The engine's rows use
      // reps/rir where the plan uses rep_target/rir_target, so reshape rather
      // than special-case the seeding below. Runs live in the plan only and are
      // carried through untouched.
      const engineReplanned =
        todayPrescription?.prescription?.plan_pinned === false && engineByName.size > 0;
      const asPlanShape = (ex) => ({
        ...ex,
        rep_target: ex.rep_target ?? ex.reps,
        rir_target: ex.rir_target ?? ex.rir,
        set_scheme: Array.isArray(ex.set_scheme)
          ? ex.set_scheme.map((b) => ({
              ...b,
              rep_target: b.rep_target ?? b.reps,
              rir_target: b.rir_target ?? b.rir,
            }))
          : ex.set_scheme,
      });
      const engineSelected = engineReplanned
        ? [
            ...(todayPrescription?.prescription?.strength_block || []).map(asPlanShape),
            ...programWorkout.exercises.filter(isRunEx),
          ]
        : engineByName.size > 0
          ? programWorkout.exercises.filter(ex => isRunEx(ex) || engineByName.has(ex.name))
          : programWorkout.exercises;
      // The header renders the substituted list; seed the logger from the same
      // one or the cards would still show the racked squat on a Casper day.
      // A no-op when the engine already re-planned around the profile, since
      // what it picked is by definition something the profile can run.
      const engineFiltered = applyEquipmentProfile(engineSelected, equipmentProfile).exercises;
      initialLogs = engineFiltered.filter(ex => !isRunEx(ex)).map((ex, index) => {
        // The plan's set_scheme carries no load_lbs — it's the static weekly
        // shape, not the day's autoregulated numbers. Match today's engine row
        // (training_prescription.strength_block) by set_type so real e1RM-based
        // loads seed the session instead of a from-history Epley guess.
        // Keyed by label first: two blocks (e.g. "Back-off Vol" / "Back-off Int")
        // can share set_type "backoff", and keying on set_type alone would
        // collapse them so the last one's load wins for both.
        const engineBlocksByLabel = new Map(
          (engineByName.get(ex.name)?.set_scheme || []).map((b) => [b.label || b.set_type, b])
        );
        const targets = progressionTargetsMap[ex.name];
        const numSets = resolveSetCount(ex.sets);

        // Get last performance for autofill. A merged lift is logged under its
        // base name ("Bench Press") but everything before the merge was logged
        // under the variant names it was built from, so fall back to those —
        // otherwise every merged lift shows an empty history and seeds at zero.
        const lastPerf = getLastExercisePerformance(allWorkoutLogs, ex.name)
          || (ex.components || []).reduce(
               (found, c) => found || getLastExercisePerformance(allWorkoutLogs, c), null);

        const loadStep = weightUnit === 'kg' ? 2.5 : 5;
        const e1 = currentE1rm(allWorkoutLogs, ex.name, { components: ex.components || [], anchor: ex.e1rm_anchor });
        const e1Load = (reps, rir) => loadForTarget(e1, reps, parseRirTarget(rir), loadStep);
        const targetReps = parseRepTarget(ex.rep_target);
        // Double progression: prefill per-set rep targets (last reps + 1, or lo after a weight jump).
        const dSeed = !ex.set_scheme && ex.progression?.type === 'double'
          ? doubleSeed(allWorkoutLogs, ex) : null;
        const scaledWeight = lastPerf?.lastWeight && lastPerf?.lastReps
          ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, targetReps)
          : lastPerf?.lastWeight || 0;

        // A lift the engine merged (heavy top set, then back-offs) arrives as ONE
        // exercise carrying a set_scheme: blocks of sets that each have their own
        // reps, RIR and load. Seed straight from the blocks so the card shows the
        // prescription as written instead of flattening it to one uniform target.
        // Everything else has no scheme and keeps the uniform seed.
        const scheme = Array.isArray(ex.set_scheme) ? ex.set_scheme : null;
        const sets = scheme
          ? scheme.flatMap((block) => {
              const blockReps = parseRepTarget(block.rep_target ?? ex.rep_target);
              const engineBlock = engineBlocksByLabel.get(block.label || block.set_type)
                || engineBlocksByLabel.get(block.set_type);
              const blockWeight = engineBlock?.load_lbs
                || block.load_lbs
                || blockProgressionWeight(allWorkoutLogs, ex, block)
                || e1Load(blockReps, block.rir_target ?? ex.rir_target)
                || (lastPerf?.lastWeight && lastPerf?.lastReps
                    ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, blockReps)
                    : targets?.workingWeight || scaledWeight);
              return Array.from({ length: Number(block.sets) || 1 }, () => ({
                reps: blockReps,
                weight: blockWeight,
                completed: false,
                rpe: null,
                rir: null, // never prefill the target as a logged value
                rir_target: block.rir_target ?? ex.rir_target ?? null,
                set_type: block.set_type || 'working',
                set_label: block.label || null,
              }));
            }).map((s, setIndex) => ({ ...s, set_number: setIndex + 1 }))
          // All sets default to working type at working weight
          : Array.from({ length: numSets }, (_, setIndex) => ({
              set_number: setIndex + 1,
              reps: dSeed?.reps[setIndex] ?? targetReps,
              weight: exerciseProgressionWeight(allWorkoutLogs, ex)
                || e1Load(targetReps, ex.rir_target) || targets?.workingWeight || scaledWeight,
              completed: false,
              rpe: null,
              rir: null, // never prefill the target as a logged value
              rir_target: ex.rir_target ?? null,
              set_type: 'working',
            }));

        return {
          name: ex.name,
          exercise_index: index,
          sets,
        };
      });
    } else {
      // Standard mode: autofill with last used weight, scaled to target reps via Epley.
      // Two passes: first compute each exercise's own-history suggestion, then
      // derive back-off weights from the SAME DAY's top set instead of the
      // back-off's own logged history. History-based back-off fill self-
      // perpetuates bad data (a back-off once logged at top-set weight keeps
      // getting suggested at top-set weight forever); anchoring to the top
      // set's e1RM with the back-off's reps+RIR gives the intended drop
      // (e.g. top 3@RIR2 vs back-off 5@RIR3 → ~92% of top weight).
      const suggestions = workout.exercises?.map((exercise) => {
        const lastPerf = getLastExercisePerformance(allWorkoutLogs, exercise.name);
        const targetReps = parseRepTarget(exercise.reps);
        const weight = loadForTarget(
            currentE1rm(allWorkoutLogs, exercise.name),
            targetReps, parseRirFromNotes(exercise.notes) || null, weightUnit === 'kg' ? 2.5 : 5)
          || (lastPerf?.lastWeight && lastPerf?.lastReps
            ? scaleWeightToReps(lastPerf.lastWeight, lastPerf.lastReps, targetReps)
            : lastPerf?.lastWeight || 0);
        return { exercise, targetReps, weight };
      }) || [];

      for (const s of suggestions) {
        if (!/\(back-?off/i.test(s.exercise.name)) continue;
        const top = suggestions.find(
          (t) => t !== s &&
            /\(top set\)/i.test(t.exercise.name) &&
            baseLiftName(t.exercise.name) === baseLiftName(s.exercise.name)
        );
        if (!top?.weight) continue;
        const topE1rm = top.weight * (1 + 0.0333 * (top.targetReps + parseRirFromNotes(top.exercise.notes)));
        const boPct = 1 + 0.0333 * (s.targetReps + parseRirFromNotes(s.exercise.notes));
        s.weight = Math.round((topE1rm / boPct) / 2.5) * 2.5;
      }

      initialLogs = suggestions.map((s, index) => ({
        name: s.exercise.name,
        exercise_index: index,
        sets: Array.from({ length: resolveSetCount(s.exercise.sets) }, (_, setIndex) => ({
          set_number: setIndex + 1,
          reps: s.targetReps,
          weight: s.weight,
          completed: false,
          rpe: null,
          set_type: 'working',
        })),
      }));
    }

  return initialLogs;
}
