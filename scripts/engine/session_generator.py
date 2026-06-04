"""
Session Generator.

Prescribes complete daily training sessions with no fixed program.
Given the MPC's modality directive and the current physiological state,
outputs: session type, exercises, sets/reps/load, and a human-readable rationale.

Concurrent training priorities:
  PRIMARY DEADLINE:  Aug 31 2026 — PST (pushups/situps/pullups/run)
  SECONDARY (ASAP):  Bench 315 / Squat 450 / Deadlift 500

Session types:
  STRENGTH      — compound barbell lifts
  CALISTHENICS  — pull-up / push-up / sit-up volume
  CARDIO        — VDOT-paced run
  MIXED         — combination determined by largest adaptation deficit
  DELOAD        — 55% load across all movements
  REST          — full rest
"""
import datetime
import math

# Hard PST deadline
DEADLINE = datetime.date(2026, 8, 31)

# Targets
PST_TARGETS = {
    "pushups":            100,
    "situps":             100,
    "pullups":            20,
    "run_1_5_mile_secs":  540,    # 9:00
    "run_4_mile_secs":    1560,   # 26:00
}
STRENGTH_TARGETS = {
    "squat":     450,
    "bench":     315,
    "deadlift":  500,
}

# Calisthenics volume constants
GTG_PULLUP_FRACTION   = 0.60    # GTG sets at 60% of estimated max
PUSHUP_DAILY_TARGET   = 200     # total push-ups across all sets per session
SITUP_DAILY_TARGET    = 150


def days_to_deadline() -> int:
    return max(0, (DEADLINE - datetime.date.today()).days)


def _round_load(lbs: float) -> float:
    """Round to nearest 2.5 lbs (standard plate increment)."""
    return round(lbs / 2.5) * 2.5


def pst_readiness(latest_pst: dict) -> float:
    """Composite 0–1 readiness vs. PST targets. 0 = no data."""
    if not latest_pst:
        return 0.0
    scores = []
    for field, target in [("pushups", PST_TARGETS["pushups"]),
                          ("situps",  PST_TARGETS["situps"]),
                          ("pullups", PST_TARGETS["pullups"])]:
        val = latest_pst.get(field)
        if val:
            scores.append(min(float(val) / target, 1.0))
    # Run (lower is better)
    run_secs = latest_pst.get("run_seconds")   # 1.5-mile time
    if run_secs:
        target = PST_TARGETS["run_1_5_mile_secs"]
        scores.append(min(target / max(float(run_secs), target * 0.7), 1.0))
    return round(sum(scores) / max(len(scores), 1), 3) if scores else 0.0


def strength_readiness(strength: dict) -> float:
    """Composite 0–1 readiness vs. strength targets."""
    scores = []
    for lift, target in STRENGTH_TARGETS.items():
        e1rm = strength.get(lift, {}).get("current_e1rm", 0)
        if e1rm > 0:
            scores.append(min(float(e1rm) / target, 1.0))
    return round(sum(scores) / max(len(scores), 1), 3) if scores else 0.0


