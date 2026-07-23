"""
phase_recommender.py — Recommend the optimal diet phase (cut / maintain / bulk)
for the athlete's goals. The engine acts as the coaching team: it proposes a
phase + rationale; the athlete accepts (sets training_phase) or rejects.

Inputs are the athlete's goals (priorities), the PST deadline proximity, the
realized bodyweight trend, recent strength progress, and — when available — a
bodyfat estimate from a physique photo. Without a bodyfat read it leans
conservative and asks for a photo to refine.

Thresholds tagged [ENG] are tunable coaching defaults, not hard rules.
"""
from __future__ import annotations

BF_CUT_ABOVE   = 18.0   # [ENG] bodyfat % at/above which leaning out helps most goals
BF_BULK_BELOW  = 10.0   # [ENG] bodyfat % at/below which a surplus is warranted
REVERSE_BF     = 10.0   # [ENG] "lean enough" — end the cut and reverse-diet out. Athlete's
                        # stated target (2026-07-11): oscillate 10 <-> 18, cut into single
                        # digits. Below ~10% the RED-S literature has recovery/hormones/
                        # strength falling off, so 10 is the floor, not a waypoint.
MAX_DEFICIT_WEEKS = 6.0 # [COACH] TNF aggressive-mini-cut rule 5: "do not stay in this deficit
                        # too long... if you go longer than four to six weeks you might run into
                        # hormonal issues." This DOMINATES the bodyfat target — TNF is explicit
                        # that an unmet goal is not a reason to stay in ("but I only have 4 weeks
                        # left — I don't care"). Get in, get out; run another block after a break.
                        # Mirrors the same cap in nutrition_modulator.recommend_deficit.
DEADLINE_NEAR  = 100    # [ENG] days; inside this the PST goal dominates phase choice
GAIN_RATE      = 0.3    # [ENG] lb/wk above which weight is meaningfully climbing


