"""
tdee.py — E10: composition-aware adaptive TDEE (MacroFactor / Hall-NIDDK style).

Replaces the indefensible single fixed energy-density constant (the old 500 kcal/lb·wk,
i.e. a flat 3500 kcal/lb) with:
  - the Forbes COMPOSITION-AWARE energy density (a lean lifter partitions more weight
    change to lean mass, lowering effective density in a cut),
  - an EWMA TREND WEIGHT (Hacker's-Diet analog of MacroFactor's recency-weighted average),
  - a ROLLING-WINDOW adaptive estimate re-derived each call (captures adaptive
    thermogenesis automatically — no hard-coded β_AT),
  - an EARLY-TRANSIENT discount so the week 1-2 glycogen/water step on a phase change is
    not booked as fat,
  - a learned per-person INTAKE-BIAS term that ANCHORS on the trend-weight signal instead
    of DISCARDING under-logged intake (the dominant error channel).

All constants are [ENG]/[COACH] priors the learner can converge — not laws. Sources:
Hall/NIDDK dynamic model (Lancet 2011); Forbes partition; MacroFactor published method.
"""

KG_PER_LB        = 0.45359237
LEAN_KCAL_PER_KG = 1820.0    # [COACH] energy density of lean (fat-free) mass change
FAT_KCAL_PER_KG  = 9440.0    # [COACH] energy density of fat mass change
FORBES_C_KG      = 10.4      # [COACH] Forbes partition constant

# Early-transient (phase-change water/glycogen) priors.
EARLY_DENSITY_KCAL_PER_KG = 2380.0   # [COACH] ~84% fat-free-mass step in wk1-2 of a change
EARLY_TRANSIENT_WEEKS     = 6.0      # [ENG] ramps to full composition density by ~wk6

# Default bodyfat prior when no physique estimate is available (so Forbes still applies).
DEFAULT_BODYFAT_FRAC = 0.18

# Trend-anchored blend: lean on the energy-balance estimate (the integrator of true
# balance), keep the bodyweight prior only as a weak anchor. REPLACES the old hard 25%
# trust gate that DISCARDED the signal whenever logging was incomplete.
TDEE_EB_BLEND = 0.6      # [ENG] weight on the trend-anchored energy-balance estimate
INTAKE_BIAS_MIN = 1.0    # under-report only (logged ≤ true)
INTAKE_BIAS_MAX = 1.5    # [ENG] cap the correction so a corrupt series can't run away


def forbes_lean_fraction(fat_mass_kg: float) -> float:
    """p = C/(C+F): the lean fraction of a unit of body-weight change (Forbes)."""
    F = max(0.0, float(fat_mass_kg or 0.0))
    denom = FORBES_C_KG + F
    return FORBES_C_KG / denom if denom > 0 else 0.5


def composition_density_kcal_per_kg(fat_mass_kg: float) -> float:
    """Forbes composition-aware energy density of weight change (kcal/kg)."""
    p = forbes_lean_fraction(fat_mass_kg)
    return p * LEAN_KCAL_PER_KG + (1.0 - p) * FAT_KCAL_PER_KG


def energy_density_kcal_per_lb(fat_mass_kg, weeks_in_phase=None) -> float:
    """Composition-aware kcal per LB of body-weight change. During the first weeks of a
    phase change the loss/gain is mostly water/glycogen (low density), ramping toward the
    Forbes composition density by ~wk6 — so the early water step is not attributed to fat.
    weeks_in_phase=None means a settled phase (full composition density)."""
    comp = composition_density_kcal_per_kg(fat_mass_kg)
    if weeks_in_phase is not None and float(weeks_in_phase) < EARLY_TRANSIENT_WEEKS:
        frac = max(0.0, min(1.0, float(weeks_in_phase) / EARLY_TRANSIENT_WEEKS))
        density_kg = EARLY_DENSITY_KCAL_PER_KG + frac * (comp - EARLY_DENSITY_KCAL_PER_KG)
    else:
        density_kg = comp
    return density_kg * KG_PER_LB


