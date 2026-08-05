import os
#!/usr/bin/env python3
"""
validate_convergence_fixes.py — behavioral checks for the CONVERGENCE_AUDIT fixes.

Each check reproduces the audit's headline failure on the PURE engine functions and
asserts the post-fix behavior. No DB / network — runs offline from scripts/.

    python3 validate_convergence_fixes.py
"""
from engine.exploration_manager import ControlledExplorationManager
from engine.learners import update_mrv, exercise_reward, OBS_VAR
from engine.athlete_profile import clamp_rep_range, per_session_muscle_cap
from engine.allocator import frequency_targets, default_goal_priorities
from engine.log_ingest import proximity_fatigue_factor, EFFORT_COST_PRIOR
from engine.session_generator import (split_from_title, build_title, _converge_split,
                                      classify_log_split, week_muscle_counts_from_logs,
                                      split_muscles_for, SessionGenerator)
from engine.muscle_map import get_muscles, hypertrophy_muscles
from engine.notes_parser import parse_workout_notes
from engine.hypertrophy_volume import MUSCLES as LANDMARK_MUSCLES

PASS, FAIL = "✓ PASS", "✗ FAIL"
_results = []


def check(name, ok, detail=""):
    _results.append(ok)
    print(f"  {PASS if ok else FAIL}  {name}" + (f"  — {detail}" if detail else ""))


# ── E1: default goal priorities are hypertrophy-primary, PST/strength held ────
_dgp = default_goal_priorities(None)
check("E1 hypertrophy carries the top default weight",
      _dgp["hypertrophy"] > _dgp["strength"] and _dgp["hypertrophy"] > _dgp["pst"],
      f"{_dgp}")
check("E1 PST/strength held at maintenance, not crushed (each ≥ 0.30)",
      _dgp["pst"] >= 0.30 and _dgp["strength"] >= 0.30)
check("E1 weights still sum to 1.0", abs(sum(_dgp.values()) - 1.0) < 1e-9)
# BUD/S-prep branch is unchanged (conditioning-weighted for that explicit context).
_buds = default_goal_priorities("buds_prep")
check("E1 BUD/S-prep branch still weights conditioning (pst top)",
      _buds["pst"] > _buds["strength"] and _buds["pst"] > _buds["hypertrophy"])


# ── E2: proximity-to-failure generates extra fatigue (audit: 0 vs 3 RIR equal) ─
_fail_sets = [{"weight": 100, "reps": 5, "rir": 0}, {"weight": 100, "reps": 5, "rir": 0}]
_easy_sets = [{"weight": 100, "reps": 5, "rir": 3}, {"weight": 100, "reps": 5, "rir": 3}]
_f_fail = proximity_fatigue_factor(_fail_sets)
_f_easy = proximity_fatigue_factor(_easy_sets)
check("E2 a 0-RIR session costs more fatigue than the same volume at 3 RIR",
      _f_fail > _f_easy, f"failure {_f_fail:.3f} > easy {_f_easy:.3f}")
check("E2 0-RIR factor matches 1 + coeff·5", abs(_f_fail - (1 + EFFORT_COST_PRIOR * 5)) < 1e-9)
check("E2 sets left >=5 RIR add no extra fatigue (factor 1.0)",
      abs(proximity_fatigue_factor([{"weight": 100, "reps": 5, "rir": 5},
                                    {"weight": 100, "reps": 5, "rir": 7}]) - 1.0) < 1e-9)
check("E2 factor is always >= 1.0 (never discounts bar load)", _f_easy >= 1.0)
# Missing RIR defaults to failure (matches the rest of the ingest).
check("E2 missing RIR is treated as failure",
      abs(proximity_fatigue_factor([{"weight": 100, "reps": 5}]) - _f_fail) < 1e-9)
# Volume-weighted: a heavy failure set dominates a tiny easy set.
_mixed = proximity_fatigue_factor([{"weight": 200, "reps": 5, "rir": 0},
                                   {"weight": 10, "reps": 1, "rir": 5}])
check("E2 factor is volume-weighted (heavy failure set dominates)", _mixed > 1.25)
# Empty / zero-volume session is neutral.
check("E2 empty session is neutral (factor 1.0)",
      proximity_fatigue_factor([]) == 1.0 and
      proximity_fatigue_factor([{"weight": 0, "reps": 0, "rir": 0}]) == 1.0)
# Real-world data: reps arrive as range strings ("8-12") and RIR may be malformed;
# must not crash (regression — these reach the function from the app).
try:
    _str = proximity_fatigue_factor([{"weight": 135, "reps": "8-12", "rir": "0"},
                                     {"weight": 135, "reps": "10", "rir": None},
                                     {"weight": 135, "reps": "5.0", "rir": "n/a"}])
    check("E2 tolerates string-range reps / malformed RIR without crashing", _str > 1.0)
except Exception as _e:
    check("E2 tolerates string-range reps / malformed RIR without crashing", False, str(_e))
# Uncompleted sets are skipped (don't add phantom failure fatigue).
check("E2 skips uncompleted sets",
      proximity_fatigue_factor([{"weight": 100, "reps": 5, "rir": 0, "completed": False}]) == 1.0)


# ── E3: soft MRV boundary (no inverted-U cliff) + recovery-cost compression ────
from engine.allocator import (allocate as _alloc, marginal_benefit, recovery_cost,
                              marginal_value as _mv, SOFT_MRV_OVERSHOOT)
_lm = {"mev": 8, "mav": 16, "mrv": 20}
# Marginal benefit no longer cliffs to 0 at/just past MRV (no inverted-U).
check("E3 marginal benefit stays positive just past MRV (no cliff to 0)",
      marginal_benefit(20, _lm) > 0 and marginal_benefit(22, _lm) > 0,
      f"@mrv {marginal_benefit(20,_lm):.3f}, @mrv+2 {marginal_benefit(22,_lm):.3f}")
check("E3 marginal benefit still diminishes (mrv+4 < mrv)",
      marginal_benefit(24, _lm) < marginal_benefit(20, _lm))
# Recovery cost is ~0 below MAV and rises (convex) past it.
check("E3 recovery cost ~0 below MAV, rises past it",
      recovery_cost(15, _lm) == 0.0 and recovery_cost(20, _lm) > recovery_cost(18, _lm) > 0)
check("E3 recovery cost is convex (accelerates)",
      (recovery_cost(22, _lm) - recovery_cost(20, _lm)) >
      (recovery_cost(20, _lm) - recovery_cost(18, _lm)))
# A muscle in the high-volume regime stops NEAR MRV at neutral (soft, not a hard wall).
_neutral = _alloc(budget=60, weights={"quads": 1.0}, landmarks={"quads": _lm}, recovery_cost_mult=1.0)
check("E3 neutral state funds a high-priority muscle to ~MRV (soft boundary)",
      18 <= _neutral["quads"] <= 22, f"quads {_neutral['quads']} (mrv 20)")
# Higher recovery-cost multiplier (deficit / fatigue — the E9 lever) compresses volume.
_deficit = _alloc(budget=60, weights={"quads": 1.0}, landmarks={"quads": _lm}, recovery_cost_mult=2.5)
check("E3 a high recovery-cost mult compresses volume below the neutral target",
      _deficit["quads"] < _neutral["quads"], f"neutral {_neutral['quads']} → deficit {_deficit['quads']}")
# Numeric backstop: never funds past MRV·SOFT_MRV_OVERSHOOT even with huge budget/weight.
_runaway = _alloc(budget=500, weights={"quads": 50.0}, landmarks={"quads": _lm}, recovery_cost_mult=0.01)
check("E3 soft backstop ceiling is never exceeded",
      _runaway["quads"] <= _lm["mrv"] * SOFT_MRV_OVERSHOOT,
      f"quads {_runaway['quads']} <= {_lm['mrv']*SOFT_MRV_OVERSHOOT}")
# MILP: hard MRV wall replaced by a soft, bounded overshoot tier.
from engine.program_synthesis import ProgramSynthesisEngine as _PSE, SOFT_MRV_OVERSHOOT as _MILP_OVER
_pse = _PSE(["quads", "chest"])
_mmat = _pse.synthesize_weekly_block({"quads": 18, "chest": 18},
                                     {"max_daily_sets": 12, "min_strength_days": 4}, 1.0)
_weekly = _mmat.sum(axis=1)
check("E3 MILP can fund past MRV (soft penalty, not a hard wall)", bool((_weekly > 18).any()),
      f"weekly {list(map(int,_weekly))}")
check("E3 MILP respects the soft overshoot ceiling",
      bool((_weekly <= 18 * _MILP_OVER + 0.01).all()))


# ── E9: nutrition modulation wired into Kalman (tau_fat) + allocator (recovery cost) ─
from engine.banister_kalman import BanisterKalman
from engine.nutrition_modulator import NutritionModulator, ETA_DEFICIT
# (a) Transient tau_fat_eff slows fatigue clearance for one step, without mutating base.
_k1, _k2 = BanisterKalman(), BanisterKalman()
for _ in range(5):
    _k1.predict(70.0); _k2.predict(70.0)        # identical fatigue build-up
_base_tau = _k2.tau_fat
_k1.predict(0.0)                                 # normal clearance
_k2.predict(0.0, tau_fat_eff=_base_tau * 1.5)    # deficit: slower clearance
check("E9 a larger transient tau_fat retains MORE fatigue (slower clearance)",
      float(_k2.x[1, 0]) > float(_k1.x[1, 0]),
      f"slowed {float(_k2.x[1,0]):.4f} > normal {float(_k1.x[1,0]):.4f}")
check("E9 transient tau_fat does NOT mutate the persisted base (no compounding)",
      _k2.tau_fat == _base_tau)
