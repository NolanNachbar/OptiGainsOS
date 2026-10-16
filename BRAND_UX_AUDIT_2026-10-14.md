# OptiGainsOS Brand + UX audit: "make it ultra premium" — 2026-10-14

Read-only. Nothing in `src/` was touched. Not repeated here: the dock overlap, Analyze orphaning, RIR pill width, logger chrome-before-content, keypad findings (`UI_UX_AUDIT_2026-10-12.md`, `LOGGING_UX_AUDIT_2026-10-13.md`, `KEYBOARD_TYPING_AUDIT_2026-10-13.md`).

Method note: each "lens" below is a *method* applied to this codebase, not a statement by or attributed to any named practitioner. Evidence: `src/index.css`, `tailwind.config.js`, `public/*`, `src/components/Layout.jsx`, a grep sweep of user-facing strings, and simulator PNGs in `ios-sim/out-uiux/sweep/` (04 Today, 06 Train, 11 Fuel, 18 Body). Contrast ratios are computed (WCAG relative luminance), not eyeballed.

---

## 1. Verdict

The product is a deterministic, explainable engine, but it presents itself as a generic dark fitness tracker. The interior has a real, disciplined system ("Ledger": flat modules, one off-white action colour, one easing, hue-owned data). The identity layer was never updated to match it. The logo, app icon and PWA chrome still speak the *previous* teal-and-coral "CLEAN" language, the app name is spelled four ways, the voice flips between engineered ("Engine's plan", "Intake vs pace") and cheerleading ("Workout logged successfully!", "Congratulations!"), and the type scale is a pile of 25 arbitrary pixel sizes. What the brand says now: "a tidy dark macro tracker." What it should say: "an instrument that shows its working." Premium here means quieter, more exact and more consistent, not more decorative.

---

## 2. Proposed position and three principles

**Position:** *OptiGains is the training instrument that shows its working.* Every number has a reason, every recommendation is traceable to the engine, nothing is performed at you.

1. **Show the working.** Any engine-originated number or instruction carries its basis in one line ("Deload 242.5: e1RM down 3 sessions"). Reasoning is the luxury, not animation.
2. **One voice, flat and exact.** Declarative, past tense for logs, no exclamation marks, no "successfully", units always present. The app speaks like a lab notebook that happens to be kind.
3. **Restraint is the finish.** Off-white is the only action colour, hue means a datum, and every size, radius and weight comes from a short named scale. If a thing needs a new colour, size or icon, it is probably the wrong thing.

---

## 3. Findings by lens

### 3a. Brand-identity lens (meaning, system, restraint, ownable marks)

**B1 [High] The mark contradicts the system it sits in.**
Evidence: `public/optigains-logo.svg` (teal gradient `#7FE9DD`→`#3DB8AE` arc + coral `#EF7368` dot), `public/optigains-icon.svg` (adds teal/coral radial glows on `#0A0D12`); versus `src/index.css:44-48` ("Off-white — THE action color (no brand hue, Ledger)") and `Layout.jsx:115-116` ("no brand hue"). The header sits a 28px teal/coral ring beside a neutral all-caps wordmark; it is the only gradient and the only coral dot in the chrome.
Why non-premium: a brand with one colour rule that breaks it in the logo reads as unfinished. The coral dot also collides with the data law "coral = protein/RHR" (`index.css` SYS-09d): the logo literally wears a datum's hue.
Fix: recolour the ring to the system: track `rgba(236,238,241,0.14)`, arc solid `#ECEEF1` (no gradient), live-edge dot `#ECEEF1` or teal `#5EDCD2` only (teal is "readiness", which is what the ring depicts, so it is the one defensible hue). Icon background `#0B0C0E` flat, delete both radial glows. Regenerate `icon-192/512`, `apple-touch-icon`, maskable PNGs from it.

