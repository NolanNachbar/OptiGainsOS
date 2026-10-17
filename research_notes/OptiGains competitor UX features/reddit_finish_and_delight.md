# Reddit: workout-finish moment, PR recognition, and in-session delight/utility features

Run accounting (read this first): 26 Exa search calls were attempted. 25 returned results (1 ad-hoc query plus a 24-query batch; every batch query succeeded, with 429 retries handled by backoff); the 26th hit HTTP 429. Full-thread fetches via `exa.web_fetch_exa` succeeded once (thread 1qjlm85) and then hit Exa's free-tier rate limit (HTTP 429) on every attempt for about 40 minutes, so the rest of the thread text could not be read in full. For the remaining threads the evidence is the search engine's highlight excerpts (each truncated to about 900 characters), which are verbatim text from the thread but not the full thread. Threads with excerpts: about 59. Quotes below are copied from those excerpts or from the one full fetch; where a highlight was cut off, the quote stops at the cut. Any thread marked "(excerpt)" was not read in full. Nothing in these notes was paraphrased as a quote.

Search coverage gap: the queries did not surface any Reddit thread specifically about confetti, haptics on PR, or sound effects for PRs in 2025-2026. Those topics are listed as gaps below rather than inferred.

Self-promotion flag: several threads are posts by app developers promoting their own app (e.g., r/promoteMyApp, r/SideProject, r/buildinpublic, r/iosapps, r/AppleWatchApps, r/hardyapp, r/Setgraph, r/striveWorkoutLog). They are not counted as consensus. They are cited only where the content is a feature description or a stated user need, and they are marked "(dev post)".

## Which finish/PR/delight moments do serious lifters value, and which annoy them?