def ewma_trend(values, alpha: float = 0.10):
    """EWMA (Hacker's-Diet analog) over a daily weight series; alpha~0.10/day ≈ 7-10 day
    half-life. Returns the smoothed trend series (Nones skipped). The slope of this series
    is the de-noised weight trend used for the energy-balance estimate."""
    trend, w_t = [], None
    for v in values:
        if v is None:
            continue
        v = float(v)
        w_t = v if w_t is None else w_t + alpha * (v - w_t)
        trend.append(w_t)
    return trend


def learned_intake_bias(mean_intake, expenditure_est, daily_rate_lb, density_kcal_per_lb,
                        prev_bias: float = 1.0, gain: float = 0.2) -> float:
    """Per-person systematic under-report correction (>=1.0), nudged toward the bias that
    reconciles logged intake with the trend-weight-IMPLIED true intake
    (expenditure + stored/released energy). Anchored on the trend-weight signal, learnable,
    bounded — NOT a hard gate that throws logs away."""
    if not mean_intake or float(mean_intake) <= 0:
        return float(prev_bias)
    implied_true_intake = float(expenditure_est) + float(daily_rate_lb) * float(density_kcal_per_lb)
    target = max(INTAKE_BIAS_MIN, min(INTAKE_BIAS_MAX, implied_true_intake / float(mean_intake)))
    nudged = float(prev_bias) + gain * (target - float(prev_bias))
    return round(max(INTAKE_BIAS_MIN, min(INTAKE_BIAS_MAX, nudged)), 4)


def adaptive_tdee(mean_intake, daily_rate_lb, density_kcal_per_lb, intake_bias: float = 1.0):
    """Rolling-window energy balance: TDEE = bias·mean_intake − daily_rate_lb·density.
    Re-derived each call over the trailing window, so adaptive thermogenesis is captured
    automatically without hard-coding β_AT."""
    return float(intake_bias) * float(mean_intake) - float(daily_rate_lb) * float(density_kcal_per_lb)


def estimate_tdee(bodyweight_lb, avg_kcal, weight_trend_lb_wk, fallback: float = 3200.0,
                  bodyfat_frac=None, intake_bias: float = 1.0, weeks_in_phase=None) -> float:
    """Composition-aware adaptive maintenance estimate (E10).

    Anchors on the trend-weight signal via the Forbes energy density and a learned intake
    bias, blended with a weak bodyweight prior. The old 25% trust GATE (which discarded
    incomplete logs and fell back to the prior) is replaced by a trust BLEND + a sanity
    CLAMP that bounds — but never discards — the energy-balance signal.
    """
    tdee_prior = bodyweight_lb * 15.5 if (bodyweight_lb and bodyweight_lb > 0) else float(fallback)
    try:
        # Require a valid bodyweight for the energy-balance branch: without it the Forbes
        # fat-mass term degenerates (all-lean density, ~4× too low), so cleanly fall back
        # to the prior instead of a silently mis-weighted estimate.
        if avg_kcal and weight_trend_lb_wk is not None and bodyweight_lb and bodyweight_lb > 0:
            bf = bodyfat_frac if (bodyfat_frac is not None) else DEFAULT_BODYFAT_FRAC
            fat_mass_kg = float(bodyweight_lb) * KG_PER_LB * float(bf)
            density = energy_density_kcal_per_lb(fat_mass_kg, weeks_in_phase)
            daily_rate_lb = float(weight_trend_lb_wk) / 7.0
            tdee_eb = adaptive_tdee(avg_kcal, daily_rate_lb, density, intake_bias)
            blended = TDEE_EB_BLEND * tdee_eb + (1.0 - TDEE_EB_BLEND) * tdee_prior
            lo, hi = 0.5 * tdee_prior, 1.6 * tdee_prior   # clamp, not gate
            return round(max(lo, min(hi, blended)))
    except (TypeError, ValueError):
        pass
    return round(tdee_prior)
