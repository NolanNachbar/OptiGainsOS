# Full UI/UX Design Audit

**Benchmarks:** MacroFactor, Hevy, Strong, Strava, Fitbod, Cronometer
**Target aesthetic:** MacroFactor-level scientific premium

---

## First Impression Verdict

No. It communicates "capable indie developer who built feature-first and styled second." The Dashboard lands with a gradient text headline — `text-transparent bg-clip-text bg-gradient-to-br from-purple-600 to-indigo-600` — which is so generic it appears as a stock example in every Tailwind tutorial written between 2021 and 2023. That is the first thing a new user sees.

The app is not embarrassing. But a sophisticated lifter who uses MacroFactor, Strong, or Hevy will immediately sense that this was designed screen-by-screen rather than from a system. That feeling erodes trust before the user logs a single set.

The product has a legitimate feature set that is better than most apps in this space. The UI currently undersells it by a wide margin.

---

## Visual Design System Audit

### Typography — 31/100

This is the most serious technical problem in the codebase.

**Michroma as the base font** is the root cause. Michroma is a geometric display face. It has essentially one optical weight, limited glyph variety, and extremely poor readability below 14px. It is appropriate for a logo or a page title. It is not appropriate as the body font for a data-dense fitness application.

The consequences show up directly in code. `FoodTracker.jsx` contains **27 instances of arbitrary text sizes**: `text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`. This is not a design decision — it is a developer fighting the font. When body text cannot be legible at normal scales, the response is to custom-size every element until it stops looking broken. The result is a typography system that is technically unmaintainable and visually incoherent.

The gradient headline on Dashboard (`Welcome to Sisyphus' Schedule`) is a specific offense. It is generic, decorative in a product that should feel analytical, and has no equivalents on any other page.

**Fix:**
- Replace Michroma as the body/UI font. Michroma can stay for the logo and large stat numbers where its technical character is appropriate.
- Choose a proper text face: Geist, IBM Plex Sans, or DM Sans for all UI copy.
- Delete every `text-[Npx]` instance and replace with a defined scale of 7–8 sizes maximum.
- Remove the gradient headline entirely.

### Color System — 48/100

The purple (`#7c3aed`) is too saturated for a scientific/analytical product. It reads as consumer-grade. MacroFactor's primary color is barely a color — a dark teal used sparingly as an accent. Cronometer uses almost no accent color at all.

**14 gradient usages** exist across the codebase. That is 13 too many for a precision analytics tool. Gradients read as decoration. Decoration reads as lacking confidence in the data.

The orange-for-cardio, purple-for-strength semantic system is good — it is one of the few places the color language has clear meaning. The problem is that purple is also the brand color, the active state color, the button color, and the chart line color. Everything is purple. There is no hierarchy.

**Fix:**
- Desaturate the primary purple by 15–20%.
- Remove all decorative gradients. Zero exceptions.
- Introduce a true dark neutral (`#18181f`) as the high-emphasis color for primary actions.
- Retain orange for cardio data only. It should never appear on UI chrome.

### Spacing & Layout Grid — 44/100

**Dashboard has 24 different `rounded-*` values. FoodTracker has 30.**

