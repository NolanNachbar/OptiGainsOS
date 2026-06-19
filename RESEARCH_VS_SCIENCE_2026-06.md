---
type: research-comparison
project: OptiGains
status: active
created: 2026-06-18
source: "deep-research (2 verified passes, 45 sources); the former Science.md + sciencev2.md (deleted 2026-06-18, merged into Science-Unified.md)"
origin: distilled
tags: [optigains, training-science, hypertrophy, strength, volume, frequency, deload]
---

# Research vs. OptiGains Science Docs (2026-06-18)

Two adversarially-verified deep-research passes (45 sources, ~200 claims extracted,
50 verified, 4 killed) compared against the original `Science.md` and `sciencev2.md`
(now merged into `Science-Unified.md`). This note records where the engine's design
matched the evidence, where it diverged, and the corrections that flowed into the unified
science doc and `SCIENCE_ALIGNMENT.md`.

Confidence tags below are the research harness's, not mine. All effect sizes are
**population means**. The one number that matters most for an N-of-1 engine (individual
volume tolerance) is the one the literature cannot give.

## The unifying finding

Every angle reduces to one monotonic dose-response: **more hard sets produce more
hypertrophy and more strength** (100% posterior probability of a positive slope;
Pelland/Zourdos 2025, *Sports Medicine*, 67 studies / 2,058 subjects), with
**diminishing returns that are far steeper for strength than for size, and no
inverted-U or "too much hurts" cliff within the studied range (to roughly 25 sets/muscle/wk).**

## Q1. Frequency (settled)

- **Research (high):** At matched volume, frequency has no meaningful effect on
  hypertrophy (Schoenfeld/Grgic/Krieger 2019, 25 studies, ES 0.07, CI -0.08 to 0.21).
  For strength, older meta-analyses found nothing at matched volume (Ralston 2018,
  ES 0.03, p=0.78); the newest/largest regression finds a small positive
  frequency-strength slope with steep diminishing returns. Any bench-specific gain
  is a skill/practice effect, not extra muscle.
- **Docs:** `Science.md` hardcoded a per-muscle peak-frequency table (biceps 3-4x,
  quads/chest 2-3x, hamstrings 1-2x) as if frequency were an independent driver.
  `sciencev2.md` omitted per-muscle frequency (more defensible).
- **Correction:** Demote frequency from a landmark to a derived scheduling output of
  the volume target plus recovery. Nolan's daily-bench result was real strength/skill
  plus novelty, not extra chest size.

## Q2. Volume and MRV (mostly settled; one myth busted)

- **Research (high):** More sets give more growth, diminishing returns, no plateau to
  ~25 sets. Strength saturates fast (most of it by ~4 sets; Pelland strength model
  near-flat past that); hypertrophy keeps climbing. Ultra-high volume in trained
  lifters buys little extra size over moderate volume and shows up mostly as
  *strength*, at real recovery cost (Pereira 2024: +30%/+60% no hypertrophy edge;
  Enes 2024: ~37-52 sets only a small non-significant size edge over 22). **The
  "exceed MRV then regress" inverted-U was specifically refuted in verification.**
  Minimal dose (<=4 sets/muscle/wk) still grows muscle; ~10+ to maximize, benefit
  continuing past (Bernardez-Vazquez 2022 umbrella review).
- **Docs (both):** Enforced a HARD MRV ceiling (`Science.md`: weekly sets <= MRV, plus
  `update_bayesian_mrv` treating "high volume + performance decline = MRV exceeded",
  baking in the inverted-U). Baseline numbers were unsourced and the two docs
  disagreed: quads MRV N(18, 2.5) vs N(15, 3 squared); biceps 16 vs 20. Neither cited
  Schoenfeld or Israetel despite using their entire MEV/MAV/MRV framework.
- **Corrections:**
  1. Replace the hard ceiling / inverted-U with a **diminishing-returns +
     recovery-cost** model. MRV is a recovery-limited soft boundary (cost too high),
     not a point where gains reverse.
  2. **Split strength and hypertrophy volume curves.** Strength saturates ~4 sets,
     hypertrophy climbs to 10-25+. One volume target per muscle conflates them.
  3. Treat baseline landmarks as **wide-sigma coaching priors** (cite RP/Israetel or
     flag unsourced); let the learner converge them.

## Q3. HIT / Mentzer / failure (closed)

Three tenets, three verdicts:

- **"One set is enough":** false for size, defensible for strength. Multi-set beats
  single-set (Krieger 2009/2010: ~46% greater strength ES, ~40% greater hypertrophy
  ES; absolute ES gaps ~0.10-0.26). The multi-set strength advantage was **not**
  larger in trained lifters (no training-status interaction, Krieger 2009).
