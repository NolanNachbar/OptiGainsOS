# Autoregulating Hypertrophy Apps (RP Hypertrophy, Juggernaut AI, others)

Research date: 2026-10-13. Scope: how RP Hypertrophy and similar volume-landmark/autoregulation apps adjust training, what users see, pricing and platform status, and user sentiment.

Source-quality notes up front:
- **Reddit coverage is thin.** The Exa MCP backend returned HTTP 429 (free-tier rate limit) on both attempts, so no Reddit thread text was pulled through it. Reddit points below come only from search-result snippets and an aggregator page, and are marked as such.
- **Dr. Muscle reviews are competitor-authored** (Dr. Muscle sells a competing tool). Treated as biased. The RP critique is dated Apr 26, 2025 and describes a beta-era app; several of its claims (web-only, no native app) are now outdated.
- **SensAI's 2026 comparison** is also a competitor's content (SensAI is an AI coaching app). Used only for figures it attributes to dated sources, flagged where used.
- **RP's own help-center article on What's New returned HTTP 403** to WebFetch. Its content below comes from search-result summaries only and is marked accordingly.
- Many pricing and feature claims come from affiliate-style aggregators. Verify before any decision.

---

## 1. What inputs does the user give, and what changes in the next session?

### Takeaway
RP Hypertrophy adjusts volume from subjective per-muscle feedback (pump, soreness, workload/fatigue, sometimes joint pain) and performance trends, not from RPE. Juggernaut AI adjusts from per-set RPE, a daily readiness rating, and end-of-session/week/block check-ins. The exact adjustment rules are not published in anything I could retrieve, and the sources disagree on which RP inputs exist.