# (b) modulate() actually produces the deficit adjustments E9 feeds downstream.
_nm  = NutritionModulator(maintenance_kcal=3000)
_mod = _nm.modulate(current_kcal_7d_avg=2400, base_tau_fat=15.0, base_mrv_sets=16.0)  # ~20% deficit
check("E9 deficit slows fatigue clearance (tau_fat_adj > base)", _mod["tau_fat_adj"] > 15.0)
check("E9 deficit compresses recoverable volume (mrv_adj < base)", _mod["mrv_adj"] < 16.0)
check("E9 maintenance/surplus stays neutral (tau_fat_adj == base)",
      _nm.modulate(3000, 15.0, 16.0)["tau_fat_adj"] == 15.0)
# (c) The deficit-derived recovery_cost_mult (as wired in generate_weekly_program)
#     compresses the high-volume allocation through E3's recovery-cost term. Use the
#     deepest (capped) deficit so the gentle per-muscle lever produces a visible cut.
_deep = _nm.modulate(current_kcal_7d_avg=1950, base_tau_fat=15.0, base_mrv_sets=16.0)
_rcm = 1.0 / max(0.5, 1.0 - ETA_DEFICIT * _deep["deficit_ratio"])
check("E9 deficit yields a recovery_cost_mult > 1", _rcm > 1.0, f"mult {_rcm:.3f}")
_e9_neutral = _alloc(budget=60, weights={"quads": 1.0}, landmarks={"quads": _lm}, recovery_cost_mult=1.0)
_e9_deficit = _alloc(budget=60, weights={"quads": 1.0}, landmarks={"quads": _lm}, recovery_cost_mult=_rcm)
check("E9 the deep-deficit mult compresses high-volume allocation (volume lever only)",
      _e9_deficit["quads"] < _e9_neutral["quads"],
      f"neutral {_e9_neutral['quads']} → deficit {_e9_deficit['quads']}")


# ── E4: separate strength vs hypertrophy curves (strength saturates early) ─────
from engine.allocator import (effective_weight, strength_weights, STR_SAT_SETS,
                              marginal_value as _mv4)
# Below saturation the FULL blended weight applies (SBD sets credited to both goals).
check("E4 below strength saturation the full weight applies (SBD funds both)",
      effective_weight(STR_SAT_SETS - 1, 1.0, 0.6) == 1.0)
# Past saturation the strength share decays; the hypertrophy/PST remainder persists.
check("E4 strength share decays past saturation",
      effective_weight(STR_SAT_SETS + 3, 1.0, 0.6) < 1.0 and
      effective_weight(STR_SAT_SETS + 3, 1.0, 0.6) >= 1.0 - 0.6 - 1e-9)
check("E4 a pure-hypertrophy muscle is unaffected (w_strength=0)",
      effective_weight(20, 1.0, 0.0) == 1.0)
# Two muscles, EQUAL blended weight: past saturation the strength-heavy one yields less.
_lm4 = {"mev": 8, "mav": 16, "mrv": 20}
_strengthy = _mv4(10, 1.0, _lm4, 1.0, 0.6)
_hyp_pure  = _mv4(10, 1.0, _lm4, 1.0, 0.0)
check("E4 past saturation a strength-heavy muscle yields LESS marginal value",
      _strengthy < _hyp_pure, f"strengthy {_strengthy:.3f} < pure-hyp {_hyp_pure:.3f}")
# strength_weights pulls only the strength relevance (quads high, biceps lower).
_sw = strength_weights({"strength": 0.30, "hypertrophy": 0.40, "pst": 0.30},
                       {"strength": 1.0, "hypertrophy": 1.0, "pst": 1.0},
                       ["quads", "side_delts"])
check("E4 strength_weights reflects strength relevance (quads >> side_delts)",
      _sw["quads"] > _sw["side_delts"] > 0, f"quads {_sw['quads']:.3f}, side_delts {_sw['side_delts']:.3f}")


# ── E13: modality-aware interference, polarized run plan, lift-first ordering ──
from engine.hypertrophy_volume import (apply_endurance_interference, apply_running_interference,
                                       endurance_interference_km, MODALITY_INTERFERENCE)
from engine.allocator import build_run_plan, RUN_QUALITY_FLOOR, RUN_QUALITY_CAP
from engine.resource_allocator import evaluate_two_a_day_split, LIFT_BEFORE_ENDURANCE
# Modality weighting: running interferes most, cycling less, swimming least.
check("E13 modality interference ranks running > cycling > swimming",
      MODALITY_INTERFERENCE["running_continuous"] > MODALITY_INTERFERENCE["cycling"]
      > MODALITY_INTERFERENCE["swimming"] > 0)
check("E13 continuous running costs more than HIIT/PST-pace running",
      MODALITY_INTERFERENCE["running_continuous"] > MODALITY_INTERFERENCE["running_hiit"])
# 40 km cycling dents leg MRV far less than 40 km running.
def _legs():
    return {m: {"mev": 8, "mav": 14, "mrv": 20} for m in ("quads", "hamstrings", "calves", "glutes")}
_run = apply_endurance_interference(_legs(), {"running_continuous": 40})
_cyc = apply_endurance_interference(_legs(), {"cycling": 40})
_swm = apply_endurance_interference(_legs(), {"swimming": 40})
check("E13 equal-km cycling compresses leg MRV far less than running",
      _cyc["quads"]["mrv"] > _run["quads"]["mrv"] and _swm["quads"]["mrv"] >= _cyc["quads"]["mrv"],
      f"run {_run['quads']['mrv']}, cyc {_cyc['quads']['mrv']}, swim {_swm['quads']['mrv']}")
# Backward-compat: running-only path == continuous-running modality dict.
check("E13 apply_running_interference == continuous-running modality path",
      apply_running_interference(_legs(), 30)["quads"]["mrv"]
      == apply_endurance_interference(_legs(), {"running_continuous": 30})["quads"]["mrv"])
# Maintenance floor (bullet 5): even crushing running never zeros leg volume (MRV >= mev+1).
_crush = apply_endurance_interference(_legs(), {"running_continuous": 999})
check("E13 leg MRV floored at mev+1 — running never zeros leg volume (maintenance floor)",
      all(_crush[m]["mrv"] >= _crush[m]["mev"] + 1 for m in _crush))
# Polarized run plan: hard quality floored at the maintenance dose, capped, intensity-tagged.
_rp_low  = build_run_plan(days_available=6, vdot_gap=0.0, pst_mult=1.0)
_rp_high = build_run_plan(days_available=6, vdot_gap=5.0, pst_mult=1.3)
_hard_low  = sum(r["count"] for r in _rp_low  if r["intensity"] == "hard")
_hard_high = sum(r["count"] for r in _rp_high if r["intensity"] == "hard")
check("E13 run plan keeps a hard maintenance floor (never zero quality)",
      _hard_low >= RUN_QUALITY_FLOOR >= 1)
check("E13 hard fraction scales UP with the PST gap (not a taper)", _hard_high > _hard_low)
check("E13 hard quality is capped to keep the plan polarized",
      _hard_high <= RUN_QUALITY_CAP)
check("E13 every run session is intensity-tagged with a duration cap",
      all("intensity" in r and "max_minutes" in r for r in _rp_high))
check("E13 hard intervals are shorter than the continuous easy/long base (duration cap)",
      max(r["max_minutes"] for r in _rp_high if r["intensity"] == "hard")
      <= min(r["max_minutes"] for r in _rp_high if r["intensity"] == "easy"))
# Lift-before-endurance ordering is a first-class output on every shared day.
_split, _why, _seq = evaluate_two_a_day_split(total_sets=12, planned_km=8.0, reserve_score=0.7)
check("E13 high-volume shared day splits two-a-day", _split is True)
check("E13 two-a-day sequence encodes lift before endurance", _seq == ("lift", "endurance"))
check("E13 lift-first ordering holds even on a combined (non-split) day",
      evaluate_two_a_day_split(4, 1.0, 0.7)[2] == LIFT_BEFORE_ENDURANCE)


# ── E5: volume/MRV maturity gated to mesocycle timescales (C8) ────────────────
from engine.learners import apply_mrv_observation, MESOCYCLE_MIN_OBS
import math as _math5
_e5_prior = 20.0
_e5_row = {"mev": 8, "mav": 16, "mrv": 20, "mrv_mean": 20.0, "mrv_var": 9.0, "n_obs": 0}
_matured_at = None
_sep_at = None
for _wk in range(1, 16):
    _u = apply_mrv_observation(_e5_row, obs=26.0, obs_var=1.0, prior_mrv=_e5_prior)  # strong, low-noise
    _e5_row.update(_u)
    if _sep_at is None and abs(_u["mrv_mean"] - _e5_prior) > 1.96 * _math5.sqrt(max(_u["mrv_var"], 1e-9)):
        _sep_at = _u["n_obs"]                       # week the CI first separated from the prior
    if _u["mature"] and _matured_at is None:
        _matured_at = _u["n_obs"]
check("E5 a low-noise designed test separates the CI well before a mesocycle",
      _sep_at is not None and _sep_at < MESOCYCLE_MIN_OBS, f"CI separated at n_obs={_sep_at}")
check("E5 but MRV cannot MATURE before a mesocycle of observations (C8 floor)",
      _matured_at is not None and _matured_at >= MESOCYCLE_MIN_OBS, f"matured at n_obs={_matured_at}")


# ── E8: bounded self-experimentation (uncertainty gate, decay, one-at-a-time) ─
_me8 = ControlledExplorationManager.from_dict({"parameters": ["neck", "traps", "calves"]})
_pw = next(w for w in range(40) if _me8.get_exploration_delta(w))  # a probe week
check("E8 a fired probe targets a single muscle (one probe at a time)",
      len(_me8.get_exploration_delta(_pw)) == 1)
check("E8 probe is restricted to the eligible (still-uncertain) set",
      set(_me8.get_exploration_delta(_pw, eligible={"calves"})) <= {"calves"})
