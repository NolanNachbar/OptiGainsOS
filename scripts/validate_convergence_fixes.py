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
from engine.session_generator import split_from_title, build_title

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


# ── F13: single low-severity pain note de-prioritises, doesn't veto ───────────
soft = exercise_reward(0.5, 0, 0, 0.0, 0, pain=True, pain_severity=1, pain_mentions=1)
hard = exercise_reward(0.5, 0, 0, 0.0, 0, pain=True, pain_severity=2, pain_mentions=1)
check("F13 single low-sev pain note is a soft nudge (not -1.5 veto)", -1.5 < soft < 0,
      f"reward {soft}")
check("F13 sharp (sev≥2) pain note still hard-vetoes", hard <= -1.5, f"reward {hard}")


# ── F2: fallback slope is scale-comparable to e1RM (not raw weight×reps ~60) ──
import importlib.util
_spec = importlib.util.spec_from_file_location("gwp", "generate_weekly_program.py")
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


print()
if all(_results):
    print(f"ALL {len(_results)} CHECKS PASSED")
else:
    print(f"{_results.count(False)}/{len(_results)} CHECKS FAILED")
    raise SystemExit(1)