**B2 [Med] The ring reads as "generic progress ring".**
A 82% arc with a dot is Apple Fitness/Oura vocabulary; nothing in it says "engine" or "explained". An ownable alternative that is also minimal: the same ring with a single short radial tick at the arc end (a "reading", like an instrument needle), or the arc ending in a flat butt cap instead of round (`stroke-linecap="butt"`) so it reads as a gauge, not a loading spinner. Cheap, and it sets the mark apart from every round-capped fitness ring.

**B3 [Med] Name spelled four ways, plus a dead brand.**
- `index.html:29` title "OptiGainsOS — Personal Performance OS"
- `manifest.json` name "OptiGainsOS", short_name "OptiGains", description "Your personal human performance operating system."
- `Layout.jsx:119` wordmark "OPTIGAINS" (CSS-shouted)
- `Logo.jsx:6` alt "OptiGains"
- `public/vektor-logo.svg|png` (a lime `#BAF90C` hand-traced 500px path, a different brand entirely) still used as the push-notification icon and badge (`src/hooks/usePushNotifications.js:85-86`) and as an export key (`vektor_version` in `src/utils/programIO.js:30`, `WorkoutCard.jsx:77`).
Why it matters: a notification is the app's most-seen surface after the home screen, and it shows a lime logo of a product that no longer exists.
Fix: pick **OptiGains** as the product name everywhere user-visible (drop "OS"; "Personal Performance OS" is a tagline, not a name). Title `OptiGains`; manifest `name` "OptiGains", `short_name` "OptiGains", description "A training engine that shows its working." Point push icon/badge at `icon-192.png` (badge should be a monochrome silhouette: render the ring alone at 96px white-on-transparent). Delete `vektor-logo.*`. Keep `vektor_version` JSON keys (import compatibility), just comment them as legacy.

**B4 [Low] Manifest/theme colour drifted from the field.**
`manifest.json` `background_color`/`theme_color` and `index.html:38` = `#0A0D12`; the actual page is `--color-bg #0B0C0E`. Cold-start splash and status bar are a different black from the app (a visible 1-step seam on OLED during launch). Fix: set all three to `#0B0C0E`.

**B5 [Low] Stale comments describing a teal brand.**
`index.css:749`, `ConfirmDialog.jsx:50`, `TodayActions.jsx:11`, `AthleteState.jsx:349` still say "teal `#19C8A6` is THE action color". A new contributor (or a future Claude session) will "fix" the app back to teal. Fix: one-line comment edits.

### 3b. Content-structure lens (consistency, naming, voice that works at every size)

**C1 [High] Voice is inconsistent: instrument vs cheerleader.**
Good, on-brand: "Engine's plan", "Intake vs pace", "Pause keeps your progress and frees the schedule.", "Your athlete state refreshes automatically each morning" (screenshot 18).
Off-brand, from the same grep: `"Workout logged successfully!"` (`WorkoutDetail.jsx:1026`, `QuickWorkout.jsx:463`), `"Program completed! Congratulations!"` (`WorkoutDetail.jsx:1013`), `"Food logged successfully!"`, `"Recipe created!"`, `"Template saved!"`, `"Profile saved!"`, `"Stats saved and goals calculated!"`, `"Logged ✓"` (`FoodTracker.jsx:1249`), `"Nice work."` (`PhysiqueTracker.jsx:399`), "Workout logged! (Progression update failed)". About 20 toast strings end in `!`, and 4 use "successfully". The finish recap toast already does it right ("Workout logged / 1 set · 1,080 lbs volume · 4 min").
Why non-premium: exclamation marks and "successfully" are the tell of a template app; the recap-style toast is the voice to copy.
Fix (rules plus rewrites): no `!`, no "successfully", no emoji/check glyphs in strings; name the object and one fact.
- "Workout logged successfully!" -> "Workout logged · {n} sets · {volume}"
- "Program completed! Congratulations!" -> "Program complete · {n} workouts over {w} weeks"
- "Food logged successfully!" / "Logged ✓" -> "Logged · {name} · {kcal} kcal"
- "Profile saved!" -> "Profile saved"
- "Stats saved and goals calculated!" -> "Targets recalculated from your stats"
- "Nice work." -> remove (the "All 4 poses captured" already confirms).
- "Workout logged! (Progression update failed)" -> "Workout logged · progression will retry" (state what the system will do, not the failure).

