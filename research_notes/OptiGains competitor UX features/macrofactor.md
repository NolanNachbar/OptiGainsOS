# MacroFactor: Defining Features and UX Trust Profile (as of 2026-10-13)

Scope note: Research done with WebSearch, WebFetch, and Exa (Reddit). About 14 tool calls. The official macrofactor.com pages were partly fetched. Several planned fetches (Version 5.0.0 notes, the AI food logging page, the algorithm-accuracy page, the expenditure-modifiers page) were not completed and are listed under Gaps. Competitor blogs (Nutrola, Glotier) are marketing or aggregated and are flagged as such. Quotes come from search snippets or the Reddit tool output, not from full-page reads, unless noted.

## 1. Adaptive expenditure (TDEE) algorithm

### Takeaway
MacroFactor's core claim is that it estimates your expenditure from your weight trend plus logged intake, then adjusts targets. Users praise it most, but there is no independent validation found. The vendor's own help text is the main public explanation.

### Cited Findings
- Official help: "MacroFactor's algorithms calculate your expenditure based on your weight trend and logged nutrition intake." — [MacroFactor help, article 110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates)
- Official help: "MacroFactor considers more than one week of data when calculating your expenditure and adjusting your nutrition targets." — same article
- Vendor design tradeoff: "expenditure calculated from one week of data adapts quickly but with more noise than signal" (short lookback is responsive but noisy; long lookback is stable but slow). Vendor claim, from a search snippet — [MacroFactor algorithm-accuracy page, via search](https://macrofactor.com/algorithm-accuracy/)
- Vendor argument against wearables: cites a systematic review that wearables "under- or over-estimate energy expenditure by more than 10% a whopping 82% of the time." Vendor's citation, not verified by me — [MacroFactor algorithm-accuracy page, via search](https://macrofactor.com/algorithm-accuracy/)
- Positive user: "it does a much better job of tracking my TDEE over time than I do. The algorithm is the selling point imo." — u/Marimothra, [Is this app worth it? (2025-09-09)](https://www.reddit.com/r/MacroFactor/comments/1ncwgh5/is_this_app_worth_it/)
- Positive user (MFP-to-MF switcher): "Mfp tells me I can lose 1-2lbs a week on 2300 calories a day. MacroFactor says my expenditure is ~1900-2000 a day. So… MacroFactor. It's the only app that's been remotely accurate and that I've been successful with." — u/aTumescentPoke, [How do you guys like MacroFactor compared to MyFitnessPal? (2025-05-07)](https://www.reddit.com/r/MacroFactor/comments/1kgp4l5/how_do_you_guys_like_macrofactor_compared_to/)
- Positive user, after about a year: "Honestly, the auto regulation of MacroFactor is a game changer." — comment on [MacroFactor OR Loseit? (2025-02-27)](https://www.reddit.com/r/MacroFactor/comments/1iz8nx2/macrofactor_or_loseit/)
- Skeptical user, 6-week use: "MacroFactor seems to be orders of magnitude out (in the lower direction)." Reports Apple Watch estimated about 3600 kcal and MacroFactor showed 2542 kcal on a heavy training day. — u/OxbridgeDingoBaby, [MF Vastly Underestimating Expenditure (2026-08-31)](https://www.reddit.com/r/MacroFactor/comments/1w3tz01/mf_vastly_underestimating_expenditure/) (44 comments; I did not read the replies)
- Support-style reply to a user whose target looked too low: "You've been partial/inconsistently logging, and need to reset your expenditure." Support advised resetting the expenditure start date. — [Having issues with tracking? (2026-04-14)](https://www.reddit.com/r/MacroFactor/comments/1sl9k2s/having_issues_with_tracking/) (user reported target of 1100 kcal/day; reply is from a forum reply, not confirmed as official staff)
- Reviewers say the algorithm needs weeks to calibrate: "most people need a few weeks of consistent use to really reap the benefits" — [Is this app worth it? (2025-09-09)](https://www.reddit.com/r/MacroFactor/comments/1ncwgh5/is_this_app_worth_it/)

### Inferences
- The algorithm is the main reason users pay and stay. Users treat it as a black box that "calibrates" over weeks. The skeptical 2026 post shows the failure mode: a single day or a few days of activity data can look wrong to a user with a wearable.
- The help text is careful. It says the algorithm needs consistent logging (at least 4 days per 7). This makes the "why" depend on logging quality, and the app says so.

### Gaps
- No independent validation study (doubly labeled water, indirect calorimetry) found. A search snippet quoted a Reddit reply saying it has not clearly been validated this way. Treat as a pointer only.
- Stronger By Science write-ups on MacroFactor were not found in search. I did not confirm any SBS article exists or its conclusions.
- The formula itself is not public. The vendor's expenditure-modifiers article (https://macrofactorapp.com/expenditure-modifiers/) was returned in search but not fetched.

## 2. Weekly check-in and how target changes are explained

### Takeaway
The official help explains the mechanism in general terms: expenditure is updated from weight trend and intake, and "coaching updates are downstream of expenditure changes." It does not publish the formula, so the "why" for a specific target change is partly opaque. Users depend on the app's status words ("updating"/"holding") and on consistent logging.

### Cited Findings
- "Coaching updates are downstream of expenditure changes." — [MacroFactor help, article 110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates)
- Status values: expenditure status moves between "updating" and "holding" when logging is inconsistent. Quoted as "from 'updating' to 'holding'" until logging is consistent again. — same article
- Logging frequency guidance: "log food at least four days a week, ideally every day." Weight needs logging only once a week. — per search summary of the same article; the text in the snippet reads "Short answer: at least four times per week, but ideally every day" — [MacroFactor help, article 110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates)
- The app says a coaching module will explain pauses: "The coaching module will provide insight into when the algorithm pauses and when you can expect it to unpause." — [MacroFactor help, article 110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates)
- Behavior described by the vendor's search summary: if progress stalls, calories go down; if losing faster than the target rate, calories go up. Source is the help/marketing material, not verified on the full page. — [MacroFactor smart nutrition coach page, via search](https://macrofactorapp.com/?p=4998)
- Reddit user confusion about a very low target: user had a target of 1100 kcal/day, and the app's response was to reset expenditure. — [Having issues with tracking? (2026-04-14)](https://www.reddit.com/r/MacroFactor/comments/1sl9k2s/having_issues_with_tracking/)

### Inferences
- The "why" is explained at the level of inputs (weight trend, logged food, consistency) and status flags. The app does not show a per-week breakdown of the formula in the sources I found. Whether the in-app UI shows more is unverified; the coaching-module language suggests it is being built.
- Logging-consistency gating is a transparency feature in itself: the app tells you when it is not learning.

### Gaps
- The in-app weekly check-in screens were not verified. No screenshot or walkthrough was read.
- No source found on how the app explains a specific target change week to week.
- Minimum-calorie guardrails are covered in section 6.

## 3. Food Logger redesign and logging speed

### Takeaway
Users repeatedly call MacroFactor fast and clean, especially versus MFP. The specific "redesign" I was asked about was not confirmed. The only redesign-like items I found are a Favorites feature and the AI food log.

### Cited Findings
- "it's incredibly fast whereas MFP is glitchy and buggy when trying to open the app and quickly log things" — u/aTumescentPoke, [How do you guys like MacroFactor compared to MyFitnessPal? (2025-05-07)](https://www.reddit.com/r/MacroFactor/comments/1kgp4l5/how_do_you_guys_like_macrofactor_compared_to/)
- "I enjoy the UI on Macrofactor, it's never stuttered or glitched on me, it's packed full of information and can be tweaked for more or less info/arranged to how you like." — 1414-day MFP streak user, [A detailed review from a long term (1414 day streak) myfitnesspal user (2025-02-28)](https://www.reddit.com/r/MacroFactor/comments/1j0ljvq/a_detailed_review_from_a_long_term_1414_day/)
- Counter-view on UI, 2026-06-24: "it's not user friendly, sometimes the units I want aren't present and calculations need to be done to convert them." Reply: "Try changing the optimization in the logger options from..." — u/Aggravating_Bag4028, [Disappointed with this app so far (2026-06-24)](https://www.reddit.com/r/MacroFactor/comments/1uerk9p/disappointed_with_this_app_so_far/)
- Same thread, user says the AI "tool sucks and you can't edit it once it's logged." Reply: "I edit all the time?" — same thread. Note the contradiction within the thread.
- Logger options exist ("optimization in the logger options") — same thread, reply text cut off.
- "Favorites" feature mentioned in one search summary of the vendor's AI food logging pages; not confirmed on the page itself. — [MacroFactor AI food logging search results](https://macrofactor.com/ai-food-logging/)
- Competitor blog (not independent): Nutrola reports its photo logger is faster; MacroFactor's own "vs Cal AI" page calls MacroFactor "the fastest food logger on the market." Both are vendor-sourced. [MacroFactor vs Cal AI](https://macrofactor.com/macrofactor-vs-cal-ai/) (vendor), [Nutrola diary](https://nutrola.app/en/blog/i-switched-from-macrofactor-to-nutrola-for-60-days) (competitor)

### Inferences
- "Speed" in user talk is mainly about app stability and fewer taps compared with MFP, not a measured timing. No benchmark found.

### Gaps
- No documented "Food Logger redesign" found. The Version 5.0.0 release notes (https://macrofactor.com/version-5-0-0/) appeared in search but were not fetched. This is the likely place for logger changes. Unverified.
- No measured logging-time benchmark found.

## 4. AI describe / voice / photo logging

### Takeaway
MacroFactor has AI food logging in Open Beta with photo, photo-plus-text, and camera-roll input. Entries are shown as editable ingredient-level results. I found no official voice logging. Reviews on the AI are mixed.

### Cited Findings
- Official: "MacroFactor AI is currently in Open Beta and will remain in Beta while we improve its accuracy and refine related workflows." — [MacroFactor AI food logging search results](https://macrofactor.com/ai-food-logging/) and [MacroFactor help, article 258](https://help.macrofactorapp.com/en/articles/258-ai-food-logging)
- Official help modes: "a plain photo, a photo with a text description, and an upload from the camera roll," each sent to an editable "Plate" view before logging. — [MacroFactor help, article 258, via search summary](https://help.macrofactorapp.com/en/articles/258-ai-food-logging)
- Official: results are built from the app's own database and broken into ingredients rather than invented: "it will break down your meal into individual ingredients" and output is "fully inspectable." — same help article (search summary; quotes approximate)
- Official, recipes: can photograph a written recipe to "pre-fill the recipe details." — [MacroFactor Apr 2026 newsletter](https://macrofactor.com/mm-april-2026/)
- Negative user: "The AI tool sucks and you can't edit it once it's logged." — [Disappointed with this app so far (2026-06-24)](https://www.reddit.com/r/MacroFactor/comments/1uerk9p/disappointed_with_this_app_so_far/) Positive reply in same thread: "The AI does good for me if I go out to restaurant."
- Aggregated review analysis (Glotier, 500 recent store reviews, read 2026-07-23): top negative theme "inaccurate nutrition database" in 20% of 115 negative reviews; "AI features unreliable or broken" in 13%; "accurate AI food recognition" among praised themes. Aggregator, method not independently checked. [Glotier MacroFactor review analysis](https://glotier.com/apps/macrofactor-macro-tracker)
- Voice: no official voice logging found. A Nutrola blog (competitor) says MacroFactor lacks voice logging because its focus is TDEE, barcode, and manual entry. Competitor characterization, not official. [Nutrola: Why does MacroFactor not have voice logging?](https://nutrola.app/en/blog/why-does-macrofactor-not-have-voice-logging)

### Inferences
- AI is in beta, so accuracy claims are not settled. The "not editable once logged" complaint is a real UX point worth checking against the app.
- The voice gap is an inference from absence in sources, not a confirmed absence.

### Gaps
- No independent test of AI photo accuracy found.
- Voice: not confirmed either way from the vendor's pages.

## 5. Barcode / label scanner and verified database

### Takeaway
MacroFactor's database is built from a curated source, not user entries, and users value that. Users also complain about database search and some barcode misses. The label scanner is praised in at least one 2026 comparison.

### Cited Findings
- Database source: "Their databases were identical since both leverage the NCCB database rather than user entries, unlike MyFitnessPal or LoseIt." — u/BorderAdventurous284, [Possible switch from MacroFactor to Cronometer (2026-01-13)](https://www.reddit.com/r/cronometer/comments/1qc60e8/possible_switch_from_macrofactor_to_cronometer/) (Reddit user claim, not vendor-confirmed; NCCB claim unverified)
- Label scanner: "In MacroFactor, I used the food label scanner. Done in 30 seconds." — same thread
- Historical: an MFP-to-MF switcher cites removal of a free barcode scanner from MFP as a reason. Dated 2022. — [Why You Should Consider Ditching MyFitnessPal for MacroFactor (2022-09-29)](https://www.reddit.com/r/MacroFactor/comments/xrd063/why_you_should_consider_ditching_myfitnesspal_for/)
- Complaints (Glotier aggregate, 2026): "poor food database searchability" 17% of negative reviews; "limited food barcode recognition" 10%. — [Glotier](https://glotier.com/apps/macrofactor-macro-tracker)
- Reddit complaint: "Sometimes the units I want aren't present and calculations need to be done to convert them." — [Disappointed with this app so far (2026-06-24)](https://www.reddit.com/r/MacroFactor/comments/1uerk9p/disappointed_with_this_app_so_far/)

### Inferences
- The "verified database" marketing is partly a claim about source (curated/not crowd-sourced). The sources do not show database accuracy rates. The Glotier aggregate suggests accuracy is still the top complaint.

### Gaps
- No vendor page on the verification process was fetched.
- No measured database accuracy comparison found.

## 6. Undo, meal memory, diet breaks, calorie-floor guardrails

### Takeaway
Calorie floor is a documented guardrail (standard 1200 kcal/day). Diet breaks are not covered in the help center I found. The app's "logging break" module is the closest pause feature. Undo and meal memory were not confirmed.

### Cited Findings
- Standard floor: "Our 'standard' floor is 1200 kcal/day, but this might be too high for people on the lower end of the energy expenditure spectrum." — [MacroFactor help, program options, via search summary](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) (search snippet; exact article may differ)
- "Low" floor is individualized, based on "the lowest levels of protein, fat, and carbohydrate required to maintain basic physiological functions for moderate periods of time." — same
- Opt-out allowed but cautious: "the decision to reduce the calorie floor below standard should not be taken lightly." — same
- Rationale for not restricting too long: help says prolonged restriction can lower leptin, reduce TDEE, and increase hunger. — [MacroFactor help, program styles or floor article, via search summary](https://help.macrofactorapp.com/en/articles/91-program-styles)
- Logging-break pause is handled as a coaching module, not a "diet break" feature. — [MacroFactor help, article 110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates)
- Anecdotal: users on targets around 1200–1500 kcal; one commenter guessed 1500 was a men's floor. Unverified. — [Another calories seem low thread (2024-11-12), via search](https://nyc1.lr.ggtyler.dev/r/MacroFactor/comments/1gpz9pj/another_calories_seem_low_thread) (mirror site; original reddit URL not confirmed)

### Inferences
- Guardrails are numeric (1200 kcal default floor), which is a sourced vendor choice. Under this repo's rule, any constant we reuse should be marked as the vendor's, not a principle.
- Diet breaks: no evidence in these sources that MacroFactor has a formal diet-break feature.

### Gaps
- Undo: no source found.
- Meal memory / favorites or recents: "Favorites" mentioned in one summary only; not confirmed in the official page.
- Diet breaks: no official guidance found in the help center search.

## 7. Workouts app

### Takeaway
MacroFactor Workouts launched January 2026 as a strength/hypertrophy app, with rule-based progression per the vendor. Reception is thin: mostly vendor material and store ratings. No independent hands-on training review found.

### Cited Findings
- Launch (Jan 2026): "built to track, train, and progress your strength and hypertrophy workouts." Guides "long-term progression based on how your body is adapting." — [MacroFactor Jan 2026 newsletter](https://macrofactor.com/mm-jan-2026/)
- Progression method: vendor says rule-based, not generative AI (per GainFrame review). Not confirmed on the vendor page; the Jan 2026 page does not say. — [GainFrame review](https://gainframe.app/blog/macrofactor-workouts-review/) (third party; states it did no longitudinal test)
- Features (Apr 2026 newsletter): levels per muscle group, warm-up sets, skip exercises, Jeff Nippard program imports, reps-first option, daily and weekly set counts. — [MacroFactor Apr 2026 newsletter](https://macrofactor.com/mm-april-2026/)
- Upcoming: Apple Health integration as the next major release; Live Activities in beta; strength estimation and fatigue logic updates; Push Pull Legs program; Apple Watch experience in development. — [Jan 2026](https://macrofactor.com/mm-jan-2026/) and [Apr 2026](https://macrofactor.com/mm-april-2026/)
- Store ratings (per-country snapshots, not global): Canada listing 4.8 with 610 reviews; Denmark listing 4.5 with 40 reviews. — [App Store Canada listing via search](https://apps.appfollow.io/ios/macrofactor-workouts-tracker/6737156524?country=ca)
- Bundling: help page mentions bundling the two apps to save money, with a free trial for each. — [Jan 2026 newsletter](https://macrofactor.com/mm-jan-2026/)
- Pricing: App Store listing (Malaysia storefront, via search) shows $11.99/month, $47.99 per half year, $71.99 per year for MacroFactor (Nutrition). Storefront and currency vary; treat as indicative only. — [App Store listing via search](https://apps.apple.com/my/app/macrofactor-macro-tracker/id1553503471?l=ms)

### Inferences
- Workouts is a 2026 product and reception is too young for the strength community to have a consensus. Outlift's 2026 review covers the nutrition app and says the author had just started testing Workouts; no findings indexed.

### Gaps
- No independent 2026 strength review with results found.
- Whether Workouts is included in the nutrition subscription: not stated on the vendor page I fetched.
- Reddit reception of Workouts was not searched directly. This is a gap.

## 8. Pricing

### Takeaway
Pricing appears as a monthly/half-year/annual tiered subscription with a free trial and no free tier. Users cite "$80 per year" in early 2026. Storefront prices conflict and need a direct check.

### Cited Findings
- App Store listing: $11.99/month, $47.99 per half year, $71.99 per year; free trial, no free subscription tier. — [App Store listing via search](https://apps.apple.com/my/app/macrofactor-macro-tracker/id1553503471?l=ms) (storefront-specific)
- Teen Reddit user, Jan 2026: "is it better than its competitors and worth the $80 per year?" — [Is MacroFactor a really good tracker? (2026-01-23)](https://www.reddit.com/r/MacroFactor/comments/1qkc0g6/is_macrofactor_a_really_good_tracker/) (conflicts with $71.99 listing; US price not verified)
- 2025 user: "it's 2x more expensive than Loseit" and Lose It has a lifetime option. — [MacroFactor OR Loseit? (2025-02-27)](https://www.reddit.com/r/MacroFactor/comments/1iz8nx2/macrofactor_or_loseit/)

### Gaps
- US price not confirmed from the US App Store or macrofactor.com pricing page (fetch of the homepage redirected and was not followed).

## 9. Trust and "why users stay" (cross-cutting)

### Takeaway
Users compare MacroFactor mainly to MFP on stability and to Lose It or Cronometer on the adaptive algorithm. The strongest praise is "it calibrates to my expenditure." Recurring criticism is the database, AI reliability, billing, and UI learning curve.

### Cited Findings
- "As others have stated, after it calibrates to your personal expenditure, it's hands down the best calorie tracker for any weight goal I've ever used and easily worth it." — [Is this app worth it? (2025-09-09)](https://www.reddit.com/r/MacroFactor/comments/1ncwgh5/is_this_app_worth_it/)
- Switch from 11 years of Lose It and MFP: "I can't believe how much better it is. Its entirely methodology for estimating caloric burn is..." — [Is MacroFactor a really good tracker? (2026-01-23)](https://www.reddit.com/r/MacroFactor/comments/1qkc0g6/is_macrofactor_a_really_good_tracker/) (quote truncated in tool output)
- Glotier aggregate (2026): top praise "excellent calorie tracking"; "accurate AI food recognition." Top complaints: "inaccurate nutrition database" (20%), "poor food database searchability" (17%), "subscription billing issues" (15%), "AI features unreliable or broken" (13%), "high subscription cost" (12%), "limited food barcode recognition" (10%), "unintuitive user interface" (9%), "poor customer support" (8%). — [Glotier](https://glotier.com/apps/macrofactor-macro-tracker) (method: 500 store reviews read 2026-07-23; percentages are of 115 negatives; aggregator not verified)
- Reddit switch to Lose It, 2026-04-28: "I downloaded and tried a TON of apps. Lose It! is near perfection for my use case." Another: "MFP seems to be having a mass exodus right now." — [r/Myfitnesspal thread (2026-04-28)](https://www.reddit.com/r/Myfitnesspal/comments/1sy7y8g/need_alternative_app_recommendation/)
- Recognition of a restaurant use case: "The AI does good for me if I go out to restaurant." — [Disappointed with this app so far (2026-06-24)](https://www.reddit.com/r/MacroFactor/comments/1uerk9p/disappointed_with_this_app_so_far/)

### Inferences
- The moat users describe is the expenditure algorithm plus stability. The database and AI are the weak links in 2026 reviews.
- Sample is skewed: r/MacroFactor is a self-selected, biased community (one Reddit user says so explicitly, [Is MacroFactor a really good tracker?](https://www.reddit.com/r/MacroFactor/comments/1qkc0g6/is_macrofactor_a_really_good_tracker/)). Treat as sentiment, not measurement.

## Answers to the key questions

### Q1. What do users say makes MacroFactor feel different from MFP / Cronometer / Lose It?
- Adaptive expenditure: "it does a much better job of tracking my TDEE over time than I do" (2025-09-09 Reddit, above).
- Stability and speed vs MFP: "MFP is glitchy and buggy" (2025-05-07, above); "it's never stuttered or glitched on me" (2025-02-28, above).
- Lose It comparison: "the auto regulation of MacroFactor is a game changer" (2025-02-27, above). Lose It is seen as having "slightly better database" by one user (same thread).
- Cronometer comparison: database is claimed identical to MacroFactor's (2026-01, above; unverified claim).

### Q2. How does the weekly check-in explain target changes?
- The explanation is mechanism-level: weight trend plus logged intake, multi-week window, and status words ("updating" / "holding"). The help text does not publish a formula. The app's stated transparency is in the logging-consistency gate and the planned coaching module that explains pauses. See section 2 for sources.

### Q3. Recurring complaints and feature requests, 2025-2026?
- Complaints (2026): database accuracy and search; AI reliability and non-editable logs; billing; price; barcode misses; UI learning curve and unit conversions; expenditure under-estimation on heavy-training days (one user, Aug 2026). Sources: [Glotier](https://glotier.com/apps/macrofactor-macro-tracker), [Disappointed (2026-06-24)](https://www.reddit.com/r/MacroFactor/comments/1uerk9p/disappointed_with_this_app_so_far/), [MF Vastly Underestimating (2026-08-31)](https://www.reddit.com/r/MacroFactor/comments/1w3tz01/mf_vastly_underestimating_expenditure/).
- Feature requests found: units (user), editable AI entries (user), Apple Health (vendor's roadmap for Workouts), Apple Watch experience (vendor roadmap). Full feature-request list not compiled; r/MacroFactor requests not searched individually.

### Q4. Is there a MacroFactor Workouts product and how is it received?
- Yes. Launched January 2026 (vendor newsletter). Reception: no independent strength review with results found. Store ratings exist but are per-country (4.8 on 610 reviews in Canada; 4.5 on 40 in Denmark). Reddit reception not directly searched. Treat as early and unproven.

## Source freshness

- Most recent: MacroFactor Apr 2026 newsletter; Reddit posts dated 2026-06-24 and 2026-08-31; Glotier analysis as of 2026-07-23.
- Older (flag): 2022 MFP-scanner post; 2023 1-year review; 2024 naturalbodybuilding review; 2025 Reddit threads.
- Competitor/marketing: Nutrola blogs (including "Why Is MacroFactor So Bad Now? (2026)"), Cal AI comparison, GainFrame review. Use only as characterization.

## Unverified or conflicting items
- Pricing: $71.99/yr (Malaysia App Store snippet) vs "$80 per year" (Reddit, Jan 2026). US price unconfirmed.
- Calorie floor 1200 kcal: from search snippet of a help article; not read in full.
- "Disappointed" thread: one user says "you can't edit it once it's logged"; another replies "I edit all the time?" Contradiction unresolved; see the thread.
- Glotier aggregate method and counts: not independently verified.
- Reddit "logging break" module: described as planned in the help article, not confirmed as shipped.

## Gaps (consolidated)
- Version 5.0.0 release notes (https://macrofactor.com/version-5-0-0/): not fetched. Likely covers logger changes.
- Food Logger "redesign": not confirmed.
- Undo and meal memory: no sources found.
- Diet breaks: no official guidance found.
- Stronger By Science: no MacroFactor article found in search.
- Independent validation of the algorithm: none found.
- Workouts reception on Reddit (r/fitness30plus, r/naturalbodybuilding): not searched directly.
- r/leangains, r/loseit, r/fitness30plus, r/naturalbodybuilding: not searched individually beyond the results above.
- Voice logging: not confirmed either way from official sources.
