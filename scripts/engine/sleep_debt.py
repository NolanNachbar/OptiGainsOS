"""
sleep_debt.py — E11: true sleep debt from logged sleep DURATION.

The engine previously read only the 0-100 `sleep_score` and ignored the actual
`sleep_duration_min` that the wearable also records. Sleep debt — cumulative hours
below a personal target — is the more principled systemic-fatigue input (the spec's
"cumulative sleep debt" feature) than an opaque 0-100 score. Constants are [ENG]
priors the learner can converge per athlete, not laws.
"""

SLEEP_TARGET_HOURS = 8.0    # [COACH] nightly need prior (learnable per athlete)
POOR_NIGHT_HOURS   = 6.0    # [ENG] a night under this counts as a "poor" night


def sleep_debt_hours(durations_min, target_hours: float = SLEEP_TARGET_HOURS) -> float:
    """Cumulative sleep debt (hours below target) over the supplied nights. Only nights
    SHORT of target add debt; extra sleep does not bank credit (debt floors at 0 per
    night). None/0 entries are treated as missing and skipped."""
    debt = 0.0
    for d in (durations_min or []):
        if d is None:
            continue
        hrs = float(d) / 60.0
        if hrs <= 0:
            continue
        debt += max(0.0, float(target_hours) - hrs)
    return round(debt, 2)


def is_poor_night(duration_min, sleep_score, score_threshold: int = 60,
                  poor_hours: float = POOR_NIGHT_HOURS):
    """Whether a night is 'poor'. Prefers actual DURATION (under poor_hours) when present;
    falls back to the 0-100 sleep_score when duration is missing. Returns None when neither
    signal is available (so a caller can stop a consecutive-run count at a missing night)."""
    if duration_min is not None and float(duration_min) > 0:
        return (float(duration_min) / 60.0) < float(poor_hours)
    if sleep_score is not None and float(sleep_score) > 0:
        return float(sleep_score) < float(score_threshold)
    return None