- **"Train to failure":** weakest pillar. Failure does **not** beat stopping 1-3
  reps short (Refalo 2022, hypertrophy ES 0.12, p=0.343; Grgic 2021 overall null;
  Refalo 2024 within-subject trained RCT: near-identical quad growth at failure vs
  1-2 RIR). For hypertrophy, closer to failure helps (negative RIR slope) but ~2-5
  RIR captures most; for strength RIR is essentially **irrelevant**. Failure mainly
  adds fatigue cost without proportional return. (Fragile exception: a 2-study
  trained subgroup showed a small failure-favoring hypertrophy signal, ES 0.15.)
- **Full Mentzer protocol** (one all-out set, infrequent, long recovery): **no
  controlled trial has ever validated it.** Rests on two partial truths (low volume
  still grows; failure not required), predicted to leave hypertrophy on the table.

**Verdict:** low-volume HIT is a legit maintenance/minimal-dose tool and fine for
strength, but as a growth strategy the evidence says it underperforms. Not worth a
hypertrophy block.

## The failure / fatigue / deload throughline

The failure research is the missing piece of the anti-deload argument: **training to
failure adds fatigue without adding gains** (failure approximates 1-3 RIR for outcomes,
more fatigue). The habit that digs the fatigue holes that "require" deloads is the one
with the smallest payoff. The evidence-backed way to avoid deloads is to bank sets
short of failure, but see Nolan's standing preference below, which keeps failure and
manages its cost through volume instead.

## N-of-1 architecture is aimed at the right gap

The research's headline caveat (individual volume tolerance is the unknown the
meta-analyses do not quantify) is exactly the thesis of the engine. Two refinements:

- `sciencev2.md`'s **Gaussian-Process response-surface was the better-suited tool**
  than `Science.md`'s Kalman + phase thresholds, because the problem is locating the
  inflection of a diminishing-returns *curve*.
- **Convergence was too fast.** `Science.md` gated "optimal squat volume" on 4 squat
  sessions; the hypertrophy signal needs **8-12 week blocks** to clear noise.
  `sciencev2.md`'s 12 observations was better but still must be read over mesocycles.

## Where the two docs disagreed (and which won)

| Topic | Science.md | sciencev2.md | More defensible |
|---|---|---|---|
| Per-muscle frequency | Fixed table | Absent | sciencev2 (omit) |
| Volume optimum prior | Squat 14 sets | Generic 10, range [4,18] | sciencev2 (wide range) |
| Quads MRV baseline | N(18, 2.5) | N(15, 3 sq) | neither sourced; widen |
| Learning tool | Kalman + KL phases | Gaussian Process | sciencev2 (GP) |
| Deload trigger | Hazard >=0.8 | Mahalanobis >2.5 | both reactive; unanchored |

## Standing design constraints (Nolan, 2026-06-18)

- **Hypertrophy is primary**, pursued through **SBD** as the primary movements.
- **Concurrent strength is a real secondary goal.** Feasible: strength saturates
  early, so the SBD volume driving hypertrophy also drives most of the strength.
- **Keeps 0 RIR / training to failure** as default style. The engine **accounts for**
  failure's fatigue cost and manages it via volume autoregulation; it does **not**
  force him off failure or raise his RIR.
- **No scheduled deloads** (waste time); reactive VOLUME management only (never bar load
  off a readiness signal, never forced RIR), with a rare slow-tissue backstop.
- **Learned priors over fixed rules.** Landmarks/thresholds are tunable priors the
  engine converges, not laws.

One honest tension, recorded once: routine 0-RIR failure is the main fatigue driver,
and "always failure + never deload" pull against each other. The reconciliation the
engine uses: he trains to failure; the engine holds or trims **volume** when
failure-driven fatigue accumulates, so a scheduled deload is never needed.

## Adaptive TDEE / trend weight (research pass R1, 2026-06-18)

- **No single energy-density constant is valid.** Fat ~4280 kcal/lb (9440 kcal/kg) vs
  lean ~825 kcal/lb (1820 kcal/kg), a ~5x gap; short-window (2-week) change is ~84%
  fat-free mass (~2380 kcal/kg) and the density rises to ~6000 kcal/kg by week 6 of a
  deficit. Use the Forbes partition p = C/(C+F), C = 10.4 kg, to compute a
  composition-aware density rather than the fixed 7700/3500/500 constants.
- **Trend weight:** EWMA (alpha ~0.1/day, ~7-10 day half-life), not linear regression;
  discount the conversion for 1-2 weeks after any phase change (glycogen/water step).