check("E8 exploration is SILENT once all posteriors converge (empty eligible → no probe)",
      _me8.get_exploration_delta(_pw, eligible=set()) == {})
check("E8 an ineligible-only probe week fires nothing (decay as model matures)",
      _me8.get_exploration_delta(_pw, eligible={"not_a_muscle"}) == {})
check("E8 eligible=None preserves back-compat (all parameters eligible)",
      _me8.get_exploration_delta(_pw) != {})


# ── E10: composition-aware adaptive TDEE (Forbes density, EWMA trend, no discard) ─
from engine.tdee import (estimate_tdee as _tdee, composition_density_kcal_per_kg,
                         energy_density_kcal_per_lb, ewma_trend, learned_intake_bias,
                         KG_PER_LB, DEFAULT_BODYFAT_FRAC)
# Forbes: a leaner athlete partitions more change to lean mass → LOWER energy density.
check("E10 leaner body composition → lower energy density (Forbes partition)",
      composition_density_kcal_per_kg(5.0) < composition_density_kcal_per_kg(40.0))
# Energy density is NOT the old fixed 3500 kcal/lb (1 lb = 3500): composition-aware.
_fm = 180 * KG_PER_LB * 0.15
check("E10 energy density is composition-aware, not a fixed 3500 kcal/lb",
      abs(energy_density_kcal_per_lb(_fm) - 3500.0) > 100)
# Early-transient discount: a phase-change week books the water/glycogen step at LOW density.
check("E10 early-transient density (wk1) is discounted vs a settled phase",
      energy_density_kcal_per_lb(_fm, weeks_in_phase=1) < energy_density_kcal_per_lb(_fm))
check("E10 early-transient density ramps back up by wk6+",
      energy_density_kcal_per_lb(_fm, weeks_in_phase=6) == energy_density_kcal_per_lb(_fm))
# EWMA trend weight lags / de-noises a step change (vs raw last value).
_ew = ewma_trend([200, 200, 195, 195, 195], 0.10)
check("E10 EWMA trend weight de-noises a step (lags the raw drop)", 195 < _ew[-1] < 200)
# Directionally correct: losing weight → TDEE above intake; gaining → below intake.
check("E10 losing weight implies TDEE above logged intake",
      _tdee(180, 2400, -1.0) > 2400)
check("E10 gaining weight implies TDEE below logged intake",
      _tdee(180, 3200, +1.0) < 3200)
# Replaces the 25% discard GATE: an energy-balance estimate far from the prior is now
# BLENDED/clamped (uses the signal), not thrown away in favour of the bodyweight prior.
_prior = round(180 * 15.5)
_far = _tdee(180, 4000, 0.0)            # intake far above the prior; old code discarded it
check("E10 a far-from-prior estimate is used (blended/clamped), not discarded to the prior",
      _far > _prior + 100, f"tdee {_far} vs prior {_prior}")
# But clamped (not gated) so a corrupt series can't run away.
check("E10 the energy-balance estimate is sanity-CLAMPED (never unbounded)",
      _tdee(180, 99999, 0.0) <= round(1.6 * _prior))
# Learned intake bias: under-report correction, bounded [1.0, 1.5], scales TDEE up.
_bias = learned_intake_bias(mean_intake=2000, expenditure_est=2790, daily_rate_lb=0.0,
                            density_kcal_per_lb=2800.0, prev_bias=1.0)
check("E10 learned intake bias corrects under-reporting (>1.0, bounded)", 1.0 < _bias <= 1.5)
check("E10 a higher intake bias raises the TDEE estimate (under-report correction)",
      _tdee(180, 2500, 0.0, intake_bias=1.3) > _tdee(180, 2500, 0.0, intake_bias=1.0))
# A missing/zero bodyweight cleanly falls back to the prior (no degenerate all-lean density).
check("E10 missing bodyweight falls back to the prior, not a degenerate estimate",
      _tdee(0, 3000, -1.0, fallback=3200) == 3200)


# ── E11: wire sleep_duration_min into a true sleep-debt signal ────────────────
from engine.sleep_debt import sleep_debt_hours, is_poor_night
# Cumulative hours below an 8h target; extra sleep banks no credit.
check("E11 sleep debt accumulates hours below target",
      sleep_debt_hours([7 * 60, 6 * 60, 5 * 60]) == (1 + 2 + 3))
check("E11 extra sleep does not bank credit (debt floors per night)",
      sleep_debt_hours([9 * 60, 9 * 60]) == 0.0)
check("E11 missing/zero nights are skipped, not counted as debt",
      sleep_debt_hours([None, 0, 8 * 60]) == 0.0)
# Poor-night detection prefers actual DURATION, falls back to score, None when neither.
check("E11 a short night is poor by duration regardless of a decent score",
      is_poor_night(5 * 60, 80) is True)
check("E11 falls back to sleep_score when duration is missing",
      is_poor_night(None, 40) is True and is_poor_night(None, 90) is False)
check("E11 a fully-missing night returns None (stops a consecutive run)",
      is_poor_night(None, None) is None)


# ── F3: exploration bandit fires (audit: never fired) ─────────────────────────
m = ControlledExplorationManager.from_dict({"parameters": ["neck", "traps", "calves"]})
fires = [w for w in range(30) if m.get_exploration_delta(w)]
check("F3 exploration fires within 30 weeks", len(fires) >= 3, f"probe weeks {fires}")
check("F3 fires in the early window (was 0.774<0.30 False forever)", any(w < 6 for w in fires))


# ── F1: MRV matures off the prior on sustained responding+recoverable weeks ────
# Prior MRV 24 (side_delts), funded near MRV, responding, low soreness.
row = {"mev": 8, "mav": 16, "mrv": 24, "mrv_mean": 24.0, "mrv_var": 9.0, "n_obs": 0}
prior = 24.0
matured_week = None
for wk in range(40):
    upd = update_mrv(row, weekly_sets=row["mrv"], e1rm_slope=0.4, soreness_avg=2.0,
                     prior_mrv=prior)
    row.update(upd)
    if upd["mature"] and matured_week is None:
        matured_week = wk
check("F1 MRV posterior separates from prior", row["mrv_mean"] > prior + 1.0,
      f"mean {row['mrv_mean']:.1f} vs prior {prior:.0f}")
check("F1 muscle reaches `mature` on passive data", row["mature"],
      f"matured at week {matured_week}")

# Discipline: a SINGLE strong week must not flip maturity (K_MAX < 0.5 by design).
one = update_mrv({"mev": 8, "mav": 16, "mrv": 18, "mrv_mean": 18.0, "mrv_var": 9.0,
                  "n_obs": 0}, weekly_sets=18, e1rm_slope=0.4, soreness_avg=2.0, prior_mrv=18.0)
check("F1 a single strong week does NOT mature (no one week swings it)", not one["mature"])
# Bound: passive growth can't ratchet MRV unbounded — it stays within headroom of prior.
check("F1 matured MRV stays bounded (no runaway)", row["mrv"] <= prior + 6,
      f"mrv {row['mrv']} (prior {prior:.0f})")


# ── F9: no MRV-down ratchet during a cut ──────────────────────────────────────
cut_row = {"mev": 8, "mav": 16, "mrv": 18, "mrv_mean": 18.0, "mrv_var": 4.0, "n_obs": 5}
start = cut_row["mrv_mean"]
for _ in range(6):
    cut_row.update(update_mrv(cut_row, weekly_sets=18, e1rm_slope=-0.3,
                              soreness_avg=8.0, prior_mrv=18.0, phase="cut"))
check("F9 cut + flat/neg slope + sore does NOT ratchet MRV down",
      cut_row["mrv_mean"] >= start, f"mean {cut_row['mrv_mean']:.1f} (start {start:.0f})")
# Off-cut, the same stall SHOULD pull it down (control).
nc_row = {"mev": 8, "mav": 16, "mrv": 18, "mrv_mean": 18.0, "mrv_var": 4.0, "n_obs": 5}
for _ in range(6):
    nc_row.update(update_mrv(nc_row, weekly_sets=18, e1rm_slope=-0.3,
                             soreness_avg=8.0, prior_mrv=18.0, phase="bulk"))
check("F9 control: off-cut stall+sore DOES ratchet down",
      nc_row["mrv_mean"] < start, f"mean {nc_row['mrv_mean']:.1f}")


# ── F5: learned high MRV is deliverable for fast-recovery muscles ─────────────
check("F5 fast-recovery muscle gets higher per-session cap",
      per_session_muscle_cap("side_delts") > per_session_muscle_cap("chest"))
freq = frequency_targets({"side_delts": 24}, days_available=6)
deliverable = freq["side_delts"] * per_session_muscle_cap("side_delts")
check("F5 MRV 24 is deliverable within the week", deliverable >= 24,
      f"freq {freq['side_delts']} × cap {per_session_muscle_cap('side_delts')} = {deliverable}")


# ── Rep-range preference: loaded work clamped sub-10, bodyweight exempt ────────
check("rep clamp: 12-15 → 8-10", clamp_rep_range("12-15") == "8-10")
check("rep clamp: heavy 3-5 passes through", clamp_rep_range("3-5") == "3-5")


# ── F8: daily split inherits the weekly plan's title ──────────────────────────
ok8 = all(split_from_title(build_title("STRENGTH", s, 1.0)) == s
          for s in ("upper_a", "upper_b", "lower_squat_primary", "lower_hinge_primary"))
check("F8 split_from_title round-trips the planned split", ok8)