**C2 [Med] Errors blame the app in four phrasings.**
"Failed to save/delete/update/log" (about 25), "Couldn't ..." (11), "Something went wrong fetching your workout history", "Couldn't load data". No next step in any.
Fix: one pattern, "Couldn't {verb} {object}. {What happens next / what to do}." e.g. "Couldn't save workout log. Your sets are still on this phone; retry." (also reinforces the never-lose-a-workout promise, which is the product's strongest trust claim and is currently invisible). Pick "Couldn't" (the warmer, already-majority form) and retire "Failed to".

**C3 [Med] Empty states: three voices and weights.**
Samples: "No PST data yet." (muted-2, semibold), "No logged sets for this lift yet", "Nothing in the library matches that.", "No actions yet, tap + to add one", "No shots yet." (`font-extrabold`), "No networking contacts yet." Note `text-sm font-extrabold` vs `font-semibold` vs plain for the same job. The best one is the Body empty state (screenshot 18): title, one explanatory sentence, three actions. Others are a bare grey sentence.
Fix: single `EmptyState` contract: title (15px/600 `--text-primary`), one line stating *why it is empty and what fills it* (13px `--text-muted`), at most one action. Rewrite pattern: "No HRV yet. Appears after the first night your device syncs." Not "No HRV data yet." Also standardise the "yet" comma splice ("No actions yet, tap + to add one") to a full stop.

**C4 [Med] Naming of the fourth tab is two things.**
Dock says "Body" (`Layout.jsx:58`), URL `/athlete-state`, page component `AthleteState`, empty state says "athlete state", and Fuel also has a "Body" sub-tab (`Layout.jsx:53`). Two different "Body"s. Fix: rename the dock tab "State" (matches its first sub-tab "State" and engine vocabulary) or rename Fuel's sub-tab "Weigh-ins". Prefer the first: "State" is the product's most ownable noun and is currently hidden.

**C5 [Low] "OPTIGAINS" shouting and mixed casing system.**
`uppercase` appears 121 times (section labels, tabs, wordmark) next to Title Case buttons ("Log a workout") and sentence case labels ("Weight trend · 30 days"). Screenshot 06/11: the sub-tabs (SCHEDULE / LIBRARY, NUTRITION & MEALS) are tracked caps, while the module titles right below are sentence case. Fix: caps only for the micro-label tier (<=11px, `tracking 0.08em`); everything tappable and every title in sentence case. Move the sub-tab strip to sentence case 13px/600.

**C6 [Low] Orphan units/labels.** Today shows "8 ex · 15 sets" and "0/7 Workouts" with a caption that is truncated ("Today's quick workout isn't part of the program we..." per kbd audit #9). "ex" is not a word; use "8 exercises · 15 sets".

### 3c. Product-craft lens (Linear/Oura/Whoop/Apple-HIG-grade polish)

**P1 [High] No type scale: 25 arbitrary pixel sizes.**
Evidence (count of `text-[..px]` in src): 11px x109, 10px x105, 13px x67, 9.5px x29, 12px x29, 15px x23, 10.5px x15, 14px x11, 17px x9, 9px x8, 22px x7, 12.5px x7, plus 20/34/26/24/13.5/11.5/28/18/56/40/32/30/19 — and Tailwind `text-xs` x532 / `text-sm` x352 on top. Half-pixel sizes (9.5, 10.5, 11.5, 12.5, 13.5) are fine-tuning individual screens, which is exactly what a scale exists to prevent.
Why non-premium: adjacent text differing by 0.5px is perceived as "slightly off" without being identifiable; it is the single largest source of the "assembled, not designed" feel.
Fix: a 7-step scale as tokens, collapse by nearest neighbour:
`--t-micro 11px/14 (caps, 0.08em)`, `--t-caption 12px/16`, `--t-body 14px/20` (already body), `--t-emph 15px/20 600`, `--t-title 17px/22 600`, `--t-display 28px/32 700 tabular`, `--t-hero 44px/44 700 tabular`. Map: 9, 9.5, 10, 10.5, 11, 11.5 -> 11; 12, 12.5 -> 12; 13, 13.5, 14 -> 14; 15 -> 15; 17-20 -> 17; 22-34 -> 28; 40-56 -> 44. Do it by Tailwind `fontSize` config + codemod, screen by screen.

**P2 [High] Sub-11px text is the default chrome, not the exception.**
Dock labels `text-[9.5px] font-bold` (`Layout.jsx:371`); 29 uses of 9.5px, 8 of 9px, 105 of 10px. iOS minimum legible UI text is 11pt. Contrast is fine (faint `#838A94` on surface-2 `#1C1F23` = 4.75:1) but size is not. Fix: dock label 11px/600 `tracking 0` with icon 22px; there is room (dock is 56px tall, 5 slots at ~64px each). A 3-letter-wide label at 11px fits "Today/Train/Fuel/State".

**P3 [Med] Weight is over-spent: 377 `font-bold`/`extrabold` usages.**
Screenshots 04/11: nearly every label is the same heavy weight, so hierarchy has to come from size alone. Premium type systems use two weights (400/600), with 700 reserved for numerals. Fix: global rule `font-bold`/`font-extrabold` -> 600 outside numerals via Tailwind `fontWeight` config (`bold: 600, extrabold: 600`); numerals keep 700 through `.hero-metric`. One config line gives the whole app a quieter, more expensive texture, with no JSX edits.

**P4 [Med] Radius scale is flattened, then re-opened ad hoc.**
`tailwind.config.js` maps sm 8, DEFAULT/md 9, lg/xl/2xl/3xl all 10, so `rounded-2xl` and `rounded-lg` are the same value (22 + 123 + 82 callers expressing intents that no longer exist), and `.surface/.glass` are forced to 0. But the pills, dock and desktop sidebar (`rounded-3xl`, `Layout.jsx:380`, which is now 10px) and inputs carry their own radii (`rounded-[13px]`, `[20px]`, `[9px]`), and in the screenshots corners of controls (Start, Log, segmented control) are visibly rounder (about 14-16px, full pill) than the 10px design intent. Result: modules are square, controls vary. Fix: three radius tokens only — `--r-module 0`, `--r-control 10px`, `--r-pill 9999px` — and replace the five Tailwind keys with exactly those; delete the `[9px]/[13px]/[20px]` literals.

**P5 [Med] Primary-action buttons are inconsistent in size and clip their labels.**
Screenshot 04: "Start" is a white pill (about 78x102 px at 1x display, text touches both edges, no horizontal padding visible), "Log" is a different white rounded square; Fuel's "Copy a day" and "Intake stats" are outlined 10px rects; Train's "Use a template" outlined; "Edit" ghost. Three shapes of the same action colour. Fix: one `Button` geometry: height 44, padding-x 20, radius `--r-control`, label 15/600; primary = off-white fill; secondary = 1px `--glass-edge-strong` (`#3A4048`) border; never icon-only for primary.

**P6 [Med] Header band stack on tab pages.**
Screenshot 06 (Train): title+date row, then an "Active program" card whose bottom edge is clipped by the sub-tab strip (the card's lower border is cut at the strip), then a week navigator, then "Engine's plan" row, then the list: five bands before content. Screenshot 11 (Fuel): header, tab strip, date row, Recent, week bars, then data. Each band has a different background (`#0B0C0E` vs `#141619` vs `#1C1F23`) and padding. Fix: put the sub-tab strip directly under the title (one band), fold "Active program · Edit" into the title row's subtitle (replace the date there), and give every band `px-4 py-3` with a single `--color-border` rule between.

**P7 [Low] Dashed outlines on empty week bars.**
Screenshot 11: seven dashed-top boxes all reading "0". Dashes plus zeros plus today-outline is three signals for "nothing". Fix: render an empty day as a 2px baseline tick in `--color-track` with no number; show the number only when > 0.

**P8 [Low] Empty progress tracks read as a broken chart.**
Screenshots 04/11: kcal/macro bars are identical grey tracks with "1,800 left", since nothing is logged. At the first hour of the day this is every user's first impression of Today. Fix: when consumed is 0, show targets as the value ("1,800 kcal · 247 P · 25 C · 63 F target") in a single line and hide the four empty bars.

**P9 [Low] Light theme fails contrast at the text tiers.** (Light is secondary but exists and ships a toggle.)
Computed on `#FFFFFF` / `#EEF0F3`: `--text-muted` rgba(23,27,34,.55) = 3.86 / 3.72:1; `--text-faint` .40 = 2.50 / 2.44:1 (both fail 4.5:1; faint fails even 3:1). Hues on white: teal 2.95, coral 3.55, green 3.44, yellow 3.56 (fail as text). Fix: `--text-muted` alpha .66 (about 5.4:1), `--text-faint` alpha .52 (about 4.6:1); hue-as-text uses a darker `-text` step (teal `#0E7F76`, coral `#B8452F`, green `#3A7A47`, yellow `#7F5F12`) or only appears as fills.

### 3d. Data-visualisation lens (Tufte-style data-ink)

**D1 [Med] The weight chart has noise marks that are not data.**
Screenshot 04 "Weight trend · 30 days": a trend line plus detached grey dots above and below it (outliers/raw points?), no axis, no min/max labels, the end point is the only emphasised mark. The dots floating at 1000-1060px (display) with no scale make it unreadable as data. Fix: raw weigh-ins as 2px `--viz-5 #4A5058` ticks *on* the trend's x positions, trend line 1.5px `--viz-1`, label only first, last and min/max values (11px `--text-muted`), no gridlines. Add the delta ("−0.7 lb / 30 d") next to 191.1 so the chart's conclusion is stated, not implied.

**D2 [Med] Chart context colour fails as data-ink.**
`--viz-5 #4A5058` is 2.40:1 on bg, 2.23:1 on surface, so the "context series" is below even the 3:1 non-text minimum. Fix: `#6B727C` (about 3.7:1 on `#141619`) for any series that must be read; keep `#4A5058` only for gridlines/axes.

**D3 [Low] Macro hues repeated as text, not once as a key.**
Fuel "Recent" chips print "P 94g · C 0g · F 13g" with a coloured letter and a coloured value, repeated on every chip; plus the same hue on the summary labels. Coloured *letters* are legend and need only appear once; zero values ("C 0g", "F 0g") are ink spent on absence. Fix: show only non-zero macros, in `--text-muted`, with a 6px hue dot instead of a coloured letter.

**D4 [Low] Border/rule is 1.23:1 against surface** (`#25282D` on `#141619`) — correct for a hairline (deliberate), but `--glass-edge-strong #3A4048` at 1.73 is what buttons/inputs use; controls with 1.2-1.7:1 edges are below the 3:1 UI-component minimum on the empty "Log a workout"/"Recovery" outlined buttons (screenshot 18). Fix: control borders `#4B525C` (about 2.6:1) or give controls a filled `--color-surface-2` face (14.2:1 label contrast already) so the shape is carried by fill, not stroke.

### 3e. Motion/haptics lens

**M1 [Med] Motion rules are documented and not enforced.**
`index.css` states "one easing, 180-320ms", but the nav alone uses `transition-colors duration-200 [transition-timing-function:var(--ease)]` copy-pasted into every className (`Layout.jsx:362,394,411`). Any Tailwind default `transition-*` without that suffix ships 150ms cubic-bezier(.4,0,.2,1). Fix: set `transitionTimingFunction.DEFAULT` and `transitionDuration.DEFAULT` in `tailwind.config.js` to `cubic-bezier(.2,.7,.3,1)` and `200ms` so the rule becomes the default, then delete the repeated suffixes over time.

**M2 [Med] No haptic or confirm moment at the product's central action.**
Completing a set, finishing a workout and logging food produce a toast but no tactile confirm. On iOS PWA `navigator.vibrate` is unavailable, so haptics are not possible there; the substitute is a 120ms check-mark scale (1 -> 1.12 -> 1, `--ease`) and a one-frame row background flash `rgba(var(--hue-green-rgb)/.12)` on the completed set. Premium apps tell you "it landed" in the element you touched, not in a toast at the top. Cosmetic only if scoped to the set row's *visual* state (see punch list note on logger).

**M3 [Low] Toasts are stacked top and bottom?** Toast tokens exist for header offset and `--dock-total-height` (bottom-centre). Pick one position (bottom, above dock) and one maximum visible (1). Several quick log actions currently queue; show the latest and replace.

### 3f. Additional lens: Trust and explanation (the engine's reasoning made visible)

**T1 [High] The product's differentiator is the least visible thing.**
The engine "computes" a plan; the UI shows "Engine's plan" in muted caption (screenshot 06, 13px, `--text-muted`) and "Session: W2 Thu - Light Squat, Heavy Bench" (04) with no reason. The deload card is the one place reasoning shows ("e1RM trending down over 3 sessions"), and it is floating (already filed). Everywhere else numbers arrive unexplained.
Fix: a consistent "basis" line under any engine-set value: 12px `--text-muted`, 1 line, format `Basis: {metric} {direction} {window}`, e.g. under today's session "Why this: ACWR 0.9, bench e1RM +2.1% over 3 sessions". Same row can carry the freshness stamp that currently exists only on `EngineStatusCard` ("Computed 6h ago", with a literal `⚠` glyph at `EngineStatusCard.jsx:48` — replace with the Info/AlertTriangle icon so it matches the Lucide set).

**T2 [Med] Glyph characters mixed with the icon set.**
Lucide throughout (80 files), but text glyphs `✓`, `✕`, `⚠`, `·` as icons in `ExerciseCard.jsx:1728,1767`, `FoodTracker.jsx:1249`, `EngineStatusCard.jsx:48`. Glyphs render in the system font at a different weight/size than 1.7-stroke Lucide. Fix: replace with `<Check/>` `<X/>` at `w-4 h-4 strokeWidth 2`; keep `·` as separator (it is typography).

### 3g. Additional lens: Icon/System-coherence lens (iconography and chrome)

**I1 [Med] Stroke weights differ between states.** Dock icons switch `strokeWidth` 1.7 -> 2 on active (`Layout.jsx:368`) which causes a perceptible optical "bump" along with the pill fill. Premium convention: keep stroke constant, change fill/ink. Fix: strokeWidth 1.75 always; active = ink `--text-primary` + pill `rgba(var(--color-brand-rgb)/0.12)` (currently `.18`, which in screenshot 04 is a heavy grey block that competes with the FAB).

**I2 [Low] The FAB and the dock's active pill are two competing white-ish objects.**
Screenshot 04: a 100px white circle in the dock's centre with a dark `+`, while active tab is a grey slab. The FAB is the loudest object on every screen, including screens where "add" is not the job. Fix: FAB 48px (it is already specified as 48px in `--fab-clearance`; the render appears about 70px), surface `--color-surface-2` with 1px `#3A4048` ring and off-white `+`, and reserve the solid off-white fill for the logger's primary action. The point is: one filled-white object per screen.

---

## 4. Prioritised punch list (premium-feel per unit effort)

Legend: **C** = cosmetic/safe (no logic, no logger state), **L** = touches or sits near the logger; handle visually only, never change state/effects/session flag.

| # | Change | Where | Measured value | Effort | Type |
|---|---|---|---|---|---|
| 1 | Unify product name to "OptiGains"; kill Vektor icon in push; fix manifest/theme colour | `index.html:29`, `manifest.json`, `usePushNotifications.js:85-86`, delete `vektor-logo.*` | theme/background `#0B0C0E` | 20 min | C |
| 2 | Recolour logo + icon to the Ledger system, butt-cap gauge, regenerate PNGs | `public/optigains-*.svg`, `icon-*.png`, `apple-touch-icon.png` | arc `#ECEEF1`, track `rgba(236,238,241,.14)`, bg `#0B0C0E` | 1-2 h | C |
| 3 | Voice pass on toasts: drop `!`, "successfully", glyphs; recap format; one error pattern | ~60 strings (C1, C2) | rules in C1/C2 | 2 h | C (strings only; `WorkoutDetail`/`QuickWorkout` toast text is a string literal, no logic touched) |
| 4 | Weight scale: map `bold`/`extrabold` to 600 outside numerals | `tailwind.config.js` `fontWeight` | 600 / numerals 700 | 15 min | C |
| 5 | Type scale tokens + collapse sub-11px and half-pixel sizes | `tailwind.config.js`, codemod `text-[9.5px]` etc. | 11/12/14/15/17/28/44 | 3-4 h, screen by screen | C, except logger files (`ExerciseCard.jsx`, `KeypadSheet`): do last, visual classes only |
| 6 | Dock: 11px/600 labels, constant 1.75 stroke, pill `.12`, FAB 48px outlined | `Layout.jsx:362-372`, `FloatingActionButton.jsx` | see P2, I1, I2 | 1 h | C (dock is hidden during logging via `body[data-logging-active]`, so it does not affect the logger) |
| 7 | Rename dock "Body" -> "State"; align empty-state copy pattern (C3) | `Layout.jsx:58`, empty-state strings | n/a | 1 h | C |
| 8 | Motion defaults in Tailwind config (200ms, `cubic-bezier(.2,.7,.3,1)`); single toast slot | `tailwind.config.js` | 200ms | 20 min | C |
| 9 | Show engine "Basis:" line under the day's session and under any engine-set number | Today session card, Train "Engine's plan" | 12px `--text-muted` | 3 h | C for Today/Train; **L** if placed inside the logger header: do not, keep it on the pre-workout cards |
| 10 | Today empty-state: replace four empty bars with a target line at 0 intake; empty week-bars as baseline ticks | `Today` nutrition card, Fuel week bars | P7, P8 | 1.5 h | C |

Deliberately *not* in the top 10 because they touch behaviour: set-completion check animation (M2) and finish-prompt wording live in the logger; do them only as CSS on the already-rendered row, and never alter `workoutSessionFlag`, `useWorkoutSession`, or the finish handlers.

Sequence that gives the biggest visible jump in a day: 1, 4, 8, 3, 6 (about 4 hours, zero risk), then 2, then 5.

---

## 5. What is already good and should be protected

- **The Ledger palette and ink ladder.** Computed: primary `#ECEEF1` 16.8:1 on bg, secondary 11.9, muted `#959CA6` 7.07, faint `#838A94` 5.62 on bg and 4.75 on surface-2. Every dark text tier passes AA on every surface except `faint` on `--color-elevated` (4.47, just under) — bump `--text-faint` to `#8A919B` if elevated menus use it. The documented history of the faint bump shows contrast being measured, which is rare.
- **Colour law (SYS-09).** One action colour, one destructive hue, each datum owning one hue. That is a genuine brand idea; the audit above only asks the logo to obey it.
- **Flat modules with a rule and an 8px gap.** No shadows, no nesting: exactly the restraint that reads as expensive. Do not add cards, glows or gradients "to lift" the UI.
- **Tabular numerals and the hero-number approach** (screenshot 04 "191.1 lbs", Fuel "1,800 left").
- **The one-easing/180-320ms doctrine** and the 8px rise entrance; it just needs to be the default (M1).
- **Safe-area, keyboard-inset and dock-clearance tokens** (`--floating-chrome-bottom`, `--keyboard-inset`): sophisticated, unglamorous, correct.
- **The Body empty state** (screenshot 18): title, one honest sentence about the daily refresh, three actions. Use it as the template for C3.
- **The recap toast, "Pause keeps your progress and frees the schedule.", and the RIR-0 follow-up "Where did it stall?"**: these are the product's real voice. Match everything else to them.
- **Never-restart logging guarantee** (`CLAUDE.md`): the strongest trust claim the app can make; surface it in copy (C2), never in code changes.
