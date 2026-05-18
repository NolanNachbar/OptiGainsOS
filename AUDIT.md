# VEKTOR — Frontend Destructive Audit Report
**Date:** 2026-05-18 | **Viewport tested:** iPhone 14 (390×844) | **Benchmark:** MacroFactor, Strong, Hevy, Strava

---

## CRITICAL ISSUES — Launch Blockers

---

### 1. Login form is light-themed inside a forced-dark app
**Severity:** Critical
**Why it hurts trust:** The entire product is #121212 dark, but the login card renders with white/light inputs and a light card surface. First-time users see a visual identity collapse at the entry gate — the first 5 seconds of the product feel like a different app entirely. Dark apps with light form modals scream "template with skin applied."
**Exact fix:** Audit Login.jsx form card and all inputs. Replace any `bg-white`, `bg-gray-*`, or browser-autofill-overriding backgrounds with `bg-charcoal-surface` (#1a1a1a). Set `input:-webkit-autofill` override in `index.css` to `-webkit-box-shadow: 0 0 0 1000px #1a1a1a inset` so autofill doesn't bleed the white.
**Effort:** 1–2 hours

---

### 2. FAB (+) button physically occludes primary interactive elements
**Severity:** Critical
**Why it hurts trust:** On Create Workout, the neon green FAB sits directly over the right portion of the "+ Add Exercise" full-width button. On Dashboard, it occludes the "Workout Logs" accordion chevron and badge. A floating element that breaks mission-critical interactions is a hard quality signal failure — it says "nobody pressed buttons before shipping."
**Exact fix:** Either (a) remove the FAB entirely from pages that already have an explicit add action (Create Workout, Dashboard), or (b) shift it to a fixed `bottom-24` position accounting for the nav bar height, and never render it on pages where it conflicts with page-level CTAs. Context-aware FAB: show only on Schedule, Workouts library, Food Tracker.
**Effort:** 2–4 hours

---

### 3. "Import JSON" exposed as a consumer CTA
**Severity:** Critical
**Why it hurts trust:** The Programs tab shows "Import JSON" as a primary action button alongside "Create Program." No consumer fitness app surfaces raw data format import as a primary affordance. It broadcasts "this was built by a developer for a developer." MacroFactor would never let this through a code review.
**Exact fix:** Move "Import JSON" to a settings overflow menu or the Profile > Settings > Data section. The Programs primary CTA should be only "+ Create Program."
**Effort:** 30 minutes

---

### 4. Multi-color off-brand system throughout
**Severity:** Critical
**Why it hurts trust:** The stated system is Volt Green (#CCFF00) + Cyber Charcoal. But the actual running product contains: blue for Strength workout type stats, orange for Cardio stats and calories, yellow-gold for body weight, a full Strava orange button in the Workouts empty state, and multi-colored macro chips (yellow CAL, blue PRO, green CAR, orange FAT) in the Food Tracker food items. Five distinct accent colors with no semantic logic. Compared to MacroFactor's disciplined two-color system, this looks unfinished.
**Exact fix:** Audit `WorkoutCard.jsx`, `FoodTracker.jsx`, `Workouts.jsx`. Macro chips should use a single neutral color (#a0a0a0) with volt green used only for active/positive states. Strength/Cardio type badges should be `text-primary-500` for active and `text-[#555]` for inactive — not blue/orange. The Strava CTA should be charcoal-surface with a white Strava logo, not a full-orange button.
**Effort:** 4–8 hours across files

---

### 5. Touch targets well below 44px minimum
**Severity:** Critical
**Why it hurts trust:** Playwright measured multiple interactive elements below Apple's minimum tap target spec:
- "Options" button: **16px height**
- "Front"/"Back" heatmap toggles: **20px height**
- "Schedule a Workout" link: **18px height**
- "History/Weight/Nutrition" analytics tabs: **32–34px height**

On a real phone these are near-impossible to tap accurately. Strong and Hevy treat every interactive element with generous padding as a baseline. Fumbled taps during a workout set destroy trust instantly.
**Exact fix:** All buttons, tabs, and links need minimum `min-h-[44px]` with appropriate padding. For small inline toggles (Front/Back), use `px-3 py-2.5` to meet spec without changing visual footprint significantly.
**Effort:** 3–6 hours

---

## HIGH ISSUES

---

### 6. "DISCOVER_ATHLETES" / "ACTIVITY_STREAM" underscore section headers
**Severity:** High
**Why it hurts trust:** These look exactly like debug variable names printed directly to the UI. This is the single fastest way to signal "hobby project" to a design-literate user. MacroFactor would never let this through a code review.
**Exact fix:** Replace with "Discover Athletes" and "Activity Feed" in the Social component. Audit all uppercase-with-underscore strings: `grep -rn '"[A-Z_]*_[A-Z_]*"' src/`
**Effort:** 30 minutes

---

### 7. Generic copy directly contradicts the brand positioning
**Severity:** High
**Why it hurts trust:** The Landing page copy is excellent — "Bayesian TDEE estimation," "exponential decay curves," "mathematical fatigue modeling." But the app itself says: "Let's crush your fitness goals today," "Build your perfect workout routine," "Let's personalize your fitness journey." This is Planet Fitness copy in a MacroFactor product. The dissonance is jarring.
**Exact fix:**
- Dashboard subtitle: "Let's crush your fitness goals today" → "Training status as of today"
- Create Workout subtitle: "Build your perfect workout routine" → "Define structure. Save to library."
- Onboarding subtitle: "Let's personalize your fitness journey" → "Configure your training profile"
- Workouts subtitle: "Your workout library and programs" → "Library & session history"

**Effort:** 1 hour (pure copy)

---

### 8. Duplicate page headings on every screen
**Severity:** High
**Why it hurts trust:** Every screen shows the page name twice — once in the fixed top bar and once as an H1 below. Profile, Create Workout, Food Tracker, Quick Workout all repeat. This is a double-title anti-pattern that wastes the first 60px of every screen and looks like a layout assembled from two separate components without integration.
**Exact fix:** The top bar header title is sufficient. Remove the standalone H1 page title on every inner page. Use that space for the page's first meaningful content unit instead.
**Effort:** 2 hours

---

### 9. Onboarding validation hint rendered in error color at rest
**Severity:** High
**Why it hurts trust:** "3-20 characters: letters, numbers, underscores" appears in red/warning styling before any user interaction. The first thing a new user reads under the username field is what looks like a persistent error message. Strong and Hevy show hints in neutral gray; they only turn red after invalid input.
**Exact fix:** Change the hint's default color to `text-[#555555]`. Apply `text-danger-500` only on blur with invalid input.
**Effort:** 30 minutes

---

### 10. Native browser number spinners break dark theme
**Severity:** High
**Why it hurts trust:** The Duration field in Create Workout shows native HTML `<input type="number">` with browser-rendered up/down spinner arrows in light browser chrome. On #121212 this is a jarring white intrusion. It communicates "we didn't fully style our inputs."
**Exact fix:** Add `[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none appearance-none` to the input class, or replace with a custom stepper component `(−) [value] (+)` which also improves mobile logging speed.
**Effort:** 1–2 hours

---

### 11. Dropdown option values are unsanitized lowercase
**Severity:** High
**Why it hurts trust:** Create Workout dropdowns show "strength" and "intermediate" — raw database enum strings rendered directly. Premium software doesn't expose internal data formats in the UI.
**Exact fix:** Add a display map in CreateWorkout.jsx: `{ strength: 'Strength', cardio: 'Cardio', intermediate: 'Intermediate', beginner: 'Beginner' }`. Apply at render time.
**Effort:** 1 hour

---

### 12. Profile page is empty — no data, no stats, no utility
**Severity:** High
**Why it hurts trust:** Strava's profile page is the proof-of-work display. MacroFactor's shows weight trend and adherence. Vektor's profile shows only a letter avatar and four settings links, then empty charcoal below the fold. A precision fitness app's profile should be a performance dashboard. As-is it looks like a stub page.
**Exact fix:** Add a stats row (Total Workouts | Total Volume | Active Streak | PRs Set) pulled from existing Supabase queries. Add the last 7 days of activity dots (same data as Dashboard This Week). Link to the public profile view.
**Effort:** 1–2 days

---

## MEDIUM ISSUES

---

### 13. Quick Workout exercise input placeholder is truncated
**Severity:** Medium
**Why:** "Exercise name (e.g., Benc" clips inside the input on first render. The primary input of the core logging flow is visually broken before any user interaction.
**Fix:** Use "Exercise name" as the placeholder only. The dropdown handles search and discovery.
**Effort:** 5 minutes

---

### 14. Schedule filter chips: "PROGRAM" clipped at right edge
**Severity:** Medium
**Why:** The horizontal filter chip row overflows its container. The last chip is cut by the viewport, making the layout look broken.
**Fix:** Add `overflow-x-auto scrollbar-none` with adequate `padding-right` to the chip row so the last chip is fully visible when scrolled to end.
**Effort:** 30 minutes

---

### 15. Zero-value stats rendered in volt green (success color)
**Severity:** Medium
**Why:** "0 Sessions" on the Workouts activity log is displayed in full volt green — the same color used for positive active states. Zero is not a success state.
**Fix:** `sessions > 0 ? 'text-primary-500' : 'text-[#555555]'` for stat values throughout.
**Effort:** 30 minutes

---

### 16. Nutrition donut charts on Schedule are unreadably small
**Severity:** Medium
**Why:** The four CAL/PRO/CARBS/FATS rings are approximately 70px diameter. Internal text is around 10–12px. Unreadable without zooming on a real device.
**Fix:** Either use horizontal bar-style progress (as Food Tracker already does, for consistency) or increase ring size to 88px minimum with 14px internal text.
**Effort:** 2 hours

---

### 17. Redundant Supabase fetches on dashboard load
**Severity:** Medium
**Why:** `workout_logs` is fetched 3 separate times, `friendships` twice on dashboard render. Each round-trip is 120–200ms and creates visible sequential pop-in.
**Fix:** Consolidate into a single fetch per resource via shared context or `Promise.all`. Cache results for the session duration.
**Effort:** 4–8 hours

---

### 18. FAB present with no clear purpose on Profile page
**Severity:** Medium
**Why:** The + FAB floats over a settings-list page. There is nothing to "add" on Profile. The FAB is rendered indiscriminately on every Layout-wrapped screen.
**Fix:** Hide FAB on `/profile`, `/onboarding`, `/create-workout`, `/quick-workout` via a route-conditional render.
**Effort:** 1 hour

---

### 19. Oversized empty states dominate new user experience
**Severity:** Medium
**Why:** Exercise Progress, Personal Records, Social feed, and Programs each take 200–300px of viewport height to show an icon and 2 lines of text. A new user's first session is almost entirely stacked empty states, making the app feel broken.
**Fix:** Cap empty state height at 120px. Use freed space for contextual onboarding nudges ("Log your first workout to unlock this").
**Effort:** 1 day

---

### 20. Food Tracker date format is unpolished
**Severity:** Low
**Why:** "05/18/2026" is a US-locale numeric format. Premium apps use "May 18" or "Mon, May 18."
**Fix:** Replace with `format(date, 'MMM d')` using date-fns.
**Effort:** 15 minutes

---

## DESIGN SYSTEM AUDIT

| System Layer | State | Verdict |
|---|---|---|
| Typography | IBM Plex Sans + Mono correctly applied | PASS |
| Border radius | Consistent 6–10px, no circles on cards | PASS |
| Spacing | Inconsistent — some cards 16px padding, others 12px, no clear scale | FAIL |
| Color tokens | 5 accent colors in use; token system defines 1 | FAIL |
| Button variants | 3+ inconsistent styles with no clear hierarchy | FAIL |
| Form inputs | Dark-correct on most screens, white on Login | FAIL |
| Touch targets | Multiple below 44px minimum | FAIL |
| Empty states | Oversized, no clear template or component | FAIL |
| Loading states | No skeleton screens; content pops in | FAIL |
| Icons | Lucide icons used inconsistently alongside custom SVGs | PARTIAL |
| Nav bar | Consistent across all screens | PASS |

---

## LAUNCH READINESS SCORE: 38 / 100

| Dimension | Score | Notes |
|---|---|---|
| Visual polish | 45/100 | Dark system and volt green are strong foundations; multi-color violations drag it down severely |
| UX quality | 30/100 | FAB collisions, undersized targets, broken quick-workout input, underscore labels |
| Scientific credibility | 52/100 | Landing copy is strong; app interior copy is generic; data displays are sparse |
| Frontend robustness | 38/100 | Console errors on most screens, light login form, duplicate fetches, native spinners |
| Mobile maturity | 28/100 | Touch targets below spec throughout, FAB collision, placeholder clipping |
| Premium product feel | 35/100 | Color discipline failure, generic copy, empty profile, no skeleton states |

---

## PRIORITY FIX ROADMAP

### Immediate — 1–2 days

1. Fix login form dark theme — white card on black app is the worst single first impression
2. Remove FAB from conflicting pages — Profile, Create Workout, Quick Workout; make it route-conditional
3. Eliminate "Import JSON" from Programs consumer view — move to settings
4. Fix "DISCOVER_ATHLETES" / "ACTIVITY_STREAM" labels — 30 minutes, massive trust dividend
5. Fix touch targets — Options, Front/Back, Schedule a Workout buttons all below spec
6. Replace generic body copy — 10 strings, 1 hour, moves brand perception immediately
7. Fix onboarding validation hint color — red-at-rest reads as a permanent error state

### Short-Term — 1–2 weeks

8. Consolidate color system — audit every component for blue/orange/gold violations; normalize to volt green + neutral
9. Remove duplicate H1 page titles across all inner screens
10. Fix dropdown value display — strength → Strength, intermediate → Intermediate
11. Remove native number spinners — replace with custom stepper component
12. Compact empty states — cut height in half, add actionable onboarding prompts
13. Fix Schedule filter chip overflow
14. Profile page stats — add minimum 3-stat row (workouts, volume, streak)
15. Deduplicate Supabase fetches on dashboard

### System-Level — 2–4 weeks

16. Design token enforcement — single source of truth for all semantic colors; no hardcoded hex in component files
17. Skeleton loading states — every data-fetching surface shows structured skeletons before data arrives
18. Touch target system — enforce `min-h-[44px]` at the component level as a baseline constraint
19. Workout logging UX — replace typed number inputs with tap-increment steppers; add session timer to Quick Workout header
20. Profile page redesign — performance dashboard with training stats, recent activity, and public profile link

---

## FINAL VERDICT

**What exact changes, in order, would make Vektor feel like a $50M elite fitness software company built it?**

**First:** Fix the login screen. A white form on a black app is the brand collapsing at the front door.

**Second:** Kill the multi-color accent system. Every screen that uses blue, orange, or yellow-gold for workout stats, macro chips, or CTAs erodes the precision brand. One primary color. MacroFactor doesn't use four accent colors. The discipline of restraint is what communicates intelligence.

**Third:** Rewrite every generic fitness-app subtitle in the app interior. "Let's crush your fitness goals" is what MyFitnessPal circa 2014 said. Vektor's landing page demonstrates the team can write with precision. The app interior should match.

**Fourth:** Fix the FAB collision on Create Workout. A floating button that physically overlaps the primary action of the core logging flow — and nobody caught it — is a QA red flag. On a $50M product, that gets caught in sprint review.

**Fifth:** Delete "Import JSON" from the Programs consumer surface. One button that shouldn't exist does more damage to perceived product maturity than a hundred missing features.

Do those five things and Vektor goes from a credible side project to a credible product. The design language foundation (IBM Plex, #121212, volt green, tight border radii) is genuinely strong — it just needs the interior to live up to the exterior.