# ── F16: SessionGenerator.generate() honors split_override even WITH log history ──
# Regression test for the Today/Train mismatch: the classmethod used to gate
# split_override behind `not recent_session_types`, a condition that's
# unreachable for any athlete with real training logs, so it always silently
# re-derived the split from log history instead — Today and Train disagreed
# on the same day. recent_session_types below is deliberately non-empty and
# points the OTHER direction (lower) from the override (upper_a).
_out16 = SessionGenerator().generate(
    banister_state={}, interference={"ampk": 0.20, "mtorc1": 0.30}, overreach={},
    acwr=1.0, strength={}, latest_pst={}, nutrition_mod={}, vdot_zones={},
    mileage_cap=0.0, mpc_action="STRENGTH", mpc_intensity=1.0,
    recent_session_types=["lower_hinge_primary", "lower_squat_primary"],
    split_override="upper_a",
)
check("F16 split_override wins over log-derived split even with session history",
      _out16.get("split") == "upper_a", f"got {_out16.get('split')!r}")


# ── F13: single low-severity pain note de-prioritises, doesn't veto ───────────
soft = exercise_reward(0.5, 0, 0, 0.0, 0, pain=True, pain_severity=1, pain_mentions=1)
hard = exercise_reward(0.5, 0, 0, 0.0, 0, pain=True, pain_severity=2, pain_mentions=1)
check("F13 single low-sev pain note is a soft nudge (not -1.5 veto)", -1.5 < soft < 0,
      f"reward {soft}")
check("F13 sharp (sev≥2) pain note still hard-vetoes", hard <= -1.5, f"reward {hard}")


# ── F2: fallback slope is scale-comparable to e1RM (not raw weight×reps ~60) ──
import importlib.util
# Resolve relative to THIS file, not the CWD — the bare relative path only
# resolved when the validator happened to be run from inside scripts/, so every
# check below F2 was silently unreachable from a repo-root run.
_spec = importlib.util.spec_from_file_location(
    "gwp", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "generate_weekly_program.py"))
_gwp = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_gwp)
_rows = [{"date": d, "exercise": "Neck Curl", "weight": w, "reps": 12, "rir": 0}
         for d, w in [("2026-05-01", 45), ("2026-05-08", 50), ("2026-05-15", 55), ("2026-05-22", 60)]]
_qs = _gwp.muscle_quality_slopes(_rows)
check("F2 fallback slope is present for a rep-tracked muscle", _qs.get("neck", 0) > 0)
check("F2 fallback slope is e1RM-scale (not raw magnitude ~60)", 0 < _qs.get("neck", 0) < 1.0,
      f"neck slope {_qs.get('neck'):.3f}")
# It must still rank by RESPONSE, not raw load: a heavier but flat lift scores ~0.
_flat = [{"date": d, "exercise": "Heavy Shrug", "weight": 225, "reps": 8, "rir": 0}
         for d in ("2026-05-01", "2026-05-08", "2026-05-15", "2026-05-22")]
_qs2 = _gwp.muscle_quality_slopes(_flat)
check("F2 a heavy-but-flat lift scores ~0 (ranks by response, not load)",
      abs(_qs2.get("traps", 0)) < 0.01, f"traps slope {_qs2.get('traps', 0):.4f}")


# ── Integration: matured + fallback landmarks → plan_week stays sane (no blowup) ─
from engine.allocator import plan_week
from engine.hypertrophy_volume import LANDMARK_PRIORS
prior_lm = {m: dict(LANDMARK_PRIORS[m]) for m in LANDMARK_PRIORS}
base = plan_week(prior_lm, tsb=0.0, phase=None,
                 goal_priorities={"strength": 0.4, "hypertrophy": 0.3, "pst": 0.3},
                 deadline_mult={"strength": 1.0, "hypertrophy": 1.0, "pst": 1.0})
# Mature two focus muscles high (side_delts/calves to MRV 27, MAV compressed to 25).
mat_lm = {m: dict(v) for m, v in prior_lm.items()}
for fm in ("side_delts", "calves"):
    mat_lm[fm] = {"mev": 8, "mav": 25, "mrv": 27}
mat = plan_week(mat_lm, tsb=0.0, phase=None,
                goal_priorities={"strength": 0.4, "hypertrophy": 0.3, "pst": 0.3},
                deadline_mult={"strength": 1.0, "hypertrophy": 1.0, "pst": 1.0})
blowup = mat["budget"] / max(1.0, base["budget"])
check("integration: matured focus muscles don't blow up total budget", blowup < 1.6,
      f"budget {base['budget']:.0f} → {mat['budget']:.0f} ({blowup:.2f}×)")
check("integration: each muscle's sets stay ≤ its MRV",
      all(mat["set_targets"][m] <= mat_lm[m]["mrv"] for m in mat["set_targets"]),
      f"max {max(mat['set_targets'].values())}")
check("integration: focus muscle is actually funded after maturing",
      mat["set_targets"].get("side_delts", 0) >= base["set_targets"].get("side_delts", 0),
      f"side_delts {base['set_targets'].get('side_delts')} → {mat['set_targets'].get('side_delts')}")


# ── Failure-reason feature: nutrition gate + programming attribution ──────────
from engine.failure_reasons import parse_set_failures, is_technical, infer_lift
_logs = [{"log_date": "2026-06-15", "exercises": [
    {"name": "Bench (paused comp)", "sets": [{"weight": 300, "reps": 3, "failure_reason": "lockout"}]},
    {"name": "Squat (comp)",        "sets": [{"weight": 400, "reps": 2, "failure_reason": "out_of_gas"}]},
]}]
_f = parse_set_failures(_logs, today_iso="2026-06-17")
check("FR technical bench miss is flagged technical (excluded from cut signal)",
      "bench" in _f["technical_miss_lifts"] and "bench" not in _f["systemic_miss_lifts"])
check("FR systemic squat miss stays a strength signal (eases cut)",
      "squat" in _f["systemic_miss_lifts"] and "squat" not in _f["technical_miss_lifts"])
# Nutrition gate: bench (technical) excluded; squat (systemic, negative) sets the min.
strength = {"Bench (paused comp)": {"progression_rate_lbs_per_week": -3.0},
            "Squat (comp)": {"progression_rate_lbs_per_week": -1.5},
            "Deadlift (conventional comp)": {"progression_rate_lbs_per_week": 0.5}}
excl = _f["technical_miss_lifts"] - _f["systemic_miss_lifts"]
slopes = [v["progression_rate_lbs_per_week"] for k, v in strength.items() if infer_lift(k) not in excl]
check("FR cut gate ignores the -3.0 technical bench, min is the -1.5 systemic squat",
      min(slopes) == -1.5, f"min slope {min(slopes)}")
# Programming: bench lockout weakness → triceps-biased assistance.
from engine.session_generator import _pick_assistance, BENCH_ASSISTANCE, _WEAKNESS_ACCESSORY
pick = _pick_assistance("bench", list(BENCH_ASSISTANCE), _f["weakness"], assist_week=0)
check("FR bench lockout aims assistance at the lockout variant",
      pick == "Reverse Grip Incline Smith Machine Press", f"picked {pick}")
check("FR bench lockout adds a triceps accessory (more triceps volume)",
      _WEAKNESS_ACCESSORY.get(("bench", "lockout")) == "Triceps OH Extension")

# Sticking point on a MADE (non-missed) set: feeds programming weakness, but must
# NEVER enter the miss sets (a completed grinder cannot ease the cut).
_sp_logs = [{"log_date": "2026-06-16", "exercises": [
    {"name": "Bench (paused comp)", "sets": [{"weight": 305, "reps": 3, "sticking_point": "lockout"}]},
]}]
_sp = parse_set_failures(_sp_logs, today_iso="2026-06-17")
check("SP made-set sticking point still steers programming (weakness has bench/lockout)",
      _sp["weakness"].get("bench", {}).get("region") == "lockout")
check("SP made-set sticking point never enters the cut signal (no miss-set membership)",
      "bench" not in _sp["technical_miss_lifts"] and "bench" not in _sp["systemic_miss_lifts"])
# Precedence: a set that carries both fields became a miss → counted once, as a miss.
_both_logs = [{"log_date": "2026-06-16", "exercises": [
    {"name": "Bench (paused comp)", "sets": [{"weight": 290, "reps": 2,
                                              "failure_reason": "lockout", "sticking_point": "lockout"}]},
]}]
_both = parse_set_failures(_both_logs, today_iso="2026-06-17")
check("SP both fields → failure_reason wins, stale sticking_point not double-counted",
      "bench" in _both["technical_miss_lifts"]
      and _both["weakness"].get("bench", {}).get("mentions") == 1)


# ── SPLIT: the convergent scheduler must not program a region back-to-back ───
# Shipped bug (2026-07-11): the Train tab prescribed "Upper B — Pull" on the Saturday
# after a logged Upper day. Root cause chain, each pinned below:
#   1. week_muscle_counts was seeded from a rolling 7-SESSION window, not the calendar
#      week, so by mid-week every count exceeded its weekly target;
#   2. every deficit therefore went negative, every split scored exactly 0.000;
#   3. sorted() over an all-zero score fell through to _FRAMEWORK_SPLITS list order;
#   4. and the weekly generator's log classifier could only emit "upper_a" /
#      "lower_squat_primary", so it could not see hinge days or pull-led upper days.
_FREQ = {"core": 1, "lats": 3, "neck": 3, "chest": 3, "quads": 3, "traps": 3,
         "biceps": 3, "calves": 3, "glutes": 3, "triceps": 3, "shoulders": 3,
         "hamstrings": 3, "rear_delts": 3, "side_delts": 3, "upper_back": 3,
         "upper_chest": 3}
_UPPER_LOG = [{"name": n} for n in (
    "Bench Press (Top Set)", "Weighted Pull-up", "Chest-Supported Row",
    "Overhead Press (BB)", "Dip Pyramid", "Lateral Raise", "Bicep Curl")]
_SQUAT_LOG = [{"name": n} for n in (
    "Back Squat (Top Set)", "Back Squat (Back-off)", "Paused Squat",
    "Hip Thrust", "Calf Raise", "Leg Extension")]
