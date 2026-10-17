# Legacy Food Loggers: MyFitnessPal, Cronometer, Lose It!, Carbon Diet Coach, Fitia/Yazio

Research date: 2026-10-13. Confidence notes are inline.

**Source-quality caveats (read first):**
- Reddit via Exa MCP (`mcporter call exa.web_search_exa`) returned results for the first few queries, then hit Exa's free-tier rate limit (HTTP 429). All later Reddit coverage came from WebSearch snippets, which surfaced few direct Reddit threads. Reddit quotes below are only those visible in search snippets; they were not re-fetched in full.
- Most 2026 "pricing" and "review" pages found are SEO or competitor-marketing content (Nutrola, NutriScan, Nutriscan, Unstar, Subger mirrors, Fitia). Treat their figures as low confidence unless noted as checked on a vendor page.
- Vendor pages checked directly: `myfitnesspal.com/premium` and `cronometer.com/gold/` (via WebFetch summarizer; quotes are the summarizer's extraction, not a raw page dump). `loseit.com/premium/` could not be fetched ("unable to fetch from www.loseit.com"), so Lose It pricing and feature gating remain unverified from the vendor.
- Carbon Diet Coach: primary help-center articles were found (help.joincarbon.com), but no direct Reddit threads.
- Fitia/Yazio: no vendor pricing page was fetched; findings are from search snippets only.

---

## MyFitnessPal

### Takeaway
MyFitnessPal's historical moat was the largest crowdsourced food database and the default-habit status it built over years. Its current paywall (barcode scan, voice, ads) is the main cited reason users leave, and many switchers describe a database that feels cluttered with duplicates. Its signature "still used" reason is inertia plus the size of the database; community commentary frames it as "what MFP used to be."

### Cited Findings
- Official Premium page (checked): Annual $79.99/yr ("saves 67%" vs monthly); Monthly $19.99/mo — [MyFitnessPal Premium](https://www.myfitnesspal.com/premium) (fetched via WebFetch summarizer)
- Premium features listed on the same page: "Barcode and voice logging", "Custom macro tracking", "An ad-free experience"; comparison table lists Barcode Scan & Meal Scan, Voice Log, custom-goal macros, ad-free logging, intermittent fasting, food insights — as Premium-only. Free accounts include nutrition/weight tracking and exercise tracking — [MyFitnessPal Premium](https://www.myfitnesspal.com/premium)
- Exact vendor wording used for AI-adjacent features: "Log entire meals with your voice" (Premium); "Barcode Scan & Meal Scan" (table). The page never uses the term "AI" — [MyFitnessPal Premium](https://www.myfitnesspal.com/premium)
- A third-party guide (low confidence) says MFP now has a "Premium+" at $99.99/yr and a "Premium + AI" tier; the vendor page fetched did not show these tiers, so treat as unverified — [Fitbudd MFP cost guide](https://www.fitbudd.com/post/myfitnesspal-app-cost); Subger mirror pages, e.g. [Subger MFP overview](https://subger.com/en/in/service/myfitnesspal)
- Reddit-sourced (snippet from a forum/aggregator thread, quoted as found): "I used to use MyFitnessPal but its pop up ads are particularly annoying and paying $20 for an ad free version doesn't make a lot of sense to me." — cited via [feddit.it thread](https://feddit.it/post/5489418) (aggregator of Reddit-style discussion; not re-verified on Reddit)
- Reddit-sourced, Cronometer subreddit, 2026-07-25: "Cronometer is what MFP used to be. My hope is that Cronometer never loses sight of the fact that a food tracker is, at its core, a database. All bells and whistles on top of that should not break core features. MFP totally lost sight of that and drove their tool into the ground." — [r/cronometer: Moved from MyFitnessPal to Chronometer](https://www.reddit.com/r/cronometer/comments/1v68tv5/moved_from_myfitnesspal_to_chronometer/)
- Database quality, third-party (low confidence): a former user's blog reports "nine conflicting entries for one sandwich, with calories ranging from 380 to 720" — [Nutrola: Why I Switched from MyFitnessPal](https://nutrola.app/en/blog/why-i-switched-from-myfitnesspal) (competitor marketing; anecdote unverified)
- Barcode-paywall backlash: a competitor blog says "barcode paywall" trended in fitness forums, but this is not verified against primary posts — [Nutrola: What Replaced MyFitnessPal in 2026?](https://nutrola.app/en/blog/what-replaced-myfitnesspal-2026)
- Alternatives people name on Reddit (secondhand): Cronometer, MyNetDiary, Loseit, Waistline — [feddit.it thread](https://feddit.it/post/5489418)

### Inferences
- The premium gate is now on the two features MFP's free users most need (barcode, voice/meal scan) plus ads, which matches the most-cited switching triggers across Lose It and Cronometer threads.
- "Meal Scan" is MFP's photo-recognition feature in the vendor's own table; its accuracy and reception were not found in primary sources.

### Gaps
- No primary Reddit thread on MFP's 2025–2026 AI feature reception was retrieved (Exa rate-limited; WebSearch returned only blogs).
- Whether a "Premium+" / "AI" tier actually exists was not confirmed on the vendor page.
- Database size and current crowdsourced-entry policy were not verified.

---

## Cronometer

### Takeaway
Cronometer's signature is verified/lab-analyzed micronutrient data (NCCDB, USDA) and deliberately curated entries. The most-cited reason users stay or switch to it is data accuracy and micronutrient depth; the most-cited reason users pay is removing its ads. Its community repeatedly frames it as the app that "kept the database front and center."

### Cited Findings
- Official Gold page (checked): Gold "$4.99 per month, billed annually at $59.99" ("Save 54%"); Gold monthly "$10.99 per month" — [Cronometer Gold](https://cronometer.com/gold/) (WebFetch summarizer)
- Gold features per vendor page: "Ad-free nutrition tracking from A to Zinc"; Basic "Track up to 84 nutrients"; Gold "Track up to 95 nutrients"; Basic "Generate reports and charts within a 7-day window" vs Gold "Look back at historical data, giving you unlimited insights"; Gold adds Recipe Importer ("Easily import recipes from your favorite websites"), Oracle Nutrient Search, Photo Log, Voice Log, Macro Scheduler, Fasting Timer, Crono Coach ("AI powered coaching"). — [Cronometer Gold](https://cronometer.com/gold/)
- Vendor page does not clearly state that Basic shows ads; the "ad-free" wording is the only ad reference. — [Cronometer Gold](https://cronometer.com/gold/)
- Reddit-sourced (r/cronometer, 2025-10-30): "Cronometer uses the USDA and NCCDB databases, which are comprehensive (80+ nutrients) and accurate, and user-generated entries are verified by their staff before being added." Same thread: "Crono's ads are deliberately intrusive and annoying, and like you, make the free version of the app almost unuseable." — [r/cronometer: Paid Cronometer vs paid lose it](https://www.reddit.com/r/cronometer/comments/1ok3nku/paid_cronometer_vs_paid_lose_it/)
- Reddit-sourced (r/cronometer, staff reply, 2025-10-14): Cronometer's community marketing manager says if barcode values differ from the label, report the issue and "Our Curation Team will take a look at it (oftentimes within a single business day)"; recommends generic NCCDB entries for text search — [r/cronometer: Database accuracy?](https://www.reddit.com/r/cronometer/comments/1gmi8q1/database_accuracy/). Note: this is a vendor employee quoted in a user thread; the claim is vendor-stated.
- Reddit-sourced (r/cronometer, 2026-01-13, user moving from MacroFactor): "Their databases were identical since both leverage the NCCDB database rather than user entries, unlike MyFitnessPal or LoseIt." Same user on barcode/label photo logging: "after taking photos of the 'front' and 'back' of the packaging, 80% was wrong and had to be hand-entered." — [r/cronometer: Possible switch from MacroFactor to Cronometer](https://www.reddit.com/r/cronometer/comments/1qc60e8/possible_switch_from_macrofactor_to_cronometer/)
- Reddit-sourced (r/cronometer, 2024-10-14, switching from Levels): "Cronometer is built on being accurate. You don't get all those user based entries because everything is verified." Reason for switching: the gym and dietitian used it and data sharing was easy. — [r/cronometer: First day on Cronometer](https://www.reddit.com/r/cronometer/comments/1f8g6gv/first_day_on_cronometer_and_im_surprised_how_many/)
- Pricing conflicts in third-party sources: USD 8.99/mo or 49.99/yr; 8.49/mo; 10.99/mo with 59.88/yr; a French NutriScan page gives 10.99/mo or 59.99/yr. The vendor page figures above supersede these. — [Nutrola: How Much Does Cronometer Cost Now in 2026?](https://nutrola.app/en/blog/how-much-does-cronometer-cost-now-2026); [NutriScan Cronometer pricing](https://nutriscan.app/en/blog/posts/cronometer-pricing-2026-basic-vs-gold-vs-pro-b28e621201)
- Conflicting claim: one source says free history is capped at 7 days, another says free users have no restrictions. The vendor page does show the 7-day window for Basic reports/charts, so the 7-day claim is supported for reports/charts specifically — [Cronometer Gold](https://cronometer.com/gold/)
- Reddit-sourced comment (2026-07-25): a switcher says the app "seems to be the only other app I can manually adjust mineral goals" — [r/cronometer: Moved from MyFitnessPal to Chronometer](https://www.reddit.com/r/cronometer/comments/1v68tv5/moved_from_myfitnesspal_to_chronometer/)

### Inferences
- Cronometer's free-to-paid pivot is ad removal and deeper analytics (history, charts, nutrient count), not barcode scanning. Barcode scanning appears to remain free on the vendor page's Basic column, but the page extract did not explicitly confirm this; treat as likely but unverified.
- The 2026-01 thread suggests user-entered data is a weak point for MFP and Lose It from the Cronometer-user perspective; Cronometer's NCCDB-first design is the differentiator.

### Gaps
- Whether Cronometer added AI photo/voice features in 2025–2026 beyond Gold's "Photo Log" and "Voice Log" listings was not checked against release notes.
- No 2026 Cronometer ad-policy change was found.
- Barcode scanning on the free tier was not confirmed on the vendor page.

---

## Lose It!

### Takeaway
Lose It! built its reputation on a free, fast barcode scanner and a clean iOS UI. The most-cited recent reason users quit or leave is the 2026 move of barcode scanning and insights behind Premium, and the loss of free "fun" features. Its community still praises its iOS polish and simplicity.

### Cited Findings
- Reddit-sourced (r/LoseitApp, 2026-04-27): "About a day or two ago when I went to log my food I went to scan a barcode and a message popped up that I had to pay for a subscription in order to use the scanner, along with that all the individual goals are now locked." — [r/LoseitApp: Have to pay now for the features that were free](https://www.reddit.com/r/LoseitApp/comments/1sxfabt/have_to_pay_now_for_the_features_that_were_free/). Same thread: "I've always recommended it to other people specifically because of the scanner being free."
- Reddit-sourced (r/LoseitApp, 2026-08-04): Insights tab removed from free use. Quote: "Now you can't see any insights AT ALL because they traded the barcode scanning being paywalled to having ANY INSIGHTS AT ALL behind a PAYWALL." Also: "Paywalling basic features ruins the fun and app loyalty completely." — [r/LoseitApp: Removal of Insights Tab](https://www.reddit.com/r/LoseitApp/comments/1vf2914/removal_of_insights_tab_removal_of_fun_features/)
- Reddit-sourced (r/LoseitApp, 2026-04-27): a commenter says a Lose It developer "said that the free users actually cost them money." Unverified: quoted as a snippet from a thread reply, not confirmed against the developer's own post.
- Reddit-sourced (r/loseit, 2024-07-03): "It is so hard to find apps that don't charge you extra money just to scan a barcode on the food you're eating, or create a meal that you can separately portion out." — [r/loseit: Calorie trackers are all premium now](https://www.reddit.com/r/loseit/comments/1duhmji/calorie_trackers_are_all_premium_now_and_its_so/)
- Reddit-sourced (r/cronometer, 2025-10-30): a former Lose It user says "the user-generated food database was horrible, and I had to sift through a dozen or more duplicate or inaccurate entries to find the right one." — [r/cronometer: Paid Cronometer vs paid lose it](https://www.reddit.com/r/cronometer/comments/1ok3nku/paid_cronometer_vs_paid_lose_it/)
- Reddit-sourced (r/loseit, 2024-07-03): "Lose It was only $20 a year... I viewed it as an expense to better my health." — [r/loseit thread](https://www.reddit.com/r/loseit/comments/1duhmji/calorie_trackers_are_all_premium_now_and_its_so/) (pre-2026 pricing; dated)
- Reddit-sourced (r/LoseitApp, 2024-01-10): a longtime user says the annual premium and lifetime offers around Thanksgiving were "totally worth the price." Dated (2024).
- Third-party (low confidence): Snap It photo logging is Premium-only in 2026; one competitor-blog says new free users may lack Scan It, others say the scanner is still free on the Basic tier. Conflicting — [Nutrola: What Do Reddit Users Say About Lose It in 2026?](https://nutrola.app/en/blog/what-do-reddit-users-say-about-lose-it-2026); [FitBudd: Lose It premium review](https://www.fitbudd.com/post/lose-it-premium-review); [NutriScan Lose It pricing 2026](https://nutriscan.app/blog/posts/lose-it-pricing-2026-free-vs-premium-2b4e921555)
- Premium price conflicts: $39.99/yr vs a claimed increase to $79.99/yr. Unverified; vendor page was not accessible. — [NutriScan Lose It pricing 2026](https://nutriscan.app/blog/posts/lose-it-pricing-2026-free-vs-premium-2b4e921555)
- Ads on the free tier are the most-cited complaint in a 2026 competitor-blog summary of Reddit; that summary is not primary — [Nutrola: Lose It on Reddit 2026](https://nutrola.app/en/blog/what-do-reddit-users-say-about-lose-it-2026)

### Inferences
- Lose It's 2026 paywall expansion (barcode, goals, insights) is the freshest and most emotionally charged switching trigger in the set; the r/LoseitApp threads from April and August 2026 are the strongest primary evidence found.

### Gaps
- Lose It's official pricing and feature list could not be fetched; the exact date and scope of the scanner paywall are unverified.
- Developer statement about free-user costs is unverified.
- No primary Lose It release notes found.

---

## Carbon Diet Coach

### Takeaway
Carbon's defining feature is an adaptive macro coach: it sets targets with what the vendor calls a "modified Müller equation," then adjusts calories and protein weekly based on tracked intake and rate of progress. It is aimed at physique athletes and lifters. It does not appear to have AI photo or voice logging. Its stickiness comes from the algorithm's weekly feedback rather than the food database.

### Cited Findings
- Vendor help center: "Carbon sets macro targets with a modified Müller equation, then adjusts them at weekly check-ins... If your results are ahead of, behind, or on pace with your target rate of change, Carbon will adjust your calories up or down accordingly." — [Carbon help: How Carbon sets and adjusts your macros](https://help.joincarbon.com/en/articles/14005628-how-carbon-sets-and-adjusts-your-macros)
- Vendor: "Carbon only adjusts your targets when the data shows that a change is needed"; "Protein is set within a range based on your specific goal and diet preference" — same source
- Vendor: Carbon "won't change your targets based on incomplete data" when a week isn't fully tracked — [Carbon help: My macros don't seem right](https://help.joincarbon.com/en/articles/6004873-my-macros-don-t-seem-right-what-should-i-do)
- Vendor: manual calorie planner "only works in 7-day increments, and it stops at a calorie floor based on the amount of Lean Body Mass" — [Carbon help: Why won't the calorie planner adjust](https://help.joincarbon.com/en/articles/6059935-why-won-t-the-calorie-planner-adjust)
- Vendor release note: check-ins now show "what your Coach reviewed, what decision was made, and why" — [Carbon release 76](https://www.joincarbon.com/blog/release-76) (not read in full; summary from search result)
- Third-party (Nutrola, competitor, rated 7/10): calls it "the best automated macro coaching tool for physique athletes and bodybuilders," praises the algorithm as "genuinely impressive," criticizes "lack of AI logging, small food database, and absent micronutrient tracking" — [Nutrola: Carbon Diet Coach Review 2026](https://nutrola.app/en/blog/carbon-diet-coach-review-2026) (competitor; low confidence on the database/micronutrient claims)
- Pricing (unverified, one 2026 breakdown): $14.99/mo, $119.99/yr — [Nutrola: How Much Does Carbon Diet Coach Cost Now in 2026?](https://nutrola.app/en/blog/how-much-does-carbon-diet-coach-cost-now-2026)
- Barcode scanning and micronutrient count conflict across sources (one says scanner included; one says no scanner; one says 80+ micronutrients). Unresolved — [Adam Freediver: Best Apps for Nutrition Tracking 2026](https://www.adamfreediver.com/dev/?p=131914); [Nutriscan Carbon alternatives](https://nutriscan.app/blog/posts/best-carbon-diet-coach-alternatives-2026-b3a290ecd9)
- Reddit: no r/CICO or r/MacroFactor Carbon threads were retrieved. Search returned only vendor help pages and competitor reviews.

### Inferences
- Carbon's "sticky" mechanic is the weekly adaptive target, which is closest in concept to MacroFactor's expenditure-estimation approach. That is a relevant design analogue for OptiGains but based on vendor description, not user testimony.

### Gaps
- No user testimony (Reddit or App Store) was retrieved for Carbon's adaptive algorithm accuracy or its complaints.
- Barcode and micronutrient coverage unresolved.
- Carbon's pricing page was not fetched.

---

## Fitia and Yazio

### Takeaway
Yazio's free tier still exists but is ad-supported, and AI photo logging is Pro-only. Fitia markets AI photo, voice, and text logging trained on a verified database, but this is vendor-promotional and independent accuracy tests were not found. Reddit threads were not retrieved for either app.

### Cited Findings
- Yazio free tier: basic calorie logging, fasting timer, with ads; "Free users see banner and interstitial ads during logging sessions, which Pro removes." Source is a competitor-affiliated blog — [NutriScan: Yazio pricing 2026](https://nutriscan.app/blog/posts/yazio-pricing-2026-free-vs-pro-what-pro-unlocks-33b26f8fc7); [Nutrola: Is Yazio Free Anymore?](https://nutrola.app/en/blog/is-yazio-free-anymore) (low confidence)
- Yazio AI photo logging: described as Pro-only in 2026 under a rebrand to "AI Calorie Tracker by Yazio." One source dates it to late 2024; another to late 2025 — conflicting. [NutriScan Yazio Pro worth it](https://nutriscan.app/blog/posts/yazio-pro-worth-it-2026-4f450da831)
- Yazio pricing: $47.90/yr (one source), $45/yr (another); a 2025 Fitia comparison lists PRO at $19.99 per three months or $39.99/yr — [Fitia: Best Yazio alternatives 2026](https://fitia.app/learn/article/best-yazio-alternatives-2026/)
- Yazio barcode scanning: sources conflict (one says PRO-only now, one says free). Unresolved.
- Yazio user complaints (secondhand, from competitor blog): "features have moved behind the paywall over time," and a user quoted: "it used to not have ads after each track." — [Nutrola: Why Is Yazio So Bad Now?](https://nutrola.app/en/blog/why-is-yazio-so-bad-now) (competitor; quote not verified against App Store)
- Fitia pricing conflict: May 2025 article lists $19.99/mo or $59.99/yr; Dec 2025 article lists $11.99/mo, $71.99/yr, 7-day trial. — [Fitia: Top 12 nutrition tracking apps 2026](https://fitia.app/en/learn/article/top-12-nutrition-tracking-apps-2026/); [Fitia: Calorie budgeting apps 2025](https://fitia.app/learn/article/best-calorie-budgeting-apps-2025-pricing-features) (vendor marketing; low confidence)
- Fitia AI logging claim (vendor marketing): "flexible AI logging (photo, voice, text) is trained on its verified database." No independent accuracy test found — [Fitia: Top 12 nutrition tracking apps 2026](https://fitia.app/en/learn/article/top-12-nutrition-tracking-apps-2026/)
- Yazio Reddit quote (secondhand, 2024-07-03): "Now I'm using YAZIO but the user interface is not amazing." — [r/loseit thread](https://www.reddit.com/r/loseit/comments/1duhmji/calorie_trackers_are_all_premium_now_and_its_so/)

### Inferences
- Yazio's free-tier ads and Pro-gated photo logging match the same pattern (paywall on the most-used convenience feature) seen in MFP and Lose It. This pattern is consistent across sources but rests mostly on competitor blogs.

### Gaps
- No vendor pricing pages fetched for Yazio or Fitia.
- No Reddit or App Store reception data for Yazio/Fitia AI photo logging.
- Fitia's signature strength and user retention story not investigated beyond vendor copy.

---

## Cross-app patterns (preliminary)

- **Most-cited switching triggers:** (1) paywalled barcode scanning (Lose It 2026, MFP), (2) ads on the free tier (MFP, Cronometer, Yazio, Lose It), (3) crowdsourced database duplicates (MFP, Lose It), (4) removal of previously free insights/features (Lose It Aug 2026).
- **Most-cited reasons to stay or switch in:** database accuracy and micronutrient depth (Cronometer), iOS polish (Lose It, per competitor summary), and the adaptive macro algorithm (Carbon).
- **AI features (2025–2026):** MFP "Meal Scan" and voice log; Lose It "Snap It" (Premium); Cronometer "Photo Log" and "Voice Log" (Gold, per vendor page); Yazio AI photo logging (Pro, conflicting dates); Fitia AI photo/voice/text (vendor claim). Carbon has no photo logging per most reviews. No independent reception data was retrieved for any of these, so reception is unverified.
- **Pricing pattern (2026):** MFP $19.99/mo or $79.99/yr (vendor page). Cronometer Gold $10.99/mo or $59.99/yr (vendor page). Lose It Premium unverified. Carbon unverified ($14.99/mo per one source). Yazio ~$40–48/yr (conflicting). Fitia unverified ($11.99/mo, $71.99/yr in one Dec 2025 vendor article).

## Next steps if more depth is needed
- Retry Exa with a new key or wait out the rate limit to get full text of the r/MyFitnessPal, r/CICO, and r/Yazio threads.
- Check Lose It's App Store page directly for current pricing and scanner availability.
