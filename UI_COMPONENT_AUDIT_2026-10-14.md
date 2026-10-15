# OptiGainsOS UI component-library audit, 2026-10-14

Scope: every file under `src/pages` (27) and `src/components` (82) scanned by script (109 JSX/JS files, comment lines skipped), plus the library in `src/components/ui/**`. Read-only; no source touched.
Not re-reported (already in `UI_UX_AUDIT_2026-10-12.md` / `BRAND_UX_AUDIT_2026-10-14.md`): type-scale sprawl and `text-[Npx]` counts (P1/P2), `font-bold` weight overspend (P3), flattened radius scale (P4), toast voice/"successfully" copy (C1/C2), empty-state *copy* voice (C3), dock/FAB issues, light-theme contrast, stale teal comments, text glyph icons (T2), dock overlap, RIR pill width (UX #4). Where this audit touches the same area it adds the component-level count and the primitive to use.

Method note: counts are line-level regex hits from `/private/tmp/.../scan.py` style scanning; multi-line JSX tags were re-checked for the tap-target and raw-button numbers. Treat counts as +/-5%.

---

## 1. The library (what exists)

### 1a. `src/components/ui/*` (shadcn-style, barrel at `ui/index.js`)

| Primitive | File | Purpose / props | Real usage (outside ui/) |
|---|---|---|---|
| `Button` | button.jsx | `variant`: volt/primary/energy/coral (all = off-white action), ghost/dark/default/ai (glass), dim, outline, secondary, plain, destructive, coralGhost, link; `size`: default (h-11 md:h-9), sm (30px), lg, icon; `asChild` | 288 uses / 53 files |
| `IconButton` | IconButton.jsx | `icon`, required `label`, `glyph`=18, `variant` plain/glass; enforces 44px | **0 uses** |
| `Card` + Header/Title/Description/Content/Footer | card.jsx | `.glass` shell with padded slots | 62 Card, 60 CardContent; Description 0, Footer 1 |
| `Input` / `Textarea` / `Label` | input/textarea/label.jsx | h-11 field, 0.5px border, tabular-nums | 143 / 15 / 148 |
| `Select*` | select.jsx | custom (non-Radix) popover select, fixed z-[10001/10002] | 34 triggers / 11 files; Group, Separator 0 |
| `Combobox*` | combobox.jsx | in-flow searchable list | 5 uses / 4 files |
| `Dialog*` | dialog.jsx | portal, bottom sheet mobile / centred desktop, z-[10000], `hideClose`, `sheetMinHeight` | 54 / 29 files; `DialogFooter` 0 |
| `ConfirmDialog` | ConfirmDialog.jsx | `open,onOpenChange,title,description,confirmText,variant default/danger,loading,details` | 14 / 8 files |
| `Tabs/TabsList/TabsTrigger/TabsContent` | tabs.jsx | underline default, `variant="segment"` | 4 files |
| `Checkbox` | checkbox.jsx | `variant` coral/neutral, 16px box | 1 use |
| `Badge` | badge.jsx | variants volt/green/amber/red/slate (+legacy) | 37 / 19 files |
| `Skeleton` (+Dashboard/Workouts/ProfileSkeleton) | skeleton.jsx | `animate-pulse bg-charcoal-elevated` | Skeleton 11 / 4 files; 3 composite skeletons **0 uses** |
| `LoadingSpinner/LoadingScreen/LoadingSpinnerInline` | loading-spinner.jsx | 12px-border-b ring (`spin-loop`) | Spinner 7, Screen 12, Inline 0 |
| `AppCard` | AppCard.jsx | bg+border+`accent` stripe | **0 uses** (dead) |
| `ActionBar*` (sidebar.jsx) | sidebar.jsx | mobile drawer + sidebar kit | **0 uses** (dead, 137 lines) |
| `QuickAddMenu`, `ThemeToggle`, `UserAvatar` | | app-chrome pieces | 1 each (fine) |
| `toast` | `sonner` (Toaster in App.jsx) | not wrapped | 121 error / 83 success / 7 info / 2 warning |

### 1b. `src/components/ui/system/*` (Ledger system) and CSS classes

| Primitive | Purpose / props | Usage |
|---|---|---|
| `Module` | flat full-bleed `.surface` band; `label, detail, detailHref, onDetailClick, right, bleed` | 11 / 4 files |
| `SectionLabel` | `.section-label` micro header with optional icon/right | 3 / 1 file (vs 182 raw `section-label` references) |
| `Surface` | `.surface`/`.glass` div | **0** |
| `GlassHero` | glass card with accent stripe | **0** |
| `VerdictBanner` | readiness verdict line | **0** |
| `MiniRing` | hue ring (macros) | 1 |
| `SegmentedControl` | pill track, `options,value,onChange,size` | 6 / 4 files |
| `PosePillRow` | scroll pills, `variant` solid/chip | 3 / 1 file (PhysiqueTracker) |
| `ProfileStatsCard`, `TabCount` | Profile hub card, count badge | 2, 1 |
| `SubTabs` | section tab strip, `tabs,active,onChange,right,sticky` | 6 / 4 files |
| `MetricTile` | hue dot + value + delta cell (`.glass-inset`) | 7 / 2 files |
| `StatRing` | readiness ring | **0** (dead) |
| CSS: `.surface/.surface-2/.tile/.glass` (flat, r=0), `.glass-inset`, `.glass-elevated`, `.glass-sheet`, `.glass-brand`, `.glass-interactive`, `.row-stripe`, `.cta-action/.cta-coral` (48px), `.cta-ghost` (44px), `.pill-value(--sm)`, `.chip-gold`, `.data-row`, `.section-label`, `.hero-metric`, `.form-label` | class-level materials | `.glass` 283 raw class uses, `.surface` 61, `.glass-inset` 137, `.cta-*` 26 in 8 files |

Dead / duplicate summary: IconButton, AppCard, ActionBar kit (sidebar.jsx), Surface, GlassHero, VerdictBanner, StatRing, DashboardSkeleton/WorkoutsSkeleton/ProfileSkeleton, LoadingSpinnerInline, DialogFooter, CardDescription, SelectGroup/Separator are never rendered by any page/component. `Button` carries 12 variants for 6 distinct looks (`volt`=`primary`=`energy`=`coral`; `ghost`=`dark`=`default`=`ai`); `variant="primary"` still has 17 call sites, `"energy"` 1, `"secondary"` 5, `"dark"` 3.

---

## 2. Deviation classes, ranked by visual impact

Impact order = how many distinct surfaces a user sees it on x how visibly it breaks the Ledger look.

### D1. Hand-built buttons beside `Button` (impact: very high)
- Count: 252 raw `<button>` in 61 files vs 288 `<Button>`; 39 raw buttons painted brand/`cta-*` by hand; ~102 raw buttons carry no >=44px class.
- Top files: FoodTracker 53, ExerciseCard 30 (logger), WeeklySchedule 14, RecipeBuilder 10, WeeklyPlanCard 10, PrescribedSessionCard 10, Mind 8.
- Examples: `pages/Profile.jsx:388` (nav item built from `rounded-lg px-3 py-2 bg-brand/[8%]`); `pages/WeeklySchedule.jsx:360` (`<button className="cta-ghost text-xs px-4 py-1.5 min-h-[44px]">` overriding a primitive that already has height/size).
- Looks funny: three different corner radii (`rounded-lg` 10px vs `.cta` var(--r-control) vs `rounded-full`), different text weights (500/600/700) and press feedback (Button lifts -1px, raw ones do not) for the same "primary/secondary action" role; 36 vs 44px heights.
- Use: `Button` (`variant="volt"` primary, `"ghost"` secondary, `"plain"` chrome-free) or `IconButton` for icon-only. List-nav rows deserve a new `NavRow` (see section 4).

### D2. Segmented controls / chip rows / tab strips (impact: very high)
Six clusters of the same "pick one of N" widget, only 4 pages use the shared one:
1. `SegmentedControl` (system): Today 722/1017, Progress 238, WorkoutDetail 1533/2001, FoodTracker 2050.
2. `PosePillRow`: PhysiqueTracker 367/571/851 only.
3. `SubTabs`: Train, Fuel, Mind.
4. `TabsList`: Career 630, Workouts 321, Progress 698 (`glass-inset rounded-lg !justify-start` override), CalculatorsModal 284 (`rounded-xl border-b-0` override). Same widget, 3 hand-tuned looks.
5. Raw hand-rolled pickers (ternary active class on `<button>`): Workouts 550 (programView), Profile 614 (unit toggle, `aria-pressed`), RecoveryDetail 403 (`role="tab"`), WorkoutLoggingHeader 366 (`role="tab"`, `border-white/90`), ProgramDurationModal 133/196, CustomSplitSelector 118/210, WeekTemplateSwap 132, MealPlanIdeas 260 (day selector), FoodTracker 2205/2639, PhysiqueTracker 805, Mind 676, MuscleHeatMap 35 (own pill track with `border-white/10 bg-white/[0.05]`), TimedCameraCapture 165, WeeklyPlanCard 582.
6. One-off toggles: EquipmentProfileToggle 34 (`aria-pressed`, rounded-full chip), ExerciseCard 1211 (logger).
- Looks funny: active state is bg-track in one, brand tint in another, a white outline in a third; heights 36/40/44; radii full vs lg vs md.
- Use: `SegmentedControl` for 2-5 options, `PosePillRow variant="chip"` for scrollable filters, `SubTabs` for section nav. `TabsTrigger variant="segment"` should be removed in favour of SegmentedControl.

### D3. Hand-rolled chips / badges / status pills (impact: high)
- Count: 23 `rounded-full px-2 py-0.5` style pills plus 3 local helpers (`Chip` in WeeklySchedule.jsx:59, `STATUS_CHIP`/`CHIP_NEUTRAL` consts in Career/Mind, TSB pills TrainingLoadTab:134-137 built four times). 37 `<Badge>` exist.
- Examples: `components/dashboard/TrainingLoadTab.jsx:134-137` (four copy-pasted `text-xs font-bold px-2.5 py-0.5 rounded-full bg-ok/10 ...`), `pages/Mind.jsx:323/328/472` (`text-[11px] font-bold px-2 py-0.5 rounded-full border-[0.5px]`).
- Looks funny: three sizes (10/11/12px), border 0.5 vs 1px, `font-bold` vs `semibold`, some without border.
- Use: `Badge` (variants volt/green/amber/red/slate); count chips `TabCount`; gold deadline `.chip-gold`; value `.pill-value`.

### D4. Hand-rolled cards and panels (impact: high)
- Count: 283 raw `.glass`, 61 raw `.surface`, 137 `.glass-inset` class strings vs 62 `<Card>` / 11 `<Module>`; ~45 elements hand-compose `rounded-(lg|xl|2xl) border border-charcoal-border` + `bg-charcoal-surface*` (15 + 30). `Surface`/`GlassHero` never used.
- Top: FoodTracker 51 glass hits, AthleteState 47, RecipeBuilder 25, WeeklyPlanCard 23, WeeklySchedule 23.
- Examples: `pages/Supplements.jsx:448` (`rounded-2xl border-2 border-dashed border-white/10 glass-inset`), `components/nutrition/WeeklyPlanCard.jsx:486` (chip built from `bg-charcoal-s...`).
- Looks funny: `.glass` is r=0 but `rounded-xl` on a Card/AppCard-like div reintroduces 10px corners, so adjacent blocks have square vs rounded corners; `border-2 dashed` appears nowhere else.
- Use: `Module` for page bands, `Card` for inset cards, `.glass-inset` (via MetricTile) for cells.

### D5. Modals / sheets built outside `Dialog` (impact: high)
- Count: 7 bespoke overlays: `BarcodeScanner.jsx:129` and `TimedCameraCapture.jsx:115` (fixed inset-0 z-[10002], full-screen camera - legitimate but duplicate each other), `ExerciseCard.jsx:1727` (keypad/RIR sheet, `z-[70]`, `shadow-2xl`, own `rounded-t-2xl`; logger), `ExerciseCard.jsx:746` (context menu via createPortal z-[10200]), `WorkoutLoggingHeader.jsx:257` (dropdown z-[10200]), `Profile.jsx:1045` (fixed save bar z-[10000]), `ProgramDetail.jsx:278` (fixed CTA z-30). Sticky action bars are redone 6 ways: Career:58, CreateWorkout:483, PSTTracker:358, WeeklyPlanCard:783, StatsSetupModal:303, Profile:1045.
- `window.confirm`: `ExerciseCard.jsx:389` (logger), `FoodTracker.jsx:3402` (a native browser alert breaks the Ledger look) while `ConfirmDialog` exists with 14 uses.
- Looks funny: z-70 sheet sits below the dock's z-9999 chrome; native confirm is the only unstyled dialog in the app.
- Use: `Dialog`/`ConfirmDialog` for modals; a new `StickyActionBar` and `FullScreenCapture` shell (section 4).

### D6. Raw form controls (impact: medium-high)
- Count: 26 `<input>` (non-file ones about 18) in 14 files vs `Input` 143; 3 `<textarea>` vs `Textarea` 15; 1 `<select>` (`WeeklyPlanCard.jsx:638`; native picker on iOS looks nothing like `Select`); 13 `<label>` vs `Label` 148; 3 `<table>` (Lifts:137, Progress:527, WorkoutDetail:1908) each with different header sizes (11/12/14px, `text-[9.5px]` header in WorkoutDetail).
- Examples: `components/dashboard/MorningCheckin.jsx:321`, `pages/Today.jsx:143`, `pages/FoodTracker.jsx:1805` (`<label>` + `glass-inset` checkbox row), `components/PSTTracker.jsx:308-347` (5 `<label className="form-label">` instead of `Label`).
- Looks funny: field height/border/focus ring differ from `Input` (h-11, 0.5px border, 3px focus halo).
- Use: `Input`, `Textarea`, `Label`, `Select`; checkbox rows `Checkbox variant="neutral"` (only 1 use, FoodTracker uses `type="checkbox"` once at 4101). Range slider (`MacroGoalsEditor.jsx:156`) and file inputs are legitimate (hidden).

### D7. Progress bars hand-built 22 times (impact: medium-high)
- 22 `style={{ width: \`${pct}%\` }}` tracks: AthleteState 355/487/604/690/711, Today 758, FoodTracker 2090, Supplements 96, PSTTracker 81, ProgramDetail 340, ProgramCard 92, TodayActions 184, WeeklySchedule 827/857, MacroGoalsEditor 137-168, WorkoutLoggingHeader 323. No `role="progressbar"` anywhere (0).
- Looks funny: track heights h-1/h-1.5/h-2/h-3, track colours (`bg-track`, `bg-charcoal-elevated`, `bg-white/10`), fill radius, easing (some `duration-200`, some none), `opacity-90` on Today only.
- Use: new `ProgressBar` (section 4).

### D8. Loading and empty states (impact: medium)
- Spinners: 50 `Loader2` uses with 37 `spin-loop`/`animate-spin` mix (e.g. `FoodTracker.jsx:4131` and `OverrideProgramWorkout.jsx:82` use `animate-spin`; the remaining use `spin-loop`, which respects reduced-motion) at sizes 14/16/20/28/32px, vs `LoadingSpinner` (7 uses, 48px ring, different visual). Mixed: `LoadingScreen` 12 full-screen vs inline text "Loading…" (only 2).
- Skeletons: `Skeleton` 11 uses vs 35 raw `pulse-loop` blocks (ProgramDetail:95-100, BriefHistory:199 `h-[64px]`, Workouts:1000 `rounded-[20px]`). Skeleton uses `animate-pulse`, raw ones `pulse-loop`, so cadence differs.
- Empty states: 36 one-off `<p>No ... yet</p>` elements (class combos `text-sm font-semibold text-muted-2`, `text-xs font-semibold text-muted-2`, `text-sm font-extrabold`, `text-base font-semibold`), 2 local helpers (`ProgramsEmptyState` in Workouts.jsx:1213, `RecipeBuilder:201`), none shared.
- Use: `Button` with `loading` prop (see section 4), `Skeleton`, one `EmptyState`.

### D9. Hard-coded colours (impact: medium; high in logger)
- Hex: 32 literals in 4 files, 29 in `ExerciseCard.jsx` (`bg-[#1C1F23]` 270/277/1219, `#E5484D/#E2B84E/#7CC389/#6EA6DA` RIR ramps 279-282 and 1555-1558, `#12161C` 1185). These equal `--color-surface-2`, `--bad`, `--warn`, `--hue-green`, `--info` today and will not follow the light theme (`html.light`). Others: `MuscleHeatMap.jsx:52` (`bodyColor="#252C37"`).
- rgb()/rgba literals: 19 in 9 files (TrainingLoadTab 21/41/48/100/111, MacroGoalsEditor 100/109, MealPlanIdeas 447 `rgba(59,130,246,0.08)` = Tailwind blue, `primitives.jsx:86-90` verdict tones).
- Tailwind palette colours: 11 in 3 files: `DietPhaseCard.jsx:239-244` (`text-amber-800`, `bg-amber-600 text-ink`, ink on amber), `MealPlanIdeas.jsx:320/335/406/449/453` (`text-rose-500`, `text-green-600`, `bg-rose-50`), `ProgramDurationModal.jsx:229/250` (`border-amber-400`).
- Raw `white/black` with alpha: 22 (`FoodTracker.jsx:3483/3612`, `Coach.jsx:183`, `ExerciseCard.jsx:1736` `bg-white/20`, `WorkoutLoggingHeader.jsx:372` `border-white/90`, `Layout.jsx:403` `border-white/[0.08]`, `MuscleHeatMap.jsx:35`); these do not flip in light theme.
- Inline style colours: 25 in 16 files (WeeklySchedule 3, MetricTile 2, GlassHero). Mostly data hues passed as `var(--hue-*)` (acceptable).
- Why funny: MealPlanIdeas "close to goal" green (#16a34a) and rose fat label are different green/red from the Ledger `--ok`/`--hue-*`; amber boxes in DietPhaseCard look like another app; light theme leaves `#1C1F23` slabs.
- Use: `bg-charcoal-surface2`, `text-bad/warn/leaf/carb/fat`, `bg-leaf/20`; RIR ramp should become a shared helper mapping to `--bad/--warn/--hue-green/--info`.

### D10. Radius literals (impact: medium)
- 14 `rounded-[Npx]` in 4 files: ExerciseCard 265/1183/1218/1447/1467/1490 (8-9px), WeeklySchedule 529/535/772/777 (13px), Mind 739/801 (9/10px), Workouts 1000/1091 (20px). Plus the standard `rounded-*` family: 431 hits where lg/xl/2xl/3xl all resolve to 10px (see BRAND P4), so intent is unreadable.
- Looks funny: 13px and 20px cells appear next to 10px controls; `glass-elevated rounded-[20px]` on Workouts is the only 20px surface in the app.
- Use: `rounded-control` (10) and `rounded-pill`, `.glass-inset` radius via `var(--r-control)`.

### D11. Tap targets under 44px (impact: medium-high; ties to a11y floor)
- 47 `<Button size="sm">` (30px high; 6 callers add `min-h-[44px]`, ~41 do not, e.g. `Workouts.jsx:304/310`, `Career.jsx:83`, `Progress.jsx:250/500`).
- 53 other interactive tags with h-5..h-10 or min-h-[<44] and no 44 class (Mind 6, ProgramBuilder 5, WorkoutLibrarySidebar 5, RecoveryDetail 4).
- Logger-adjacent: `WorkoutLoggingHeader.jsx:244` (`min-h-[36px]` timer chip), 261/268/275/282 (`min-h-[40px]` menu buttons), `ExerciseCard.jsx:979` (`min-h-[28px]` link), 1218 (`min-h-[36px]` chip).
- Also `Button size="default"` is `md:h-9` (36px) and `size="icon"` `md:h-9 w-9`; fine on desktop but `h-9 lg:` overrides are repeated by hand (`WorkoutLoggingHeader:222/302`).
- Use: `Button size="lg"`/default with `min-h-[44px]` baked into `sm`, or `IconButton`.

### D12. Spacing off scale (impact: low-medium)
- Half steps (`-0.5/1.5/2.5/3.5`): 748 hits in 80 files (FoodTracker 71, ExerciseCard 49, WeeklySchedule 42, AthleteState 39).
- Odd steps (5/7/9/10/11): 130 in 35 files (AthleteState 24, WeeklyPlanCard 13).
- Arbitrary px spacing: 20 (Layout 12: `gap-[2px]`, `gap-[3px]`, `px-[18px]`, `pb-[18px]`, `gap-[11px]`, `px-[9px]`, `py-[5px]`, `pt-[22px]`; `button.jsx:92 px-[22px]`, `primitives.jsx:279 gap-[3px]`).
- Looks funny: 18px gutters (`Layout.jsx:471/558`) next to 16px page gutters (`px-4`), 11px gaps; hard to fix individually, collapse in a codemod: `1.5->2`, `2.5->3`, `3.5->4`, `[18px]->4`, `[11px]->3`.

### D13. Icon size / stroke inconsistency (impact: low-medium)
- 767 `w-N h-N` pairs across 87 files; sizes in use 2.5/3/3.5/4/4.5/5/6/7/8; `w-3.5 h-3.5` and `w-4 h-4` coexist in the same row (Module detail chevron 3.5 vs list chevrons 4).
- `strokeWidth` overridden in 30 spots in 12 files (TrainingLoadTab 9, ExerciseCard 5, Layout 3); default is lucide 2, `IconButton` 2, dock 1.7/2.
- Use: a small `Icon` size map (14/16/20/24) or `IconButton glyph`.

### D14. z-index wars (impact: low-medium)
18 `z-[N]` arbitrary + 25 `z-10..50`: scale is 9997 (strip) / 9998 (header, logging bar) / 9999 (dock) / 10000 (dialog, QuickAdd, Profile save bar) / 10001-10002 (select, full-screens) / 10200 (menus) plus `z-[70]` (ExerciseCard sheet) and `z-30/40/50` (ProgramDetail, sidebar, QuickAdd desktop). Two things at 10000 (`dialog.jsx:22`, `Profile.jsx:1045`); a Select inside a Dialog is only above because 10001 > 10000, and the keypad sheet at 70 is under the dock if ever shown without `data-logging-active`. Use named CSS vars (`--z-dock`, `--z-sheet`, `--z-popover`, `--z-camera`).

---

## 3. Clusters of identical widgets (hand-built 3+ times)

| Widget | Instances | Where |
|---|---|---|
| Section header (icon + title) | 3 local fns + 182 raw `.section-label` | Profile.jsx:29, AthleteState.jsx:298, PSTTracker.jsx:27 |
| Progress bar | 22 | list in D7 |
| Segmented/pill picker | ~20 raw | list in D2 |
| Status chip | 23 + helpers | D3 |
| Empty state | 36 + 2 helpers | D8 |
| Sticky bottom action bar | 6 | D5 |
| Spinner-in-button | 25 (`<Loader2 .../> Saving…` inside Button) | FoodTracker 3435/3686, MealTemplates 458/742/928, RecipeBuilder 1355/1505 |
| Inline "Retry" error block | 8+ | Career:83, Progress:250/500, WeeklySchedule:360 |
| 2/3-cell metric (`flex-1 glass-inset rounded-[13px]`) | 4 | WeeklySchedule 529/535/772/777 (MetricTile exists) |
| Full-screen camera overlay | 2 | BarcodeScanner:129, TimedCameraCapture:115 |
| Back/header row | multiple | pages with custom `h-12` toolbars |

## 4. Primitives that should exist (not yet in the library)

1. `ProgressBar` (`value, max, hue, size sm/md, label`; `role="progressbar"`).
2. `EmptyState` (`icon?, title, body, action?`) as proposed in BRAND C3.
3. `StickyActionBar` (safe-area + dock clearance + `glass-sheet`; slots left/right).
4. `Button loading` prop (replaces 25 hand-composed `<Loader2/> Saving…`).
5. `NavRow` / `ListRow` (icon, label, detail, chevron, active) for Profile menu, QuickAdd, Layout sidebar.
6. `Chip`/`StatusPill` extension of `Badge` with sizes (`sm` 11px, `md` 12px) and tone map (ok/warn/bad/info/neutral), absorbing Career/Mind/TrainingLoad helpers.
7. `FullScreenOverlay` shell for BarcodeScanner/TimedCameraCapture (camera chrome, close, z token).
8. `DataTable` (th/td type style) for Lifts/Progress/WorkoutDetail tables.
9. `Field` (Label + Input/Select + hint + error) wrapper used by ~30 forms.
10. Tokens, not components: `--z-*` scale, icon size scale, a `hueForRir()` helper.

---

## 5. Punch list

### 5a. Safe-mechanical (visual classes/imports only, no logic)
1. Delete dead primitives: IconButton (or adopt it, see 6), AppCard, sidebar.jsx ActionBar kit, Surface, GlassHero, VerdictBanner, StatRing, 3 composite skeletons, LoadingSpinnerInline, SelectGroup/Separator. Net -700 lines.
2. Collapse Button aliases: rewrite `variant="primary"` (17) and `"energy"` (1) to `"volt"`, `"secondary"` (5)/`"dark"` (3) to `"ghost"`; remove alias keys.
3. Replace 11 Tailwind palette uses (DietPhaseCard 239-244, MealPlanIdeas 320/335/406/449/453, ProgramDurationModal 229/250) with `warn/bad/leaf` tokens; swap `bg-[rgba(59,130,246,0.08)]` for `bg-carb/[0.08]`.
4. Replace 13 `rounded-[Npx]` outside the logger with `rounded-control`/`rounded-pill`.
5. Raw `<label className="form-label">` (PSTTracker x5, WeighInModal) -> `Label`; 3 raw `<textarea>`/1 `<select>` -> `Textarea`/`Select`.
6. Replace 35 `pulse-loop` placeholders with `Skeleton`; pick one pulse animation.
7. `animate-spin` -> `spin-loop` in 12 places (reduced-motion safety); standardise Loader2 to `w-4 h-4`.
8. Raise 41 `Button size="sm"` callers to `min-h-[44px]` or change `sm` to `h-11 md:h-8` in `button.jsx`.
9. Change `TrainingLoadTab` pills x4 and Mind/Career/Soreness chips to `Badge`.
10. Replace `window.confirm` in FoodTracker.jsx:3402 with `ConfirmDialog` (logic unchanged; Today.jsx hit is a comment).
11. Convert 3 local SectionHeader fns to `SectionLabel`.
12. Introduce `--z-*` tokens in index.css and replace literals outside Dialog/Select.
13. `bg-white/*`, `border-white/*` -> `border-charcoal-border`/`bg-track` (11 files).

### 5b. Needs a design decision
1. Single `SegmentedControl` vs pills vs underline tabs: which look wins for the 20 raw pickers, and drop `Tabs variant="segment"`.
2. `Button` size scale (44 everywhere vs 36 desktop) and whether `cta-action` (48px) stays alongside `Button lg` (44).
3. `EmptyState` anatomy (icon yes/no) and whether the dashed empty card in Supplements is legitimate.
4. `ProgressBar` thickness (one value or sm/md) and whether empty tracks hide at zero (BRAND P8).
5. Radius intent restoration: keep flattened scale or reintroduce md/lg/xl.
6. Card vs Module for inset blocks: which is canonical inside a page (283 raw `.glass`).
7. Spacing codemod target for 18px gutters in Layout (16 vs 20).
8. `Dialog` mobile sheet vs full-screen overlay for camera flows (shared shell).

### 5c. Logger files: hard constraint applies (visual classes only; never touch state, effects, session flag or finish handlers)

`ExerciseCard.jsx` (1828 lines), `KeypadSheet` (defined inside ExerciseCard.jsx:1570), `QuickWorkout.jsx`, `WorkoutDetail.jsx`, plus adjacent `WorkoutLoggingHeader.jsx`, `AddExerciseForm.jsx`:

| File | Findings |
|---|---|
| ExerciseCard | 30 raw buttons (620, 715, 755, 774, 791 ...), 4-8 raw inputs (1082, 1135, 1155, 1265: set cells), 29 hex colours (270/277/279-282/1185/1219/1555-1558), 6 `rounded-[8-9px]`, 7 sub-11px labels (927, 992 `9.5px`, 1048, 1130 `9px`, 1240, 1309, 1327), `min-h-[28px]` (979) and `min-h-[36px]` (1218) targets, `w-[26px] h-[26px]` glyph tiles (1447/1467/1490), `z-[70]` sheet (1727), `window.confirm` (389), `bg-white/20` handle (1736) |
| KeypadSheet (1570+) | portal div not `Dialog` by design (comment at 1511: Radix focus trap); keep, but tokenise colours and z-index only |
| QuickWorkout | 2 raw buttons, `text-[10px]` 754 and `text-[12.5px]` 755, 6 sub-44 targets, 9 half-steps |
| WorkoutDetail | 2 raw buttons, 2 raw labels (1878, 2123), 3 half-pixel sizes (87 `13.5px`, 1911-1913 `9.5px`), raw `<table>` 1908, 28 `text-[Npx]`, 4 sub-44 |
| WorkoutLoggingHeader | `min-h-[36px]` 244/302, `min-h-[40px]` 261-282, `border-white/90` 372, `z-[9998]` 187, `z-[10200]` 257 |

Safe in logger: colour hex -> tokens (same values), `rounded-[9px]` -> `rounded-control`, `text-[9.5px]`/`[9px]` -> 11px. Ask first: converting set-cell `<input>` to `Input` (focus/selection behaviour tied to KeypadSheet `fresh` buffer), swapping the keypad sheet to `Dialog`, and anything touching `aria-pressed` toggles at 1211/760.
