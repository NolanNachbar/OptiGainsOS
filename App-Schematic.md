# OptiGains Mobile OS: Exhaustive Schematic Diagram (Engine Edition)

This schematic defines the complete structural, functional, and navigational architecture of the OptiGains mobile application. It merges the **Stealth Fitness OS** (training, mind, career) with a **Dynamic Metabolic Engine** (expenditure tracking, weight trending, and coached macro adjustments).

---

## 1. Global Navigation Architecture
**Pattern:** Fixed Bottom Tab Bar (5-slot)
1. **Dashboard** (The Engine Room)
2. **Train** (Strength & Endurance)
3. **Log** (Unified Intake Hub)
4. **Analysis** (Trends & Vault)
5. **System** (OS / Coach / Settings)

---

## 2. Page & Component Hierarchy

### [1] DASHBOARD (The Metabolic Grid)
**Primary View:** High-density 2-column tile grid.
- **Header:** `UserAvatar` | `CurrentPhase` (e.g. "Build") | `DailyBriefBtn` (Triggers AI Brief Modal)
- **TILE: Expenditure Engine**
  - *Data:* Live Calculated TDEE (e.g., 2,845 kcal).
  - *Visual:* Tiny sparkline showing metabolism trend over 30 days.
- **TILE: Trend Weight**
  - *Data:* "True Weight" (Smoothed average) vs. Scale Weight.
  - *Action:* Tap to open `WeightDeepDive.jsx`.
- **TILE: Today’s Mission**
  - *Content:* Scheduled BUD/S workout + Key Lift.
  - *Action:* `Start` (Launches `WorkoutDetail.jsx`).
- **TILE: Nutrition Snapshot**
  - *Content:* P/C/F progress bars + Calories remaining.
  - *Source:* Auto-updated from the `Log` hub.
- **TILE: Readiness Score**
  - *Data:* Composite score from HRV, Sleep, and Body Battery.
- **TILE: Energy Balance**
  - *Visual:* Current surplus/deficit relative to TDEE.

---

### [2] TRAIN (The Grinder)
**Primary View:** Active Program at top, Library below.
- **SUB-PAGE: Program Detail**
  - Calendar view + Progression targets (Weight increments per session).
- **SUB-PAGE: Workout Detail (The Grinder)**
  - `WorkoutLoggingHeader`: Elapsed time, Tonnage, Live HR.
  - `ExerciseCard` List:
    - *Per Set:* Weight, Reps, RPE (1-10 slider), Rest Timer (15-20s auto-start).
    - `AddExerciseForm` / `ReplaceExerciseModal`.
  - `FinishWorkoutModal`: Soreness log + Volume summary -> Feeds into `Expenditure Engine`.

---

### [3] LOG (Unified Intake Hub)
**Primary View:** Speed-focused entry point for all daily metrics.
- **Top Bar:** Search field + Barcode Scanner + Voice Logging.
- **Quick-Add Slider:** Horizontal tray of frequent foods, supplements, and weights.
- **The Timeline:** A scrollable vertical history of today's inputs:
  - *06:30:* Scale Weight (186.2 lbs)
  - *07:00:* Coffee + Whey Protein
  - *08:30:* Workout: "PST Baseline"
  - *12:00:* Chicken & Rice (450 kcal)
- **COMPONENT: Supplement Stack**
  - Checklist for daily "Tactical Stack" (Creatine, Fish Oil, etc.).
- **COMPONENT: Water Tracker**
  - Incremental buttons (+250ml, +500ml).

---

### [4] ANALYSIS (The Trend Vault)
**Primary View:** Tabbed navigation for data visualization.
- **TAB: Performance**
  - 1RM Trends, Tonnage Volume, Intensity Heatmaps.
- **TAB: Metabolism**
  - `ExpenditureChart`: Metabolism stability over months.
  - `NutrientConsistency`: GitHub-style grid of logging frequency.
- **TAB: Body Comp**
  - `TrendWeightChart`: Purple trend line vs. Faint scale dots.
  - `MeasurementHistory`: cm tracking + Progress Photo comparison.
- **TAB: Recovery**
  - HRV Trends, Sleep Architecture, and ACWR dial.

---

### [5] SYSTEM (OS & Coaching)
**Primary View:** Vertical section list.
- **SECTION: The Coach (Weekly Check-In)**
  - Algorithm-driven logic: *"Your metabolism rose by 100kcal. Adjusting macros for faster weight loss."*
  - `ProgramControls`: Goal setting (Date/Weight) + Rate of Change selection.
- **SECTION: Mind (Second Brain)**
  - `ReadingLog`, `StudyLog`, and `SkillsMatrix`.
- **SECTION: Career (The Pipeline)**
  - `ApplicationKanban` and `NetworkingLog`.
- **SECTION: Settings**
  - Notification times, Data Export (CSV), and Supabase health.

---

## 3. Global Modals & Overlays
- **`DailyBriefModal`**: Synthesis of yesterday's performance + today's metabolic recommendation.
- **`WeeklyCheckInModal`**: Every Monday; required for macro target adjustments.
- **`CalculatorsModal`**: 1RM, Wilks, TDEE, Macro split.
- **`ConfirmDialog`**: Destructive actions or early workout termination.

---

## 4. State & Data Flow (The Engine Logic)
1. **Ingest:** Garmin/Apple Health -> `recovery_metrics`.
2. **Analysis:** `Intake` (from Log) - `Weight Change` (from Log) = `Calculated Expenditure`.
3. **Adjustment:** `Coach` reads `Expenditure` -> Proposes new `MacroTargets` for the `Dashboard`.
4. **Sync:** `CaptureInbox` + `MindLogs` -> Local Obsidian vault via Desktop Agent.

---

## 5. Mobile UI/UX Specifics
- **Information Density:** MacroFactor-style minimal whitespace; data-first.
- **One-Handed Flow:** The "Log" button is the primary bottom-center focus.
- **Visual Feedback:** Volt Green accents for "On Target" states; Slate for neutral.
- **Haptics:** Tactile clicks on each set logged and each food item added.
