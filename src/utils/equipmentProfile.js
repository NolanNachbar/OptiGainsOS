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

/** The replacement for one exercise name under a profile, or null to keep it. */
export function substituteFor(name, profileName) {
  const prof = EQUIPMENT.profiles?.[profileName || "full_gym"];
  if (!prof || !prof.available) return null;
  const key = EQUIPMENT.index?.[norm(name)];
  if (!key) return null;
  return prof.blocked?.[key] || null;
}

export function isBlocked(name, profileName) {
  return substituteFor(name, profileName) !== null;
}

/**
 * Rewrite an exercise list for a profile.
 * Returns { exercises, swaps: [{ from, to }] }. The set/rep prescription rides
 * along unchanged — the swap is a movement substitution, not a new session, so
 * the volume he was going to do is the volume he does.
 * A substitute already in the list is dropped rather than duplicated.
 */
export function applyEquipmentProfile(exercises, profileName) {
  const list = Array.isArray(exercises) ? exercises : [];
  const prof = EQUIPMENT.profiles?.[profileName || "full_gym"];
  if (!prof || !prof.available) return { exercises: list, swaps: [] };

  const swaps = [];
  const present = new Set(list.map((ex) => norm(ex?.name)));
  const out = [];
  for (const ex of list) {
    const to = substituteFor(ex?.name, profileName);
    if (!to) {
      out.push(ex);
      continue;
    }
    swaps.push({ from: ex.name, to });
    if (present.has(norm(to))) continue;
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
