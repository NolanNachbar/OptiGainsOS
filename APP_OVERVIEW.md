# Sisyphus' Schedule — App Overview

A full-stack progressive web app (PWA) for fitness tracking, workout planning, nutrition logging, and social fitness. Built with React + Vite on the frontend and Supabase for auth, database, and storage.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Navigation & Routes](#navigation--routes)
3. [Pages](#pages)
   - [Landing](#landing)
   - [Auth (Login / Signup / Password Reset)](#auth-login--signup--password-reset)
   - [Onboarding](#onboarding)
   - [Dashboard](#dashboard)
   - [Schedule](#schedule)
   - [Workouts](#workouts)
   - [Create Workout](#create-workout)
   - [Workout Detail (Logging)](#workout-detail-logging)
   - [Quick Workout](#quick-workout)
   - [Program Builder](#program-builder)
   - [Program Detail](#program-detail)
   - [Progress](#progress)
   - [Food Tracker](#food-tracker)
   - [Profile](#profile)
   - [Social](#social)
   - [Public Profile](#public-profile)
   - [Admin](#admin)
4. [Key Shared Components](#key-shared-components)
5. [State Management](#state-management)
6. [Data Models](#data-models)
7. [External Integrations](#external-integrations)
8. [ML / Recommendation System](#ml--recommendation-system)
9. [Utilities](#utilities)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| State / Caching | TanStack Query (React Query) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) |
| Styling | Tailwind CSS, shadcn/ui |
| Charts | Recharts |
| Drag & Drop | dnd-kit |
| Push Notifications | Web Push API |
| Barcode Scanner | ZXing (via BarcodeScanner component) |
| Food Data | USDA FoodData Central API, Open Food Facts API |
| Fitness Data | Strava OAuth + REST API |
| PWA | Vite PWA plugin (offline-capable) |

---

## Navigation & Routes

### Public Routes
| Path | Page |
|---|---|
| `/` | Landing |
| `/login` | Login |
| `/signup` | Signup |
| `/forgot-password` | Forgot Password |
| `/reset-password` | Reset Password (email link callback) |

### Protected Routes (require auth + Layout wrapper)
| Path | Page |
|---|---|
| `/onboarding` | Onboarding |
| `/dashboard` | Dashboard |
| `/schedule` | Schedule |
| `/workouts` | Workouts Library |
| `/create-workout` | Create Workout |
| `/workout-detail` | Workout Detail / Logger |
| `/quick-workout` | Quick Workout |
| `/program-builder` | Program Builder |
| `/program/:id` | Program Detail |
| `/food-tracker` | Food Tracker |
| `/progress` | Progress |
| `/profile` | Profile / Settings |
| `/social` | Social Hub |
| `/profile/:username` | Public Profile |
| `/admin` | Admin (dev tools) |
| `/strava-callback` | Strava OAuth Callback |

### Notable Query Parameters
- `workout-detail?id=&source=program&enrollmentId=&programWorkoutId=` — open a specific workout, optionally from a program enrollment
- `dashboard?tab=history|bodyweight|training-load|coach` — deep-link to a dashboard analytics tab
- `food-tracker?addFood=true` — open the food tracker with the add-food modal pre-opened
- `workouts?tutorial=true` — start the in-app tutorial

---

## Pages

### Landing

Marketing page shown to unauthenticated visitors.

- **Hero section** — app name, tagline, and two CTAs (Get Started / Log In)
- **Feature cards** — 6 cards highlighting smart workout tracking, the program builder, PR tracking, ML-powered recommendations, social features, and offline PWA support
- **Footer** — links and branding

---

### Auth (Login / Signup / Password Reset)

Standard Supabase email/password authentication flow.

- **Login** — email + password, link to signup and forgot password
- **Signup** — email + password with validation, redirects to onboarding on first login
- **Forgot Password** — sends reset email via Supabase
- **Reset Password** — form shown after clicking the email link; sets new password

---

### Onboarding

Multi-step first-run setup wizard. Collects all data needed to personalize the app before showing the dashboard.

| Step | Content |
|---|---|
| 1 | Fitness level (beginner / intermediate / advanced), primary goals (multi-select), available equipment |
| 2 | Workout preferences — days per week, session duration, exercises per day, include cardio, skip deload weeks |
| 3 | Body stats — height, weight, age, sex, activity level |
| 4 | Nutrition goals — daily calories, protein, carbs, fats (or auto-calculate via TDEE) |
| 5 | Initial body weight entry |
| 6 | Completion screen → redirect to Dashboard |

---

### Dashboard

The main hub. Surfaces today's actionable info plus a full analytics section.

#### Today Section
- **Daily Readiness Check-in** — slider inputs for sleep quality, muscle soreness, and stress level (1–5). Scores influence training load recommendations.
- **Today's Workout card** — shows the scheduled workout for today (from the weekly schedule or active program). Quick-start button opens Workout Detail.
- **Generate Week button** — calls the ML recommender to build a full 7-day workout week. Opens a review/approval modal before saving to the schedule.
- **Active Program progress** — if enrolled in a program, shows current cycle/day and the day's prescribed workout.

#### This Week Metrics Strip
- Workouts completed vs. planned
- Days food logged
- Active diet phase (cut / bulk / maintenance)
- Current body weight vs. starting weight
- Cardio stats (distance, time) from Strava
- Muscle heatmap — anterior and posterior body diagram shaded by weekly training volume

#### Today's Nutrition
Four circular progress rings for calories, protein, carbs, and fats, compared against daily goals. Tapping opens Food Tracker.

#### Analytics Tabs (bottom of page)
| Tab | Content |
|---|---|
| **History** | All-time totals, exercise progress chart, personal records table, searchable/filterable workout log |
| **Bodyweight** | Quick log, trend chart, full weight history |
| **Training Load** | Training Stress Score, recovery index, fatigue vs. fitness |
| **Nutrition Coach** | AI-generated coaching feedback based on recent training and nutrition patterns |

---

### Schedule

Weekly calendar for planning and reviewing workouts.

- **7-day grid** — one column per day (Mon–Sun). Each cell shows the scheduled workout card, food summary for the day, and macro totals.
- **Drag-and-drop** — drag workout cards between days to reschedule.
- **Day detail panel** — click a day to expand; shows food logged, macro breakdown, and workout notes.
- **Add workout** — open the workout library sidebar to drag a workout onto any day, or create a new one inline.
- **Program workouts** — workouts from an active program enrollment appear as pinned, non-moveable items on their prescribed days.
- **Generate Week** — same AI week generator as Dashboard; opens the approval modal before writing to schedule.

---

### Workouts

Library of all workouts belonging to the user, plus shared/community content.

- **Filter tabs** — All, Custom (user-created), Shared (published to community), Imported (cloned from others)
- **Folder system** — organize workouts into named folders; filter by folder
- **Search + advanced filters** — search by title; filter by type, difficulty, equipment, muscle group
- **Workout cards** — show title, type badge, difficulty badge, duration, muscle tags, and a reaction tally (👍/👎)
- **Cardio sessions** — Strava-synced cardio sessions appear here with activity type, distance, duration, and a route map button
- **Reaction system** — thumbs up/down on individual workouts; reaction counts displayed
- **Actions per card** — open, edit, schedule, duplicate, share, delete
- **Bulk actions** — select multiple workouts to export as JSON or delete
- **Create button** — navigates to Create Workout

---

### Create Workout

Step-by-step builder for new strength or cardio workouts.

1. **Metadata** — title, description, type (strength / cardio / HIIT / yoga / flexibility / mixed), difficulty, estimated duration, equipment needed, target goals
2. **Exercises** — add exercises by name (backed by the built-in exercise database of 300+ movements); configure sets, reps, rest time, notes, and progression type (hypertrophy / strength / endurance)
3. **Review** — summary of all exercises, reorder via drag-and-drop
4. **Save** — optionally assign to a folder and/or immediately schedule for a specific date

---

### Workout Detail (Logging)

The full-featured session logging screen. Used for both pre-planned workouts and live in-session tracking.

#### Pre-Session View
- Workout title, type, difficulty badges
- Muscle heatmap showing which muscles this workout targets
- Recovery warning if the same muscle groups were trained too recently
- Full exercise list with target sets/reps for each movement

#### Active Session
- **Session header** — elapsed timer, rest timer (configurable per exercise), pause/resume
- **Exercise cards** — set-by-set logging table: previous performance (weight × reps), current weight input, reps input, RIR (reps in reserve) or RPE (rate of perceived exertion), calculated volume
- **Add / remove sets** — inline per exercise
- **Reorder sets** — drag-and-drop within an exercise
- **Notes** — per-exercise and per-session notes
- **Last performance reference** — shows what weight/reps were used last time this exercise was logged

#### Session Management
- **Session persistence** — in-progress sessions are saved automatically; a resume prompt appears if the user navigates away mid-session
- **Complete session** — writes a WorkoutLog, updates streak, triggers any program enrollment advancement
- **Share** — opens ShareWorkoutModal to publish the completed session

---

### Quick Workout

Lightweight ad-hoc logging for spontaneous training not tied to a pre-built workout.

- Auto-generated title (e.g., "Workout — May 14")
- Add any exercise on the fly from the exercise database
- Minimal UI focused on speed — no predefined structure required
- Same save/share options as Workout Detail on completion

---

### Program Builder

Advanced multi-step tool for building structured multi-week training programs.

#### Step 1 — Program Details
- Name, description, goal (strength / hypertrophy / endurance / weight loss / general fitness), difficulty
- Tags (e.g., "PPL", "bro split", "5/3/1")
- Cycle length (days), number of cycles

#### Step 2 — Cycle/Day Grid
- Grid of cycles × days; each cell is a workout slot
- Drag workouts from the library sidebar into cells
- Each cell supports an inline workout editor (exercises, sets, reps, rest)
- Supports two schema versions: v1 (flat list) and v2 (cycles)

#### Step 3 — Progression Rules
- Set automatic progression for each exercise (e.g., add 5 lb every cycle)
- View projected weight timelines per exercise across all cycles

#### Step 4 — Confirm & Save
- Full program summary
- Save as private or share to community
- JSON export

**Import** — paste a valid program JSON to load an existing program schema into the builder.

---

### Program Detail

Overview page for a single program.

- Name, goal, difficulty, duration, days/week
- Cycle/day grid visualization (read-only)
- **Enroll button** — if not the owner and not already enrolled; opens enrollment flow with starting weight inputs per exercise
- **Enrollment state** — if enrolled, shows current cycle, current day, completed workouts count, and progress bar; pause / resume / reset enrollment
- **Owner controls** — edit (opens Program Builder), delete, share/unshare, export JSON
- Community stats if shared — like count, clone count

---

### Progress

Dedicated analytics page (mirrors the Dashboard analytics tabs in a full-page layout).

- **Exercise Progress Chart** — searchable exercise selector; line chart of best set volume or 1RM estimate over time
- **Personal Records Table** — sortable list of all-time bests per exercise (weight, reps, estimated 1RM)
- **Bodyweight** — log weight, quick stats (starting / current / average / change), trend chart, full history table
- **Workout Logs** — filterable/searchable full history of every logged session; expand each entry to see exercise breakdown

---

### Food Tracker

Comprehensive nutrition logging and analysis tool.

#### Daily Log View
- **Date selector** — navigate forward/backward by day
- **Meal tabs** — Breakfast, Lunch, Dinner, Snack; each shows entries and a per-meal macro subtotal
- **Food search** — searches USDA FoodData Central (generic + branded), the user's custom foods, and recent entries simultaneously
- **Barcode scanner** — uses the device camera to scan product barcodes; looks up in Open Food Facts
- **Add entry** — select food, set serving amount and unit (g, oz, cups, tbsp, etc.), preview macros, save to a meal
- **Edit / delete entries** — inline actions on each logged item

#### Macro Summary
- Bar or ring displays for calories, protein, carbs, fats vs. daily goal
- 7-day rolling macro trend chart
- Diet phase card showing current phase (cut / bulk / maintenance) with adjusted calorie targets

#### Recipes
- **Recipe Builder** — combine ingredients into a named recipe, set servings, save to library
- **Recipe Library** — browse, edit, delete, share saved recipes
- **Share Recipe** — publish a recipe to the social feed

#### Meal Templates
- Save the entire contents of a meal (e.g., your usual breakfast) as a reusable template
- Apply a template to any day/meal slot with one tap

#### Nutrition Coach & Automation
- **Weekly Check-in Banner** — on the configured check-in day, prompts a brief body-weight + adherence check-in
- **Training Adaptation Banner** — auto-suggests increasing calories on high-volume training days and decreasing on rest days based on training load
- **AI Meal Plan Ideas** — generates meal suggestions that hit macro targets using NutritionCoach component

#### Custom Foods
- Create foods that don't exist in USDA (macros per serving unit)
- Appear alongside USDA results in search

---

### Profile

User settings and account management.

#### Identity
- Avatar upload (stored in Supabase Storage)
- Display name, username
- Privacy level (public / friends-only / private)
- Bio

#### Nutrition Goals
- Daily calorie, protein, carbs, fats targets
- TDEE override (manually set if preferred over calculated)
- Check-in day (which day of the week triggers the weekly check-in)

#### Body Stats
- Height (cm or ft/in), weight, age, sex
- Activity level (sedentary → extremely active)

#### Fitness Questionnaire
- Fitness level (beginner / intermediate / advanced)
- Primary goals (multi-select)
- Available equipment (multi-select)
- Preferred session duration and days per week
- Injuries / limitations (free text)
- Exercises per day, include cardio toggle, skip deload weeks toggle

#### Integrations & Features
- **Strava** — connect / disconnect; shows connection status and last sync date
- **Push Notifications** — request browser permission; subscribes to workout reminders
- **Show RIR toggle** — show Reps In Reserve field during logging (vs. RPE)
- **Adaptive Training toggle** — enable/disable auto-calorie adjustment

#### Account
- **Export Data** — downloads all user data (workouts, logs, nutrition, body weight) as JSON
- **Delete Account** — confirmation dialog; permanently removes all user data and the Supabase account

---

### Social

Community hub organized into three sections.

#### Feed
- Activity stream showing recent workouts, programs, and recipes shared by friends
- Trending section showing top-liked content across the community
- Like and comment on any item
- Clone (copy to your library) shared workouts and programs

#### Friends
- Search for users by username
- Send / accept / decline friend requests
- Friend list with online/active status
- Friend card shows their recent activity summary and muscle heatmap

#### Leaderboards
- Ranked lists for specific exercises (e.g., Bench Press, Squat, Deadlift)
- Filter by time period (all-time, this month, this week)
- Shows rank, username, best weight × reps, estimated 1RM

---

### Public Profile

View another user's public-facing profile.

- Avatar, display name, username, bio
- Privacy badge (public / friends-only)
- Muscle heatmap aggregated from their training history
- **Shared Workouts tab** — list of workouts they've published; clone button on each
- **Shared Programs tab** — list of programs they've published; clone button on each
- Aggregate stats if their profile is public (total workouts, total volume, PRs)

---

### Admin

Developer/testing utilities. Not visible to regular users.

- Regenerate the ML workout plan for the current user
- Test ML model output with custom parameters
- Quick-adjust profile fields without going through the full Profile page
- Clear React Query cache
- Reset user data (nuke and re-seed for testing)

---

## Key Shared Components

| Component | Purpose |
|---|---|
| `Layout.jsx` | App shell — sidebar navigation, header, mobile bottom nav |
| `ProtectedRoute.jsx` | Redirects unauthenticated users to `/login` |
| `MuscleHeatMap.jsx` | SVG anterior/posterior body diagram shaded by volume |
| `ExerciseCard.jsx` | Single exercise display with inline set logging |
| `WorkoutCard.jsx` | Workout preview card used in library, schedule, social feed |
| `ProgramCard.jsx` | Program preview card |
| `BarcodeScanner.jsx` | Camera-based barcode scanner for food lookup |
| `OneRMCalculator.jsx` | Epley / Brzycki 1RM estimate from weight × reps |
| `TutorialOverlay.jsx` | Full-screen guided tour with spotlights and tooltips |
| `WeighInModal.jsx` | Quick body weight logger accessible from multiple pages |
| `DataExport.jsx` | Triggers full data export download |
| `ThemeToggle.jsx` | Light / dark mode switch |

---

## State Management

### React Contexts
| Context | Manages |
|---|---|
| `AuthContext` | Supabase session, user object, sign-in/sign-up/sign-out, account deletion |
| `ThemeContext` | Light/dark mode preference (persisted to localStorage) |
| `TutorialContext` | Tutorial active state, current step, step completion tracking |

### Custom Hooks (TanStack Query wrappers)
| Hook | Data |
|---|---|
| `useUserQueries` | User profile, food entries, body weight entries, custom foods |
| `useProgramQueries` | Programs, enrollments, create/update/delete programs |
| `useSocialQueries` | Friends, public profiles, shared content, comments, leaderboard |
| `useDietPhase` | Active diet phase |
| `useWeeklyCheckin` | Weekly nutrition check-in state |
| `useExerciseReactions` | Per-exercise like/dislike reactions |
| `useRecipeReactions` | Per-recipe like/dislike reactions |
| `useWorkoutSession` | Active session state (resume, persist, complete) |
| `useWorkoutExercises` | Exercise list management during logging |
| `useTrainingAdaptation` | Auto calorie-adjustment logic |
| `useStravaAutoSync` | Background Strava activity sync on app load |
| `usePushNotifications` | Web push subscription registration |
| `useTutorial` | Tutorial step progression |

### Query Key Factory (`queryKeys.js`)
Centralized keys for consistent cache invalidation across the app. Each domain has a factory function (e.g., `queryKeys.workouts()`, `queryKeys.foodEntries(date)`) plus a corresponding `invalidate*()` helper.

---

## Data Models

### UserProfile
`id, created_by, username, display_name, privacy_level, bio, avatar_url, fitness_level, primary_goal[], available_equipment[], days_per_week, workout_duration_preference, injuries_limitations, height_cm, height_unit, age, sex, activity_level, weight_unit, daily_calorie_goal, daily_protein_goal, daily_carbs_goal, daily_fats_goal, tdee_override, checkin_day, strava_access_token, show_rir, adaptive_training, exercises_per_day, include_cardio, skip_deload`

### Workout
`id, created_by, title, description, type, difficulty, duration_minutes, exercises[], equipment_needed, is_custom, target_goals[], folder, rating, is_shared, created_at`

### Exercise (within a Workout)
`name, sets, reps (or rep_target), rest_seconds, notes, focus (hypertrophy/strength/endurance), progression, weight, rir, rpe`

### WorkoutLog
`id, created_by, workout_id, log_date, duration_seconds, exercises[], notes`

### WorkoutSchedule
`id, created_by, workout_id, scheduled_date, time_of_day, completed, completed_at`

### FoodEntry
`id, created_by, food_name, date, meal_type, serving_amount, serving_unit, calories, protein_grams, carbs_grams, fats_grams, barcode, is_usda, brand`

### BodyWeightEntry
`id, created_by, weight, recorded_date, notes`

### DietPhase
`id, created_by, phase_type (cutting/bulking/maintenance), start_date, end_date, daily_calorie_goal, daily_protein_goal`

### Program
`id, created_by, name, description, difficulty, goal, workouts[], cycle_length, num_cycles, duration_weeks, days_per_week, tags, schema_version (v1/v2), is_shared, created_at`

### ProgramEnrollment
`id, user_id, program_id, status (active/completed/paused), current_day, current_week, current_day_index, current_cycle, completed_workouts[], start_date, progression_state`

### DailyReadiness
`id, created_by, checkin_date, sleep_score, soreness_score, stress_score`

### Friend
`id, user_a_id, user_b_id, status (pending/accepted)`

### CardioSession (Strava)
`id, created_by, activity_type, distance_meters, moving_time_seconds, calories, average_heartrate, start_date, polyline`

---

## External Integrations

### Supabase
- **Auth** — email/password authentication, password reset emails, JWT session management
- **Database** — PostgreSQL; all user data stored here with row-level security
- **Storage** — user avatar images

### USDA FoodData Central
- Powers the food search in Food Tracker
- Two endpoints: generic foods (nutritional data) and branded foods (packaged products with UPC)

### Open Food Facts
- Barcode-to-food lookup used by the BarcodeScanner component

### Strava
- OAuth 2.0 connection flow (via `/strava-callback`)
- Pulls activity data (runs, rides, swims, etc.) on sync
- Cardio sessions appear in the Workouts library and contribute to training load calculations

### Web Push API
- Browser push notifications for workout reminders
- Subscription stored in Supabase; notifications triggered server-side

---

## ML / Recommendation System

Located in `/src/ml/`.

| File | Role |
|---|---|
| `mlRecommender.js` | Entry point — orchestrates rest-day detection, personalized workout suggestions, weekly plan generation |
| `workoutModel.js` | Rule-based workout generator using user profile (goals, equipment, frequency, level) |
| `workoutModelML.js` | Feature-vector ML model for workout generation (secondary, more personalized) |
| `exerciseDB.js` | Built-in database of 300+ exercises with metadata: primary muscle, movement type, equipment, difficulty |
| `fitnessTemplates.js` | Pre-built workout templates for common goal × equipment combinations |
| `rfModel.js` | Random forest classifier used as a fallback recommender |
| `modelTrainer.js` | Trains models on accumulated user reaction data (like/dislike on exercises) |
| `syntheticData.js` | Generates synthetic training samples for bootstrapping the model before enough real data exists |

**How it works:**
1. On "Generate Week," `mlRecommender.js` reads the user's profile (goals, equipment, history, reactions, recent fatigue)
2. It calls `workoutModel.js` or `workoutModelML.js` to produce workout objects for each day
3. Recovery logic (`fatigueManagement.js`) ensures the same muscle groups aren't overloaded back-to-back
4. The generated week is shown in an approval modal; user can accept, regenerate, or manually edit before saving to the schedule

---

## Utilities

| File | Purpose |
|---|---|
| `nutritionUtils.js` | Aggregate macros from food entries, compute daily trends, recent foods, unit conversions |
| `coachingUtils.js` | TDEE calculation (Mifflin, Harris-Benedict, Katch-McArdle), macro splits, protein recommendations, phase-based calorie targets |
| `exerciseStats.js` | Unique exercise list, exercise history, volume calculations, personal records |
| `fatigueManagement.js` | Recovery window checks per muscle group, overall recovery score, training load warnings |
| `trainingLoad.js` | Combine workout logs and cardio into a Training Stress Score + recovery index |
| `programProgression.js` | Calculate target weights for a given program day, transfer progression state between cycles, detect deload weeks |
| `muscleVolumeUtils.js` | Map exercises → muscle groups → heatmap intensity values |
| `exerciseReplacer.js` | Suggest equipment-compatible or injury-safe substitutions for a given exercise |
| `programSchedule.js` | Resolve today's program workout from enrollment state; build a full weekly grid from a program |
| `programIO.js` | Serialize/deserialize programs to/from portable JSON |
| `checkinUtils.js` | Daily readiness check-in state and scoring logic |
| `runningAdaptation.js` | Auto-adjust cardio targets based on recent running performance trends |
| `imageUpload.js` | Handle workout photo uploads to Supabase Storage |