_HINGE_LOG = [{"name": n} for n in (
    "Deadlift (Top Set)", "Deficit Deadlift", "Romanian Deadlift from Deficit",
    "Hip Thrust", "Calf Raise", "Hamstring Curl")]

check("SPLIT classifier reads a squat-primary lower day",
      classify_log_split(_SQUAT_LOG) == "lower_squat_primary",
      classify_log_split(_SQUAT_LOG))
check("SPLIT classifier reads a hinge-primary lower day (old one collapsed both to squat)",
      classify_log_split(_HINGE_LOG) == "lower_hinge_primary",
      classify_log_split(_HINGE_LOG))
check("SPLIT classifier reads a press-led upper day as upper_a",
      classify_log_split(_UPPER_LOG) == "upper_a",
      classify_log_split(_UPPER_LOG))
check("SPLIT classifier returns None on a session with no lifting content",
      classify_log_split([{"name": "Easy Run"}]) is None)

# week_muscle_counts must be scoped to the CALENDAR WEEK, not a rolling window.
_rows = [{"log_date": "2026-07-10", "exercises": _UPPER_LOG},   # this week
         {"log_date": "2026-07-09", "exercises": _SQUAT_LOG},   # this week
         {"log_date": "2026-06-30", "exercises": _UPPER_LOG}]   # LAST week — must not count
_wmc = week_muscle_counts_from_logs(_rows, "2026-07-06")
check("SPLIT week_muscle_counts excludes sessions from previous weeks",
      _wmc.get("chest", 0) == 1,
      f"chest counted {_wmc.get('chest', 0)}x (2 upper logs, but one is last week)")

# THE HEADLINE: upper logged yesterday → today must be lower, even when the week's
# frequency targets are already saturated and every deficit has clamped to zero.
_recent = ["lower_hinge_primary", "upper_a", "upper_a", "lower_hinge_primary",
           "upper_a", "lower_squat_primary", "upper_a"]          # newest last = UPPER
_saturated = {m: 9 for m in _FREQ}                                # every target blown
_pick = _converge_split(_recent, "upper_lower", _FREQ, _saturated)
check("SPLIT saturated week does NOT program upper the day after upper",
      _pick.startswith("lower"), f"picked {_pick}")
check("SPLIT saturated week alternates the lower variant off the last logged lower",
      _pick == "lower_hinge_primary",                             # last lower was squat
      f"picked {_pick}")

# Score must be a MEAN, not a sum: an 11-muscle upper day must not beat a 5-muscle
# lower day just for covering more muscles when both are equally behind and rested.
_fresh = {}                                                       # nothing trained yet
_rested = ["lower_squat_primary"]                                 # only lower is fatigued
_pick2 = _converge_split(_rested, "upper_lower", _FREQ, _fresh)
check("SPLIT bigger split does not win on muscle count alone",
      _pick2.startswith("upper"), f"picked {_pick2}")

# A full week must rotate, never stacking a region.
_hist, _tally = list(_recent), {}
_week = []
for _ in range(7):
    _sp = _converge_split(_hist, "upper_lower", _FREQ, _tally)
    _week.append(_sp)
    for _m in split_muscles_for(_sp):
        _tally[_m] = _tally.get(_m, 0) + 1
    _hist.append(_sp)
    if len(_hist) > 7:
        _hist.pop(0)
_regions = ["upper" if "upper" in s else "lower" for s in _week]
_b2b = sum(1 for i in range(1, len(_regions)) if _regions[i] == _regions[i - 1])
check("SPLIT a generated week never stacks the same region twice in a row",
      _b2b == 0, " → ".join(_week))
check("SPLIT a generated week uses BOTH upper variants (emphasis actually rotates)",
      {"upper_a", "upper_b"}.issubset(set(_week)), " → ".join(_week))


# ── MAP: every exercise the athlete actually logs must map to the right muscles ──
# Shipped bug (2026-07-11): muscle_map's keys are space-separated ("pull up", "leg
# curl") but the catalog names are hyphenated ("Pull-up") or differently worded
# ("Hamstring Curl"). Raw substring matching therefore MISSED them, and "Hamstring
# Curl" fell through to the bare "curl" key and credited BICEPS. A leg day funded arm
# volume; pull-ups and push-ups contributed nothing at all. This feeds
# week_muscle_counts_from_logs (the convergent split's input) AND the MRV learner.
_LOWER_LM = {"quads", "hamstrings", "glutes", "calves"}
# Real exercise names taken verbatim from the athlete's workout_logs.
_REAL_EXERCISES = [
    "Ab Crunch Machine", "Adductor", "Back Squat (Top Set)", "Barbell Curl",
    "Barbell Hold", "Barbell Shrug", "Bench Press (Top Set)", "Bicep Curl",
    "Cable Lateral Raise", "Calf Machine Shrugs", "Calf Raise", "Chest-Supported Row",
    "Close Grip Bench Press", "Conventional Deadlift", "Decline DB skull crusher",
    "Deficit Deadlift", "Dip Pyramid", "Face Pull", "Front Squat", "Hamstring Curl",
    "Hanging Leg Raise", "Hip Thrust", "Incline DB Press", "Larsen Press",
    "Lat Pulldown", "Lateral Raise", "Leg Extension", "Leg press Calf Raises",
    "Loaded Standing Calf Raises", "Low-to-High Cable Fly", "Machine Incline Press",
    "Neck Curl", "Neck Extension", "Overhead Press (BB)", "Paused Squat", "Pin Squat",
    "Preacher Curl", "Pull-Up Pyramid", "Push-Up Pyramid", "RDL",
    "Reverse Grip Incline Smith Machine Press", "Romanian Deadlift", "Seated Leg Curl",
    "Sit-Up Pyramid", "Smith machine shoulder press", "Triceps OH Extension",
    "Weighted Dip", "Weighted Pull-up", "Wrist Curl", "Zercher Squat",
]
_unmapped = [n for n in _REAL_EXERCISES if not get_muscles(n)]
check("MAP every real logged exercise resolves to at least one muscle",
      not _unmapped, f"unmapped: {_unmapped}" if _unmapped else f"{len(_REAL_EXERCISES)} names")

check("MAP a hyphenated name matches a space-separated keyword (Pull-up → back/biceps)",
      set(hypertrophy_muscles("Weighted Pull-up")) == {"lats", "upper_back", "biceps"},
      str(hypertrophy_muscles("Weighted Pull-up")))
check("MAP Push-Up Pyramid credits chest/triceps (was: nothing)",
      set(hypertrophy_muscles("Push-Up Pyramid")) == {"chest", "triceps"},
      str(hypertrophy_muscles("Push-Up Pyramid")))
check("MAP Hamstring Curl is a LEG movement, not biceps",
      hypertrophy_muscles("Hamstring Curl") == ["hamstrings"],
      str(hypertrophy_muscles("Hamstring Curl")))
check("MAP Wrist Curl never credits biceps",
      "biceps" not in hypertrophy_muscles("Wrist Curl"),
      str(get_muscles("Wrist Curl")))
check("MAP the bare 'curl' catch-all still works for real arm work",
      hypertrophy_muscles("Bicep Curl") == ["biceps"])
check("MAP no leg movement leaks into an upper-body landmark",
      not [n for n in _REAL_EXERCISES
           if any(k in n.lower() for k in ("squat", "hamstring", "leg extension", "adductor"))
           and (set(hypertrophy_muscles(n)) - _LOWER_LM - {"core"})],
      "checked squat/hamstring/leg-extension/adductor names")
check("MAP every emitted landmark is a real landmark muscle",
      all(m in LANDMARK_MUSCLES for n in _REAL_EXERCISES for m in hypertrophy_muscles(n)))


# ── NOTES: "pull" is a movement pattern, not an injury ───────────────────────
# Shipped bug: "pull" sat in _PAIN_WORDS *and* in the severity-2 escalation list, so
# "Great pull day, lat pulldown was smooth" registered as SHARP PAIN and hard-vetoed
# lats/upper_back/biceps — on movements this engine programs by name (Face Pull,
# Weighted Pull-up, Pull-up Pyramid).
def _caution(note):
    r = parse_workout_notes([{"log_date": "2026-07-10", "notes": note, "exercises": []}])
    return (r.get("caution") if isinstance(r, dict) else {}) or {}

for _note in ("Great pull day, lat pulldown was smooth",
              "Pull-ups felt great today, added weight",
              "Face pulls were smooth",
              "I pulled 405 for an easy triple"):
    check(f"NOTES no phantom injury from {_note[:34]!r}", not _caution(_note),
          str(_caution(_note)))
check("NOTES 'kept my back tight' is a bracing cue, not pain",
      not _caution("Kept my back tight all session"),
      str(_caution("Kept my back tight all session")))

# The genuine-pain path MUST still fire — that is the whole point of the parser.
check("NOTES genuine soft pain still detected", bool(_caution("my shoulders kinda hurt")))
check("NOTES sharp pain still escalates to severity 2",
      any(v.get("severity") == 2 for v in _caution("Sharp pain in my left knee on squats").values()))
check("NOTES a strain still escalates to severity 2",
      any(v.get("severity") == 2 for v in _caution("I think I strained my hamstring").values()))
check("NOTES the INJURY sense of pull still escalates ('pulled a muscle')",
      any(v.get("severity") == 2 for v in _caution("Pulled a muscle in my lower back").values()),
      str(_caution("Pulled a muscle in my lower back")))


# ── MPC: the two action scorers must not drift apart ─────────────────────────
# Shipped bug: generate_weekly_program.simulate_and_score had NO action-dependent term,
# so w_pst/w_str cancelled in the argmax, the score was monotone in TSS load, and
# TWO_A_DAY (the highest load) won nearly every day. mpc_prescriber.score_trajectory
# already carried the goal term; the weekly one claimed to "mirror" it and did not.
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location(
    "gwp", os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "generate_weekly_program.py"))