### Cited Findings
- RP's 2017 volume-landmarks article defines the feedback scales. MEV check: Pump Quality (0 none / 1 decent / 2 excellent), Muscle Challenge (0–2, top score "Muscles pushed to near limits"), Soreness Response (0–2, top score "Multi-day soreness"). Totals: "0-1 total = below MEV, 2-4 = likely at MEV, 5-6 = above MEV." Weekly progression: Soreness Recovery (1–4, "Still sore for next session = 4 points") and Performance (1–4, "Couldn't match previous week = 4 points"). "You've likely hit MRV when you score a 4 on the performance scale." — [RP Strength, "Training Volume Landmarks for Muscle Growth" (dated Jan 4, 2017)](https://rpstrength.com/training-volume-landmarks-muscle-growth/). **Old source; it describes the manual method and is the closest thing to a published rule set I could retrieve.**
- The same article says the RP Hypertrophy App "automates much of this volume progression, adjusting your training based on performance feedback." — [same source](https://rpstrength.com/training-volume-landmarks-muscle-growth/)
- Stated RP baseline: MV "typically around 6 working sets per muscle group per week" when trained at least twice weekly; the article gives no fixed MEV/MAV/MRV values, only an example of MEV 12 / MRV 20. — [same source](https://rpstrength.com/training-volume-landmarks-muscle-growth/)
- Per-muscle landmark values appear in RP's other tips articles, per search summary only (not fetched): trap MEV 0–4 / MRV 12–20; calves MEV 4–6 / MRV 16–24. — [RP trap article](https://rpstrength.com/trap-training-tips-hypertrophy/), [RP calves article](https://rpstrength.com/calves-training-tips-hypertrophy). **Unverified (summary only).**
- RP's feedback inputs are reported inconsistently across sources:
  - Help-center-derived (via SensAI): the app adjusts sets "based on how pumped, sore and fatigued you feel," and "does not use RPE." — [SensAI comparison, accessed 3 Oct 2026](https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026)
  - Dr. Muscle (Apr 2025): "RP uses four indicators (pump, disruption, joint pain, performance)." — [Dr. Muscle critique](https://dr-muscle.com/rp-hypertrophy-app-critique/)
  - Aggregator summary: "pump, soreness, joint pain, and performance." — [search summary, carefocusdaily](https://carefocusdaily.com/fitlife/rp-hypertrophy-app-review-cost-guide) **(unverified; not fetched)**
  - RP marketing/App Store (via search summary): feedback on "pump, soreness, and workload"; site says "soreness, pump, joint pain, and work load." — [RP hypertrophy-app page](https://rpstrength.com/hypertrophy-app) **(summary only; not fetched)**
  - **Conflict:** joint pain vs. no joint pain, and "performance" vs. "fatigue/workload." Not resolvable from what I could retrieve. Note the help center itself was not readable.
- Juggernaut AI inputs, per SensAI (accessed 3 Oct 2026): "RPE on each set, a daily readiness rating, and end-of-session, week and block check-ins." Quote: "Your Daily Readiness Rating, End of Session/Week/Block Check-Ins are how the system learns about you." — [SensAI comparison](https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026)
- Juggernaut v3.0 rebuild (Aug 11, 2026) added a 0–100 readiness score, per SensAI. — [SensAI comparison](https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026) **(single source)**
- Juggernaut: "can prescribe warm-up weights and repetitions, ask how those sets feel, and adjust the upcoming working weight," and can change accessory volume when recovery feedback suggests too much fatigue; uses MEV/MRV concepts. — [aitoolsbakery review](https://aitoolsbakery.com/?p=5896) **(affiliate-style; weak)**. A second review claims daily readiness and bar-speed data; treated as unverified.
- Juggernaut scope: squat, bench, deadlift only; built by powerlifter/coach Chad Wesley Smith. — [aitoolsbakery review](https://aitoolsbakery.com/?p=5896); [subger.com overview](https://subger.com/en/service/juggernaut-ai)

### Inferences
- The RP model appears to be a per-muscle, subjective-feedback controller on volume (sets), with load/reps changes secondary. The 2017 article's scoring is the most concrete public description of the logic, but the app's live rules are not published in anything I could read.
- Juggernaut's inputs (RPE + readiness + check-ins) are more quantitative and set-level than RP's, which is subjective and per-muscle.

### Gaps
- Exact RP adjustment rules (thresholds, how soreness/pump map to +sets or -sets, how the next session changes) are **not documented in any source I could retrieve.** RP's help-center "Navigating the App" section lists questions such as "What if I stop getting sore/pumped from my workouts?" and "how the app decides when to add weight, reps, and sets," but the answers were not accessible (help center returned 403).
- Whether RP uses joint pain at all in 2026 remains unresolved (sources conflict).
- No independent test of whether the adjustments produce better outcomes.

---

## 2. Transparency of each change

### Takeaway
Neither product, as far as I could verify, shows a per-session explanation of why a specific change happened. Transparency relies on the user reading a help center or on the logic described in marketing. RP's 2017 article is the most explicit about its logic, but it describes a manual method, not the app's live output.

### Cited Findings
- Dr. Muscle criticizes the RP feedback as "highly subjective" and says the pump-to-growth link is unproven: "no literature has ever measured how much cell swelling is needed for growth." — [Dr. Muscle critique](https://dr-muscle.com/rp-hypertrophy-app-critique/) **(competitor; biased)**
- Dr. Muscle reports auto-fill "really is just randomly selected," with repeated exercises and odd ordering, and "Minimal help, if any, with choosing exercises." — [Dr. Muscle critique](https://dr-muscle.com/rp-hypertrophy-app-critique/) **(competitor; biased; dated Apr 2025)**
- Dr. Muscle: "If you have never heard of a 'mesocycle', this app isn't for you"; the app "requires intermediate knowledge." — [Dr. Muscle critique](https://dr-muscle.com/rp-hypertrophy-app-critique/) **(competitor; biased)**
- Juggernaut: "Check-Ins are how the system learns about you" (marketing-level description). — [SensAI comparison](https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026)

### Inferences
- Users are asked to trust opaque adjustment logic. The RP help center's FAQ-style titles suggest some explanation exists, but I could not confirm its content.

### Gaps
- Whether either app displays a per-change rationale in-app (e.g., "added 1 set to biceps because soreness=1"). Not verifiable from sources retrieved.
- Recent screenshots or first-person UI walkthroughs were not retrieved.

---

## 3. Native/offline status, pricing in 2026, and notable 2025–2026 updates

### Takeaway
RP Hypertrophy launched native iOS (US, Dec 20, 2025) and Android (Dec 21, 2025, per SensAI) and still has a web app; its last listed version is 1.7.0 (Oct 1, 2026, bug fixes). Offline support is not stated for either product. Price is $34.99/mo for both RP and Juggernaut; RP's annual is $299.99 and Juggernaut's is $349.99 (one aggregator lists $419.88, unverified).

### Cited Findings
- RP native iOS launch: v1.0.0 "launched on iOS in the US on December 20, 2025." — [RP help center "What's new"](https://help.rpstrength.com/hc/en-us/articles/34725726510999-RP-Hypertrophy-App-What-s-new) **(content via search summary only; page returned HTTP 403 on fetch)**
- RP v0.31.0 (Sept 5, 2025) added muscle priorities ("Emphasize, Grow, Maintain") and "a new mobile meso planning experience." — [RP help center "What's new"](https://help.rpstrength.com/hc/en-us/articles/34725726510999-RP-Hypertrophy-App-What-s-new) **(search summary; not fetched)**
- RP native iOS requires iOS 17.6+; Android listed on Google Play (released Dec 21, 2025); web app at training.rpstrength.com; latest version 1.7.0 on Oct 1, 2026 (bug fixes only). — [SensAI comparison, accessed 3 Oct 2026](https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026) **(secondary source; verify on the App Store/Play listings)**
- Juggernaut native iOS (requires iOS 15.6+) and Google Play; Apple Health and Health Connect integration added in v2.0. — [SensAI comparison](https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026)
- Price (US, accessed 3 Oct 2026, per SensAI): RP $34.99/mo and $299.99/yr billed yearly (site also shows "$24.99/month $299.99 Billed Yearly"); Juggernaut $34.99/mo and $349.99/yr sold on website. — [SensAI comparison](https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026)
- Juggernaut annual conflict: $349.99 vs. $419.88 (subger.com). — [subger.com Juggernaut AI overview](https://subger.com/en/service/juggernaut-ai) **(unresolved; check official site)**
- Juggernaut trial: 14-day trial (aitoolsbakery, which also says 2 weeks via website). — [aitoolsbakery review](https://aitoolsbakery.com/?p=5896); RP: no free trial, 30-day money-back on website purchases per a blog review. — [search summary, camcode blog](https://storestaging.camcode.com/?p=9455) **(unverified)**
- Older RP pricing (Apr 2025, Dr. Muscle): $34.99 monthly, $199.99 for 6 months, $299.99 for 12 months. — [Dr. Muscle critique](https://dr-muscle.com/rp-hypertrophy-app-critique/) **(stale)**
- RP refund complaint: a 1-star Trustpilot review says a 30-day refund was not honored. Trustpilot aggregate 2.9 from 6 reviews (low volume). — [Trustpilot RP Strength](https://ch.trustpilot.com/review/renaissanceperiodization.com) **(search summary; not fetched)**
- Juggernaut App Store rating 4.8 from 5,655 reviews as of early Oct 2026. — [aitoolsbakery review](https://aitoolsbakery.com/?p=5896) **(secondary; unverified)**

### Inferences
- Dr. Muscle's "web-only" critique is outdated. Any buying decision should not rely on it.
- RP's 2025–2026 movement (native apps, muscle priorities, meso planning) is the most concrete recent change in this category.

### Gaps
- Offline behavior for both apps is not documented in anything retrieved. Needs direct testing or the official FAQ.
- Android-specific feature parity with iOS is unknown.
- Output Sports, Kinetic, and MacroFactor's workout product were not researched (out of time budget).

---

## 4. Muscle priorities, mesocycle length, deloads, volume landmarks

### Takeaway
RP's public model is 4–6 week mesocycles that ramp volume (roughly +1 set/muscle/week in third-party summaries) then deload. Muscle priorities (Emphasize/Grow/Maintain) were added in 2025. Specific deload percentages come only from third-party blogs.

### Cited Findings
- RP muscle priorities "Emphasize, Grow, Maintain" and mobile meso planning added in v0.31.0 (Sept 2025). — [RP help center "What's new"](https://help.rpstrength.com/hc/en-us/articles/34725726510999-RP-Hypertrophy-App-What-s-new) **(search summary)**
- RP's app "raises volume, weight, and effort over a 4–6 week cycle, then deloads" and "decreases RIR" over the cycle. — [search summary, carefocusdaily](https://carefocusdaily.com/fitlife/how-rp-hypertrophy-works) **(third-party; not fetched)**
- Deload: "1 week at ~50% volume and reduced intensity after each hypertrophy block." — [search summary, carefocusdaily](https://carefocusdaily.com/fitlife/rp-hypertrophy-app-review-cost-guide) **(third-party; unverified)**
- Accumulation blocks of 4–6 weeks adding about one set per muscle per week, then a deload at roughly 50% volume. — [arvo.guru RP Training](https://arvo.guru/resources/methods/rp-training) **(third-party guide, not RP; unverified)**
- MRV definition from RP: "the most volume you can handle regularly and still barely recover from." — [RP trap article, search summary](https://rpstrength.com/trap-training-tips-hypertrophy/) **(unverified; not fetched)**

### Inferences
- The 4–6 week block with ~50% deload looks like a consensus of third-party summaries, but none of these traces back to a primary RP document I could read. Treat as unconfirmed.

### Gaps
- Official RP deload rules and whether the app decides deload timing from feedback vs. calendar: not found.
- Mesocycle-length options in the app: not verified.
- Whether the app's volume-landmark values are the 2017 article numbers or updated internal values: unknown.

---

## 5. User sentiment (Reddit vs. Hevy + spreadsheet vs. Fitbod)

### Takeaway
Reddit access was blocked (Exa 429), so firsthand Reddit sentiment is thin and mostly comes from one aggregator page and one thread snippet. The available signal: RP users complain about crashes, exercise-selection auto-fill, and price, and some praise it for removing guesswork; Hevy is well-liked as a free logger; Fitbod has no independent lifter opinions in what I retrieved.

### Cited Findings
- r/RPHypertrophy: ~4k members (aggregator count); top solution-request thread "Alternatives to the RP App?"; a common complaint thread "App Crashing." — [GummySearch r/RPHypertrophy](https://gummysearch.com/r/RPHypertrophy/) **(aggregator; not fetched; thread titles not verified against Reddit)**
- r/MacroFactor thread (mirror): a commenter says "Hevy tends to get recommended here a lot," another "use[s] Hevy and like[s] it a lot"; another is "thinking of switching to RP Hypertrophy from Boostcamp"; one is "strongly positive about RP Hypertrophy, saying it takes a lot of the guess work out of programing." — [red.applefritter.com r/MacroFactor mirror](https://red.applefritter.com/r/MacroFactor/comments/1gq34n0/workout_app) **(mirror of Reddit; date unclear; "13d ago" in snippet not trustworthy; quoted via search summary, not fetched)**
- Hevy's free tier is praised for logging; one source says "it may never need to upgrade if you only log sets and reps." — [SensAI Hevy vs Strong vs Fitbod](https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod-2026) **(vendor-competitor; unverified)**
- Price: Hevy $23.99/yr vs. Fitbod $95.99/yr. — [SensAI comparison](https://www.sensai.fit/es/blog/hevy-vs-strong-vs-fitbod) **(competitor; unverified)**
- Fitbod's own blog positions it as more personalized than Hevy. — [Fitbod vs Hevy](https://fitbod.me/blog/fitbod-vs-hevy-9-reasons-fitbod-beats-hevy/) **(vendor; biased)**

### Inferences
- Hevy plus spreadsheet = manual programming with free logging; RP = guided, subjective-feedback volume control at ~$300/yr; Fitbod = AI generator at a higher annual price. Reddit signal leans "RP removes guesswork" vs. "RP exercise selection and crashes."

### Gaps
- No direct Reddit thread text retrieved (Exa rate-limited). Needs retry when quota resets, or a WebSearch with site-restricted queries.
- No independent lifter opinions on Fitbod found.
- No review of the Hevy+spreadsheet combo.

---

## Things the user complains about (cross-source, with confidence)

- **Price:** $34.99/mo or ~$300/yr for RP; Dr. Muscle calls it "not worth the price... at least right now" (Apr 2025, competitor). Moderate confidence the complaint is real; source biased.
- **Web-only:** Dr. Muscle's claim is **outdated**; native iOS/Android launched Dec 2025 per RP help center summary and SensAI.
- **Rigid templates / auto-fill:** Dr. Muscle reports random auto-fill and "templates" that are not full programs. Competitor source.
- **Manual set adds / "sets over load":** Dr. Muscle disputes RP's emphasis on adding sets rather than load. Competitor source; no lifter-side quote retrieved.
- **Crashes:** r/RPHypertrophy "App Crashing" thread title (aggregator only, unverified).

## Stale / conflicting sources to flag
- Dr. Muscle RP critique: Apr 26, 2025, beta-era, web-only claim outdated.
- RP volume-landmarks article: Jan 4, 2017.
- RP feedback inputs conflict across sources (joint pain present or not; performance vs. workload).
- Juggernaut annual price conflict ($349.99 vs $419.88).
- RP help center pages returned 403; their content was read only from search summaries.

## Items not researched (time budget)
- Output Sports, Kinetic, MacroFactor workout app: no sources gathered.
- Official RP and Juggernaut help-center rule documentation: blocked.
