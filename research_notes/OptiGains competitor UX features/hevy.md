# Hevy: UX features, stickiness, moments, tiers, complaints (as of Oct 2026)

Scope note: Primary-source pages on hevyapp.com and help.hevyapp.com were fetched through a summarizing WebFetch, so quotes from them are as the fetch returned them, not byte-verified. Reddit content came through Exa highlights (not full threads). hevyapp.com's own pricing page was not retrieved; Pro pricing and limits below are corroborated by third-party sources and Reddit comments, not by Hevy's pricing page. Reddit thread text is from search highlights and may be partial.

## 1. Defining features, and what users say keeps them

### Takeaway
Hevy's core is a fast logger with automatic rest timers, auto-filled previous-session values, a routine planner (web and app), and set-type labels (warm-up, drop, failure). Users who stay cite the Apple Watch integration, the web routine builder, the "active devs" and steady update cadence (relative to Strong), and the low price with a lifetime option. The social feed is treated as optional by many users.

### Cited Findings
- Homepage feature list, grouped as Logging (intuitive logging, advanced routine planner, warm-up/drop/failure set marking, automatic rest timers, exercise notes), Progress (advanced exercise charts, PRs, one-rep max, exercise videos, custom exercises, full history), Community (following, liking/commenting, saving athletes' routines), Apple Watch and WearOS (syncing routines, offline workouts), and Desktop (hevy.com for routines and analysis) — [Hevy homepage](https://www.hevyapp.com/) (fetched via summarizer; homepage carries no pricing)
- Automatic rest timer: starts "once you mark a set as completed"; adjustable per exercise "from five seconds to five minutes"; can be switched off per exercise, e.g., for supersets — [Hevy rest timer page](https://www.hevyapp.com/features/workout-rest-timer/) (dated 2024-12-09 in tool metadata)
- Workout Settings page lists 11 toggles/options: sounds (timer, check-set, PR notification volume), default rest timer, previous-workout values (all history or current routine only), warm-up calculator (percentage-based warm-up sets), include warm-ups in stats, keep-awake during workout, plate calculator, RPE tracking column, "Smart Superset Scrolling" (auto-advances to the next superset exercise after a set), inline timer for timed sets (planks), and Live PR notification — [Hevy workout settings](https://www.hevyapp.com/features/workout-settings/) (fetched via summarizer; page intro says 12, lists 11)
- Supersets: add exercises, then "add to superset" from the three-dot menu; supersets of 2–5+ exercises are supported. Users report that rest can be placed only after the full superset by setting rest to 0 on all but the last exercise — [Reddit: Can I make sets of supersets?](https://www.reddit.com/r/Hevy/comments/1gaje68/can_i_make_sets_of_supersets/) and [Reddit: Superset](https://www.reddit.com/r/Hevy/comments/1kayuxt/superset/) (both dated Oct 2025 in metadata, threads originally older)
- Apple Watch as a stickiness driver: "The main reason I switched to Hevy was the Apple Watch app integration. It's worked perfectly for over a year until a couple of weeks ago." — u/gothpeacock, [Reddit: Apple Watch live sync broken](https://www.reddit.com/r/Hevy/comments/1pl2dli/apple_watch_live_sync_broken/) (2025-12-12). A Reddit reply on 2025-07-07 says a Hevy team member called it an issue affecting "a small number of users" — [Reddit: Is anyone else having issues with Apple Watch sync](https://www.reddit.com/r/Hevy/comments/1lto3zg/is_anyone_else_having_issues_with_apple_watch/)
- Web routine builder as a switch reason: "I choose Hevy over Strong, because you can add your routines in a web UI. Strong is app only." — Reddit commenter in [Honestly, what makes Hevy better than Strong](https://www.reddit.com/r/Hevy/comments/1q29pbr/honestly_what_makes_hevy_better_than_strong_or/) (2026-01-02). Another 2026 thread: "The web interface is a total game changer for me" — [Reddit: Casual 'Strong' user here considering using Hevy](https://www.reddit.com/r/Hevy/comments/1vkd82r/casual_strong_user_here_considering_using_hevy/) (2026-08-10)
- Switch-from-Strong narrative: "It's essentially Strong but with better UI and regular updates" and a commenter who left Strong because it "hasn't been updated even once" over a long stretch — [Reddit: Reasons to use Hevy instead of Strong?](https://www.reddit.com/r/Hevy/comments/1hs9566/reasons_to_use_hevy_instead_of_strong/) (2025-01-03) and [Honestly, what makes Hevy better](https://www.reddit.com/r/Hevy/comments/1q29pbr/honestly_what_makes_hevy_better_than_strong_or/)
- Social is optional for many: "I don't use the social aspects either, and it's pretty easy to ignore them." — [Reddit: Reasons to use Hevy instead of Strong?](https://www.reddit.com/r/Hevy/comments/1hs9566/reasons_to_use_hevy_instead_of_strong/). Social feed can be made private per workout (Visibility > Private) — [Hevy Social Guide](https://help.hevyapp.com/hc/en-us/articles/35688036014231-Hevy-App-Social-Guide-Connect-Follow-and-Share-Your-Workouts)
- Data portability is a stated strength: workout and measurement export, and Strong CSV import — [SensAI Hevy review 2026](https://www.sensai.fit/blog/hevy-review-2026) (competitor site; first published 2026-07-18, modified 2026-09-15). Reddit confirms import from Strong: [Reasons to use Hevy instead of Strong?](https://www.reddit.com/r/Hevy/comments/1hs9566/reasons_to_use_hevy_instead_of_strong/)
- Unprompted "why it's worth it" reasons from Pro threads: "Unlimited routines, unlimited graph history, and measurement tracking are the main upgrades for me." — [Reddit: Is Hevy Premium worth it after 4 months?](https://www.reddit.com/r/Hevy/comments/1sh2hui/is_hevy_premium_worth_it_after_4_months_also/) (2026-04-09)
- Reputation: SensAI cites 4.9/5 on the US App Store from ~92,000 ratings and "16+ million athletes" (Hevy's claim) — [SensAI review](https://www.sensai.fit/blog/hevy-review-2026). Boostcamp (competitor) cites 4.9 on 70K ratings as of May 2026 — [Boostcamp vs Hevy](https://www.boostcamp.app/vs/hevy). The two rating counts disagree; treat both as unverified.

### Inferences
- Stickiness appears to come from (a) logging speed plus automatic timer and auto-filled previous values, (b) the watch, and (c) data history, rather than from social. Social is repeatedly described as ignorable, so it is not a retention driver for the users quoted here.
- The Pro upgrade reasons quoted most often are history length and routine count, not analytics. This is a small sample of Reddit comments, not a survey.

### Gaps
- No quantitative retention or churn data for Hevy found.
- Reddit highlights were the available source; I could not read full threads (see Section 4 note on Reddit access).

## 2. Set completion, PR, and workout finish moments

### Takeaway
Hevy's documented moments are functional, not theatrical. Checking a set starts the rest timer and, if it beats a prior best, shows a banner (Live PR, opt-in). Finishing opens a screen with visibility, photo/video, and save options, after which the user can swipe through share designs. No confetti, medal, or set-completion animation is documented in any source found. Set-record PRs do not trigger a live announcement.

### Cited Findings
- Live PR: "instantly lets you know when you've achieved a new best" during a workout; fires when you "exceed a previous best performance and mark a set as complete"; shows a banner; the PR is saved to that workout. Record types: heaviest weight for a rep count, 1RM, volume, most reps, duration. No live alert on a first-ever lift because there is no prior value — [Hevy Live PR page](https://www.hevyapp.com/features/live-pr/) (summarizer fetch)
- Live PR is opt-in: "It's off by default and must be turned on under Profile, gear icon, Workouts, Live Personal Record Notification." — [Hevy Live PR Notifications help article](https://help.hevyapp.com/hc/en-us/articles/36012016405655-Hevy-Live-PR-Notifications-Get-Instant-Updates-on-Your-Best-Lifts) (via search-result highlight)
- Set records (heaviest weight for reps) appear in a table on the exercise page and "do not trigger a live Personal Record announcement or a medal" — same help article per search highlight
- Finish flow: "Finish" top right opens a screen with options (visibility, add photo/video) before the session is saved — [Hevy Social Guide](https://help.hevyapp.com/hc/en-us/articles/35688036014231-Hevy-App-Social-Guide-Connect-Follow-and-Share-Your-Workouts) and [Hevy PR help search highlights](https://help.hevyapp.com/hc/en-us/articles/36012016405655)
- After saving: "swipe through the available sharing designs. These can highlight your workout details, personal records, or training volume." Choose dark, light, or transparent background; share or save as an image — [Hevy Social Guide](https://help.hevyapp.com/hc/en-us/articles/35688036014231-Hevy-App-Social-Guide-Connect-Follow-and-Share-Your-Workouts)
- Shareables content: PRs, training volume, muscle distribution chart, and comparisons such as "You lifted a total of 13 264 kg. That's like lifting a truck!" Also a monthly summary. Designed for Instagram Stories with @hevyapp tag — [Hevy Social Media Shareables](https://www.hevyapp.com/features/shareable/) (metadata date 2025-09-03)
- Older workouts can be shared: Profile > three dots > Share Workout — same shareables page
- Post-workout summary contents (duration, weight lifted, sets, exercise list, PRs), per help search highlight — [Hevy help: PR/workout summary](https://help.hevyapp.com/hc/en-us/articles/36012016405655)
- Keep-awake setting exists so the phone does not sleep mid-workout — [Workout Settings](https://www.hevyapp.com/features/workout-settings/)

### Inferences
- The "PR moment" is a banner on the logging screen, which keeps the user in flow. The share-card payoff is deferred to the finish step, where PRs are one of several highlight designs.
- The share image is user-initiated, not automatic. Sharing is one of the sticky loops (photo overlays, Stories), but it is opt-in per workout.

### Gaps
- I did not verify the in-app visual design of the PR banner or finish screen (no screenshots or video reviewed). Any animation or haptic is unverified.
- Hevy's own finish-summary screen layout is not documented in sources I could fetch.

## 3. Free vs Pro tiers (as of Sept–Oct 2026)

### Takeaway
Logging is unlimited on the free tier. Pro removes caps on routines (free: 4), custom exercises (free: 7), and graph/data history (free: 3 months), and adds body measurements beyond weight and waist, Hevy Trainer, and advanced analytics. Pro pricing per third-party sources: $2.99/month, $23.99/year, or $74.99 lifetime, with a second $3.99/month SKU noted by SensAI. Hevy's own pricing page was not retrieved; treat exact figures as needing a check in the App Store.

### Cited Findings
- Free limits: "On the free version you can log unlimited workouts, but you can save up to four routines and up to seven custom exercises" — as quoted by [Hevy Pro comparison search results](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison); corroborated by Reddit: "To me it's totally worth it if only to have an unlimited amount of routines (limited to 4 in free version)" — [Reddit: Is Hevy Pro worth it?](https://www.reddit.com/r/Hevy/comments/1uz2rpw/is_hevy_pro_worth_it/) (2026-07-17)
- Free history: graph/data history limited to 3 months; Pro unlimited — [SensAI Hevy review 2026](https://www.sensai.fit/blog/hevy-review-2026) and corroborated by Reddit: "I bought it because I wanted to be able to see more than just three months of history data" — [Reddit: Pro subscription worth it?](https://www.reddit.com/r/Hevy/comments/1rqbr1k/pro_subscription_worth_it/) (2026-03-10)
- Free body measurements: body weight and waist only; Pro adds more measurements — [SensAI review table](https://www.sensai.fit/blog/hevy-review-2026)
- SensAI feature table: Hevy Trainer is Pro-only; ads none on either tier — [SensAI review](https://www.sensai.fit/blog/hevy-review-2026). A separate search summary said Trainer requires Pro (same source family, not independently verified)
- Pro pricing (SensAI, US, checked 2026-09-15): $2.99/month, $3.99/month second SKU, $23.99/year, $74.99 lifetime — [SensAI review](https://www.sensai.fit/blog/hevy-review-2026). Boostcamp (May 2026) lists $2.99/$23.99/$74.99 — [Boostcamp vs Hevy](https://www.boostcamp.app/vs/hevy) (competitor-sourced)
- Year in Review is available on free: "Is the year in review available on Hevy's free version? Yes. All users get an annual review if they meet the requirements." Eligibility: first logged workout before November and at least ten logged workouts — [Hevy Year in Review page](https://www.hevyapp.com/features/year-in-review/) (metadata 2025-01-03; FAQ content may be newer)
- Free-tier stat removal complaint (user report): body heat map / muscle map removed from free. A commenter says it is under Profile > Statistics > Muscle distribution, and that a blank 7-day chart may explain what the user saw — [Reddit: Features removed from free version?](https://www.reddit.com/r/Hevy/comments/1vyyjs6/features_removed_from_free_version/) (2026-09-14). Also: "They removed the body heat map from the routines" — [Reddit: Pro still worth it?](https://www.reddit.com/r/Hevy/comments/1pmte71/pro_still_worth_it/) (2025-12-15)

### Inferences
- Pro's marginal value is mostly history length and routine count. Analytics and Trainer are less clearly quantified in sources.
- The $2.99 vs $3.99 SKU discrepancy and the 4.9 rating count discrepancy suggest third-party figures vary. Verify in App Store before quoting.

### Gaps
- Hevy's primary pricing and tier page not retrieved; exact current prices and whether the $3.99 SKU is still offered are unverified.
- Exact Pro-only list for analytics (which charts) not verified against a Hevy primary source.
- Hevy Trainer: SensAI calls it Pro; Hevy's own page not confirmed.

## 4. Recurring complaints

### Takeaway
The most-cited complaints are: sync/Apple Watch reliability after updates, slow response to feature requests with no public roadmap, perceived feature removal from the free tier and routine/heat-map changes, and gaps like exports or unilateral sets. Trainer is criticized for limited recovery inputs and a fixed progression rule (third-party view). Paywall complaints are mostly about cost and subscription model, and many users say they paid anyway.

### Cited Findings
- Sync: Hevy's own troubleshooting guide says "Repeated freezing, missing workout data, or being unable to save a workout should not be treated as a normal delay" — [Hevy Apple Watch Sync Issues](https://help.hevyapp.com/hc/en-us/articles/33996260919703-Hevy-Apple-Watch-Sync-Issues-Step-by-Step-Troubleshooting-Guide)
- Sync threads: "Watch sync broken for me 3.0.1" (2026-03-08) — [Reddit](https://www.reddit.com/r/Hevy/comments/1rnwuez/watch_sync_broken_for_me_301/); reply from a Hevy-side poster: "The most common reason for watch sync to stop working after an update is that the watch version and phone version aren't in sync." Another user: "now it doesn't even register the workout on Health"
- Apple Watch in-workout sync: a user reports the watch "records sets that the iPhone does not" — [Reddit: Is anyone else having issues with Apple Watch sync while training?](https://www.reddit.com/r/Hevy/comments/1lto3zg/is_anyone_else_having_issues_with_apple_watch/) (2025-07-07). Hevy reply: it "consistently affects a small number of users, particularly after updating Hevy and/or iOS/watchOS"
- Sync also: "Apple Watch live sync broken" (2025-12-12) — [Reddit](https://www.reddit.com/r/Hevy/comments/1pl2dli/apple_watch_live_sync_broken/) (the watch-integration user quoted in Section 1)
- Feature-request responsiveness: "Feature Request: Actually build the features your users request" (2025-12-16) — [Reddit](https://www.reddit.com/r/Hevy/comments/1pobo2e/feature_request_actually_build_the_features_your/): "There's no public roadmap, no Kanban-style board, and no visible way for users to see what's being considered or to vote on feature requests." A commenter says the devs seem "aloof": "the devs seem pretty aloof. They started a thread a couple months back looking for ideas, and then promptly ignored the hundreds of posts that followed" — [Reddit: Pro still worth it?](https://www.reddit.com/r/Hevy/comments/1pmte71/pro_still_worth_it/) (2025-12-15)
- Requested but missing (user-reported): "I have requested this feature through the Feature Request section in the Hevy app at least 10 times over the last four years, but I've never received any response" — [Reddit: Hevy does everything.. except this!!](https://www.reddit.com/r/Hevy/comments/1wndg5u/hevy_does_everything_except_this/) (2026-09-22). Same thread: a commenter says left/right logging for unilateral sets is missing from the app. Another commenter describes a monthly PDF progress report and says they requested Excel export and a custom date range; whether those were added is not stated
- Help-center note: "if you send a bug report or help request through the Feature Request option, our support team won't see it" — Hevy's Bug Report vs Feature Request help article, via search highlight: [Hevy help: Bug Report, Get Help, Feature Request](https://help.hevyapp.com/hc/en-us/articles/34161316169239-Bug-Report-Get-Help-and-Feature-Request-What-is-the-Difference). Users posting in the wrong channel may explain some "no response" complaints.
- Year in Review disappearance (user): a user says their recap "has since completely vanished from my profile" despite reinstall and support email — [Reddit: What's up with the Hevy recap/year breakdown?](https://www.reddit.com/r/Hevy/comments/1pggvs7/whats_up_with_the_hevy_recapyear_breakdown/) (2025-12-14). A Hevy-side reply: "Now both old and new versions of the app should have access to Year in Review."
- Paywall: "I hate subscription models, so if I like and use an app frequently and has a lifetime option..." — [Reddit: Pro subscription worth it?](https://www.reddit.com/r/Hevy/comments/1rqbr1k/pro_subscription_worth_it/). Lifetime is valued: "I have the lifetime sub and for 70ish CAD, it's well worth it. I don't think that option is going to be around forever." — [Reddit: Is Hevy premium worth it?](https://www.reddit.com/r/Hevy/comments/1jvzesn/is_hevy_premium_worth_it/) (2025-04-10)
- Trainer (third-party critique, SensAI): no recovery inputs (sleep, HRV, resting HR, readiness); progression is a fixed rule (add weight after hitting top of rep range on all sets) with no reasoning about plateaus; not a chat interface — [SensAI review](https://www.sensai.fit/blog/hevy-review-2026) (competitor source)
- Competitor framing (Boostcamp): no pre-built named programs (5/3/1, PPL); progression across cycles is manual; Strength Score and per-muscle heatmap "not offered" — [Boostcamp vs Hevy](https://www.boostcamp.app/vs/hevy). Boostcamp's own characterization; not verified against Hevy.

### Inferences
- Complaints cluster around trust: sync failures, unanswered requests, and features that moved behind Pro or disappeared. Users who paid still reported these, suggesting the paywall is more a satisfaction-under-expectation issue than a pure price issue.
- Sync issues appear tied to OS/app version mismatches per Hevy's own support guidance. Recurrence across 2025–2026 threads suggests it is not fully fixed, but I have no bug-count data.

### Gaps
- Could not read full Reddit threads (Exa highlights only). Complaint frequency is not quantified; GummySearch lists r/Hevy topics "Sync" (13 posts) and "Bug" (9 posts) as popular, but this is a snapshot from an aggregator with unknown date and is unverified.
- Exa rate-limit hit on the first attempt; later attempts succeeded with reduced result counts.
- No verified App Store review-text analysis. Unstar (third-party aggregator) said most questions relate to subscriptions, permissions, and billing; not verified against App Store.

## Source notes
- Reddit access: Direct reddit.com fetch was blocked ("Claude Code is unable to fetch from www.reddit.com"); Reddit content was taken from `mcporter call exa.web_search_exa` highlights only.
- Dated: Most Reddit threads are 2025–2026; Year in Review, rest timer, and shareables pages carry 2024–2025 metadata dates. Sensai review is 2026 (published 2026-07-18, modified 2026-09-15).
- Competitor-sourced material (SensAI, Boostcamp) is labeled as such above.
