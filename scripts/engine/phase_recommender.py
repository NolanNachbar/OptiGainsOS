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
BF_BULK_BELOW  = 12.0   # [ENG] bodyfat % at/below which a surplus is warranted
REVERSE_BF     = 12.0   # [ENG] "lean enough" — end the cut and reverse-diet out (energy-
                        # availability / RED-S evidence: below ~10% recovery/hormones/strength
                        # fall off; ~12% captures the relative-strength benefit safely)
DEADLINE_NEAR  = 100    # [ENG] days; inside this the PST goal dominates phase choice
GAIN_RATE      = 0.3    # [ENG] lb/wk above which weight is meaningfully climbing


def recommend_phase(*, weight_trend, days_to_deadline, bodyfat,
                    goal_priorities, current_phase=None) -> dict:
    """
    Returns {phase, rationale, confidence, needs_photo}.
    weight_trend       : realized lb/wk (None if unknown)
    days_to_deadline   : days to the PST deadline (None if n/a)
    bodyfat            : latest photo bodyfat % (None if no photo)
    goal_priorities    : {strength, hypertrophy, pst} weights
    """
    pst_w = float((goal_priorities or {}).get("pst", 0.3))
    near = days_to_deadline is not None and days_to_deadline <= DEADLINE_NEAR
    tactical_priority = near and pst_w >= 0.35
    reasons: list[str] = []
    reverse = False

    if bodyfat is not None:
        bf = float(bodyfat)
        if bf <= REVERSE_BF and str(current_phase or "").lower() == "cut":
            # Lean enough — end the cut and reverse-diet calories back up gradually
            # toward maintenance (or a slow bulk if very lean and no near deadline),
            # rather than crashing out of a deep deficit.
            phase = "bulk" if (bf <= BF_BULK_BELOW and not tactical_priority) else "maintain"
            reverse = True
            reasons.append(f"you're at ~{bf:.0f}% — lean enough to end the cut. Reverse-diet calories "
                           f"back up gradually toward {phase}; grinding lower costs recovery and strength "
                           "faster than it buys performance")
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