There is no border-radius system. `rounded-sm`, `rounded`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` all appear on the same pages, sometimes within the same component. The eye notices something is wrong but cannot name it. That unnamed wrongness is exactly what separates "almost polished" from "actually polished."

MacroFactor uses a single border-radius value for cards and a slightly smaller one for elements inside cards. That is it.

The `text-align: center` global default on `body` in `index.css` is fighting every left-aligned layout and being manually overridden throughout the codebase.

**Fix:**
- Define three radius values: card/surface (10px), element (6px), pill (9999px). Use nothing else.
- Remove `text-align: center` from the body default in `index.css`.
- Standardize card padding to 20px desktop / 16px mobile.

### Component Consistency — 38/100

**The button system does not exist.** Every button in the app is `variant="ghost"` plus inline `className` overrides. There is no `variant="primary"` or `variant="secondary"` enforcing intended styles. Every button is custom-coded, which is why they are all different. A new developer adding a button to any page will guess at the right style, continue the inconsistency, and make the problem worse.

**Cards have no system.** The workout library uses top-border accents. The activity log uses left-border accents. The dashboard stats card has no accent. The featured Today's Workout card uses a full gradient fill. Five different treatments for functionally equivalent content containers.

**Charts are default Recharts.** `ExerciseProgressChart` is Recharts with no customization beyond setting two stroke colors. `CartesianGrid strokeDasharray="3 3"` is the Recharts default. The chart has a dual-Y-axis, a default Legend, and circular data points at `r: 5`. MacroFactor's charts feel like they were designed by a data visualization specialist. The current charts look like a tutorial project.

---

## Screen-by-Screen Audit

### Dashboard — Functional but weak

- The centered gradient headline is the single worst element in the app. Remove it. Use the same left-aligned page header as every other screen.
- The Today's Workout gradient card achieves prominence through loudness rather than design. Replace with dark charcoal.
- The `AI WEEK GENERATOR` label reads as marketing language in a utilitarian interface.
- The analytics tabs (History, Bodyweight, Training Load, Nutrition Coach) are buried below the fold and not discoverable by most users.
- The week metrics section and muscle heatmap are genuinely well-structured and should not change.

### Workout Logging — Production-ready

The strongest screen in the app. Set-by-set logging, last performance reference, rest timer, session persistence, RIR/RPE — all correct decisions and competitive with Strong/Hevy on features.

**Gaps versus Strong/Hevy:**
- Strong's set rows are larger tap targets optimized for one-handed gym use. This implementation is web-first.
- Hevy shows previous session weight as a placeholder directly in the input field. The current "last performance" reference requires scanning to a separate area, adding cognitive load mid-set.
- Fix the font and button system and this screen is shippable.

### Workouts Library — Functional but weak

Cards have too many competing elements: difficulty badge, type badge, folder label, truncated title, truncated description, two stat rows, two reaction buttons, full-width CTA. That is seven information layers on a card. MacroFactor and Hevy use 3–4 maximum.

The top-border accent is the wrong position. The left-border accent from the Activity Log persists down the full card height regardless of length. Use that system everywhere.

The Activity Log tab is the best page in the app. Its pattern should propagate everywhere.

### Schedule — Production-ready

The weekly calendar is well-executed. The day cards are clean and the macro rings are appropriate for the space.

Issues:
- Activity type icons in day cells have no legend. First-time users cannot decode them.
- Macro ring labels are too small to read at normal viewing distance. Either increase the font size or remove labels and let fill communicate the summary.
- The filter chips (All, Strength, Cardio, Hiit) — "Hiit" should be "HIIT."

### Progress / Analytics — Needs redesign

The most critical gap versus MacroFactor.

The `ExerciseProgressChart` is default Recharts. Hardcoded colors, default grid, default legend, default dot shapes. No story is being told — it displays data but does not surface insight. MacroFactor's weight trend chart shows a LOESS smoothing curve over raw data points, communicates trajectory and variability simultaneously, and labels the current value directly on the chart. It feels like research software. The current chart feels like a demo.

Specific issues:
- Dual Y-axis (weight left, reps right) creates visual confusion. MacroFactor separates these concerns.
- The Recharts `Legend` component with default styling is never an acceptable final design.
- The bodyweight chart needs a trend line, not just raw data points.

This section is where the app proves its scientific value. It currently proves nothing.

### Food Tracker — Functional but weak

The structural design is sound. The functionality (USDA search, barcode scanning, meal templates) is strong.

The typography problem here is severe — 27 arbitrary `text-[Npx]` values, text ranging from 8px to 11px to normal Tailwind sizes all competing on the same screen.

The right sidebar is overcrowded: 7-day trend chart, nutrition goals panel, and templates/recipes/ideas tabs stacked in a narrow column, all requiring scrolling to use.

### Social — Needs redesign

The left panel uses `INTELLIGENCE FEED` and `ACTIVE NETWORK` as section labels. These are marketing phrases, not UI labels. No serious product uses this language in the interface.

The deeper issue: Social does not have a clear reason to exist as a primary navigation destination for the serious lifter target user. It currently occupies a top-level nav slot equal to Workouts and Schedule. It should be secondary — accessible but not primary nav.

### Program Builder / Detail — Production-ready

The Program Builder is the strongest competitive differentiator in the product. The cycle/day grid, progression rules, JSON import/export, and enrollment flow are meaningfully better than anything in Hevy or Strong.

Issues:
- The Program Detail page needs one clear, prominent Enroll CTA at top — the current layout buries it.
- The cycle grid uses very small text that becomes unreadable at 4+ cycles with 6+ days.

### ML Recommendation Layer — Needs redesign

The ML layer is currently invisible to the user as a system. "Generate My Week" is a button. Nothing communicates that the week generated is personalized to this specific user based on training history, reaction data, and recovery state.

MacroFactor's most successful design decision is making its algorithm visible — it tells you why a calorie target changed, what data it used, and what it expects to happen. Users trust MacroFactor because they understand the model is doing something real.

The current Generate Week flow produces a week with no explanation of why these specific workouts were chosen. It looks identical to what a random week generator would produce.

**Fix:** Before the user accepts a generated week, show three data points: (1) which muscle groups are emphasized and why, (2) how this compares to last week's volume, (3) one sentence on recovery status. This is the difference between "AI button" and "intelligent coach."

---

## Scientific Credibility Audit — 39/100

Would an advanced lifter trust its recommendations? Conditionally.
Would an engineer trust its data? Not at first glance.
Would a data-driven athlete believe it? Not on visual evidence alone.

The core problem: the visual language communicates "fitness app" rather than "analytics tool." Gradients, bright saturated purple, consumer-style cards, default Recharts — these signals conflict with the claim of being a scientific precision tool.

The RIR/RPE logging, the TDEE calculation, the fatigue management system, the program progression math — these are genuinely evidence-based features. They are being presented in a generic consumer UI that does not honor them.

---

## Mobile Quality Audit — 32/100

This is a web-first application. Mobile responsiveness exists but was not the primary design context.

Critical issues:
- `text-[8px]` and `text-[9px]` text is illegible on any display. Apple's minimum recommended tap text size is 11px.
- The ExerciseCard set logging table — with columns for weight, reps, RIR, volume, and a completion checkbox — is almost certainly not usable one-handed at the gym on a 375px screen.
- Hevy and Strong are designed thumb-first. Every input is in the bottom 60% of the screen. The current architecture does not appear to have been designed with this constraint.

If iOS native is a future goal, the workout logging screen needs to be redesigned from scratch with mobile-first constraints.

---

## Redesign Recommendations

### Immediate (1–2 days)

| Change | Location | Impact |
|---|---|---|
| Remove gradient from Dashboard heading | `Dashboard.jsx:669` | High |
| Replace Today's Workout gradient card with dark charcoal | `Dashboard.jsx:704` | High |
| Remove ALL CAPS from food names | `FoodTracker.jsx` | Medium |
| Define 3 button variants in `button.jsx`, stop using ghost + override | `components/ui/button.jsx` | High |
| Left-align Dashboard page header | `Dashboard.jsx:669` | Medium |
| Remove `text-align: center` from body | `index.css:22` | Medium |
| Hide public dislike count, keep ML signal | `Workouts.jsx` | Medium |

### Medium (1–2 weeks)

| Change | Impact |
|---|---|
| Replace Michroma as UI body font. Michroma stays for display/logo only. | Critical — root cause of typography chaos |
| Eliminate all 27 arbitrary `text-[Npx]` sizes in FoodTracker. Define 7-step scale. | High |
| Standardize border-radius to 3 values: 10px / 6px / 9999px | High |
| Redesign ExerciseProgressChart: remove dual Y-axis, add trend line, custom legend, remove default dots | High |
| Rebuild card system: one component with optional left-border accent prop, replace top-border variant | High |
| Make ML recommendation visible: show 3 data points in Generate Week modal | High |
| Replace `INTELLIGENCE FEED` / `ACTIVE NETWORK` labels with real UI copy | Medium |

### System-level (major upgrades)

| Change | Impact |
|---|---|
| Define and implement the Sisyphus design token system | Critical for scale |
| Full chart redesign with custom Recharts configuration | High |
| Mobile-first redesign of WorkoutDetail logging table for one-handed gym use | Critical for product-market fit |
| Reconsider Social as primary nav; move to secondary or nested section | Strategic |

---

## Sisyphus Design Language

**Visual Principles:**
- Everything on screen either conveys data or enables action. No decorative elements.
- Density is achieved through precision, not compression.
- The UI's job is to disappear. The user's data is the content.
- Trust is earned through restraint, not asserted through color.

**Typography:**
- Display / large metrics: Michroma (retain for logo and stat numbers only)
- UI text: IBM Plex Sans or Geist
- Numeric data: IBM Plex Mono or DM Mono
- Scale: 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36 (8 steps, nothing else)
- Weights: Regular (400), Medium (500), Semibold (600) only

**Color:**
- Background: `#f4f4f6`
- Surface: `#ffffff`
- Border: `#e5e5ea`
- Text primary: `#111118`
- Text secondary: `#636370`
- Text muted: `#9898a8`
- Brand purple: `#5d3cc7` (desaturated from current `#7c3aed`)
- Action dark: `#18181f` (replaces competing black buttons)
- Strength accent: `#5d3cc7`
- Cardio accent: `#d97706`
- Positive: `#16a34a`
- Danger: `#dc2626`
- Zero gradients