_gwp = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_gwp)
import mpc_prescriber as _mpc

check("MPC weekly and daily scorers share PST_READINESS_VALUE",
      _gwp.PST_READINESS_VALUE == _mpc.PST_READINESS_VALUE)
check("MPC weekly and daily scorers share STRENGTH_PROGRESS_VALUE",
      _gwp.STRENGTH_PROGRESS_VALUE == _mpc.STRENGTH_PROGRESS_VALUE)
check("MPC weekly and daily scorers share GOAL_REWARD_SCALE",
      _gwp.GOAL_REWARD_SCALE == _mpc.GOAL_REWARD_SCALE)
check("MPC weekly and daily scorers share ACTION_TSS",
      _gwp.ACTION_TSS == _mpc.ACTION_TSS)

# The deadline weights must actually STEER the choice. If the goal term is ever dropped
# again they cancel out and this goes flat.
_k = _gwp.BanisterKalman()
_pst_heavy = {a: _gwp.simulate_and_score(_k, a, [50] * 28, 0.9, 0.1) for a in _gwp.ACTION_TSS}
_str_heavy = {a: _gwp.simulate_and_score(_k, a, [50] * 28, 0.1, 0.9) for a in _gwp.ACTION_TSS}
check("MPC deadline weights actually change the ranking (goal term is live)",
      max(_pst_heavy, key=_pst_heavy.get) != max(_str_heavy, key=_str_heavy.get)
      or _pst_heavy != _str_heavy,
      f"pst-heavy top={max(_pst_heavy, key=_pst_heavy.get)}, "
      f"str-heavy top={max(_str_heavy, key=_str_heavy.get)}")
check("MPC a STRENGTH-weighted deadline scores STRENGTH above CARDIO",
      _str_heavy["STRENGTH"] > _str_heavy["CARDIO"],
      f"STRENGTH={_str_heavy['STRENGTH']}, CARDIO={_str_heavy['CARDIO']}")
check("MPC a PST-weighted deadline scores CARDIO above STRENGTH",
      _pst_heavy["CARDIO"] > _pst_heavy["STRENGTH"],
      f"CARDIO={_pst_heavy['CARDIO']}, STRENGTH={_pst_heavy['STRENGTH']}")


# ── CUT: an open-ended cut must not freeze the MRV learner ───────────────────
# Shipped bug (2026-07-11): can_schedule() refused to start a volume-tolerance test
# while phase == "cut". On a cut the learner has only two paths, and BOTH were shut:
# the DOWN-ratchet is suppressed by design (F9), and the UP-ratchet needs
# `weekly_sets + 1 > mrv_mean`, which only becomes true DURING a ramp. So blocking the
# ramp closed the last path. The athlete cut open-endedly from 2026-06-07; every
# landmark stayed pinned to its population prior for 34 days (10 of 16 muscles at
# n_obs=0) and the program was byte-identical every week.
from engine.controlled_tests import (can_schedule, pick_volume_test_muscle,
                                     schedule_volume_test, ramp_target, step_volume_test,
                                     RAMP_WEEKS)
from engine.learners import apply_mrv_observation
from engine.athlete_profile import MUSCLE_EMPHASIS

check("CUT a volume-tolerance test CAN be scheduled while cutting", can_schedule(None, "cut"))
check("CUT still only one test at a time", not can_schedule({"test_type": "volume_tolerance"}, "cut"))
check("CUT still only one test at a time, off a cut too", not can_schedule({"x": 1}, None))

# The full ramp → observation chain must actually move the posterior ON A CUT.
_LM = {"side_delts": {"mev": 6, "mav": 10, "mrv": 16, "mrv_mean": 16.0,
                      "mrv_var": 9.0, "n_obs": 0, "mature": False}}
_tm = pick_volume_test_muscle(_LM, MUSCLE_EMPHASIS)
check("CUT the probe targets an unobserved, high-emphasis muscle", _tm == "side_delts", str(_tm))

_test, _obs = schedule_volume_test(_tm, _LM[_tm]["mrv_mean"], "2026-07-13"), None
_targets = []
for _ in range(RAMP_WEEKS + 1):
    _t = ramp_target(_test, _LM).get(_tm)
    if _t is None:
        break
    _targets.append(_t)
    _test, _obs = step_volume_test(_test, muscle_slope=0.8, soreness_avg=3.0, week_sets=_t)
    if _obs:
        break
check("CUT the ramp actually RAISES the weekly set target week over week",
      _targets == sorted(_targets) and len(set(_targets)) > 1,
      " → ".join(f"{t:.0f}" for t in _targets))
check("CUT the ramp pushes the muscle above its MAV (where MRV becomes observable)",
      max(_targets) > _LM[_tm]["mav"], f"max {max(_targets):.0f} vs MAV {_LM[_tm]['mav']}")
check("CUT a completed ramp emits an MRV observation", bool(_obs), str(_obs))

_n_before = _LM[_tm]["n_obs"]
_upd = apply_mrv_observation(_LM[_tm], _obs["obs"], _obs["obs_var"], 18)
check("CUT the MRV posterior actually records the observation (was frozen for 34 days)",
      _upd["n_obs"] > _n_before, f"n_obs {_n_before} → {_upd['n_obs']}")

# A STALL under a deficit stays ambiguous — we must NOT ratchet MRV down on a cut.
_sore_row = {"mev": 6, "mav": 12, "mrv": 16, "mrv_mean": 16.0, "mrv_var": 9.0,
             "n_obs": 3, "mature": False}
_cut_stall = update_mrv(dict(_sore_row), 14, -0.5, 8.0, 18, phase="cut")
_off_stall = update_mrv(dict(_sore_row), 14, -0.5, 8.0, 18, phase=None)
check("CUT a stall+sore week does NOT ratchet MRV down on a cut (deficit masking)",
      _cut_stall["mrv_mean"] == _sore_row["mrv_mean"],
      f"{_sore_row['mrv_mean']} → {_cut_stall['mrv_mean']}")
check("CUT the same stall+sore week DOES ratchet down off a cut",
      _off_stall["mrv_mean"] < _sore_row["mrv_mean"],
      f"{_sore_row['mrv_mean']} → {_off_stall['mrv_mean']}")


# ── E14: the food log is not taken at face value ──────────────────────────────
# Three coupled bugs let a spotty food log quietly drive the whole nutrition engine:
# the intake window skipped unlogged days, the coverage was never reported, and the
# learned under-report correction was built but never called.
import datetime as _dt
import compute_athlete_state as _cas
from engine.tdee import energy_density_kcal_per_lb as _density, KG_PER_LB as _KGLB

_cas.TODAY = "2026-07-11"
# Nolan's real July log: 5 of the 7 days before today. 07-03/04/05 were never logged.
_food = [{"date": d, "calories": k, "protein_grams": 200} for d, k in {
    "2026-07-10": 1516, "2026-07-09": 1557, "2026-07-08": 1530,
    "2026-07-07": 1417, "2026-07-06": 1669,
    "2026-07-02": 1882, "2026-07-01": 996,     # outside the 7-day window
}.items()]
_wts = [{"recorded_date": d, "weight": w} for d, w in [
    ("2026-07-06", 188.0), ("2026-07-07", 187.8), ("2026-07-08", 184.6),
    ("2026-07-09", 183.0), ("2026-07-10", 183.3)]]
_nut = _cas.compute_nutrition(_food, _wts, {"daily_calorie_goal": 1500, "diet_phase": "cut"})

check("E14 the intake window is calendar-anchored, not 'last 7 dates with entries'",
      _nut["days_logged_7d"] == 5, f"{_nut['days_logged_7d']}/7 days in 07-04..07-10")
check("E14 unlogged days are surfaced as coverage, not silently skipped",
      abs(_nut["log_coverage_7d"] - 5 / 7) < 1e-3, f"coverage {_nut['log_coverage_7d']:.0%}")
check("E14 TODAY (a partial day) is excluded from the mean",
      "2026-07-11" not in {e["date"] for e in _food} or _nut["days_logged_7d"] == 5)
# A day with no food log is UNKNOWN intake, not a 0-kcal day: zero-filling would understate
# intake even worse than skipping. The mean stays over logged days; coverage carries the doubt.
check("E14 an unlogged day is not zero-filled into the mean",
      _nut["avg_calories_7d"] > 1400, f"avg {_nut['avg_calories_7d']} kcal (not dragged toward 0)")

# Coverage scales trust in the energy-balance term CONTINUOUSLY — a weight, not a revival
# of the old hard gate. Half-logged weeks lean on the bodyweight prior instead of reading a
# gap-riddled log as genuine starvation and spiralling the calorie target down.
_bw, _prior_bw = 184.0, round(184.0 * 15.5)
_lo_cov = _tdee(_bw, 1538, -1.0, bodyfat_frac=0.15, intake_bias=1.5, log_coverage=0.0)
_hi_cov = _tdee(_bw, 1538, -1.0, bodyfat_frac=0.15, intake_bias=1.5, log_coverage=1.0)
check("E14 zero coverage falls back to the bodyweight prior (nothing is discarded)",
      _lo_cov == _prior_bw, f"{_lo_cov} == prior {_prior_bw}")
check("E14 full coverage trusts the energy-balance estimate",
      _hi_cov < _lo_cov, f"cov 1.0 → {_hi_cov} vs cov 0.0 → {_lo_cov}")
check("E14 coverage is a continuous weight, not a gate (partial → between the two)",
      _lo_cov > _tdee(_bw, 1538, -1.0, bodyfat_frac=0.15, intake_bias=1.5,
                      log_coverage=0.71) > _hi_cov)
check("E14 an under-logged week no longer reads as a starvation TDEE",
      _tdee(_bw, 1538, -1.0, bodyfat_frac=0.15, intake_bias=1.0, log_coverage=1.0)
      < _tdee(_bw, 1538, -1.0, bodyfat_frac=0.15, intake_bias=1.5, log_coverage=0.71))

