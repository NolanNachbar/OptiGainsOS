# Program-driven lifting apps: Fitbod, Boostcamp, JEFIT, Dr. Muscle (as of Oct 2026)

Scope note: Reddit access was limited. Exa MCP returned HTTP 429 (free-tier rate limit), so the `mcporter exa` route was unavailable. WebSearch returned almost no genuine r/Fitbod, r/Boostcamp, r/Jefit, or r/Fitness threads. Most "Reddit" hits were SEO spam or vendor pages. Nearly all user-sentiment evidence below is from Trustpilot, App Store listings, and independent reviews. Treat user-complaint coverage as thin.

Several sources are vendor or affiliate content. Those are labeled as such.

## Fitbod: how it decides weight/reps

### Takeaway
Fitbod is the most explicitly algorithmic of the four. It prescribes from an estimated 1RM, per-muscle recovery percentages, and user-reported RIR and max-effort days. The vendor publishes target rep ranges but not the recovery or load-adjustment math. Pricing is about $15.99/mo or $95.99/yr, and sources conflict on whether any free tier exists.

### Cited Findings
- Fitbod's "Capability Recommender" sets sets, reps, and weight. Stated targets: strength is "Primarily 1–6 reps at high loads (~85–100% of 1RM), with 3–5 minute rest intervals"; hypertrophy is "Primarily 6–12 reps" with some 1–5 and 15–25 work and "10–20 working sets per muscle group per week" — [Fitbod blog, fitbod-algorithm](https://fitbod.me/blog/fitbod-algorithm)
- Weight is derived from an estimated 1RM using "established prediction equations (such as the Epley formula)" on logged sets. New exercises use aggregate data from similar users — [Fitbod blog](https://fitbod.me/blog/fitbod-algorithm)
- Reps in Reserve: logged values influence how aggressively the next session is loaded, but the page does not say how RIR changes load — [Fitbod blog](https://fitbod.me/blog/fitbod-algorithm)
- Max Effort Days: one or two exercises every few workouts ask for as many reps as possible on the final set — [Fitbod blog](https://fitbod.me/blog/fitbod-algorithm)
- Recovery is a 0–100% score per muscle group from recent history, with 48–72 hours cited as the recovery window. Users can manually adjust fatigue on the Body tab. Apple Health, Health Connect, Fitbit, and Strava can update recovery — [Fitbod blog](https://fitbod.me/blog/fitbod-algorithm)
- The page does **not** explain how the recovery percentage is computed, how fatigue decays, or what counts as "recovered enough" — [Fitbod blog](https://fitbod.me/blog/fitbod-algorithm) (gap, see below)
- Help-center guidance for sessions that feel too hard: lower reps keeping weight, or lower weight keeping reps. Manual changes feed back into future recommendations — [Fitbod help](https://help.fitbod.me/hc/en-us/articles/30721771750039-Getting-Started-with-Fitbod-A-New-User-s-Guide) (as surfaced via search; article text not fully fetched)
- Starting weights for new exercises are described as drawn from "over 87M logged workouts," usually on the conservative side. Older light logs can pull recommendations down — [Fitbod help, surfaced via search](https://help.fitbod.me/hc/en-us/articles/16254175592215) (vendor claim, not fetched in full)
- Reddit complaint (r/xxfitness, single thread): Fitbod keeps suggesting barbell exercises at "17.5 or 22 lb loads," which is impossible because the empty bar is 40–45 lb. The same user notes some barbell moves don't translate well to dumbbells — [r/xxfitness thread via redlib mirror](https://redlib.belloworld.it/r/xxfitness/comments/1fvy3gt/fitbod_app/lqbkkk9/?context=3) (date unverified; mirror URL)
- Trustpilot 1-star complaint: workout order "all over the place with insane reps and weight." Fitbod replied that this is "not intended behavior" — [Fitbod Trustpilot](https://www.trustpilot.com/review/fitbod.me) (search-surfaced; full page not fetched)
- Dr. Muscle review (competitor, promotional) quotes users saying Fitbod's workouts seemed "too easy even on the 'advanced' settings, and seemed random" — [dr-muscle.com/fitbod-app-review-alternative](https://dr-muscle.com/fitbod-app-review-alternative/) (2024; competitor-authored, anecdotal)
- Pricing: $15.99/mo or $95.99/yr, with a 7-day trial, per a 2026 review. Older $12.99/$79.99 prices and regional or promo variants are also reported. One July 2026 comparison says there is no permanent free tier. Another says a limited trial of three workouts exists. Sources conflict — [SensAI 2026 review](https://www.sensai.fit/blog/fitbod-review-2026); [aitoolsbakery pricing](https://aitoolsbakery.com/blog/fitbod-pricing/); [SensAI pricing comparison](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison). These are not vendor-verified. The vendor's own algorithm page does not state pricing
- Reviewer summary: an Android glitch report exists (single reviewer, per SensAI review). SensAI is a competitor, so weight accordingly — [SensAI 2026 review](https://www.sensai.fit/blog/fitbod-review-2026)

### Inferences
- Fitbod's transparency is partial. It names the 1RM formula and rep targets, but the recovery score and the load-adjustment rule are opaque. This matches the complaint pattern (prescriptions that feel random or mis-loaded) more than a clear "why" on each set.
- Equipment and plate-increment modeling is a plausible source of the barbell-at-17.5-lb complaint, but the vendor does not confirm this.

### Gaps
- No verified 2025–2026 r/Fitbod thread found. Sentiment on bad prescriptions is based on one Reddit thread (date unverified) and a few Trustpilot/review-site items.
- Free-tier status is unresolved across sources.
- Recovery percentage formula is undocumented.

## Boostcamp: free named programs

### Takeaway
Boostcamp's pitch is a large free program catalog plus a free full tracker. Pro ($14.99/mo or $59.99/yr) unlocks analytics, the Strength Score, and the volume heatmap. Its "auto-progression" is described only as applying to "named methodologies," with no rules published. Program counts vary across sources and are inconsistent.

### Cited Findings
- Vendor comparison page (Last updated May 2026): free tier includes "Full tracker (RPE/RIR, supersets, drop sets, plate calc, PRs, weekly reports), 11,000+ programs, custom builder." The free tier has no time limit and no cap on the library or manual program building — [boostcamp.app/vs/strong](http://www.boostcamp.app/vs/strong) (vendor claim)
- Same page: "more than 130 coach-designed programs" within the catalog. Pro adds "20+ exclusive coach programs, the Strength Score, the per-muscle volume heatmap" — [boostcamp.app/vs/strong](http://www.boostcamp.app/vs/strong)
- Vendor claims "auto-progression on named methodologies" but does not state the progression rules or how weights or reps are computed. The FAQ says personalized programs come from "a builder that generates a starter plan from a short questionnaire" — [boostcamp.app/vs/strong](http://www.boostcamp.app/vs/strong)
- Strength Score is bodyweight-adjusted using IPF DOTS. This is an analytics metric, not a prescription method — [boostcamp.app/vs/strong](http://www.boostcamp.app/vs/strong)
- Pricing: $59.99/yr ($4.99/mo) with a 7-day trial, or $14.99/mo with no trial. No lifetime option — [boostcamp.app/vs/strong](http://www.boostcamp.app/vs/strong)
- Independent review (Garage Gym Reviews, updated Sept 11, 2026; overall 4.2/5): "The free version is available forever, but most analytics and progress charts require the Pro plan." Calls the free version "great if you're simply looking for a way to record your workouts." Calls the annual plan "an absolute steal" — [garagegymreviews.com/boostcamp-review](https://www.garagegymreviews.com/boostcamp-review)
- Same review: showing previous-week sets, reps, and weight "eliminates the guesswork of progressive overload" (scored 5/5). Ease of use 5/5, "the easiest one to use" among 10+ apps tested. Accountability scored 2/5 — [Garage Gym Reviews](https://www.garagegymreviews.com/boostcamp-review)
- Same review dislikes: no individualized coaching; exercises have animations but no video demos; custom builder has a learning curve; little cardio or mobility content; some App Store users reported confusing interface updates and tech issues (reviewer did not personally hit these) — [Garage Gym Reviews](https://www.garagegymreviews.com/boostcamp-review)
- Same review: not recommended for beginners, endurance or hybrid athletes, or competitive powerlifters/weightlifters who need personalized coaching — [Garage Gym Reviews](https://www.garagegymreviews.com/boostcamp-review)
- Community programs cited as Reddit-origin: PPL split, nSuns 5/3/1, PHUL — [Garage Gym Reviews](https://www.garagegymreviews.com/boostcamp-review)
- Fortune 2026 review gives 4.5/5 and lists "tons of structured programs—for free" as a pro; cons include weak accountability — [Fortune boostcamp review](https://www.fortune.com/article/boostcamp-review/) (surfaced via search; not fetched in full)
- Program-count conflicts: 132 official programs and 12,000+ user programs (Garage Gym Reviews); 130+ expert and 10,000+ community (App Store listing, per search); 11,000+ total on the free tier (vendor). The App Store listing also cites "70+ professional plans" and "500+ community-created routines" — [App Store](https://apps.apple.com/IN/app/id1529354455) (search-surfaced; regional listings differ)

### Inferences
- The free-named-program model is the acquisition hook. Paywall friction centers on analytics and some premium programs, not the core log.
- The lack of published auto-progression rules means "why this weight" is not explained in-app, per vendor materials.

### Gaps
- No verified Reddit user sentiment for Boostcamp found. The app's own community is the main user-generated program source, which Reddit-sourced programs feed into, but this is not confirmed by user threads.
- The UX of the "previous week" card and the program browser is described secondhand by one reviewer; no screenshot-level review found.

## JEFIT: library and analytics

### Takeaway
JEFIT is a long-running logger with a big exercise library and an analytics layer behind the Elite tier. It is the most ad-supported of the four in its free tier. Trustpilot is poor (2.7, from 5 reviews), but the sample is tiny. App Store and Google Play ratings are higher. Its "progressive overload system" is mentioned in its own update notes but not explained.

### Cited Findings
- Free tier: workout logging, workout planning, a 1,400+ exercise database with animated demos, and community access. Ads are reported in the free tier — [Subger Jefit Elite overview / search summaries](https://subger.com/en/service/jefit-elite) (aggregator); [stork.ai](https://www.stork.ai/en/jefit) (aggregator). Both are third-party; exact feature lists unverified against the vendor
- Elite adds: unlimited watch-app workouts, professional audio cues, advanced fitness analytics, and premium expert-crafted routines — [Apple App Store listing](https://apps.apple.com/ca/app/jefit-workout-planner-gym-log/id449810000) (search-surfaced; the ID link was returned in search, not fetched). Comparison sites add ad removal and video demos (unverified)
- Analytics on Elite include 1RM, volume, and body-weight tracking (per a third-party review; unverified)
- Pricing: Elite Monthly $12.99; Elite Yearly $69.99 (US, per App Store listing as surfaced); older and discounted prices also appear. One source says Elite pricing is not publicly detailed, which conflicts. Prices vary by region — [App Store listing](https://apps.apple.com/ca/app/jefit-workout-planner-gym-log/id449810000); [Subger deals](https://subger.com/en/deal/jefit-elite) (affiliate-style)
- App Store update note (2025): "refinements to our new progressive overload system" and performance work for users with large data sets — [Apple App Store listing](https://apps.apple.com/ca/app/jefit-workout-planner-gym-log/id449810000). Vendor claim; the system is not described
- Ratings: Google Play 4.4 from 89.2K reviews; Apple 4.8 from 115 ratings (search-surfaced)
- Trustpilot: TrustScore 2.7 ("Poor") from 5 reviews, 80% one-star. Two reviews are from the last 12 months. The profile is unclaimed and the company hasn't invited reviews. Recent 1-star (Nov 14, 2025, Marcus Lundberg) concerns a Swedish breach-notification listing tied to a 2020 Jefit leak (emails, IPs, passwords, usernames). Recent 5-star (May 26, 2025, Qamran Sultan): "Jefit is hands-down one of the best workout tracking apps out there" — [Trustpilot jefit.com](https://trustpilot.com/review/jefit.com)
- A search summary cites a separate Trustpilot 1-star complaint about a VIP subscription that stayed active after deletion, requiring cancelling the card. This was NOT present in the fetched Trustpilot page (which showed only 5 reviews), so it is unverified and may come from a different page — [Trustpilot via search, ch.trustpilot.com/review/www.jefit.com](https://ch.trustpilot.com/review/www.jefit.com) (not fetched; treat as unverified)
- A third-party overview says interface has received "mixed reviews," with some users finding it unattractive and "unfinished" (unverified, aggregator)
- Paywall: a third-party onboarding walkthrough shows an "Unlock Pro" paywall screen (unverified)

### Inferences
- JEFIT's core competence is the library and logging, and its progression is a secondary feature. Analytics is the paywall lever.
- The cancellation/billing complaint pattern shows up repeatedly in search results for Jefit and for Dr. Muscle. It is the most consistent cross-app billing theme, but Trustpilot sampling is too small to quantify it.

### Gaps
- No verified r/jefit or r/Fitness threads found. JEFIT's blog and comparison pages are vendor-biased and were not used for claims.
- How JEFIT's "progressive overload system" calculates load is undocumented in anything found.

## Dr. Muscle: auto-progression

### Takeaway
Dr. Muscle is the most explicit about DUP-based auto-progression. It promises the app "tell you exactly how much to lift (and for how many reps)" and says it uses daily undulating periodization. Sources differ on pricing ($48.99/mo or $399.99/yr per App Store as surfaced). The main user-side complaint across secondary sources is cancellation and billing. Independent reviews describe it as suited to intermediate lifters.

### Cited Findings
- Vendor page: the app "varies your reps each workout automatically, based on your goals and past performance" (DUP) and then computes weights for the chosen reps. Weight increases target 2–3% and fall back to other weight/rep combinations when plate increments don't fit. Sets rise up to 6 work sets "until you hit a plateau" — [dr-muscle.com/progressive-overload-app-gain-muscle-strength](https://dr-muscle.com/progressive-overload-app-gain-muscle-strength/) (vendor-authored, promotional)
- Feedback loop: you rate each set on effort and the app "tweaks your subsequent sets and reps automatically based on your feedback." The page does not name this as RIR, though its tip is the same idea — [dr-muscle.com](https://dr-muscle.com/progressive-overload-app-gain-muscle-strength/)
- Deloads are suggested "when your strength goes down," or triggered manually. The description is qualified "at the time of this writing" — [dr-muscle.com](https://dr-muscle.com/progressive-overload-app-gain-muscle-strength/)
- The page does not state its rep ranges, whether it explains "why" per set, or the trial length — [dr-muscle.com](https://dr-muscle.com/progressive-overload-app-gain-muscle-strength/)
- Vendor claims "for less than the cost of one session with a personal trainer, you can get unlimited coaching with Dr. Muscle for a month" — [dr-muscle.com](https://dr-muscle.com/progressive-overload-app-gain-muscle-strength/)
- Price per App Store listing (search-surfaced): $48.99/mo or $399.99/yr, with a free trial that requires no payment info to start — [App Store, ca listing](https://apps.apple.com/ca/app/dr-muscle-ai-personal-trainer/id1073943857)
- Third-party review (aitoolsbakery, updated 2026; scored 3.8/10 in one snippet and 3.8/5 in another. Scoring is inconsistent): describes the app as an "overpriced app with a difficult exit" for most people, and suited to intermediate rather than beginner lifters. Says it "delivers real strength progress for the right person." Flags documented Trustpilot cancellation issues — [aitoolsbakery.com/blog/dr-muscle-review](https://aitoolsbakery.com/blog/dr-muscle-review/) (affiliate-style SEO site; low confidence)
- Third-party review states that Fitbod rotates exercises while Dr. Muscle keeps the same exercises across a cycle — [aitoolsbakery review](https://aitoolsbakery.com/blog/dr-muscle-review/) (unverified against source)
- Reviewer complaint from a Dr. Muscle-hosted review of Fitbod (competitor): users say Dr. Muscle-style AI workouts seem random — see Fitbod section. Not a Dr. Muscle user review

### Inferences
- Dr. Muscle's transparency is partial. The "why" is in rules (DUP, feedback-driven reps, plateau-based set counts) described in marketing copy. There is no per-set explanation shown in any source found.
- Reviewer scoring of 3.8 appears in two different scales in the same source. Do not treat the score as data.

### Gaps
- No verified Reddit thread on Dr. Muscle's auto-progression was found. The Reddit-specific results were for "Muscle Booster" and "Mad Muscles," which are different apps, and those summaries are low-quality.
- Price discrepancy between sources is unresolved (App Store ca listing vs. third-party reviews).

## Cross-app patterns

- **Transparency of "why":** Fitbod publishes the most mechanism detail (1RM formula, recovery %, rep ranges), but not the load-adjustment rule. Dr. Muscle publishes DUP and the feedback loop, but not per-set rules. Boostcamp publishes almost none (named methodologies, no rules). JEFIT publishes almost none beyond "progressive overload system."
- **Complaints (2025–2026, thin evidence):**
  - Bad or random prescriptions: Fitbod (one r/xxfitness thread, Trustpilot 1-star). Dr. Muscle and Fitbod both show "too easy / random" claims in competitor-written reviews.
  - Billing and cancellation: JEFIT (search-surfaced 1-star, unverified) and Dr. Muscle (third-party reviews). Documented only in secondary sources.
  - Paywall: Boostcamp's analytics and some programs are paid. Fitbod has no clear free tier. JEFIT ads on free tier.
  - Interface and bugs: Boostcamp (some App Store users reported interface and tech issues, per Garage Gym Reviews). JEFIT "mixed" interface (unverified). Fitbod Android glitch (single review).
  - Data privacy: JEFIT 2020 breach as shown in a 2025 Trustpilot review (historical, not a 2025 issue).
- **Pricing (as of Oct 2026, sources conflict where noted):**
  - Fitbod: $15.99/mo or $95.99/yr; trial status conflicts across sources.
  - Boostcamp: Free tracker and library; Pro $14.99/mo or $59.99/yr (7-day trial on annual only).
  - JEFIT: Free with ads; Elite $12.99/mo or $69.99/yr (US, per App Store as surfaced); regional prices vary.
  - Dr. Muscle: $48.99/mo or $399.99/yr (App Store as surfaced); free trial with no payment method required to start (per App Store).

## Items to verify before relying on them
1. Fitbod free-tier status (sources conflict).
2. Dr. Muscle's pricing (App Store vs. third-party articles).
3. Boostcamp program counts (four different figures).
4. JEFIT Trustpilot "VIP subscription" complaint (search summary only, not found on the fetched page).
5. Any user-sentiment claim. Reddit was not successfully searched. Exa rate-limited, and WebSearch did not return real subreddit threads for these apps. Rerun the Reddit portion with a working Exa key or direct Reddit search before writing the user-sentiment section.