def recommend_phase(*, weight_trend, days_to_deadline, bodyfat,
                    goal_priorities, current_phase=None, weeks_in_cut=None) -> dict:
    """
    Returns {phase, rationale, confidence, needs_photo}.
    weight_trend       : realized lb/wk (None if unknown)
    days_to_deadline   : days to the PST deadline (None if n/a)
    bodyfat            : latest photo bodyfat % (None if no photo)
    goal_priorities    : {strength, hypertrophy, pst} weights
    current_phase      : the phase he is actually running now
    weeks_in_cut       : weeks elapsed in the current open cut (None if not cutting)

    The bodyfat rules are HYSTERETIC, not a static band. A static band leaves a dead
    zone: at 13.5% BF — below CUT_ABOVE, above BULK_BELOW — it reads "maintain" no matter
    which way the athlete is travelling, so a cut aimed at 10% would be told to stop the
    moment it dropped under 18%. Instead the current phase RUNS UNTIL IT REACHES ITS FAR
    THRESHOLD: a cut continues to REVERSE_BF, a bulk continues to BF_CUT_ABOVE. That is
    the 10 <-> 18 oscillation. Only from maintain/unknown do we fall back to the band.
    """
    pst_w = float((goal_priorities or {}).get("pst", 0.3))
    near = days_to_deadline is not None and days_to_deadline <= DEADLINE_NEAR
    tactical_priority = near and pst_w >= 0.35
    phase_now = str(current_phase or "").lower()
    reasons: list[str] = []
    reverse = False

    # Duration cap outranks everything, INCLUDING an unmet bodyfat target and a missing
    # photo. This is the one rule TNF states unconditionally, so it is checked first.
    if phase_now == "cut" and weeks_in_cut is not None and float(weeks_in_cut) >= MAX_DEFICIT_WEEKS:
        bf = float(bodyfat) if bodyfat is not None else None
        phase = "bulk" if (bf is not None and bf <= BF_BULK_BELOW and not tactical_priority) else "maintain"
        reverse = True
        at_bf = f" at ~{bf:.0f}%" if bf is not None else ""
        reasons.append(f"you're {float(weeks_in_cut):.1f} weeks into this cut{at_bf} — that's the 4-6 week cap. "
                       f"End the block and reverse-diet calories back up toward {phase}. Not hitting the "
                       "bodyfat target is not a reason to stay in; run another block after a break")
        return {
            "phase": phase, "rationale": "; ".join(reasons), "confidence": "high",
            "needs_photo": bodyfat is None, "reverse_diet": reverse,
            "current_phase": current_phase, "changed": phase != current_phase,
        }

    if bodyfat is not None:
        bf = float(bodyfat)
        if phase_now == "cut":
            # Hysteresis: a running cut continues until it reaches REVERSE_BF, not until
            # it merely drops out of the "high bodyfat" zone.
            if bf <= REVERSE_BF:
                phase = "bulk" if (bf <= BF_BULK_BELOW and not tactical_priority) else "maintain"
                reverse = True
                reasons.append(f"you're at ~{bf:.0f}% — target reached, end the cut. Reverse-diet calories "
                               f"back up gradually toward {phase}; grinding lower costs recovery and strength "
                               "faster than it buys performance")
            else:
                phase = "cut"
                reasons.append(f"bodyfat ~{bf:.0f}% is still above your {REVERSE_BF:.0f}% target and you're "
                               f"{float(weeks_in_cut):.1f}/{MAX_DEFICIT_WEEKS:.0f} weeks into the block — keep cutting"
                               if weeks_in_cut is not None else
                               f"bodyfat ~{bf:.0f}% is still above your {REVERSE_BF:.0f}% target — keep cutting")
        elif phase_now == "bulk":
            # Hysteresis the other way: a running bulk continues until BF_CUT_ABOVE.
            if bf >= BF_CUT_ABOVE:
                phase = "cut"
                reasons.append(f"bodyfat ~{bf:.0f}% has reached the {BF_CUT_ABOVE:.0f}% ceiling — end the gaining "
                               "phase and cut back down")
            else:
                phase = "bulk"
                reasons.append(f"bodyfat ~{bf:.0f}% is still under the {BF_CUT_ABOVE:.0f}% ceiling — keep gaining")
        elif bf >= BF_CUT_ABOVE:
            phase = "cut"
            reasons.append(f"bodyfat ~{bf:.0f}% is high enough that leaning out improves "
                           "relative strength and running (push-ups, pull-ups, 1.5/4-mile are all bodyweight-relative)")
        elif bf <= BF_BULK_BELOW and not tactical_priority:
            phase = "bulk"
            reasons.append(f"bodyfat ~{bf:.0f}% is lean and there's no near tactical deadline, "
                           "so a controlled surplus drives the 315/450/500 strength goals fastest")
        else:
            phase = "maintain"
            reasons.append(f"bodyfat ~{bf:.0f}% is in a solid range — recomp/hold while pushing performance")
            if tactical_priority and bf > 14:
                phase = "cut"
                reasons.append(f"...but with the PST {days_to_deadline}d out, trimming a little fat sharpens "
                               "running and bodyweight reps without losing strength")
        confidence = "high"
        needs_photo = False
    else:
        # No bodyfat read — decide from trend + deadline, conservatively, and ask for a photo.
        if tactical_priority:
            if weight_trend is not None and weight_trend > GAIN_RATE:
                phase = "maintain"
                reasons.append(f"you're gaining {weight_trend:+.1f} lb/wk with the PST {days_to_deadline}d out — "
                               "hold weight so running and bodyweight reps keep improving")
            else:
                phase = "maintain"
                reasons.append(f"PST is {days_to_deadline}d out — maintain to keep relative strength and running sharp")
        elif weight_trend is not None and weight_trend > GAIN_RATE:
            phase = "maintain"
            reasons.append(f"you're gaining {weight_trend:+.1f} lb/wk with no clear bulk mandate — hold and reassess")
        else:
            phase = "maintain"
            reasons.append("holding at maintenance while we gather data")
        reasons.append("upload a physique photo so I can read your bodyfat and refine cut vs maintain vs bulk")
        confidence = "low"
        needs_photo = True

    return {
        "phase": phase,
        "rationale": "; ".join(reasons),
        "confidence": confidence,
        "needs_photo": needs_photo,
        "reverse_diet": reverse,
        "current_phase": current_phase,
        "changed": current_phase is not None and phase != current_phase,
    }