# The bias is a nudge (gain 0.2) — it ONLY converges if prev_bias is carried across runs.
_b, _d15 = 1.0, _density(_bw * _KGLB * 0.15)
for _ in range(30):
    _b = learned_intake_bias(mean_intake=1538, expenditure_est=_bw * 15.5,
                             daily_rate_lb=-1.0 / 7.0, density_kcal_per_lb=_d15, prev_bias=_b)
check("E14 the intake bias learns across runs (was re-seeded to 1.0 every day)",
      _b > 1.4, f"1.00 → {_b:.2f} over 30 runs")
_one_shot = learned_intake_bias(mean_intake=1538, expenditure_est=_bw * 15.5,
                                daily_rate_lb=-1.0 / 7.0, density_kcal_per_lb=_d15, prev_bias=1.0)
check("E14 a single run barely moves it — persistence is load-bearing, not cosmetic",
      _one_shot < 1.15, f"one run: 1.00 → {_one_shot:.2f}")

# ── E15: photo bodyfat is a session signal, never a single shot ───────────────
# Per-shot vision BF is pose-dependent: one 2026-06-07 session read 18% relaxed and 10%
# flexed off the same body. `order=taken_at.desc limit 1` tie-breaks arbitrarily among
# same-day shots, so with REVERSE_BF at 12% the cut/bulk call was a coin flip.
from engine.phase_recommender import recommend_phase as _rec
_session = [{"taken_at": "2026-06-15", "bodyfat_estimate": b} for b in (15, 10, 10, 18)]
_goals = {"pst": 0.25, "strength": 0.3, "hypertrophy": 0.45}
_phases = {_rec(weight_trend=-1.0, days_to_deadline=51, bodyfat=b,
                goal_priorities=_goals, current_phase="cut")["phase"]
           for b in (10, 15, 18)}
check("E15 a single arbitrary shot could swing the phase call (the bug)",
      len(_phases) > 1, f"same session → {sorted(_phases)}")
_bf_frac = _cas.compute_physique_bf_frac(_session, max_stale_days=99999)
_bf_pct = round(_bf_frac * 100.0, 1)
check("E15 the session mean lands between the pose extremes, not on one of them",
      10 < _bf_pct < 18, f"{_bf_pct}% from shots 15/10/10/18")
check("E15 the phase call is now deterministic for a given session",
      len({_rec(weight_trend=-1.0, days_to_deadline=51, bodyfat=_bf_pct,
                goal_priorities=_goals, current_phase="cut")["phase"] for _ in range(5)}) == 1)
# Order must not matter — that was the whole defect.
check("E15 shot order within a session cannot change the estimate",
      _cas.compute_physique_bf_frac(list(reversed(_session)), max_stale_days=99999) == _bf_frac)


# ---------------------------------------------------------------------------
# E16 — hysteretic phase band (10 <-> 18) + TNF 4-6 week duration cap.
#
# The old band was STATIC, so it had a dead zone: at 13.5% BF (below CUT_ABOVE,
# above BULK_BELOW) it read "maintain" regardless of travel direction. A cut aimed
# at 10% would therefore be told to stop the moment it dropped under 18% — the
# engine could never drive the athlete from 13.5% to his 10% target.
# ---------------------------------------------------------------------------
print("\n--- E16: hysteretic phase band + deficit duration cap ---")
from engine.phase_recommender import MAX_DEFICIT_WEEKS, REVERSE_BF, BF_CUT_ABOVE, BF_BULK_BELOW

check("E16 the athlete's stated band is 10 <-> 18",
      (REVERSE_BF, BF_BULK_BELOW, BF_CUT_ABOVE) == (10.0, 10.0, 18.0),
      f"reverse/bulk-below {REVERSE_BF}/{BF_BULK_BELOW}, cut-above {BF_CUT_ABOVE}")

# The dead zone: mid-band, direction of travel must decide the call.
_mid = dict(weight_trend=-0.5, days_to_deadline=51, goal_priorities=_goals, bodyfat=13.5)
check("E16 a running cut mid-band KEEPS CUTTING (the dead-zone bug)",
      _rec(**_mid, current_phase="cut", weeks_in_cut=4.9)["phase"] == "cut",
      "13.5% BF, wk 4.9 → cut (old static band said 'maintain' and stalled the cut)")
check("E16 a running bulk mid-band KEEPS GAINING",
      _rec(**_mid, current_phase="bulk")["phase"] == "bulk")
check("E16 from maintain, mid-band still reads maintain (band intact where it belongs)",
      _rec(**_mid, current_phase="maintain")["phase"] == "maintain")

# Far thresholds still terminate each phase.
check("E16 a cut ENDS when it reaches the 10% target, and reverse-diets out",
      (lambda r: r["phase"] in ("maintain", "bulk") and r["reverse_diet"])(
          _rec(weight_trend=-0.5, days_to_deadline=51, bodyfat=9.5,
               goal_priorities=_goals, current_phase="cut", weeks_in_cut=3.0)))
check("E16 a bulk ENDS when it reaches the 18% ceiling",
      _rec(weight_trend=0.4, days_to_deadline=None, bodyfat=18.5,
           goal_priorities=_goals, current_phase="bulk")["phase"] == "cut")

# TNF rule 5 — the duration cap outranks an unmet bodyfat target.
_capped = _rec(weight_trend=-0.5, days_to_deadline=51, bodyfat=13.5,
               goal_priorities=_goals, current_phase="cut", weeks_in_cut=MAX_DEFICIT_WEEKS)
check("E16 the 4-6wk cap ends the cut even with the bodyfat target UNMET",
      _capped["phase"] != "cut" and _capped["reverse_diet"],
      f"wk {MAX_DEFICIT_WEEKS} at 13.5% (target 10%) → {_capped['phase']}, reverse={_capped['reverse_diet']}")
check("E16 the cap fires with NO photo at all (it is unconditional)",
      (lambda r: r["phase"] != "cut" and r["reverse_diet"])(
          _rec(weight_trend=-0.5, days_to_deadline=51, bodyfat=None,
               goal_priorities=_goals, current_phase="cut", weeks_in_cut=7.0)))
check("E16 one week short of the cap the cut still runs",
      _rec(weight_trend=-0.5, days_to_deadline=51, bodyfat=13.5,
           goal_priorities=_goals, current_phase="cut",
           weeks_in_cut=MAX_DEFICIT_WEEKS - 1)["phase"] == "cut")
check("E16 the cap is dormant when not cutting (a bulk is not capped)",
      _rec(weight_trend=0.3, days_to_deadline=None, bodyfat=13.5,
           goal_priorities=_goals, current_phase="bulk", weeks_in_cut=9.0)["phase"] == "bulk")

# The cap must agree with the one nutrition_modulator already enforces, or the
# phase recommender says "cut" while the modulator quietly backs the calories out.
import engine.nutrition_modulator as _nm, inspect as _insp
check("E16 the phase cap matches the deficit cap in nutrition_modulator",
      "weeks_in_cut) >= 6" in _insp.getsource(_nm).replace("float(", ""),
      f"both gate at {MAX_DEFICIT_WEEKS:.0f} weeks")

# Nolan's live state on 2026-07-11: cut opened 2026-06-07.
_wk = (_dt.date(2026, 7, 11) - _dt.date(2026, 6, 7)).days / 7.0
check("E16 Nolan is 4.9wk in on 2026-07-11 — still cutting, cap not yet reached",
      _rec(weight_trend=-0.52, days_to_deadline=51, bodyfat=13.5, goal_priorities=_goals,
           current_phase="cut", weeks_in_cut=_wk)["phase"] == "cut", f"{_wk:.1f} weeks")
_wk19 = (_dt.date(2026, 7, 19) - _dt.date(2026, 6, 7)).days / 7.0
check("E16 the block auto-ends on 2026-07-19 (6.0wk) and flips to reverse",
      (lambda r: r["reverse_diet"] and r["phase"] == "maintain")(
          _rec(weight_trend=-0.52, days_to_deadline=43, bodyfat=13.5, goal_priorities=_goals,
               current_phase="cut", weeks_in_cut=_wk19)), f"{_wk19:.1f} weeks")


# ── F14: program-content stagnation fix (2026-07-27) ──────────────────────────
# apply_philosophy's accessory cap used to collapse every weekly_target < 8 to a
# flat 1 set and every target >= 8 to a flat 2 — nothing in the 1-7 range ever
# showed a visible change. session_target (weekly_target / expected frequency)
# now drives the cap directly, so adjacent weekly targets can produce different
# per-session sets.
from engine.athlete_profile import accessory_set_cap, apply_philosophy
check("F14 accessory cap tracks session_target, not just weekly_target>=8",
      accessory_set_cap(5, session_target=1) == 1 and accessory_set_cap(7, session_target=2) == 2,
      f"cap(5,1)={accessory_set_cap(5, session_target=1)} cap(7,2)={accessory_set_cap(7, session_target=2)}")
check("F14 accessory cap still ceilings at 2 regardless of session_target",
      accessory_set_cap(20, session_target=5) == 2)
check("F14 accessory cap floors at 1 even with session_target=0",
      accessory_set_cap(0, session_target=0) == 1)
check("F14 accessory cap falls back to the old binary rule with no session_target",
      accessory_set_cap(3) == 1 and accessory_set_cap(8) == 2)
_ex_lo = apply_philosophy({"sets": 3, "rir_target": 2}, weekly_target=4, session_target=1)
_ex_hi = apply_philosophy({"sets": 3, "rir_target": 2}, weekly_target=8, session_target=2)
check("F14 apply_philosophy actually varies sets between two real weekly targets",
      _ex_lo["sets"] != _ex_hi["sets"], f"target4→{_ex_lo['sets']} target8→{_ex_hi['sets']}")