class SessionGenerator:
    """
    Generates a complete daily training session prescription.

    Call generate() after mpc_prescriber determines the day's action and intensity.
    No state is maintained between calls — all context is passed in.
    """

    def generate(
        self,
        *,
        # Engine state
        banister_state:  dict,   # {fitness, fatigue, tsb_banister, confidence}
        interference:    dict,   # {ampk, mtorc1, interference_level, anabolic_window}
        overreach:       dict,   # {fatigue_state, overreaching, hrv_z_3d}
        acwr:            float,
        # Athlete metrics
        strength:        dict,   # from compute_strength()
        latest_pst:      dict,   # most recent PST test row
        nutrition_mod:   dict,   # from NutritionModulator.modulate()
        vdot_zones:      dict,   # from VDOTEngine.pace_zones()
        mileage_cap:     float,
        # MPC directive
        mpc_action:      str,    # "REST"|"DELOAD"|"STRENGTH"|"CARDIO"|"CALISTHENICS"|"MIXED"|"LIGHT"
        mpc_intensity:   float = 1.0,  # 0.7–1.1 intensity scalar
    ) -> dict:

        days_left  = days_to_deadline()
        pst_score  = pst_readiness(latest_pst)
        str_score  = strength_readiness(strength)

        # Deadline urgency: as Aug 31 approaches, PST weight dominates
        # 90 days: 50/50  |  45 days: 70/30  |  14 days: 88/12
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
                f"AMPK={interference['ampk']:.2f} (elevated from recent cardio). "
                "mTORC1 anabolic signaling is suppressed. If doing both today, "
                "separate strength from cardio by ≥3 hours, or shift strength to tomorrow."
            )

        # ── Route by MPC action ───────────────────────────────────────────────
        if mpc_action == "STRENGTH":
            return self._strength(p, strength, nutrition_mod, mpc_intensity)

        if mpc_action == "CALISTHENICS":
            return self._calisthenics(p, latest_pst, mpc_intensity)

        if mpc_action == "CARDIO":
            return self._cardio(p, vdot_zones, mileage_cap, mpc_intensity)

        if mpc_action in ("MIXED", "LIGHT"):
            pst_gap = (1.0 - pst_score) * w_pst
            str_gap = (1.0 - str_score) * w_str

            if pst_gap > str_gap * 1.15:
                # PST more deficit → calisthenics + easy run
                p = self._calisthenics(p, latest_pst, mpc_intensity * 0.85)
                return self._add_run(p, vdot_zones, round(mileage_cap * 0.4, 1), "easy")
            else:
                # Strength more deficit → strength + calisthenics accessory
                p = self._strength(p, strength, nutrition_mod, mpc_intensity * 0.90)
                return self._add_calisthenics_accessory(p, latest_pst)

        return self._rest(p, f"Unrecognized MPC action '{mpc_action}' — defaulting to rest.")

    # ── Session builders ──────────────────────────────────────────────────────

    def _strength(self, p, strength, nutrition_mod, intensity):
        p["session_type"] = "strength"
        mrv_adj = float(nutrition_mod.get("mrv_adj", 16))

        # Rank lifts by % of target — most lagging gets primary slot
        ranked = sorted(
            STRENGTH_TARGETS.items(),
            key=lambda kv: (strength.get(kv[0], {}).get("current_e1rm", 0) / kv[1]),
        )

        exercises = []
        for i, (lift, target) in enumerate(ranked):
            e1rm = strength.get(lift, {}).get("current_e1rm", 0)
            if e1rm <= 0:
                continue

            if i == 0:   # primary / most lagging
                sets     = min(5, max(3, int(mrv_adj / 4)))
                reps     = 5
                load_pct = 0.83 * intensity
            elif i == 1:
                sets     = 3
                reps     = 5
                load_pct = 0.78 * intensity
            else:
                sets     = 3
                reps     = 6
                load_pct = 0.72 * intensity

            exercises.append({
                "name":     lift,
                "sets":     sets,
                "reps":     reps,
                "load_lbs": _round_load(e1rm * load_pct),
                "load_pct": round(load_pct, 2),
                "e1rm_ref": round(e1rm),
            })

        p["strength_block"] = exercises
        primary             = ranked[0][0] if ranked else "—"
        primary_e1rm        = round(strength.get(primary, {}).get("current_e1rm", 0))
        p["rationale"] = (
            f"Strength session. Most lagging lift: {primary} "
            f"({primary_e1rm}/{ranked[0][1] if ranked else '?'} lbs). "
            f"Intensity scalar {intensity:.2f}. "
            f"MRV adj={mrv_adj:.0f} sets/wk."
        )
        return p

    def _calisthenics(self, p, latest_pst, intensity):
        p["session_type"] = "calisthenics"
        pullup_max = (latest_pst or {}).get("pullups") or 10
        gtg_reps   = max(1, round(float(pullup_max) * GTG_PULLUP_FRACTION))

        pushup_sets = 5
        pushup_reps = max(5, round(PUSHUP_DAILY_TARGET * intensity / pushup_sets))
        situp_sets  = 5
        situp_reps  = max(5, round(SITUP_DAILY_TARGET  * intensity / situp_sets))

        p["calisthenics_block"] = {
            "pullups": {
                "protocol":  "grease_the_groove",
                "sets":      6,
                "reps_each": gtg_reps,
                "note":      (f"Spread 6 sets across the day. "
                              f"Sub-max: {gtg_reps} reps. "
                              f"Current max ~{pullup_max}. Target: {PST_TARGETS['pullups']}."),
            },
            "pushups": {
                "sets":      pushup_sets,
                "reps_each": pushup_reps,
                "total":     pushup_sets * pushup_reps,
            },
            "situps": {
                "sets":      situp_sets,
                "reps_each": situp_reps,
                "total":     situp_sets * situp_reps,
            },
        }
        p["rationale"] = (
            f"PST calisthenics day. Pull-up GTG: 6×{gtg_reps}. "
            f"Push-ups: {pushup_sets}×{pushup_reps}. "
            f"Sit-ups: {situp_sets}×{situp_reps}."
        )
        return p

    def _cardio(self, p, vdot_zones, mileage_cap, intensity):
        p["session_type"] = "cardio"
        # Single run = ~40% of the weekly cap at this intensity
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
            f"Easy pace {easy_pace}/mi. "
            f"Weekly mileage cap {mileage_cap} mi."
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
