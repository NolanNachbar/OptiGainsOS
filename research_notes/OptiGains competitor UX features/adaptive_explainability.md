# Adaptive Prescriptions and Explainability in Fitness Apps (as of Oct 2026)

Coverage caveat: the Exa/Reddit backend returned HTTP 429 (free MCP rate limit) on the first call, so Reddit was reached only through WebSearch result summaries, not through thread text. Nothing below is a verbatim Reddit quote unless marked "verbatim." Most "user says" items are paraphrases of search-result summaries and need a direct read before use. Several sources are 2023-2025 and are flagged as older. Tool budget (about 15 calls) was reached, so several threads listed here were not opened.

## Key Question 1: Which apps explain their prescriptions well, and what does the explanation look like?

### Takeaway
MacroFactor is the clearest documented example of a "why did the target change" explanation, but its official text describes the mechanism at a high level and does not give a per-week reason. Fitbod's help center explains its conservative defaults in general terms. Liftosaur's scripting model makes the rule itself visible to the user, which is the most transparent option found, at the cost of complexity. Dr. Muscle and RP have little independent documentation of how their changes are explained.

### Cited Findings
- MacroFactor: the check-in "looks for changes in the user's expenditure, weight, and goal to provide a new set of macro targets for the following week" (paraphrase in search summary; not fetched directly) — [MacroFactor site](https://macrofactorapp.com/?p=2607)
- MacroFactor help article on dynamic vs static expenditure, fetched and quoted: "program updates are based on dynamic changes to your estimated expenditure"; with a static estimate, "MacroFactor will not update your nutrition targets week-to-week"; switching back to dynamic, the algorithm "will pick right back in real time, as if you'd been using a dynamic expenditure estimate the whole time." — [MacroFactor KB: change expenditure from dynamic to static](https://help.macrofactorapp.com/en/articles/64-how-to-change-your-expenditure-estimate-from-dynamic-to-static) (verbatim, via WebFetch)
- MacroFactor has a KB article "How to Interpret Changes to your Energy Expenditure" that covers how and why the estimate shifts week to week. Its title and summary were seen in search; the full text was not fetched. — [MacroFactor KB search result](https://help.macrofactorapp.com/en/articles/64-how-to-change-your-expenditure-estimate-from-dynamic-to-static) (title only; full article URL not confirmed)
- MacroFactor staff reply on a Reddit coached-plan thread (per search summary, date unclear, may be older): calories rose at a first check-in because "expenditure increases over time as you gain weight," with the estimate dropping only if the earlier estimate was too high; other causes listed were overeating, water-weight swings, and logging problems. Unverified: this is a summary of the thread, not verbatim. — [r/MacroFactor thread (mirror)](https://nyc1.lr.ggtyler.dev/r/MacroFactor/comments/1hayfkb/question_about_the_coached_program)
- Fitbod help center (per search summary, not fetched): new users and never-logged exercises start conservatively; time off lowers suggestions; manually changing weight or reps feeds future recommendations. Unverified wording. — [Fitbod Getting Started guide](https://help.fitbod.me/hc/en-us/sections/360001927994-Getting-Started)
- Liftosaur: progression is written as visible text in the program. Each exercise line can carry a `progress:` clause such as `progress: lp(5lb)`, or a `custom() { ... }` block for unusual logic; set variations appear on the line (e.g. `5x3 / 6x2 / 10x1`); exercises can reuse another's logic with `...Bench Press`. (Fetched from the Liftosaur blog; paraphrased from the fetch summary, not a verbatim quote.) — [Liftosaur: Combine Workout Planner and Liftoscript](https://liftosaur.com/blog/posts/combine-workout-planner-and-liftoscript)
- Liftosaur docs describe Liftoscript as able to express "nearly any progression or deload scheme," and state that scripts "use state variables that persist between workouts." (Search summary, not fetched directly.) — [Liftosaur Liftoscript docs](https://www.liftosaur.com/doc/liftoscript)
- Dr. Muscle (vendor claim, promotional): "every time you complete a set, your program updates automatically to match your progress." — [Dr. Muscle on App Store](https://apps.apple.com/us/app/-/id1073943857). Third-party directories disagree on timing ("adjusts ... based on whether you hit, exceeded, or fell short of your previous session targets" vs. dynamic adjustment during a workout). No independent source explains individual changes. A Jan 2026 company press release says the app was rebuilt as "Dr. Muscle X" and the progressive overload algorithm "continues to drive workout recommendations" (self-reported). — [GlobeNewswire release, 2026-01-05](https://www.globenewswire.com/news-release/2026/01/05/3212909/0/en/AI-Workout-App-Dr-Muscle-Launches-New-App-Saves-125-000-a-Year-by-Replacing-Developers-with-AI.html)
- RP Hypertrophy (third-party, mixed quality): described as adjusting volume from self-reported pump, soreness, and fatigue over a 4-6 week cycle, then a deload. — [dr-muscle.com RP critique](https://dr-muscle.com/rp-hypertrophy-app-critique/) (contents not verified beyond search summary)

### Inferences
- The strongest explanation pattern found is "name the input and the direction": MacroFactor ties target changes to a measured expenditure estimate and weight trend. That is an explanation a user can check against their own data.
- Liftosaur's "rule is the text" approach makes behavior fully inspectable and editable but assumes the user can read code. This is the opposite end of the trade-off from a one-line "why" card.
- Vendor explanations of adaptive logic are mostly marketing claims. Treat "auto-updates after every set" as unverified until tested.

### Gaps
- No direct read of MacroFactor's "How to Interpret Changes to your Energy Expenditure" article; the exact wording of its explanation is unknown.
- No primary read of Fitbod's help articles on recommendation logic beyond search summaries.
- No direct screenshots or reviews of Dr. Muscle's or RP's in-app explanation UI.

## Key Question 2: What do users say when an algorithm is wrong, and what do they do (override, ignore, churn)?

### Takeaway
Secondhand reports suggest users most often complain about suggestions that are too light, not too heavy, and that they respond by overriding weights and continuing to log, or by ignoring the recommendations entirely. The "too heavy" complaint found was from a competitor's review, so it is weak evidence. Churn to other apps after poor adaptation is reported in at least one forum post.

### Cited Findings
- r/xxfitness (Fitbod) thread, per search summary: a user found Fitbod suggested 17.5 or 22.5 lb barbell loads, below the bar's weight; commenters advised editing the gym equipment profile to list real available weights, and hand-editing suggested weights. Paraphrase. — [r/xxfitness thread (mirror)](https://redlib.belloworld.it/r/xxfitness/comments/1fvy3gt/fitbod_app/lqalq8h/?context=3)
- r/xxfitness (Fitbod), per search summary: a user said the app started them on a light weight for a new exercise (about 5 lb too easy), and overriding it "didn't change later suggestions much"; they asked whether the "how easy was this?" feedback was meant to fix it. Paraphrase; unverified. — [r/xxfitness thread (mirror)](https://redlib.belloworld.it/r/xxfitness/comments/1fvy3gt/fitbod_app/lqbho9a/?context=3)
- Fitbod "too heavy" claim: the only direct example found is a Dr. Muscle (competitor) review that says it drew on Google and Reddit reviews and quotes a user: "I think fitbod is training me for cirque du soleil." Unverified and from a competitor. — [Dr. Muscle Fitbod review](https://dr-muscle.com/fitbod-app-review-alternative/)
- Opposite complaint: one reviewer said generated workouts seemed too easy even on "advanced" settings and felt random. — [Indie Hackers Fitbod review 2026](https://www.indiehackers.com/post/fitbod-app-review-2026-honest-take-after-real-testing-45d5f07a1b) (search summary; not fetched)
- MacPowerUsers forum (per search summary): many long-term Fitbod users use it only to log and ignore the recommendations. — [MacPowerUsers thread](https://talk.macpowerusers.com/t/gym-iphone-app-recommendation/32667)
- Freeletics forum (older, undated in result): a user reported "pretty much the same ones" exercises across intervals and switched apps after the virtual coach "was not adapting well." Paraphrase from search summary. — [Freeletics forum: Getting stuck](https://forum.freeletics.com/t/getting-stuck-with-freeletics/13729)
- A third-party review summary claims about 10% of App Store and Reddit feedback complains about repeated workouts, and about 15% about subscription management. Source is an unnamed aggregator analysis; treat as unverified. — [Indie Hackers Fitbod review 2026](https://www.indiehackers.com/post/fitbod-app-review-2026-honest-take-after-real-testing-45d5f07a1b) (cited in search summary, not checked)
- Speediance blog post titled "what happens when you ignore AI deload week recommendations" exists; content not read. — [Speediance](https://www.speediance.com/blogs/smart-fitness-ai-training/what-happens-when-you-ignore-ai-deload-week-recommendations) (vendor blog; not verified)

### Inferences
- Pattern across the reports: when the engine is wrong, users first look for a way to fix the input (equipment list, weight override), then fall back to logging-only use. Explicit churn appears in the Freeletics case.
- "Overrides don't stick" is the most actionable complaint: users expect a manual correction to change future output and report that it may not. This matches the design risk for any deterministic engine that learns from logs.
- Deload complaints found were indirect. No Reddit thread was found in this pass that directly documents users rejecting a deload.

### Gaps
- No direct Reddit thread text on heavy prescriptions or unrequested deloads. The r/Fitbod and r/weightroom searches did not return threads.
- No quantified churn data from a primary source.
- Share of users who ignore versus override is not measured in any source found.

## Key Question 3: Evidence on deterministic/rule-based vs LLM-driven coaching (hallucination complaints, consistency, trust)

### Takeaway
The evidence found is thin and mostly from journalism and one study. LLM-generated plans were criticized for vagueness, unrealistic volume and rest, and occasional wrong safety advice, rather than for fabricated exercises. No source found directly compares user trust in deterministic vs LLM coaching.

### Cited Findings
- TIME writer: ChatGPT's strength list lacked sets, reps, and whether to do exercises singly or in a circuit. — [TIME](https://time.com/6958557/chatgpt-workout-plan/) (2023; seen in search summary, not fetched)
- A January 2024 study (per search summary) found ChatGPT workout exercise recommendations were 41% comprehensive against ACSM exercise prescription components, and about 90% accurate, with most errors telling users to get medical clearance they did not need. Study not located directly. — [TechRadar summary](https://techradar.com/health-fitness/i-asked-chatgpt-and-siri-ai-to-build-me-a-workout-plan-and-there-was-only-one-winner) (secondhand; verify before use)
- A bodybuilder quoted in the same coverage: "It's very unrealistic to only rest 30 seconds between squat sets." (Verbatim per search summary; source article not fetched.) — [TIME](https://time.com/6958557/chatgpt-workout-plan/)
- Counterpoint: a Men's Health Australia writer who trained on ChatGPT for a month found exercise selection fine and rep ranges good for growth, with sessions too long. — [Men's Health AU](https://menshealth.com.au/ai-personal-training-fitness/) (search summary)
- A prompting guide (per search summary) notes ChatGPT's default progression is unconditional, adding weight "whether you earned it or not." — [Gainframe guide](https://gainframe.app/blog/chatgpt-workout-plan/) (vendor blog; not verified)
- Podcast summary (Lifting Nerds, per search summary): AI-generated programs often prescribe excessive volume without understanding fatigue; 3-5 consecutive bad sessions typically signal a deload. — [Lifting Nerds ep. 16](https://liftingnerds.buzzsprout.com/1734108/episodes/17798263-s3e16-can-ai-help-with-progressive-overload) (summary only)
- Freeletics user complaint (above) is the only found example of an app-side coach's variety problem; it is not clearly LLM-driven.

### Inferences
- The failure mode reported for general LLM plans is "generic and under-specified," not "invented exercises." A deterministic engine with a fixed, inspectable parameter set avoids the consistency problem (same inputs, same output) but still needs to explain itself. The source gap is the main limit.
- Users seem to accept LLM output as a starting point, and penalize it on rest, volume, and missing structure. That supports a "show the numbers and the rule" approach over a chat-style rationale.

### Gaps
- No Reddit evidence of hallucination complaints was retrieved in this pass.
- The 41%/90% study was not located; figures are secondhand.
- No head-to-head trust or retention study of deterministic vs LLM fitness coaching was found.

## Key Question 4: Patterns for letting the user see and override the engine's reasoning

### Takeaway
The patterns visible in the sources are: state the input and direction of each change (MacroFactor); make the rule inspectable and editable (Liftosaur); let users correct inputs such as equipment and weight, and say whether those corrections affect future output (Fitbod). The reported failure is that corrections are not clearly applied to later prescriptions.

### Cited Findings
- MacroFactor offers a static vs dynamic expenditure toggle, with a documented effect on weekly target updates. — [MacroFactor KB](https://help.macrofactorapp.com/en/articles/64-how-to-change-your-expenditure-estimate-from-dynamic-to-static) (verbatim quotes in Key Question 1)
- Liftosaur: users can write or edit the progression rule itself, and the author notes that for a web-editor-style planner, "there's way too much clicking around," and that the planner would expose "custom() { }" for unusual logic. The author also warns a code-first default "could be quite intimidating." — [Liftosaur blog](https://liftosaur.com/blog/posts/combine-workout-planner-and-liftoscript) (fetched; paraphrase except quoted fragments)
- Fitbod: manual weight or rep edits are said to feed future recommendations, and equipment profiles can be edited to match available weights. Reported in community threads as not always applied (see Key Question 2). — [Fitbod Getting Started](https://help.fitbod.me/hc/en-us/sections/360001927994-Getting-Started); [r/xxfitness thread](https://redlib.belloworld.it/r/xxfitness/comments/1fvy3gt/fitbod_app/lqalq8h/?context=3)

### Inferences
- Override design should state what an override changes: this session only, the exercise going forward, or the engine's learned prior. Users in these threads ran into the gap between expected and actual effects.
- For a deterministic engine, a "why" that names the input (for example, "weight trend +0.4 kg/wk over 3 weeks, so target +100 kcal") is consistent with MacroFactor's model. Exact wording in the engine should be checked against the repo's own spec, which this research did not read.
- Undo is not described in any source found. The search did not surface a vendor that documents an undo for prescriptions, so this is a gap, not a finding.

### Gaps
- No vendor documentation found on undo for prescription changes.
- No source found on whether users prefer per-set vs per-program overrides.
- Dr. Muscle, RP, and Liftosaur UI details beyond the cited text were not inspected.

## Source quality and limits
- Reddit: only mirror pages (redlib/lr.* mirrors) and search summaries were reached. Quotes from those threads are paraphrases unless marked verbatim. The Exa backend (the one specified for Reddit) was rate-limited and was not bypassed.
- Vendor claims (Dr. Muscle, Gym AI, Workout Buddy, Speediance, Gainframe): treated as marketing unless independently corroborated.
- Older sources: TIME (2023), MIT Technology Review (2023), Freeletics forum (undated, older), Men's Health AU (undated, likely 2023-2024), Lifting Nerds ep. 16 (undated).
- SEO aggregators seen in results (several "asburyseminary.edu" pages with invented-looking Reddit-style reviews) were excluded.

## Next steps (suggested, not done)
- Retry the Exa Reddit search once the rate limit resets, or set an Exa API key, and open r/Fitbod, r/MacroFactor, r/weightroom threads on "suggested weight too heavy" and "deload not asked for."
- Fetch MacroFactor's "How to Interpret Changes to your Energy Expenditure" article for the exact wording.
- Fetch Fitbod's help articles on recommendation logic and override behavior.
