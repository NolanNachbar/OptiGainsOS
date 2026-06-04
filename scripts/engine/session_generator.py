"""
Session Generator.

Prescribes complete daily training sessions with no fixed program.
Given the MPC's modality directive and the current physiological state,
outputs: session type, exercises, sets/reps/load, and a human-readable rationale.

Session types (single-session unless MPC selects TWO_A_DAY):
  STRENGTH      — compound barbell lifts
  CALISTHENICS  — pull-up / push-up / sit-up volume
  CARDIO        — VDOT-paced run
  MIXED         — combination determined by largest adaptation deficit
  TWO_A_DAY     — AM strength + PM conditioning (only when MPC deems recovery supports it)
  DELOAD        — 55% load across all movements
  REST          — full rest

Concurrent training priorities:
  PRIMARY DEADLINE:  Aug 31 2026 — PST (pushups/situps/pullups/run)
  SECONDARY (ASAP):  Bench 315 / Squat 450 / Deadlift 500
"""
import datetime
import math

DEADLINE = datetime.date(2026, 8, 31)

PST_TARGETS = {
    "pushups":           100,
    "situps":            100,
    "pullups":           20,
    "run_1_5_mile_secs": 540,   # 9:00
    "run_4_mile_secs":   1560,  # 26:00
}
STRENGTH_TARGETS = {
    "squat":    450,
    "bench":    315,
    "deadlift": 500,
}

GTG_PULLUP_FRACTION = 0.60
PUSHUP_DAILY_TARGET = 200
SITUP_DAILY_TARGET  = 150

# PM conditioning plan by weekday for TWO_A_DAY sessions (Monday=0 … Sunday=6)
WEEKLY_PM_PLAN = {
    0: {"type": "calisthenics", "note": "PST pyramid — push-up/sit-up/pull-up max rounds"},
    1: {"type": "intervals",    "reps": 8, "dist_m": 400, "note": "400m track repeats, 90s rest"},
    2: {"type": "easy_run",     "miles": 3.0, "note": "Zone 2, conversational pace"},
    3: {"type": "easy_run",     "miles": 4.0, "note": "Zone 2, conversational pace"},
    4: {"type": "calisthenics", "note": "PST pyramid — track weekly totals"},
    5: {"type": "long_run",     "miles": 5.5, "note": "45–90 min OR 4-mile boot ruck (alternate weekly)"},
    6: {"type": "swim",         "meters": 500, "note": "Easy sidestroke/breaststroke. Time it."},
}


def days_to_deadline() -> int:
    return max(0, (DEADLINE - datetime.date.today()).days)


def _round_load(lbs: float) -> float:
    return round(lbs / 2.5) * 2.5


def pst_readiness(latest_pst: dict) -> float:
    if not latest_pst:
        return 0.0
    scores = []
    for field, target in [("pushups", PST_TARGETS["pushups"]),
                          ("situps",  PST_TARGETS["situps"]),
                          ("pullups", PST_TARGETS["pullups"])]:
        val = latest_pst.get(field)
        if val:
            scores.append(min(float(val) / target, 1.0))
    run_secs = latest_pst.get("run_seconds")
    if run_secs:
        target = PST_TARGETS["run_1_5_mile_secs"]
        scores.append(min(target / max(float(run_secs), target * 0.7), 1.0))
    return round(sum(scores) / max(len(scores), 1), 3) if scores else 0.0


def strength_readiness(strength: dict) -> float:
    scores = []
    for lift, target in STRENGTH_TARGETS.items():
        e1rm = strength.get(lift, {}).get("current_e1rm", 0)
        if e1rm > 0:
            scores.append(min(float(e1rm) / target, 1.0))
    return round(sum(scores) / max(len(scores), 1), 3) if scores else 0.0