### Takeaway
The workout-end screen is valued as a share-and-brag artifact (Hevy's "you lifted a ..." comparison slides), but the Finish-workout prompt itself is a friction point. The PR system is trusted only when it is correct, and users complain when it misfires or cannot be reset after equipment changes. Audio and voice feedback during rest is the most common annoyance.

### Cited Findings

Finish screen and share (Hevy)
- Thread 1qjlm85 (full fetch): "Does anyone know how I access the end of workout screens that I can share to social? They also have stats like “you lifted a shark” or “car” etc. and the body weights." — https://www.reddit.com/r/Hevy/comments/1qjlm85/access_end_of_workout_screen/
- Same thread, top comment (full fetch): "The 'You lifted a whatever ' is my favorite part of ending a workout 🤣 I think once you hit finish it shows you a screen and you can scroll through them if I remember correctly." — https://www.reddit.com/r/Hevy/comments/1qjlm85/access_end_of_workout_screen/
- Thread 1kbpoa0 (excerpt, dated 2025-10-14 placeholder in index but the thread is older): "Android user, I should say. I'm looking for the screens to swipe through that show me I've lifted an elephant, car, etc" — https://www.reddit.com/r/Hevy/comments/1kbpoa0/new_to_app_i_want_to_see_the_review_i_get_at_the/ (date on this thread is unverified; excluded from the 2025-2026 count).
- Thread 1lkl8dx (excerpt): "This is how you see that fun slide showing you what you lifted I.e. a truck, boat, T-Rex, fighter jet, aircraft carrier etc." — https://www.reddit.com/r/Hevy/comments/1lkl8dx/how_to_see_the_post_workout_analytics/ (date unverified).
- Thread 1vejst1 (excerpt, 2026-08-03): "Is there any way I can get this screen to show what weight and reps I did for each exercise? I want to be able to share with my friends without having to screenshot every single exercise and flood the chat with pictures." — https://www.reddit.com/r/Hevy/comments/1vejst1/repsweight_on_workout_overview/
- Thread 1wu7a8o (excerpt, 2026-09-30): "This looks great, but it is only available for routine. The routine is the plan and i usually do not follow the plan exactly. Why can Hevy not generate the muscle graph and summary for real workout?" — https://www.reddit.com/r/Hevy/comments/1wu7a8o/need_the_muscle_graph_and_results_for_every/

Finish-workout prompt (Strong and Hevy)
- Thread 1kuue9e (excerpt, Strong, dated 2025-10-14 placeholder; original post date unverified from excerpt): “Finish Workout?” Prompt Now Auto-Completes or Deletes My Sets.. Why?? — https://www.reddit.com/r/strongapp/comments/1kuue9e/the_new_update_broke_my_tracking_flow_anyone_else/
- Thread 1mfxm96 (excerpt, Strong, original post 2025-08-02 per the thread's own text): "At the end of a workout the last thing I wanna do is make a decision. I am done FFS!" and "I just close the app and ignore it." — https://www.reddit.com/r/strongapp/comments/1mfxm96/how_to_get_rid_of_this/
- Thread 1wlie1j (excerpt, Hevy, 2026-09-20): "It would be cool if there was an indicator next to the “Finish” button showing how many sets are still left in the workout." Also: "Having a small indicator would make it much easier to see if you accidentally missed something before ending the workout." — https://www.reddit.com/r/Hevy/comments/1wlie1j/small_qol_feature_request_show_remaining_sets/

PR recognition
- Thread 1wsv9fo (excerpt, Strong, 2026-09-29): "lately I’ve noticed that occasionally Strong will not recognize a PR... It’s not the end of the world but is a bit annoying." — https://www.reddit.com/r/strongapp/comments/1wsv9fo/strong_sometimes_doesnt_recognize_prs_lately/
- Thread 1w1qekz (excerpt, Hevy, 2026-08-29): "I now know that I will probably never get a PR notification on this lift for like maybe a whole year or even more until I eventually surpass the old weight" — https://www.reddit.com/r/Hevy/comments/1w1qekz/we_should_have_an_option_to_reset_prs_changing/
- Thread 1vw3ml1 (excerpt, Hevy, 2026-08-23): "So if I crank up the weight Hevy thinks I have done a record and just by looking at the data looks I got stronger while is just a different gym and machine" — https://www.reddit.com/r/Hevy/comments/1vw3ml1/please_add_a_way_to_log_the_gym/
- Thread 1w5pfbc (excerpt, LiftinApp, 2026-09-02): "Currently the only way to view your PRs is in Progress tab and it only shows the max weight you ever done and doesn't even tell how many times." — https://www.reddit.com/r/LiftinApp/comments/1w5pfbc/request_personal_records_for_each_number_of/

Rest timer audio, vibration, and silent mode
- Thread 1wqyndk (excerpt, LiftinApp, 2026-09-26): "So I have rest timer notifications disabled because I don’t like Siri announcing it. And even without the announcement it’s kinda annoying swiping the timer notification away each time." — https://www.reddit.com/r/LiftinApp/comments/1wqyndk/feature_request_vibrate_rest_timer/
- Same thread, a reply (excerpt): "The speech that says “rest timer is up etc” is so annoying, it stopps the music playing on my earbuds" — same URL.
- Thread 1qiubpq (excerpt, MacroFactor, 2026-02-14): "The rest timers don't seem to vibrate or make a sound when they reach 0:00." A reply (excerpt): "...it doesn’t work in silent mode (most other workout apps do) since most users have their phones always in silent." — https://www.reddit.com/r/MacroFactor/comments/1qiubpq/rest_timer_sound_not_working/
- Thread 1v2mkdo (excerpt, Bevel, 2026-07-21, app-user post): "I don't like to check every 15 seconds if my rest time is finished, i think that sound effect/phone vibration that would remind user that the rest time is finished is usefull." — https://www.reddit.com/r/bevelhealth/comments/1v2mkdo/sound_signals_doing_workout/

Apple Watch and Workout Buddy voice interruptions
- Thread 1syscrs (excerpt, 2026-04-29): "Omg I HATE her and cant get it to stop either!" (reply about Apple's Workout Buddy interrupting walks) — https://www.reddit.com/r/AppleWatchFitness/comments/1syscrs/stop_ai_fitness_notifications/
- Thread 1nx474x (excerpt, 2025-10-14 placeholder; original date unverified from excerpt): "Whenever I am doing a workout, I get notifications from Workout Buddy any time I start, pause/resume, end a workout... But i am STILLLL getting my music lowered and these annoying workout buddy prompts." — https://www.reddit.com/r/AppleWatch/comments/1nx474x/cant_turn_off_workout_audio_notifications/

Positive-tone signal for in-app delight
- Thread 1ofxct4 (excerpt, Alpha Progression, 2025-10-25): "this app is very satisfying and pleasant to use" and "I have been recommending your app to basically everyone that I ever talk to in the gym" — https://www.reddit.com/r/alphaprogression/comments/1ofxct4/app_feedback_wishes_for_improvements_after_almost/ (single user; not consensus)

Confetti, animation, and sound celebrations (PR)
- No 2025-2026 thread surfaced in the 24 queries that discusses confetti or PR celebration animations or sounds positively or negatively. See Gaps.

### Inferences
- The most-cited annoyance in these excerpts is audio and voice interruption during rest (LiftinApp, MacroFactor, Apple Workout Buddy), not the lack of celebration. Users request silent, non-verbal cues (vibration) more than they ask for celebratory effects.
- Users value the post-workout summary as a share artifact and ask for it to contain per-set detail (Hevy 1vejst1, 1wu7a8o). That is a request for content density, not for animation.
- PR trust is the sticking point: a PR is only useful if it is correct and resettable (Strong 1wsv9fo, Hevy 1w1qekz, 1vw3ml1).

### Gaps
- No 2025-2026 Reddit thread found about confetti or PR animations (wanted or hated). Needs a targeted second pass once Exa limits clear.
- No Reddit evidence found on haptics specifically for PR hits. The only haptic-adjacent request is the vibrate-on-rest-timer request above.
- Full text of threads 1wlie1j, 1wqyndk, 1w1qekz, and 1wsv9fo was not read. Quotes are from highlight excerpts.

## What do users say they miss most when switching apps (what keeps them)?

### Takeaway
Switchers cite the single feature their old app did that the new one lacks, and that feature is usually per-set rest timers, auto-progression, or a clean logging flow. Mid-set friction (app-switching to music, Watch usability) is a recurring pain. Lock-in is mostly data history and a specific progression feature rather than celebration.

### Cited Findings
- Thread 1v1tuiv (excerpt, Hevy, 2026-07-20): "I recently switched to Hevy from Strong app and I'm loving it, but there's one specific feature I'm really missing: Set-specific rest timers." — https://www.reddit.com/r/Hevy/comments/1v1tuiv/feature_request_setspecific_rest_timers/
- Thread 1v4eg7s (excerpt, Strong, 2026-07-23): "Lowkey, the lack of development and features is the reason I switched to Hevy, though on the other hand that lacks individual set timer which I do miss" — https://www.reddit.com/r/strongapp/comments/1v4eg7s/why_isnt_there_a_muscle_heat_map_yet_even_though/
- Thread 1t6o7yy (excerpt, Strong vs Hevy, 2026-05-14): Hevy listed as having "A « heatmap » that tracks what muscle group lack training" and "The always on display tracking"; Strong listed as "A more straight to the point approach" and "Faster log in". A commenter (excerpt): "I tested both, and Hevy lacked a feature that le..." (cut off) — https://www.reddit.com/r/strongapp/comments/1t6o7yy/what_are_the_features_that_strong_has_over_hevy/
- Thread 1vqm5ak (excerpt, Liftosaur, 2026-08-17): reply: "I moved from Strong. Liftosaur is 100x better/more powerful... built-in auto-progression—this is the absolute key to the app—it selects the weight for you next week based on what the programme you’re doing (or have programmed) specifies" — https://www.reddit.com/r/liftosaur/comments/1vqm5ak/worth_it_to_buy_the_paid_version/ (single commenter, self-reported)
- Thread 1rz2q28 (excerpt, Liftosaur, 2026-03-20, switcher from Hevy): "I'm not gonna pretend Hevy is bad. It's a VERY solid app with cool social aspects." and "...when I found out Liftosaur lets you literally write code for your progression logic" — https://www.reddit.com/r/liftosaur/comments/1rz2q28/coming_from_hevy_275_workouts_logged_this_app/ (switcher; the excerpt is cut before the reason it switched)
- Thread 1svidnd (excerpt, Hevy to Liftosaur, 2026-05-14): "Progressive overload. Multiple types! All programmable and adaptable to your history and weight range!" — https://www.reddit.com/r/Hevy/comments/1svidnd/hevy_to_liftosaur_a_critical_review/
- Thread 1qiki9n (excerpt, MacroFactor Workouts, 2026-01-21): "I struggle to see the value of the app over the Excel." A reply (excerpt): "Like macrofactor nutrition, the value is primarily in the auto-progression." — https://www.reddit.com/r/MacroFactor/comments/1qiki9n/what_value_do_see_in_the_workouts_app_if_not/
- Thread 1vzaov7 (excerpt, MacroFactor Workouts, 2026-08-26): asks "Do you generally trust the weight and rep recommendations it gives you, or do you find yourself overriding them fairly often?" — https://www.reddit.com/r/MacroFactor/comments/1vzaov7/macofactor_workouts_are_you_enjoying_the/ (question post, no consensus answer in excerpt)
- Thread 1sx0ngg (excerpt, ClaudeAI, 2026-04-27): "on travel days in the hotel gym, I kept opening the screenshot mid-workout and zooming in every few minutes" — https://www.reddit.com/r/ClaudeAI/comments/1sx0ngg/built_an_interactive_daily_workout_app_with/ (self-built; not consensus)
- Thread 1q1hko4 (excerpt, r/workout, 2026-01-14): "Anyone else annoyed of switching between a workout tracker and a music app mid set?" — https://www.reddit.com/r/workout/comments/1q1hko4/anyone_else_annoyed_of_switching_between_a/
- Thread 1ul66pw (excerpt, r/beginnerfitness, 2026-07-02, a trainer's question): "What made you quit using them? What did you like? What was missing?" — https://www.reddit.com/r/beginnerfitness/comments/1ul66pw/what_makes_you_stop_using_workout_apps/ (question post; no answers in excerpt)
- Thread 1ltvded (excerpt, Fitbod, 2025-07-07): "Today I regularly need to craft my own routines because the output from the app is entirely useless." — https://www.reddit.com/r/fitbod/comments/1ltvded/i_think_im_done/ (a reason to leave, not a reason to stay)
- Thread 1ty1ibn (excerpt, JEFIT, 2026-06-05): original poster: "It has completely changed- all functionality lost." Replies disagree: "I’ve used it for years it’s lost no functionality" — https://www.reddit.com/r/jefit/comments/1ty1ibn/wtf_happened_to_jefit/ (conflicting; reported as a split)

### Inferences
- The "keeps me" feature is a progression engine (Liftosaur auto-progression, MacroFactor auto-progression) for one segment, and per-set rest timers / clean Watch logging for Hevy and Strong switchers. Celebration is not named as the reason for staying in any excerpt.
- MacroFactor Workouts users frame their value question around auto-progression. A user who only logs gets little value (1qiki9n).

### Gaps
- The excerpts do not show a clear single "keeps me" answer across apps. A targeted query on "why I stayed with Strong/Hevy" was not run.

## Which features are repeatedly requested but not yet shipped?

### Takeaway
Across Hevy, Strong, LiftinApp, Fitbod, and Alpha Progression threads, the repeated unmet requests are: set-specific rest timers, PR reset or per-machine PRs, muscle-group heatmaps for every workout (not only routines), a remaining-sets indicator on Finish, duration-based exercises for HIIT/stretching, and a non-verbal rest-timer cue. Several of these are marked as known to the developer but unanswered.

### Cited Findings
- Set-specific rest timers (Hevy): see 1v1tuiv above. Excerpt includes a proposed table ("Warm-up 2 / 50% of target / 1 min", "Working Sets / 100% of target / 3 min") — same URL.
- Muscle heatmap (Strong): thread 1v4eg7s (excerpt, 2026-07-23): "Why isnt there a muscle heat map yet even though this is one of the most requested feature?" and "If this has come up fairly often and you acknowledged it a year ago, why hasn't this feature been implemented yet?" — https://www.reddit.com/r/strongapp/comments/1v4eg7s/why_isnt_there_a_muscle_heat_map_yet_even_though/. The same thread's reply (excerpt): "The answer to everything related to Strong App developme..." (cut off).
- Muscle summary for real workouts (Hevy): 1wu7a8o (see above).
- PR reset / per-equipment PRs (Hevy): 1w1qekz and 1vw3ml1 (see above). Commenter (excerpt): "This has been said before and I’m astonished it hasn’t been implemented."
- Duration-based exercises for HIIT/stretching (Hevy): thread 1wndg5u (excerpt, 2026-09-22): "I have requested this feature through the Feature Request section in the Hevy app at least 10 times over the last four years, but I've never received any response or indication as to whether it's something you are considering." — https://www.reddit.com/r/Hevy/comments/1wndg5u/hevy_does_everything_except_this/
- Remaining-sets indicator on Finish (Hevy): 1wlie1j (see above).
- Non-verbal rest-timer vibration (LiftinApp): 1wqyndk (see above). Also MacroFactor rest timer silent-mode failure (1qiubpq).
- Alpha Progression requests more exercises and features: thread 1vyvjho (excerpt, 2026-08-26): "Competitors are adding helpful features that enhance their apps' functionality on a consistent basis." — https://www.reddit.com/r/alphaprogression/comments/1vyvjho/user_input_for_future_app_development/ (single poster; a request list is in the thread, not in the excerpt)
- Alpha Progression Live Activity: already shipped in v6.6 per the developer's own post (1sugruk, 2026-05-14): "We added an iOS Live Activity, which shows the rest timer, set info, and recommendation on the Lock Screen and Dynamic Island." — https://www.reddit.com/r/alphaprogression/comments/1sugruk/v66_live_activity_ios/ (developer post, first party; Android status "currently checking out what options there are")
- Fitbod natural-language and single-leg filtering request: 1vze95n (excerpt, 2026-08-27): "I would like to focus on single leg exercises when possible - but there is no way to request that and no easy way to filter exercises to choose from." — https://www.reddit.com/r/fitbod/comments/1vze95n/feature_suggestions_requests_natural_language/
- Fitbod notification complaint (excerpt, 2025-09-29): "Every day, I get a notification asking me how much progress I made... Please make it stop." — https://www.reddit.com/r/fitbod/comments/1ntxote/this_notification_drives_me_crazy/
- Hevy 2025 recap requests (excerpt, 2026-01-07): "allow us to view the whole workout instead of being locked in the rest timer" and "swipe to view now playing/media" — https://www.reddit.com/r/Hevy/comments/1q6e2fx/2025_hevy_recap_update/ (users' request list inside the developer's own recap)
- Hevy Apple Watch sync (same thread, excerpt): "since iOS 26, the Apple Watch - iPhone link is somewhat broken for me. I can start the workout in one and it'll show in another" — same URL.
- Strava streaks (not a lifting app, but a streak precedent, excerpt, 2026-04-14): "Streaks worst addition in 15 years of the app!... I just wish there were an option to turn it off." — https://www.reddit.com/r/Strava/comments/1sljyof/streaks_worst_addition_in_15_years_of_the_app/

### Inferences
- The repeatedly requested items are mostly data-model items (per-set rest, per-equipment PRs, per-workout muscle summary, duration exercises), not visual items. That suggests a delight feature that depends on correct data (a PR badge) is undermined when the PR model is wrong.
- The Finish-screen "remaining sets" indicator is a cheap, specifically requested fix.

### Gaps
- Not checked: whether Hevy or Strong has shipped any of these since the 2026-09 threads. The developers' responses were not read.
- Requests in the Hevy 1wndg5u thread that the developer has or has not answered are not verified.

## Share cards, widgets, streaks, Watch, year-in-review (summary of threads read)

### Cited Findings
- Share cards (dev post, Setgraph, 2026-08-19): "Share Cards let you turn the results from any workout into a polished card that's easy to post or send to friends." — https://www.reddit.com/r/Setgraph/comments/1vsvrnd/new_in_setgraph_turn_your_workouts_into/ (dev post)
- Share flow (dev post, Hardy, 2026-09-02): "After completing a workout, the summary screen has a 'Share' button... share it directly to Instagram, save the image to your camera roll" — https://www.reddit.com/r/hardyapp/comments/1w56oxw/how_to_share_a_workout_session_a_summary_on/ (dev post; author unclear)
- Share and widgets (dev post, Strive, 2026-04-17): "Finally I improved sharing views for routines, workouts... And a strava like overlay." — https://www.reddit.com/r/striveWorkoutLog/comments/1snxy12/121_new_sharing_homescreen_widgets/ (dev post)
- Home-screen widgets (dev post, Dash, 2026-01-14): "clean, glanceable Home Screen / Lock Screen widgets for your training stats" — https://www.reddit.com/r/iosapps/comments/1q6jcqe/dash_widgets_for_workouts/ (dev post, self-promo)
- Streaks, adverse (Strava, excerpt, 2026-04-14): "It's constantly in your face, taking up far too much screen space" and "I can easily imagine others feeling pressured to maintain their streaks, even if it means exercising when they shouldn't. That's not motivation" — https://www.reddit.com/r/Strava/comments/1sljyof/streaks_worst_addition_in_15_years_of_the_app/
- Streaks, adverse (Habitica community, excerpt, 2026-01-29): "it feels like a psychological attack" — https://www.reddit.com/r/habitica/comments/1qqcfvw/every_app_is_adding_streaks_and_it_feels_like_a/ (non-lifting community)
- Streaks, mixed (r/Habits, excerpt, 2026-08-17): "Streaks work. They turn a behaviour into a game and give you a simple reason to show up again tomorrow." followed by "I've started to think that the purpose of a streak is to eventually stop needing it." — https://www.reddit.com/r/Habits/comments/1vqn2k6/i_worked_out_every_day_for_77_days_heres_why_im/
- Guilt, lifting (r/workout, excerpt, 2026-09-15): "I feel guilty doing it because I wo..." (cut off) — https://www.reddit.com/r/workout/comments/1wgzrax/i_feel_guilty_for_taking_the_week_off_from_the_gym/
- Guilt, beginner (r/beginnerfitness, excerpt, 2026-07-03): "I feel really bad/guilty on the days I don’t exercise/gym or hit my step count" — https://www.reddit.com/r/beginnerfitness/comments/1um85m4/rest_day_guilt/
- Year-in-review (Apple Watch, excerpt, 2026-01-06): replies name third-party tools ("I used 'Fitness Wrapped'!", "I used EON to make one for me"); one reply is an indie-dev plug (Bloom) — https://www.reddit.com/r/AppleWatchFitness/comments/1q5lqrl/can_my_apple_watch_give_me_a_year_in_review/ (mixed; plugs flagged)
- Year-in-review (WHOOP official, 2025-12-09): "Your 2025 Year in Review is now live in the WHOOP app!" — https://www.reddit.com/r/whoop/comments/1pieoze/your_2025_year_in_review_is_now_live_in_the_whoop/ (vendor post; no sentiment)
- Year-in-review (Liftosaur developer, 2026-01-14): "It's kinda a tradition now to write these end-of-year reviews for Liftosaur!" — https://www.reddit.com/r/liftosaur/comments/1q0i7wi/happy_new_year_2025_yearinreview_for_liftosaur/ (developer post)
- Apple Watch as logger (excerpt, r/AppleWatchFitness, 2026-09-23): replies list Hevy and the default Apple workout app as the watch apps people use — https://www.reddit.com/r/AppleWatchFitness/comments/1woihfd/what_is_your_favorite_workout_app_to_use_on_apple/
- Apple Watch as logger, dev complaint (excerpt, 2026-03-06): "Most of them require too much scrolling or navigating menus just to log a set" — https://www.reddit.com/r/AppleWatch/comments/1rm4q35/do_any_of_you_track_strength_workouts_with_apple/ (dev post, flagged)
- Apple Watch lifting app (dev post, RIRLift, 2026-07-30): "Almost every lifting app I've used has the same problem: the Watch app is a rest timer with a heart rate readout" — https://www.reddit.com/r/AppleWatchApps/comments/1vawa1y/i_built_a_lifting_app_where_the_apple_watch_isnt/ (dev post, flagged)
- Hevy Watch sync (2025 recap, excerpt): "Fixing the rest timer from locking up any other activity on the Apple Watch and some sort of pre screen to selecting an exercise on the watch." — https://www.reddit.com/r/Hevy/comments/1q6e2fx/2025_hevy_recap_update/
- Lock-screen rest timer (Liftin, 2026-09-27 announcement, not read): Liftin v53 "all new Watch-sync" — https://www.reddit.com/r/LiftinApp/comments/1wrgcxu/version_53_released_with_ai_integrations_design/ (title only; content not read)
- Lock-screen activity (Oura, excerpt, 2026-06-14, not a lifting app): "It would be a huge help to be able to see without having to go into my Apple health" — https://www.reddit.com/r/ouraring/comments/1u5owai/anyone_have_a_live_activity_tracker_on_your_lock/

### Inferences
- Streaks are split: the lifting-adjacent complaints (Strava) focus on injury and pressure; the r/Habits post frames streaks as useful but temporary. No lifting-app-specific streak thread was found with a positive sentiment.
- Lock-screen rest timers and Live Activities are requested in lifting contexts (Liftin voice/vibration, MacroFactor silent-mode failure) more than they are praised. AP has shipped one (v6.6) and the developer's post is the only first-party evidence.

### Gaps
- No lifting-app Reddit thread found about confetti, PR badges, or haptics on PR. (See above.)
- Year-in-review for lifting apps (Hevy, Strong, Liftin, Fitbod) was not found as a 2025-2026 user-sentiment thread. Only Liftosaur's developer post, and cross-app recaps, were found.
- Apple Watch logging for Hevy and Strong: sentiment not read in full.

## Dropped or unreliable sources
- r/promoteMyApp, r/SideProject, r/buildinpublic, r/iosapps, r/ClaudeAI, r/gamification, r/ADHDFitness, r/alphaandbetausers: developer self-promotion threads; not counted as consensus.
- Threads with placeholder "Published" dates (2025-10-14, 2023-10-14, 2024-10-14, 2017-10-14, 2019-10-14, 2020-10-14, 2022-05-12 etc.) were ignored when dating. Where a 2025-10-14 placeholder appeared, the true date is taken from the thread's own text if visible in the excerpt; otherwise it is marked "date unverified".
- Juggernaut, Cal AI, Cronometer, MacroFactor food-logging threads were excluded from scope.
