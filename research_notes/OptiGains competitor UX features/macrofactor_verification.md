# MacroFactor Verification Notes (as of 2026-10-13)

Scope: close verification gaps from earlier research using primary MacroFactor sources. Reddit could NOT be searched (see Gaps in the final section).

## 1. Weekly check-in: how a target change is presented

### Takeaway
The official help article says a Check-In "will typically recommend an increase or decrease" in calorie and macro targets, that the Coach explains why each module is surfaced, and that the user can decline. Screenshots in the articles are images; no exact on-screen UI string for the target-change card was found in text form.

### Cited Findings
- "When you have a check-in available, there will be a small alert indication on the Strategy tab. Check-ins are weekly, and you can choose your check-in day." — [Introduction to Check-Ins and Coaching Modules](https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules)
- "To perform a Check-In: 1. Tap the Strategy tab (when a Check-in is available) 2. Tap Check-In" — same URL
- "The Check-In process will typically recommend an increase or decrease in your Calorie and macronutrient targets. The recommendations are made to better align you toward achieving your goal at your desired rate (if you have a weight gain or weight loss goal), or toward maintaining your desired weight (if you have a weight maintenance goal)." — same URL
- "You do have the option to decline a Check-In if you choose to, and this will prevent any caloric recommendations to be applied to your program. You will be prompted weekly by the app to check in." — same URL
- "First, the MF Coach will introduce the module on the Check-In page and explain why the module is being surfaced at this Check-In at this precise moment. You can skip any module, or choose to continue to its contents." — same URL
- "Usually, the last step of a module provides an explanation, offers guidance, or makes a meaningful change to your account data or program." — same URL
- Modules listed: Partial Logging, Weigh-In, Fasting, Logging Break, Program Update — same URL
- "The program update coaching module adjusts your weekend Calorie and macronutrient targets..." and "The program update module is the final module in a check-in" — [Coaching Module: Program Update](https://help.macrofactorapp.com/en/articles/252-coaching-module-program-update) (screens are images, no text)
- Toggle modules and skip them: "You can toggle individual Coaching Modules on and off from More > Strategy." Fast Check-In: "go to More > Strategy > Fast Check-In > Edit and turn on the Fast Check-In. Fast Check-In skips past all Coaching Modules and jumps straight to updated macro recommendations." — [Introduction to Check-Ins](https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules)
- Expenditure explanation: "The main reason we show you your calculated energy expenditure in MacroFactor is simple: it's what we use to generate and adjust nutrition recommendations, and we believe in transparency." — [How Should I Interpret Changes to my Energy Expenditure?](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure)
- "your weekly Check-In includes curated 'Coaching Modules' that will give you feedback on your weight and nutrition logging" — same article (line on logging feedback)

### Inferences
- The "reason" a user sees is the Coach's per-module introduction on the Check-In page, not a generic label on the target change itself. The exact copy is unverified because the article only shows it in screenshots.
- Expenditure-change explanations are in the article above, which is the explanation a user is pointed to, not a card in the app (unverified).

### Gaps
- The article titled "How to Interpret Changes to your Energy Expenditure" does not exist at that slug (404). The actual article is "How Should I Interpret Changes to my Energy Expenditure?" at the URL above.
- Exact on-screen wording of the target-change card is not in text form. Would need an app screenshot or the image alt text.

## 2. Feature existence checks

### Undo for logged entries
- Not found in the official help center. Documented controls are delete and edit: "From your food timeline, swipe left on a food you want to delete" and "Tap 'Remove' on the menu at the bottom of the screen" — [Delete Foods From Your Timeline](https://help.macrofactorapp.com/en/articles/96-delete-foods-from-your-timeline). Edit quantities: [Edit Quantities of Foods You've Already Logged](https://help.macrofactorapp.com/en/articles/98-edit-quantities-of-foods-you-ve-already-logged-and-view-nutritional-values-for-foods-on-your-timeline).
- Reddit thread titled "undo button? : r/MacroFactor" surfaced in an earlier search (https://www.reddit.com/r/MacroFactor/comments/1jeluyu/undo_button/). Only the title was seen; body and answer not verified.
- Verdict: no undo found; delete-with-swipe and edit only.

### Copy / paste (copy-meal, copy-day)
- Exists as copy and paste of a single food, not copy-meal or copy-day as a whole-day action. "In the Food Log, tap on the food tile of the food you want to copy. Tap 'Copy' from the menu at the bottom of the screen." Paste options: "Clipboard Icon", "To Now", "To Today", "To Tomorrow", "Paste Inline", "Multi-paste Inline" ("without clearing your clipboard... This is a useful utility for people who eat some of the same things at the same time every day"), "To Date & Time", "To Dates" (multi-select calendar). — [Copy and Paste](https://help.macrofactorapp.com/en/articles/95-copy-and-paste)
- Copy-day as a single action: not found.
- Watch app also supports copy/paste: [How to Copy and Paste a Food Entry on the Watch App](https://help.macrofactorapp.com/en/articles/269-how-to-copy-and-paste-a-food-entry-on-the-watch-app). Watch release notes (5.4.0): "Copy and paste" — https://macrofactor.com/version-5-4-0/

### Meal memory ("foods you usually eat at this meal")
- The exact phrase was not found. Closest official feature is "Hourly go-tos": "Your hourly go-tos are the foods you most frequently log during or near the hour you're currently logging foods to. For example, your '1pm Go-Tos' are the foods you most commonly log between about 12pm and 3pm... Hourly go-tos are determined by both recency and frequency." Also "Latest" foods and "From History" search results. — [How to Log Food in MacroFactor](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor)
- Saved meals: "a recipe is technically just a bundle of items that are consumed at the same time... you can use the recipe feature to easily save entire meals for later reuse" — [Save a Meal For Later Use](https://help.macrofactorapp.com/en/articles/239-save-a-meal-for-later-use)
- Verdict: time-of-hour suggestions exist (hourly go-tos); not labeled "foods you usually eat at this meal".

### Diet breaks
- Exists as a documented workflow, not a dedicated mode. "Why Doesn't MacroFactor Have a Diet Break Mode? ... diet breaks can already be done with tremendous ease in MacroFactor, without the need for a dedicated mode of operation." Two methods: (a) "simply do it" by raising intake to approximately current TDEE estimate for 1-2 weeks, or (b) "edit your goal to 'maintenance' for 1-2 weeks, then switch back." — [Does MacroFactor Support Refeeds, Diet Breaks, or Carb Cycling?](https://help.macrofactorapp.com/en/articles/30-does-macrofactor-support-refeeds-diet-breaks-or-carb-cycling)
- Also: refeeds have no dedicated mode either (same article).

### Speed index / logging-speed claim
- Confirmed. MacroFactor publishes the "Food Logging Speed Index (FLSI)", developed by Cory Davis at MacroFactor; it counts actions for logging tasks, lower is better. "In 2025, we've now hit a score of 24 in our default speed mode." "Compared with MacroFactor's speed mode, the strongest competitor requires 25% more discrete actions to log foods, and the average entrant requires about 70% more taps or swipes." — [Is MacroFactor Still the Fastest Food Logger? (2025 FLSI Update)](https://macrofactor.com/fastest-food-logger-2025/)
- Method origin: [What is the Fastest Food Logger? We Designed a System to Find Out](https://macrofactor.com/fastest-food-logger/)
- Caveat: this is a self-run benchmark by the vendor. The article also says "we use the fastest possible settings for each logging scenario" and "the FLSI allows small exceptions, or 'freebies'". Treat as vendor claim, not independent measurement.

## 3. US pricing (official site)

### Takeaway
Official pricing shown on macrofactor.com (not macrofactorapp.com/pricing, which returns 404): $11.99/month, $71.99/year ($5.99/mo equivalent), or $47.99 per 6 months.

### Cited Findings
- Month to month: "Charged on a monthly basis." Price rendered "$ 11 99" with "Monthly" — [MacroFactor Nutrition](https://macrofactor.com/macrofactor/)
- Yearly: "Charged yearly for $71.99." Rendered "$ 5 99 Monthly" — same URL
- Every 6 months: "Charged for $47.99." Rendered "$ 7 99 Monthly" — same URL
- FAQ: "MacroFactor is $71.99/yr, vs. $79.99 for MyFitnessPal premium" — same URL
- Workouts page (https://macrofactor.com/workouts/) shows the same price block text (Month to month, Yearly $71.99, 6-month $47.99). Treat Workouts pricing as same unless separately confirmed; the page says existing customers can "get a bundle of the two apps" at https://macrofactor.com/workouts/price/ (not fetched).
- Free trial stated: "Start your free trial of MacroFactor Nutrition or MacroFactor Workouts today." — same pages.

### Gaps
- macrofactorapp.com/pricing returned 404. Monthly price is read from rendered text "$ 11 99", which is $11.99.
- Bundle price at macrofactor.com/workouts/price/ was not fetched.

## 4. Latest release notes: Food Logger

### Takeaway
No official "Food Logger redesign" release note was found for 2025-2026. The latest nutrition release is 5.8.8 (2026-09-11); version 5.0.0 (2025-03-30) introduced the AI tab, not a logger redesign. Logger-related changes in 2026 are the AI tab streamlining and custom-food workflow.

### Cited Findings
- Latest listed: "Version 5.8.8 Release Notes — September 11, 2026" — [Release notes archive](https://macrofactor.com/release-notes/). Body: "Create foods with AI, powered up Label Scanning and Landscape Mode for Tablets"; "Streamlined custom food creation: the workflow you are used to has been lightly redesigned for simplicity." — [Version 5.8.8](https://macrofactor.com/version-5-8-8/)
- 5.5.7 (May 10, 2026): "The AI tab was streamlined into two modes: Snap and Describe. Snap is for quick in-the-moment photo logging. In Describe, you can use one or more photos and/or text." — [Version 5.5.7](https://macrofactor.com/version-5-5-7/) (fetched via the archive links)
- 5.0.0 (March 30, 2025): "From the food logger, select the AI tab. Snap a photo and optionally add a meal description." — [Version 5.0.0](https://macrofactor.com/version-5-0-0/). Notes state "MacroFactor AI is currently in Open Beta."
- 5.5.0 (October 19, 2025): Expenditure Modifiers (Step-Informed Updates, Predictive Goal Adjustment) — [Version 5.5.0](https://macrofactor.com/version-5-5-0/). Not logger.
- 5.4.0 (September 9, 2025): Apple Watch app with 8 watch-optimized food logging workflows — [Version 5.4.0](https://macrofactor.com/version-5-4-0/)
- 5.2.2 (July 29, 2025): recipe importer, recipe wizard redesign — [Version 5.2.2](https://macrofactor.com/version-5-2-2/)

### Gaps
- The versions 5.6.x and 5.7.x are not in the archive list; the archive jumps 5.5.7 to 5.8.8. Not checked.
- The 2022 "food logger revamp" blog (https://macrofactorapp.com/mm-may-2022/) was surfaced in search but not fetched.

## 5. MacroFactor Workouts (as of Oct 2026)

### Takeaway
Official Workouts release notes through 1.2.0 (May 13, 2026) add Apple Health write (Feb 2026), basic cardio, smart warm-up options, and an iOS Live Activity (May 2026). Official feature page lists rest timers, supersets, partials/myoreps, RIR tracker, smart warm-up suggestions, and Jeff Nippard program import. Set-type breadth is only described in general terms ("advanced set types", "drop sets, RIR, failure sets, partial reps").

### Cited Findings
- Live Activity (1.1.9-1.2.0, May 13, 2026): "iOS Live Activity: Track your lifts, time your rest, and quickly access MacroFactor Workouts from your lock screen." Also "Workout Change Log: You can now inspect changes made to the workout plan during an active session." — [Workouts release notes 1.2.0](https://macrofactor.com/versions-1-2-0/)
- Apple Health (1.1.1-1.1.3, Feb 8, 2026): "Apple Health integration: write your workouts data to Apple Health." Also "Basic cardio support" and "Media volume rest timer." — [Workouts 1.1.1-1.1.3](https://macrofactor.com/wo-version-1-1-3/). Note: write-only per this note.
- 1.1.4-1.1.8 (April 20, 2026): "New warmup from custom scheme option"; "New option to hide/show completed warmups"; "More programs supported in program importer"; "New program create/edit customization options"; "New setting that lets you choose reps-first instead of weight-first for set-to-set adjustments" — [Workouts 1.1.4-1.1.8](https://macrofactor.com/wo-version-1-1-8/)
- 1.1.0 (Jan 19, 2026): custom exercises from search; "Smart Progression can now widen a set's target rep range" — [Workouts 1.1.0](https://macrofactor.com/wo-version-1-1-0/)
- Feature page: "Track supersets, partial reps, and myoreps"; "RIR tracker"; "Smart warm-up suggestions"; "Customizable rest timers"; "Plate calculator"; "Track weights and reps on your right and left sides"; "Create gym profiles" — [MacroFactor Workouts](https://macrofactor.com/workouts/)
- Set types / drop sets / failure sets: "Easily track every detail of your workouts, including rest time, drop sets, RIR, failure sets, partials, and more" — same page.
- Import: "You can import workouts or full programs using a supported spreadsheet file. However, imports follow strict formatting rules, including exact exercise name matching." "You cannot import past workout data from other apps." — [Workouts FAQ](https://macrofactor.com/workouts/)
- Jeff Nippard programs: "you can import his six most recent programs (Min-Max Program, Bodybuilding Transformation System, Pure Bodybuilding Phase 2, Pure Bodybuilding Phase 1, Ultimate PPL System, and Essentials Program)" and "you must already own the program" — same page.
- Workouts release-notes index lists 1.0.1 (Jan 12, 2026) through 1.2.0 — [Workouts release notes](https://macrofactor.com/workouts-release-notes/)

### Reddit (r/MacroFactor, 2026)
- NOT VERIFIED. Exa web search returned HTTP 429 (free MCP rate limit) on every attempt across roughly 15 minutes of backoff. WebSearch rejects the reddit.com domain ("The following domains are not accessible to our user agent: ['reddit.com']"). No 2026 user sentiment about Workouts was collected.
- One Reddit thread URL surfaced earlier, title only: "undo button? : r/MacroFactor" — https://www.reddit.com/r/MacroFactor/comments/1jeluyu/undo_button/ (2025-era thread; date and content not verified).

### Gaps
- Live Activity and Apple Health are confirmed from release notes only. Whether they work as described in practice is not verified.
- Set-type list is not enumerated officially beyond the feature-page phrases above.
- Reddit sentiment for 2026: not collected (rate limit + reddit.com domain blocked for WebSearch).

## Sources not reachable
- help.macrofactorapp.com/en/articles/... (EE article, check-in article, program update) fetched via r.jina.ai: OK.
- macrofactorapp.com/pricing: 404.
- The exact-titled "How to Interpret Changes to your Energy Expenditure" article: does not exist at that title.