**Border Radius:**
- Surface/Card: `10px`
- Element/Button/Input: `6px`
- Pill/Tag: `9999px`
- Nothing else

**Charts:**
- Thin lines (1.5px), no fill areas, no dots unless on hover
- Subdued grid (`#e5e5ea` at 50% opacity)
- Direct labels; no legends where avoidable
- Trend lines over raw scatter
- Axes only where necessary

**Motion:**
- Page transitions: none
- State changes: 120ms ease-out only
- Loading: skeleton screens, not spinners on content areas
- No bounce, no spring, no decorative animation

---

## Competitive Positioning

Can this visually compete with MacroFactor, Hevy, Fitbod?

Not in its current state.

- **vs MacroFactor:** Feature set is comparable or better in several areas (program builder, social, Strava integration). Visual design is 3–4 years behind MacroFactor's level of polish. The gap is in typography, chart design, and restraint.
- **vs Hevy / Strong:** Logging interface is functionally competitive. Hevy's card design and type treatment are cleaner. The gap is closeable in weeks, not months.
- **vs Fitbod:** Muscle balance and recovery features are at least as good. Fitbod's dark-mode-first aesthetic is more compelling for the gym context. The gap is primarily font and color choices.

The feature gap does not exist. The execution gap does.

---

## Final Score