class SessionGenerator:

    def generate(
        self,
        *,
        banister_state:  dict,
        interference:    dict,
        overreach:       dict,
        acwr:            float,
        strength:        dict,
        latest_pst:      dict,
        nutrition_mod:   dict,
        vdot_zones:      dict,
        mileage_cap:     float,
        mpc_action:      str,
        mpc_intensity:   float = 1.0,
    ) -> dict:

        days_left = days_to_deadline()
        pst_score = pst_readiness(latest_pst)
        str_score = strength_readiness(strength)

        urgency = 1.0 - min(days_left / 90.0, 1.0)
        w_pst   = min(0.90, 0.50 + urgency * 0.45)
        w_str   = 1.0 - w_pst

        p = {
            "date":                datetime.date.today().isoformat(),
            "mpc_action":          mpc_action,
            "mpc_intensity":       round(mpc_intensity, 2),
            "session_type":        None,
            "strength_block":      None,
            "calisthenics_block":  None,
            "run_block":           None,
            "swim_block":          None,
            "rationale":           "",
            "interference_warning": None,
            "days_to_deadline":    days_left,
            "pst_readiness":       pst_score,
            "strength_readiness":  str_score,
            "deadline_weights":    {"pst": round(w_pst, 2), "strength": round(w_str, 2)},
        }

        # ── Hard overrides ────────────────────────────────────────────────────
        if overreach.get("overreaching"):
            return self._rest(p, "CRITICAL_OVERREACH: HRV and RHR indicate systemic "
                               "overreaching. Full rest required today.")
        if mpc_action == "REST":
            return self._rest(p, "MPC-prescribed rest day for recovery.")
        if mpc_action == "DELOAD":
            return self._deload(p, strength)

        # ── Interference advisory ─────────────────────────────────────────────
        if interference.get("interference_level") == "HIGH":
            p["interference_warning"] = (
                f"AMPK={interference.get('ampk', 0):.3f} elevated from recent cardio. "
                "mTORC1 anabolic signaling suppressed. If doing both sessions today, "
                "separate strength from cardio by ≥3 hours, or shift strength to tomorrow."
            )

        # ── Route by MPC action ───────────────────────────────────────────────
        if mpc_action == "STRENGTH":
            return self._strength(p, strength, nutrition_mod, mpc_intensity)

        if mpc_action == "CALISTHENICS":
            return self._calisthenics(p, latest_pst, mpc_intensity)

        if mpc_action == "CARDIO":
            return self._cardio(p, vdot_zones, mileage_cap, mpc_intensity)

        if mpc_action == "TWO_A_DAY":
            return self._two_a_day(p, strength, nutrition_mod, latest_pst,
                                   vdot_zones, mileage_cap, mpc_intensity)

        if mpc_action in ("MIXED", "LIGHT"):
            pst_gap = (1.0 - pst_score) * w_pst
            str_gap = (1.0 - str_score) * w_str
            if pst_gap > str_gap * 1.15:
                p = self._calisthenics(p, latest_pst, mpc_intensity * 0.85)
                return self._add_run(p, vdot_zones, round(mileage_cap * 0.4, 1), "easy")
            else:
                p = self._strength(p, strength, nutrition_mod, mpc_intensity * 0.90)
                return self._add_calisthenics_accessory(p, latest_pst)

        return self._rest(p, f"Unrecognized MPC action '{mpc_action}' — defaulting to rest.")

    # ── Session builders ──────────────────────────────────────────────────────

    def _strength(self, p, strength, nutrition_mod, intensity):
        p["session_type"] = "strength"
        mrv_adj = float(nutrition_mod.get("mrv_adj", 16))

        ranked = sorted(
            STRENGTH_TARGETS.items(),
            key=lambda kv: (strength.get(kv[0], {}).get("current_e1rm", 0) / kv[1]),
        )

        exercises = []
        for i, (lift, target) in enumerate(ranked):
            e1rm = strength.get(lift, {}).get("current_e1rm", 0)
            if e1rm <= 0:
                continue
            if i == 0:
                sets, reps, load_pct = min(5, max(3, int(mrv_adj / 4))), 5, 0.83 * intensity
            elif i == 1:
                sets, reps, load_pct = 3, 5, 0.78 * intensity
            else:
                sets, reps, load_pct = 3, 6, 0.72 * intensity

            exercises.append({
                "name":     lift,
                "sets":     sets,
                "reps":     reps,
                "load_lbs": _round_load(e1rm * load_pct),
                "load_pct": round(load_pct, 2),
                "e1rm_ref": round(e1rm),
            })

        p["strength_block"] = exercises
        primary      = ranked[0][0] if ranked else "—"
        primary_e1rm = round(strength.get(primary, {}).get("current_e1rm", 0))
        p["rationale"] = (
            f"Strength session. Most lagging lift: {primary} "
            f"({primary_e1rm}/{ranked[0][1] if ranked else '?'} lbs). "
            f"Intensity scalar {intensity:.2f}. MRV adj={mrv_adj:.0f} sets/wk."
        )
        return p

    def _calisthenics(self, p, latest_pst, intensity):
        p["session_type"] = "calisthenics"
        pullup_max  = (latest_pst or {}).get("pullups") or 10
        gtg_reps    = max(1, round(float(pullup_max) * GTG_PULLUP_FRACTION))
        pushup_sets = 5
        pushup_reps = max(5, round(PUSHUP_DAILY_TARGET * intensity / pushup_sets))
        situp_sets  = 5
        situp_reps  = max(5, round(SITUP_DAILY_TARGET  * intensity / situp_sets))
        p["calisthenics_block"] = {
            "pullups": {
                "protocol":  "grease_the_groove",
                "sets":      6,
                "reps_each": gtg_reps,
                "note":      (f"Spread 6 sets across the day. Sub-max: {gtg_reps} reps. "
                              f"Current max ~{pullup_max}. Target: {PST_TARGETS['pullups']}."),
            },
            "pushups": {"sets": pushup_sets, "reps_each": pushup_reps, "total": pushup_sets * pushup_reps},
            "situps":  {"sets": situp_sets,  "reps_each": situp_reps,  "total": situp_sets  * situp_reps},
        }
        p["rationale"] = (
            f"PST calisthenics day. Pull-up GTG: 6×{gtg_reps}. "
            f"Push-ups: {pushup_sets}×{pushup_reps}. Sit-ups: {situp_sets}×{situp_reps}."
        )
        return p

    def _cardio(self, p, vdot_zones, mileage_cap, intensity):
        p["session_type"] = "cardio"
        session_miles = round(mileage_cap * 0.38 * intensity, 1)
        easy_pace     = vdot_zones.get("easy_pace", "N/A")
        thresh_pace   = vdot_zones.get("threshold_pace", "N/A")
        p["run_block"] = {
            "session_miles":  session_miles,
            "pace":           easy_pace,
            "zone":           "easy (≤70% VO2max)",
            "threshold_note": f"Add {thresh_pace}/mi threshold intervals only on designated quality days.",
        }
        p["rationale"] = (
            f"Aerobic run. VDOT={vdot_zones.get('current_vdot')} "
            f"(target={vdot_zones.get('target_vdot')}, gap={vdot_zones.get('vdot_gap')}). "
            f"Easy pace {easy_pace}/mi. Weekly mileage cap {mileage_cap} mi."
        )
        return p

    def _two_a_day(self, p, strength, nutrition_mod, latest_pst,
                   vdot_zones, mileage_cap, intensity):
        """AM strength + PM conditioning per the weekly plan."""
        weekday  = datetime.date.today().weekday()
        pm_plan  = WEEKLY_PM_PLAN[weekday]
        pm_type  = pm_plan["type"]

        # AM: full strength session at slightly backed-off intensity to leave room for PM
        p = self._strength(p, strength, nutrition_mod, intensity * 0.90)

        # PM: follow the weekly conditioning plan at reduced intensity
        pm_intensity = intensity * 0.85

        if pm_type == "intervals":
            scaled_reps = max(4, round(pm_plan["reps"] * pm_intensity))
            p["run_block"] = {
                "type":         "intervals",
                "reps":         scaled_reps,
                "distance_m":   pm_plan["dist_m"],
                "pace":         vdot_zones.get("interval_pace", "N/A"),
                "rest_seconds": 90,
                "note":         pm_plan["note"],
            }
        elif pm_type in ("easy_run", "long_run"):
            miles = round(pm_plan["miles"] * pm_intensity, 1)
            miles = max(1.5, min(miles, mileage_cap * 0.50))
            p["run_block"] = {
                "type":          pm_type,
                "session_miles": miles,
                "pace":          vdot_zones.get("easy_pace", "N/A"),
                "zone":          "Zone 2",
                "note":          pm_plan["note"],
            }
        elif pm_type == "calisthenics":
            pullup_max  = (latest_pst or {}).get("pullups") or 10
            gtg_reps    = max(1, round(float(pullup_max) * 0.50))
            pushup_reps = max(5, round(PUSHUP_DAILY_TARGET * pm_intensity / 5))
            situp_reps  = max(5, round(SITUP_DAILY_TARGET  * pm_intensity / 5))
            p["calisthenics_block"] = {
                "pullups": {"protocol": "grease_the_groove", "sets": 4, "reps_each": gtg_reps,
                            "note": pm_plan["note"]},
                "pushups": {"sets": 5, "reps_each": pushup_reps, "total": 5 * pushup_reps},
                "situps":  {"sets": 5, "reps_each": situp_reps,  "total": 5 * situp_reps},
            }
        elif pm_type == "swim":
            p["swim_block"] = {
                "meters": pm_plan["meters"],
                "stroke": "sidestroke or breaststroke",
                "note":   pm_plan["note"],
            }

        day_name = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekday]
        p["session_type"] = f"two_a_day ({day_name}: strength + {pm_type})"
        p["session_order"] = "strength_am_conditioning_pm"
        p["rationale"] = (
            f"Two-a-day: AM strength at {intensity * 0.90:.2f}x + PM {pm_type} at {pm_intensity:.2f}x. "
            f"Recovery and ACWR support the extra volume today."
        )
        return p

    def _add_run(self, p, vdot_zones, miles, zone):
        pace = (vdot_zones.get("easy_pace") if zone == "easy"
                else vdot_zones.get("threshold_pace"))
        p["run_block"]    = {"session_miles": miles, "pace": pace, "zone": zone}
        p["session_type"] = (p.get("session_type") or "") + "+cardio"
        return p

    def _add_calisthenics_accessory(self, p, latest_pst):
        pullup_max = (latest_pst or {}).get("pullups") or 10
        gtg_reps   = max(1, round(float(pullup_max) * 0.50))
        p["calisthenics_block"] = {
            "pullups": {
                "protocol":  "grease_the_groove",
                "sets":      4,
                "reps_each": gtg_reps,
                "note":      "Accessory GTG after strength. Low fatigue, high frequency.",
            },
            "pushups": {"sets": 3, "reps_each": 30, "total": 90},
        }
        p["session_type"] = (p.get("session_type") or "") + "+calisthenics"
        return p

    def _rest(self, p, reason):
        p["session_type"] = "rest"
        p["rationale"]    = reason
        return p

    def _deload(self, p, strength):
        p["session_type"] = "deload"
        exercises = []
        for lift in ["squat", "bench", "deadlift"]:
            e1rm = strength.get(lift, {}).get("current_e1rm", 0)
            if e1rm > 0:
                exercises.append({
                    "name":     lift,
                    "sets":     2,
                    "reps":     5,
                    "load_lbs": _round_load(e1rm * 0.55),
                    "load_pct": 0.55,
                    "note":     "Deload: 55% e1RM. Maintain pattern, no grinding.",
                })
        p["strength_block"] = exercises
        p["rationale"] = ("Deload. 55% load, 2 sets per lift. "
                          "Goal: drive fatigue down, maintain motor patterns.")
        return p