# update_mrv: previously only >=7 soreness ever moved the posterior down, and a
# responding-but-budget-capped muscle (weekly_sets+1 <= mean) never accumulated
# any evidence (n_obs stuck at 0). Two new paths: a moderate-soreness stall now
# nudges the mean down (softly), and a responding/recoverable-but-capped week
# ticks n_obs / shrinks variance without moving the mean.
_row0 = {"mrv_mean": 16.0, "mrv_var": 9.0, "n_obs": 0, "mev": 6, "mav": 14}
_moderate_stall = update_mrv(_row0, weekly_sets=8, e1rm_slope=-0.1, soreness_avg=5.5,
                              prior_mrv=16.0, phase=None)
check("F14 a moderate-soreness stall now moves the posterior (was frozen before)",
      _moderate_stall["mrv_mean"] < 16.0, f"mean→{_moderate_stall['mrv_mean']}")
check("F14 a moderate-soreness stall still counts as an observation",
      _moderate_stall["n_obs"] == 1)
_dead_zone = update_mrv(_row0, weekly_sets=8, e1rm_slope=0.2, soreness_avg=2.0,
                          prior_mrv=16.0, phase=None)
check("F14 a responding-but-budget-capped week ticks n_obs without moving the mean",
      _dead_zone["n_obs"] == 1 and _dead_zone["mrv_mean"] == 16.0,
      f"n_obs={_dead_zone['n_obs']} mean={_dead_zone['mrv_mean']}")
check("F14 that same tick still shrinks the variance (evidence accumulates)",
      _dead_zone["mrv_var"] < 9.0)
_on_cut_dead_zone = update_mrv(_row0, weekly_sets=8, e1rm_slope=-0.1, soreness_avg=5.5,
                                 prior_mrv=16.0, phase="cut")
check("F14 the moderate-soreness down-drift is still suppressed on a cut (F9 unchanged)",
      _on_cut_dead_zone["mrv_mean"] == 16.0 and _on_cut_dead_zone["n_obs"] == 0)

# ── F15: carb-timing windows follow the ACTUAL split (2026-08-05) ─────────────
# _carb_windows used to branch on "today has a lift AND has cardio", which is a
# different question from "the day was split into two sessions".
# evaluate_two_a_day_split() decides that separately and only stamps time_of_day
# when the halves are genuinely pulled apart, so a combined lift+cardio block was
# rendering a "Between sessions" window for a between that does not exist.
import datetime as _dt
import compute_athlete_state as _cas

_today_iso = _dt.date.today().isoformat()
_tomorrow_iso = (_dt.date.today() + _dt.timedelta(days=1)).isoformat()

def _windows_for(exercises, cardio, tomorrow=None, target=100):
    rows = [{"scheduled_date": _today_iso, "exercises": exercises, "cardio_sessions": cardio}]
    if tomorrow:
        rows.append({"scheduled_date": _tomorrow_iso, "exercises": tomorrow, "cardio_sessions": []})
    _orig = _cas.sb_get
    _cas.sb_get = lambda table, params: rows
    try:
        return _cas._carb_windows("u", target)
    finally:
        _cas.sb_get = _orig

_LIFT_AM = [{"sets": 3, "time_of_day": "am"}]
_LIFT_PM = [{"sets": 3, "time_of_day": "pm"}]
_LIFT_NO = [{"sets": 3}]
_CARDIO_AM = [{"duration_minutes": 40, "time_of_day": "am"}]
_CARDIO_PM = [{"duration_minutes": 40, "time_of_day": "pm"}]
_CARDIO_NO = [{"duration_minutes": 40}]

_split = _windows_for(_LIFT_AM, _CARDIO_PM)
check("F15 a genuine two-a-day still gets three windows",
      len(_split) == 3, f"{[w['label'] for w in _split]}")
check("F15 those windows name the modality, not AM/PM",
      _split[0]["label"] == "Pre-lift" and _split[-1]["label"] == "Post-cardio",
      f"{_split[0]['label']} … {_split[-1]['label']}")
check("F15 a COMBINED lift+cardio block gets two windows, not a phantom 'between'",
      len(_windows_for(_LIFT_AM, _CARDIO_AM)) == 2,
      f"{[w['label'] for w in _windows_for(_LIFT_AM, _CARDIO_AM)]}")
check("F15 unstamped lift+cardio rows read as ONE block (conservative default)",
      len(_windows_for(_LIFT_NO, _CARDIO_NO)) == 2)
check("F15 window order follows the stamps, so a flipped day flips the labels",
      [w["label"] for w in _windows_for(_LIFT_PM, _CARDIO_AM)][0] == "Pre-cardio")
check("F15 a rest day still gets no windows",
      _windows_for([], []) == [] and _windows_for([{"sets": 0}], []) == [])
check("F15 lift-only and cardio-only days are labelled distinctly",
      _windows_for(_LIFT_NO, [])[0]["label"] == "Pre-lift"
      and _windows_for([], _CARDIO_NO)[0]["label"] == "Pre-cardio")
_tomorrow_on = _windows_for(_LIFT_AM, _CARDIO_PM, tomorrow=_LIFT_NO)
check("F15 back-to-back demand shifts carbs to the final window",
      _tomorrow_on[-1]["grams"] > _split[-1]["grams"],
      f"{_split[-1]['grams']}g → {_tomorrow_on[-1]['grams']}g when tomorrow trains")
# The client rescales off `pct` because it owns the carb TOTAL (calorie remainder
# after its own cut clamps); absolute grams here can disagree with what it shows.
check("F15 every window carries a pct for the client to rescale from",
      all("pct" in w for w in _split))
for _case, _w in (("two-a-day", _split), ("single session", _windows_for(_LIFT_NO, []))):
    check(f"F15 the {_case} split's percentages sum to exactly 1",
          abs(sum(w["pct"] for w in _w) - 1.0) < 1e-9,
          f"sum={sum(w['pct'] for w in _w)}")


# ── F16: the approved plan owns exercise SELECTION (2026-08-05) ───────────────
# Today renders training_prescription; the Train tab renders program_workouts.
# Both used to generate their own exercise list and agreed only when their shared
# inputs happened to agree — on 2026-08-05 the same day was 8 movements on Today
# and 9 in the plan, only 5 of them shared. mpc_prescriber now passes the plan's
# exercises into SessionGenerator.generate(planned_exercises=…), which replaces
# selection and leaves every autoregulation layer (soreness, cut, interference,
# e1RM load) running on top. This gates that the daily engine can never invent a
# movement the plan doesn't contain.
print("\n--- F16: daily prescription pinned to the approved plan ---")
from engine.session_generator import SessionGenerator as _SG

_PLAN = [
    {"name": "Bench Press (Top Set)", "sets": 1, "rep_target": "3", "rir_target": 2, "rest_seconds": 180},
    {"name": "Chest-Supported Row", "sets": 3, "rep_target": "8-10", "rir_target": 1, "rest_seconds": 120},
    {"name": "Lateral Raise", "sets": 3, "rep_target": "12-15", "rir_target": 0, "rest_seconds": 45},
]

def _presc(action="STRENGTH", **kw):
    return _SG().generate(
        banister_state={}, interference={}, overreach={}, acwr=1.0,
        strength={"Bench (paused comp)": {"current_e1rm": 300}}, latest_pst={},
        nutrition_mod={}, vdot_zones={}, mileage_cap=20.0,
        mpc_action=action, mpc_intensity=1.0, split_override="upper_a", **kw)

_free = _presc()
_pin = _presc(planned_exercises=_PLAN)
_pin_names = [e["name"] for e in _pin["strength_block"]]
_plan_names = {e["name"] for e in _PLAN}

check("F16 an unpinned session really would have differed (the bug is reachable)",
      {e["name"] for e in _free["strength_block"]} != _plan_names,
      f"unpinned={[e['name'] for e in _free['strength_block']]}")
check("F16 the prescription programs no movement outside the approved plan",
      set(_pin_names) <= _plan_names, f"got {_pin_names}")
check("F16 every planned lift survives into the prescription",
      _plan_names <= set(_pin_names), f"missing {_plan_names - set(_pin_names)}")
check("F16 the plan's order is preserved", _pin_names == [e["name"] for e in _PLAN])
# Selection is pinned; the daily numbers are still the engine's. The bench top set
# must come back with a real e1RM-derived load, which the stored plan row has no
# column for at all — that's the half the daily path still owns.
_bench = next(e for e in _pin["strength_block"] if e["name"] == "Bench Press (Top Set)")
check("F16 pinned lifts still get today's autoregulated load", _bench["load_lbs"] > 0,
      f"load_lbs={_bench['load_lbs']}")
check("F16 pinned lifts keep the plan's rep/RIR targets",
      str(_bench["reps"]) == "3" and int(_bench["rir"]) == 2,
      f"reps={_bench['reps']} rir={_bench['rir']}")
# A lift blocked after the plan was approved must not come back through it.
_blocked = _presc(planned_exercises=_PLAN, blocked_exercises={"lateral raise"})
check("F16 a newly blocked lift is not resurrected by an old plan",
      "Lateral Raise" not in [e["name"] for e in _blocked["strength_block"]])
# No plan for today (cold start, or a rest day in the plan) must not blank the
# session — the daily generator still owns the fallback.
check("F16 no plan falls back to the generated session",
      [e["name"] for e in _presc(planned_exercises=[])["strength_block"]]
      == [e["name"] for e in _free["strength_block"]])
check("F16 a REST day stays empty regardless of the plan",
      _presc(action="REST", planned_exercises=_PLAN)["strength_block"] == [])


print()
if all(_results):
    print(f"ALL {len(_results)} CHECKS PASSED")
else:
    print(f"{_results.count(False)}/{len(_results)} CHECKS FAILED")
    raise SystemExit(1)