| Dimension | Score | Notes |
|---|---|---|
| Visual Polish | 44/100 | Font chaos, gradient overuse, no component system |
| Trustworthiness | 52/100 | Feature depth earns partial credit; visual signals undermine it |
| Scientific Feel | 38/100 | Default charts, decorative gradients, marketing copy in UI |
| Interaction Quality | 61/100 | Web architecture is competent; mobile is unproven |
| Mobile Quality | 32/100 | Web-first; not designed for thumb ergonomics |
| Premium Product Feel | 41/100 | Reads as indie project, not $50M software |
| **Overall** | **45/100** | |

---

## The Five Changes That Matter Most

In order of ROI:

**1. Fix the font.** Replace Michroma as the body font. This single change propagates to every screen. Everything becomes more legible, more trustworthy, and more professional. The arbitrary `text-[8px]` proliferation disappears as a side effect. Highest ROI change in the codebase.

**2. Remove every gradient.** All 14. The dashboard heading, the Today's Workout card, the banner. Replace with flat surfaces. Dark charcoal for the featured card, plain backgrounds for everything else.

**3. Build a real button system.** Three variants with semantic meaning, enforced through the component. Never override with `className` again.

**4. Fix the charts.** The progress section is where the app proves its scientific value. Custom Recharts configuration, trend lines, direct labels, no defaults left visible.

**5. Make the ML visible.** Three data points in the Generate Week modal explaining why this specific week was generated. This is the difference between "AI feature" and "intelligent system."

After those five: the app has the bones to compete. Right now it has the bones but they are not yet visible.