- **Adaptive TDEE:** rolling 14-28 day reconciliation of intake vs trend-weight change;
  re-deriving each window captures adaptive thermogenesis (~120 kcal/day) automatically.
- **Under-logging is the dominant error** (explains ~48-61% of individual variance).
  Replace the 25% trust gate with a learned per-person intake-bias term; anchor on the
  trend-weight signal. Reference: Hall/NIDDK dynamic model (Lancet 2011), validated to
  -0.47 kg bias. Folded into `SCIENCE_ALIGNMENT.md` E10 and `Science-Unified.md` nutrition.

## Concurrent hypertrophy + endurance (research pass R2, 2026-06-18)

- **True concurrent, not blocks.** At recreational volumes concurrent training matches
  lifting-only for strength/power/hypertrophy while improving aerobic capacity (umbrella
  review, 17 meta-analyses / 144 studies, aerobic SMD 0.77). Both adaptations advance
  together, so no need to sequence into blocks; year-round concurrent fits the
  continuous-readiness goal.
- **Interference is real but small and controllable.** Scales with endurance DURATION
  (steepest) and frequency. Continuous running hurts leg hypertrophy (Type I SMD -0.81);
  cycling shows no significant interference; swimming is mechanistically low-interference.
  So base the aerobic volume on cycling and swimming (also 2 of 3 Ironman disciplines),
  confine running to HIIT and PST pace, keep sessions short.
- **Lift before endurance** on shared days (~6.9% better lower-body strength, no
  hypertrophy/aerobic cost); separate hard-leg from hard-run days.
- **Maintenance is cheap both ways** (the enabler of concurrent-without-blocks): VO2max
  holds on ~2 quality sessions/wk; muscle holds on 1-3 hard sets 2-3x/wk. The
  off-emphasis quality coasts on a minimum dose without backsliding.
- **Intensity:** polarized 80/20 (mostly easy Zone 2 for the Ironman base, small hard
  fraction for PST speed). The broad "polarized beats everything" claim was refuted; only
  the specific Stoggl/Sperlich 2014 figures hold.
- **Continuous readiness without peaking** is achievable (build-vs-maintain asymmetry),
  with the honest caveat that no study confirms a hybrid athlete holds absolute-best
  numbers with zero taper; a small optional pre-test fatigue drop is the only place a
  taper might help. Folded into `SCIENCE_ALIGNMENT.md` E13 and the Science-Unified
  standing constraints. Caveat: most sources are recreationally trained, not hybrid
  resistance-trained athletes; swimming's profile is mechanistic inference.

## Key citations

- Pelland, Remmert, Robinson, Hinson, Zourdos 2025/2026, *Sports Medicine*, DOI 10.1007/s40279-025-02344-w (PMID 41343037): volume dose-response, 67 studies.
- Schoenfeld, Grgic, Krieger 2019 (PMID 30558493): frequency at matched volume.
- Ralston 2018 (s40798-018-0149-9); Grgic 2018 (s40279-018-0872-x): frequency/strength.
- Schoenfeld, Ogborn, Krieger 2017: weekly-set dose-response (~0.37%/set, <=10-set range).
- Krieger 2009 (PMID 19661829) / 2010: single vs multi-set.
- Radaelli 2015 (PMID 25546444): 1<3<5 set dose-response (untrained).
- Refalo, Helms, Fyfe 2022/2023 (PMC9935748) and 2024 (DOI 10.1007/s40279-024-02069-2; J Sports Sci 42(1)): failure proximity / RIR.
- Grgic, Schoenfeld 2021 (S2095254621000077): training to failure.
- Bernardez-Vazquez 2022 (PMC9302196): minimum effective / maximize volume.
- Pereira 2024 (japplphysiol.00476.2024); Enes 2024 (Enes-Souza): ultra-high volume RCTs.
- Hall et al. Lancet 2011 + NIDDK Web Appendix; Heymsfield/Thomas Obesity Reviews 2014 (PMC3970209); Bhutani/Schoeller 2017 (PMC5506524); Muller/Heymsfield Metabolism 2012; Guo/Hall AJCN BWP validation: adaptive TDEE / energy density.
- Concurrent-training umbrella review 2026 (PMID 41762427); Lundberg/Schumann 2022 (PMC9474354); Wang/Lu 2024 NMA (S1728869X23000679); Eddens 2017/2018 session order (PMC5752732); Hickson 1981 maintenance (PMID 7219129); Androulakis-Korakakis 2020 minimum dose (PMID 31797219); Stoggl/Sperlich 2014 polarized (fphys.2015.00295): concurrent hypertrophy + endurance.
