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
from engine.allocator import frequency_targets
from engine.session_generator import split_from_title, build_title

PASS, FAIL = "✓ PASS", "✗ FAIL"
_results = []


def check(name, ok, detail=""):
    _results.append(ok)
    print(f"  {PASS if ok else FAIL}  {name}" + (f"  — {detail}" if detail else ""))


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


print()
if all(_results):
    print(f"ALL {len(_results)} CHECKS PASSED")
else:
    print(f"{_results.count(False)}/{len(_results)} CHECKS FAILED")
    raise SystemExit(1)
