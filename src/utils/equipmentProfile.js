// equipmentProfile.js — run a workout with the equipment that's actually there.
//
// The engine already does this for the day it plans: mpc_prescriber applies the
// profile and session_generator re-plans around what's missing. A workout run
// straight from the library never goes through the engine, so it arrived with a
// racked squat and a cable pushdown on a day there's no rack and no cable.
//
// The rules live in Python (scripts/engine/equipment_profiles.py); this reads
// the table emitted from it. Nothing is decided here — the lookup is
// lowercase-and-collapse, and a name the table doesn't carry passes through
// untouched, which is the same fail-open the engine uses: a wrong pass-through
// is one swap he makes himself, a wrong block is a gutted session.
import EQUIPMENT from "@/data/equipmentProfiles.json";

const norm = (s) => String(s || "").toLowerCase().split(/\s+/).join(" ").trim();

/** Every replacement this profile can run for one name, best first. */
export function substitutesFor(name, profileName) {
  const prof = EQUIPMENT.profiles?.[profileName || "full_gym"];
  if (!prof || !prof.available) return [];
  const key = EQUIPMENT.index?.[norm(name)];
  if (!key) return [];
  const list = prof.blocked?.[key];
  if (!list) return [];
  return Array.isArray(list) ? list : [list];
}

/** The replacement for one exercise name under a profile, or null to keep it. */
export function substituteFor(name, profileName) {
  const key = EQUIPMENT.index?.[norm(name)];
  if (!key) return null;
  const prof = EQUIPMENT.profiles?.[profileName || "full_gym"];
  if (!prof || !prof.available || !(key in (prof.blocked || {}))) return null;
  return substitutesFor(name, profileName)[0] || null;
}

export function isBlocked(name, profileName) {
  const prof = EQUIPMENT.profiles?.[profileName || "full_gym"];
  if (!prof || !prof.available) return false;
  const key = EQUIPMENT.index?.[norm(name)];
  return !!key && key in (prof.blocked || {});
}

/**
 * Rewrite an exercise list for a profile.
 * Returns { exercises, swaps: [{ from, to }] }. The set/rep prescription rides
 * along unchanged — the swap is a movement substitution, not a new session, so
 * the volume he was going to do is the volume he does.
 * When the best substitute is already in the list the next one down is taken,
 * so two blocked lifts sharing a top pick still come back as two movements.
 */
export function applyEquipmentProfile(exercises, profileName) {
  const list = Array.isArray(exercises) ? exercises : [];
  const prof = EQUIPMENT.profiles?.[profileName || "full_gym"];
  if (!prof || !prof.available) return { exercises: list, swaps: [] };

  const swaps = [];
  const present = new Set(list.map((ex) => norm(ex?.name)));
  const out = [];
  for (const ex of list) {
    if (!isBlocked(ex?.name, profileName)) {
      out.push(ex);
      continue;
    }
    const options = substitutesFor(ex?.name, profileName);
    const to = options.find((c) => !present.has(norm(c)));
    if (!to) {
      // Nothing left this profile can run that isn't already programmed.
      swaps.push({ from: ex.name, to: options[0] || null });
      continue;
    }
    swaps.push({ from: ex.name, to });
    present.add(norm(to));
    out.push({ ...ex, name: to, _substituted_from: ex.name });
  }
  return { exercises: out, swaps };
}

/** Same, applied to a whole workout object. Safe on null. */
export function applyEquipmentProfileToWorkout(workout, profileName) {
  if (!workout) return { workout, swaps: [] };
  const { exercises, swaps } = applyEquipmentProfile(workout.exercises, profileName);
  if (!swaps.length) return { workout, swaps };
  return { workout: { ...workout, exercises }, swaps };
}

export const EQUIPMENT_PROFILE_LABELS = {
  full_gym: "Full gym",
  casper: "Casper",
};
