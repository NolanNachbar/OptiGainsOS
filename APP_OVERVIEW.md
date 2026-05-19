# Vektor — App Overview

A full-stack progressive web app (PWA) for fitness tracking, workout planning, nutrition logging, and social fitness. Built with React + Vite on the frontend and Supabase for auth, database, and storage. Deployed as a PWA at vektor.app. Forced dark mode; primary color palette is Cyber Charcoal (#121212) and Volt Neon Green (#CCFF00).

> **Naming note:** The repository folder is named `FlexAppeal` — a legacy artifact from the previous brand. The live product brand is **Vektor**.

---

## The Problem We Solve

A personal trainer works. It's the best product in fitness — personalized programming, accountability, someone who knows your history and adjusts when you plateau. But it costs $400–$1,000 a month, and most people paying $40 for a gym membership aren't going to add that on top.

So those members walk in, wander around, do the same thing they did last week, don't see results, and cancel in 90 days. The gym didn't fail them — there was just nothing bridging the gap between "paid for access" and "actually making progress."

That's the gap Vektor fills. AI-generated programming that adapts to the user's goals, equipment, and history. Progress tracking that shows PRs going up week over week. Nutrition logging. The things a trainer does — minus the $400.

For a gym, the pitch is simple: member retention is a revenue problem, and members cancel when they stop seeing results. Give every member a structured program from day one and you've removed the most common reason people quit. Not as an upsell — included with membership, as a differentiator.

White-labeled under the gym's brand. Their name, their colors, their app. We handle the tech. They just offer it.

At $2 per active member per month, a 500-member gym pays $1,000/month. If it keeps 10 members from cancelling — 10 people at $40/month — it pays for itself in the first month and everything after that is margin.

The personal trainer is still the best product. Vektor is the product for everyone who can't afford one.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Navigation & Routes](#navigation--routes)
3. [Pages](#pages)
4. [Key Shared Components](#key-shared-components)
5. [State Management](#state-management)
6. [Data Models](#data-models)
7. [External Integrations](#external-integrations)
8. [ML / Recommendation System](#ml--recommendation-system)
9. [Utilities](#utilities)
10. [Security Architecture](#security-architecture)
11. [Known Limitations & Constraints](#known-limitations--constraints)

---

## Tech Stack

| Layer              | Technology                                               |
| ------------------ | -------------------------------------------------------- |
| Frontend           | React 18, Vite, React Router v6                          |
| State / Caching    | TanStack Query (React Query)                             |
| Backend / DB       | Supabase (PostgreSQL + Auth + Storage + Edge Functions)  |
| Styling            | Tailwind CSS, shadcn/ui                                  |
| Charts             | Recharts                                                 |
| Drag & Drop        | dnd-kit                                                  |
| Push Notifications | Web Push API (VAPID)                                     |
| Barcode Scanner    | ZXing (via BarcodeScanner component)                     |
| Food Data          | USDA FoodData Central API, Open Food Facts API           |
| Fitness Data       | Strava OAuth 2.0 + REST API v3                           |
| PWA                | manifest.json + service worker (limited offline caching) |

---

## Navigation & Routes

### Public Routes

| Path               | Page                                 |
| ------------------ | ------------------------------------ |
| `/`                | Landing                              |
| `/login`           | Login                                |
| `/signup`          | Signup                               |
| `/forgot-password` | Forgot Password                      |
| `/reset-password`  | Reset Password (email link callback) |

### Protected Routes (require auth + Layout wrapper)

| Path                 | Page                               |
| -------------------- | ---------------------------------- |
| `/onboarding`        | Onboarding                         |
| `/dashboard`         | Dashboard                          |
| `/schedule`          | Schedule                           |
| `/workouts`          | Workouts Library                   |
| `/create-workout`    | Create Workout                     |
| `/workout-detail`    | Workout Detail / Logger            |
| `/quick-workout`     | Quick Workout                      |
| `/program-builder`   | Program Builder                    |
| `/program/:id`       | Program Detail                     |
| `/food-tracker`      | Food Tracker                       |
| `/progress`          | Progress                           |
| `/profile`           | Profile / Settings                 |
| `/social`            | Social Hub                         |
| `/profile/:username` | Public Profile                     |
| `/admin`             | Admin (dev tools, not user-facing) |
| `/strava-callback`   | Strava OAuth Callback              |

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

Standard Supabase email/password authentication flow. No OAuth social login (e.g., Google) at this time.

- **Login** — email + password, link to signup and forgot password
- **Signup** — email + password with validation, redirects to onboarding on first login
- **Forgot Password** — sends reset email via Supabase
- **Reset Password** — form shown after clicking the email link; sets new password

---

### Onboarding

Multi-step first-run setup wizard. Collects all data needed to personalize the app before showing the dashboard. Users who skip or haven't completed onboarding are redirected here automatically.

| Step | Content                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | Fitness level (beginner / intermediate / advanced), primary goals (multi-select), available equipment                     |
| 2    | Workout preferences — days per week, session duration, exercises per day, include cardio toggle, skip deload weeks toggle |
| 3    | Body stats — height, weight, age, sex, activity level                                                                     |
| 4    | Nutrition goals — daily calories, protein, carbs, fats (or auto-calculate via TDEE formula)                               |
| 5    | Initial body weight entry                                                                                                 |
| 6    | Completion screen → redirect to Dashboard                                                                                 |

---

### Dashboard

The main hub. Surfaces today's actionable information plus a full analytics section.

#### Today Section

- **Daily Readiness Check-in** — three 1–5 sliders for sleep quality, muscle soreness, and stress level. Scores are logged as `DailyReadiness` entries and feed into training load recommendations. Check-in must be submitted before showing the "Start Workout" CTA (can be skipped).
- **Today's Workout card** — shows the scheduled workout for today (from the weekly schedule or active program enrollment). Displays workout name, program badge (if from a program), duration, and exercise count. Quick-start button navigates to Workout Detail.
- **Active Program progress** — if enrolled in a program, shows current cycle/day and the day's prescribed workout. Supports cardio-only days and mixed cardio + lifting days.
- **Generate Week button** — calls the ML recommender to build a full 7-day workout week based on profile, fatigue state, and past reactions. Opens a review/approval modal before writing to the schedule.

#### This Week Metrics Strip

- Workouts completed vs. planned goal
- Days food logged (out of 7)
- Active diet phase (cut / bulk / maintenance)
- Current body weight vs. all-time starting weight (with delta in lbs/kg)
- Cardio stats (sessions, distance, minutes, calories) from Strava — only shown if Strava is connected
- Muscle heatmap — anterior and posterior SVG body diagram shaded by weekly training volume per muscle group

#### Today's Nutrition

Four circular SVG progress rings for calories, protein, carbs, and fats vs. daily goals. Estimated TDEE displayed if the adaptive model has sufficient data.

#### Analytics Tabs (bottom of page)

| Tab                 | Content                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **History**         | All-time totals (workouts, volume, avg duration), exercise progress chart, personal records table, searchable/filterable workout log                                              |
| **Bodyweight**      | Quick log form, trend chart, quick stats (starting / current / average / change), full weight history                                                                             |
| **Training Load**   | Training Stress Score (TSS), Chronic Training Load (CTL), Acute Training Load (ATL), Training Stress Balance (TSB), fatigue vs. fitness visualization. Requires 28+ days of data. |
| **Nutrition Coach** | AI-generated coaching feedback based on recent training and nutrition patterns via NutritionCoach component                                                                       |

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
- **Workout cards** — show title, type badge, difficulty badge, duration, muscle tags, and a reaction tally (thumbs up/down)
- **Cardio sessions** — Strava-synced cardio sessions appear here with activity type, distance, duration, and a route map button (requires polyline from Strava)
- **Reaction system** — thumbs up/down on individual workouts; reaction counts displayed
- **Actions per card** — open, edit, schedule, duplicate, share, delete
- **Bulk actions** — select multiple workouts to export as JSON or delete
- **Create button** — navigates to Create Workout

---

### Create Workout

Step-by-step builder for new strength or cardio workouts.

1. **Metadata** — title, description, type (strength / cardio / HIIT / yoga / flexibility / mixed), difficulty, estimated duration, equipment needed, target goals
2. **Exercises** — add exercises by name, backed by the built-in exercise database of **274 movements**; configure sets, reps, rest time, notes, and progression type (hypertrophy / strength / endurance). Name lookup uses case-insensitive fuzzy matching (exact match first, then substring).
3. **Review** — summary of all exercises, reorder via drag-and-drop
4. **Save** — optionally assign to a folder and/or immediately schedule for a specific date

---

### Workout Detail (Logging)

The full-featured session logging screen. Used for both pre-planned workouts and live in-session tracking.

#### Pre-Session View

- Workout title, type, difficulty badges
- Muscle heatmap showing which muscles this workout targets
- Recovery warning if the same muscle groups were trained too recently (based on `fatigueManagement.js` recovery windows)
- Full exercise list with target sets/reps for each movement

#### Active Session

- **Session header** — elapsed timer, rest timer (configurable per exercise, defaults from exercise definition), pause/resume
- **Exercise cards** — set-by-set logging table: previous performance (weight × reps from last log of that exercise), current weight input, reps input, RIR (reps in reserve) or RPE (rate of perceived exertion) toggle controlled by profile setting, calculated volume per set
- **Add / remove sets** — inline per exercise
- **Reorder sets** — drag-and-drop within an exercise
- **Notes** — per-exercise and per-session notes
- **Last performance reference** — shows what weight/reps were used the last time this specific exercise was logged (looked up from workout_logs history)

#### Session Management

- **Session persistence** — in-progress sessions are auto-saved to localStorage; a resume prompt appears if the user navigates away mid-session
- **Complete session** — writes a `WorkoutLog` record, updates streak, triggers program enrollment advancement if applicable
- **Share** — opens ShareWorkoutModal to publish the completed session to the social feed

---

### Quick Workout

Lightweight ad-hoc logging for spontaneous training not tied to a pre-built workout.

- Auto-generated title (e.g., "Workout — May 14")
- Add any exercise on the fly from the 274-exercise database
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
- Supports two schema versions: v1 (flat day list) and v2 (cycles × days)

#### Step 3 — Progression Rules

- Set automatic progression per exercise (e.g., add 5 lb every cycle based on stall detection)
- View projected weight timelines per exercise across all cycles
- Default increment: 2.5% for upper body, 5% for lower body; minimum 2.5 lb, rounded to nearest 2.5 lb
- Stall detection: 3+ sessions at same weight without hitting target reps + RIR ≥ 2

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

- **Exercise Progress Chart** — searchable exercise selector; line chart of best set volume or estimated 1RM over time
- **Personal Records Table** — sortable list of all-time bests per exercise (weight, reps, estimated 1RM via Epley formula)
- **Bodyweight** — log weight, quick stats (starting / current / average / change), trend chart, full history table
- **Workout Logs** — filterable/searchable full history of every logged session; expand each entry to see per-exercise, per-set breakdown with volume and RIR

---

### Food Tracker

Comprehensive nutrition logging and analysis tool.

#### Daily Log View

- **Date selector** — navigate forward/backward by day
- **Meal tabs** — Breakfast, Lunch, Dinner, Snack; each shows entries and a per-meal macro subtotal
- **Food search** — simultaneously searches USDA FoodData Central (Foundation + SR Legacy + Branded), the user's custom foods, and the user's recent entries
- **Barcode scanner** — uses the device camera (ZXing) to scan product barcodes; primary lookup via Open Food Facts API, fallback to USDA Branded Foods
- **Add entry** — select food, set serving amount and unit (g, oz, cups, tbsp, etc.), preview macros, save to a meal
- **Edit / delete entries** — inline actions on each logged item

#### Macro Summary

- Ring or bar displays for calories, protein, carbs, fats vs. daily goal
- 7-day rolling macro trend chart
- Diet phase card showing current phase (cut / bulk / maintenance) with adjusted calorie targets

#### Recipes

- **Recipe Builder** — combine ingredients into a named recipe, set servings, save to library
- **Recipe Library** — browse, edit, delete, share saved recipes
- **Share Recipe** — publish a recipe to the social feed

#### Meal Templates

- Save the entire contents of a meal (e.g., usual breakfast) as a reusable template
- Apply a template to any day/meal slot with one tap

#### Nutrition Coach & Automation

- **Weekly Check-in Banner** — on the user's configured check-in day, prompts a brief body-weight + adherence review
- **Training Adaptation Banner** — auto-suggests increasing calories on high-volume training days and decreasing on rest days based on that day's TSS
- **AI Meal Plan Ideas** — generates meal suggestions that hit macro targets using the NutritionCoach component

#### Custom Foods

- Create foods that don't exist in USDA or Open Food Facts (define macros per serving unit)
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
- TDEE override (manually set to bypass the calculated value)
- Check-in day (which day of the week triggers the weekly nutrition check-in)

#### Body Stats

- Height (cm or ft/in), weight, age, sex
- Activity level (sedentary → extremely active) — used in TDEE formula

#### Fitness Questionnaire

- Fitness level (beginner / intermediate / advanced)
- Primary goals (multi-select)
- Available equipment (multi-select from 12 categories)
- Preferred session duration and days per week
- Injuries / limitations (free text)
- Exercises per day, include cardio toggle, skip deload weeks toggle

#### Integrations & Features

- **Strava** — connect / disconnect; shows connection status and last sync timestamp
- **Push Notifications** — request browser permission; subscribes device to workout and check-in reminders via VAPID Web Push
- **Show RIR toggle** — show Reps In Reserve field during logging (vs. RPE)
- **Adaptive Training toggle** — enable/disable auto-calorie adjustment based on training load

#### Account

- **Export Data** — downloads all user data as three CSV files: `body_weight.csv`, `food_log.csv`, `lifting_log.csv` (full history, no date range filter)
- **Delete Account** — confirmation dialog; permanently removes all user data and the Supabase auth account

---

### Social

Community hub organized into three sections.

#### Feed

- Activity stream showing recent workouts, programs, and recipes shared by friends
- Trending section showing top-liked content across the community
- Like and comment on any item
- Clone (copy to your library) shared workouts and programs directly from the feed

#### Friends

- Search for users by username
- Send / accept / decline friend requests
- Friend list with online/active status
- Friend card shows their recent activity summary and muscle heatmap

#### Leaderboards

- Ranked lists for any exercise in the database (user selects from a dropdown populated by logged exercises)
- Filter by time period (all-time, this month, this week)
- Shows rank, username, best weight × reps, estimated 1RM (computed via Supabase RPC)
- Privacy controls: leaderboard excludes users with `private` privacy setting; `friends_only` users are visible only to their friends

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

| Component                  | Purpose                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `Layout.jsx`               | App shell — sidebar navigation, header, mobile bottom nav                              |
| `ProtectedRoute.jsx`       | Redirects unauthenticated users to `/login`                                            |
| `MuscleHeatMap.jsx`        | SVG anterior/posterior body diagram shaded by training volume                          |
| `ExerciseCard.jsx`         | Single exercise display with inline set-by-set logging                                 |
| `WorkoutCard.jsx`          | Workout preview card used in library, schedule, and social feed                        |
| `ProgramCard.jsx`          | Program preview card                                                                   |
| `BarcodeScanner.jsx`       | Camera-based barcode scanner (ZXing) for food lookup                                   |
| `OneRMCalculator.jsx`      | Epley / Brzycki 1RM estimate from weight × reps                                        |
| `TutorialOverlay.jsx`      | Full-screen guided tour with spotlights and tooltips                                   |
| `WeighInModal.jsx`         | Quick body weight logger accessible from multiple pages                                |
| `DataExport.jsx`           | Triggers full user data export as three CSV files                                      |
| `ThemeToggle.jsx`          | Present in Layout but functionally a no-op — ThemeContext forces dark mode permanently |
| `NutritionCoach.jsx`       | AI coaching feedback panel for nutrition analysis                                      |
| `WorkoutApprovalModal.jsx` | Review/edit modal for AI-generated weekly workout plans                                |
| `TrainingLoadTab.jsx`      | TSS/CTL/ATL/TSB visualization; requires Strava connection and 28+ days of data         |

---

## State Management

### React Contexts

| Context           | Manages                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `AuthContext`     | Supabase session, user object, sign-in/sign-up/sign-out, account deletion                  |
| `ThemeContext`    | Always returns `dark`; toggle is preserved in UI but does nothing — dark mode is permanent |
| `TutorialContext` | Tutorial active state, current step, step completion tracking                              |

### Custom Hooks (TanStack Query wrappers)

| Hook                    | Data                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| `useUserQueries`        | User profile, food entries, body weight entries, custom foods      |
| `useProgramQueries`     | Programs, enrollments, create/update/delete programs               |
| `useSocialQueries`      | Friends, public profiles, shared content, comments, leaderboard    |
| `useDietPhase`          | Active diet phase                                                  |
| `useWeeklyCheckin`      | Weekly nutrition check-in state                                    |
| `useExerciseReactions`  | Per-exercise like/dislike reactions (feeds ML model training)      |
| `useRecipeReactions`    | Per-recipe like/dislike reactions                                  |
| `useWorkoutSession`     | Active session state (resume from localStorage, persist, complete) |
| `useWorkoutExercises`   | Exercise list management during logging                            |
| `useTrainingAdaptation` | Auto calorie-adjustment logic based on daily TSS                   |
| `useStravaAutoSync`     | Background Strava activity sync on app load (4-hour interval)      |
| `usePushNotifications`  | Web push subscription registration and management                  |
| `useTutorial`           | Tutorial step progression                                          |
| `useBodyWeightEntries`  | Body weight log fetching and cache management                      |

### Query Key Factory (`queryKeys.js`)

Centralized key factory for consistent cache invalidation across the app. Each domain has a factory function (e.g., `queryKeys.workouts()`, `queryKeys.foodEntries(date)`) plus a corresponding `invalidate*()` helper to keep cache coherent after mutations.

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

`id, created_by, checkin_date, sleep_score (1–5), soreness_score (1–5), stress_score (1–5)`

### Friend

`id, user_a_id, user_b_id, status (pending/accepted)`

### CardioSession (Strava)

`id, created_by, activity_type, distance_meters, moving_time_seconds, elapsed_time_seconds, total_elevation_gain, average_speed, max_speed, calories, average_heartrate, max_heartrate, average_cadence, start_date, map_polyline, strava_activity_id`

### ExerciseReaction

`id, created_by, exercise_name, reaction (like/dislike), created_at` — primary training signal for the ML recommender

---

## External Integrations

### Supabase

- **Auth** — email/password only; no social OAuth. Password reset via Supabase email links. JWT session management with auto-refresh.
- **Database** — PostgreSQL with row-level security (RLS) enforced on all user tables. Social feed and leaderboard data accessed via Supabase RPC functions (`get_social_feed`, `get_explore_feed`, leaderboard RPC).
- **Storage** — user avatar images.
- **Edge Functions** — 3 deployed functions:
  - `strava-token` — handles Strava OAuth token exchange and refresh; stores refresh token server-side only
  - `usda-proxy` — rate-limited proxy for USDA API calls (200 requests/user/hour, logged to `usda_request_log`)
  - `send-daily-workout-reminder` / `send-weekly-checkin-reminder` — scheduled cron jobs for push notifications

---

### USDA FoodData Central

Powers the primary food search in Food Tracker.

- **Endpoint:** `https://api.nal.usda.gov/fdc/v1` (proxied via Supabase Edge Function)
- **Datasets queried:** Foundation, SR Legacy (generic foods), Branded (packaged products with UPC/GTIN)
- **Nutrient codes mapped:** 208/957 (Calories), 203 (Protein), 205 (Carbohydrates), 204 (Total Fat). Falls back to nutrient name matching if code not found.
- **Serving size:** Uses food-provided value; defaults to 100g if absent
- **Rate limit (enforced by app):** 200 requests per user per hour, tracked in `usda_request_log` table. USDA's own published limit is higher; the app's limit is conservative.
- **Auth:** All requests go through the Supabase Edge Function which verifies the user's JWT before forwarding to USDA.

---

### Open Food Facts

Barcode-to-food lookup for the BarcodeScanner component.

- **API:** `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
- **Fields requested:** `product_name, product_name_en, brands, nutriments, serving_size`
- **Nutrition mapping:** `energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g` (all per 100g, scaled to serving)
- **Fallback:** If Open Food Facts returns incomplete data (all macros zero), the app retries against USDA Branded Foods using the barcode as a GTIN
- **Timeout:** 8 seconds per request; gracefully degrades to USDA fallback on timeout
- **Coverage:** Open Food Facts is community-contributed; US branded product coverage is variable. The USDA fallback improves US coverage significantly.

---

### Strava

Pulls cardio activity data for training load calculations and the Workouts library.

- **OAuth 2.0 flow:** CSRF-protected with `crypto.randomUUID()` state token stored in `sessionStorage`. Scope requested: `activity:read_all` (read-only; app cannot post to Strava).
- **Token storage:** Access token stored in `UserProfile.strava_access_token` (client-accessible). Refresh token stored server-side only in `strava_tokens` table (RLS blocks client reads). Rotated on each refresh.
- **Token refresh:** Checked 60 seconds before expiry. Refresh handled by the `strava-token` Edge Function automatically on app load.
- **Sync interval:** 4 hours (hardcoded). Triggered on app load via `useStravaAutoSync`.
- **Strava API rate limits:** 600 requests per 15 minutes per authenticated user (Strava-enforced). The app does not implement client-side rate limiting — it relies on Strava returning 429 errors.
- **Supported activity types:** Run, VirtualRun, Ride, VirtualRide, Swim, Walk, Hike, WeightTraining, Workout, Yoga, Rowing, NordicSki, AlpineSki, EllipticalTrainer, StairStepper
- **Data fields pulled:**

| Strava Field           | Stored As              | Notes                                          |
| ---------------------- | ---------------------- | ---------------------------------------------- |
| `id`                   | `strava_activity_id`   | Used for deduplication                         |
| `type`                 | `activity_type`        |                                                |
| `name`                 | `name`                 |                                                |
| `start_date`           | `start_date`           |                                                |
| `distance`             | `distance_meters`      |                                                |
| `moving_time`          | `moving_time_seconds`  | Used for TSS calculation                       |
| `elapsed_time`         | `elapsed_time_seconds` |                                                |
| `total_elevation_gain` | `total_elevation_gain` |                                                |
| `average_speed`        | `average_speed`        |                                                |
| `max_speed`            | `max_speed`            |                                                |
| `average_heartrate`    | `average_heartrate`    | Nullable — not all activities have HR data     |
| `max_heartrate`        | `max_heartrate`        | Nullable                                       |
| `average_cadence`      | `average_cadence`      | Nullable                                       |
| `calories`             | `calories`             | Nullable — Strava estimate, not always present |
| `map.summary_polyline` | `map_polyline`         | Used for route map display                     |

- **What Strava does not provide / limitations:**
  - No power data (watts) without a compatible device
  - Calorie data is Strava's estimate and may be absent for manually-entered activities
  - Heart rate data requires a paired HR monitor during the activity
  - Map polyline is a summary (not full GPS track); sufficient for route display but not turn-by-turn
  - Historical backfill: syncs the most recent activities on connect; very old historical data may not sync

---

### Web Push API

Browser push notifications for workout reminders and weekly check-ins.

- **Standard:** W3C Web Push with VAPID authentication
- **Subscription flow:** User grants browser permission → `pushManager.subscribe()` → endpoint + `p256dh` + `auth` keys stored in `push_subscriptions` table (upserted on endpoint)
- **Server-side triggers:** `send-daily-workout-reminder` and `send-weekly-checkin-reminder` Edge Functions (cron-scheduled)
- **Local notifications:** `showLocalNotification()` triggers via the service worker without a server round-trip (used for immediate feedback)
- **Browser support:** Requires `navigator.serviceWorker` and `window.PushManager`. Not supported in Safari on iOS <16.4 (now supported in iOS 16.4+ with PWA installed to home screen). Gracefully disabled if unavailable.
- **HTTPS requirement:** Web Push and service workers require HTTPS in production. Local development requires `VITE_HTTPS=true`.

---

## ML / Recommendation System

Located in `/src/ml/`.

| File                  | Role                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `mlRecommender.js`    | Entry point — orchestrates rest-day detection, personalized exercise selection, weekly plan generation     |
| `workoutModel.js`     | Rule-based workout generator using user profile (goals, equipment, frequency, level). Production baseline. |
| `workoutModelML.js`   | Feature-vector ML model wrapper for workout generation (secondary layer)                                   |
| `exerciseDB.js`       | Built-in database of **274 exercises** with full metadata                                                  |
| `fitnessTemplates.js` | Pre-built workout templates for common goal × equipment combinations                                       |
| `rfModel.js`          | Random Forest classifier for exercise personalization                                                      |
| `modelTrainer.js`     | Trains the RF model on accumulated user reaction data (likes/dislikes on exercises)                        |
| `syntheticData.js`    | Generates synthetic training samples for bootstrapping the model before sufficient real data exists        |

### Exercise Database Detail

**274 exercises** with the following metadata per entry:

| Field             | Values                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primaryMuscle`   | Array: Quads, Glutes, Hamstrings, Core, Chest, Back, Triceps, Shoulders, Biceps, Forearms, Calves, Traps, Lats, Rhomboids, Rear Delts, Obliques, Adductors, Abductors, Lower Back, Posterior Chain                                                                      |
| `secondaryMuscle` | Array of supporting muscles                                                                                                                                                                                                                                             |
| `type`            | Compound, Isolation, Isometric, Machine                                                                                                                                                                                                                                 |
| `difficulty`      | 1 (beginner), 2 (intermediate), 3 (advanced)                                                                                                                                                                                                                            |
| `equipment`       | Array: bodyweight, dumbbells, kettlebell, barbell, rack, bench, cable, machine, resistance_bands, pull_up_bar, trap_bar, box                                                                                                                                            |
| `pattern`         | 21 movement patterns: Squat, Hinge, Lunge, Step, Bridge, Horizontal Push, Vertical Push, Incline Press, Decline Press, Horizontal Pull, Vertical Pull, Elevation, Flexion, Abduction, Adduction, Plantar Flexion, Static Hold, Anti-Rotation, Anti-Extension, Extension |
| `goalTags`        | Array: general_fitness, weight_loss, muscle_gain, endurance, flexibility                                                                                                                                                                                                |
| `isCardio`        | Boolean                                                                                                                                                                                                                                                                 |

**Lookup:** Case-insensitive fuzzy match — exact match first, then substring in either direction.

### Random Forest Model

- **Algorithm:** Vanilla JavaScript Random Forest (no external ML library — `ml-random-forest` v2.1.0 has a known browser compatibility bug)
- **Configuration:** 5 trees, max depth 6, max 4 features per split, min 8 samples to split
- **Training time:** ~150ms on a typical dataset
- **Reported accuracy (beta):** 77.6% on the 274-exercise personalization problem
- **Feature engineering:** Per (userProfile, exercise) pair — goal alignment score, equipment match, difficulty match, movement pattern compatibility, muscle group overlap
- **Output:** Probability score per exercise (0–1, fraction of trees voting "like"); ranked list sorted by probability

### Model Caching

- Stored in `localStorage` as `sisyphus_rf_model_v1` and `sisyphus_rf_model_meta_v1`
- Cache validity: 7 days. Stale models trigger automatic retraining on next app init.
- Persists: training accuracy, feature count, example counts, timestamp

### Training Data & Cold Start

- **Primary signal:** `exercise_reactions` table (user likes/dislikes on exercises logged after sessions)
- **Cold start handling:** New users with fewer than 10 reactions fall back to the rule-based `workoutModel.js` generator automatically. ML model activates once 10+ reactions are logged.
- **Synthetic bootstrap:** `syntheticData.js` generates artificial (userProfile, exercise, reaction) triplets from fitness templates to seed training before real data accumulates. Real data is weighted 3× higher than synthetic data during training.
- **Training trigger:** On app init via `initializeML()` and after new reactions are logged (`retrainModel()`)

### Fallback Chain

1. RF model (if trained and cached)
2. Rule-based `generateWorkoutPlan()` from `workoutModel.js`
3. Template-based defaults from `fitnessTemplates.js`

### How a Week is Generated

1. "Generate Week" reads user profile (goals, equipment, days/week, history, reactions, readiness check-in scores)
2. `mlRecommender.js` calls `workoutModel.js` or `workoutModelML.js` to produce workout objects for each training day
3. `fatigueManagement.js` checks recovery windows per muscle group to prevent back-to-back overloading
4. The proposed week is shown in an approval modal — user can accept, regenerate, or edit individual days before saving to the schedule

---

## Utilities

| File                    | Purpose                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nutritionUtils.js`     | Aggregate macros from food entries, compute daily trends, recent foods, unit conversions                                                           |
| `coachingUtils.js`      | TDEE calculation (Mifflin-St Jeor), macro splits, protein recommendations, phase-based calorie targets, adaptive TDEE from real weight + food data |
| `exerciseStats.js`      | Unique exercise list, per-exercise history, volume calculations, personal records (all-time best weight × reps per exercise)                       |
| `fatigueManagement.js`  | Recovery window checks per muscle group, overall recovery score, training load warnings                                                            |
| `trainingLoad.js`       | Combines workout logs and cardio into Training Stress Score (TSS), CTL, ATL, TSB                                                                   |
| `programProgression.js` | Calculate target weights for a given program day, auto-increment logic, stall detection, deload detection, state transfer on exercise replacement  |
| `muscleVolumeUtils.js`  | Map exercises → muscle groups → heatmap intensity values                                                                                           |
| `exerciseReplacer.js`   | Suggest equipment-compatible or injury-safe substitutions for a given exercise                                                                     |
| `programSchedule.js`    | Resolve today's program workout from enrollment state; build a full weekly grid from a program                                                     |
| `programIO.js`          | Serialize/deserialize programs to/from portable JSON                                                                                               |
| `checkinUtils.js`       | Daily readiness check-in state and scoring logic                                                                                                   |
| `runningAdaptation.js`  | Auto-adjust cardio targets based on recent running performance trends                                                                              |
| `imageUpload.js`        | Handle workout photo uploads to Supabase Storage                                                                                                   |
| `dateUtils.js`          | Timezone-aware today string, week start/end calculations                                                                                           |

### TDEE Calculation Detail

**Formula method (Mifflin-St Jeor):**

```
BMR = 10 × weight_kg + 6.25 × height_cm − 5 × age + (5 if male, −161 if female)
TDEE = BMR × activity_multiplier
```

Activity multipliers: Sedentary 1.2 · Lightly Active 1.375 · Moderately Active 1.55 · Very Active 1.725 · Extremely Active 1.9

**Adaptive method (from real data):**

- Requires 14+ days with both weight entries and food logs (minimum 10 logged food days)
- Formula: `TDEE = average_daily_calories − (weekly_weight_change_lbs × 500)`
- Confidence tiers: Low (14–20 days), Medium (21–27 days), High (28+ days)

**Selection priority:**

1. Manual `tdee_override` in profile
2. Adaptive TDEE (if confidence is medium or high)
3. Formula TDEE (fallback)

**Protein suggestion:** 1.2 g/lb during cuts · 1.0 g/lb for muscle gain · 0.8 g/lb for general fitness · capped at 250 g

### Training Stress Score (TSS) Detail

**Cardio TSS (HR-based, TRIMP-derived):**

```
TSS = (duration_hours) × (avg_hr / max_hr)² × 100
```

- `max_hr` estimated as `220 − age`
- Capped at 300 per session

**Lifting TSS (RPE-based):**

```
TSS = (duration_hours) × (avg_rpe × 10) × 0.8
```

- RIR converted to RPE: `RPE = 10 − RIR`
- Falls back to RPE 7 (RIR 3) if no RIR logged
- Capped at 250 per session

**Fitness / Fatigue metrics (require 28+ days of data):**

- **CTL (Chronic Training Load):** 42-day exponential moving average of daily TSS
- **ATL (Acute Training Load):** 7-day exponential moving average of daily TSS
- **TSB (Training Stress Balance):** CTL − ATL. Positive = fresh; negative = accumulated fatigue.

---

## Security Architecture

- **Authentication:** Supabase JWT sessions. All protected routes check auth state via `AuthContext`. No session data stored in non-httpOnly cookies.
- **Row-Level Security:** RLS enforced on all user data tables. Users can only read and write their own records. Social tables (feed, friends) have multi-user RLS via Supabase functions.
- **Strava refresh token:** Never sent to the client. Stored server-side in `strava_tokens` table (client RLS blocks reads). Accessed only by the `strava-token` Edge Function using the Supabase service role key.
- **Edge Function auth:** All Edge Functions verify the caller's Supabase JWT before executing. Requests without a valid Bearer token are rejected.
- **USDA rate limiting:** Server-side, enforced in the `usda-proxy` Edge Function before forwarding to USDA. Logged to `usda_request_log` for audit trail.
- **CORS:** Edge Functions return `Access-Control-Allow-Origin: *` (standard for browser-facing APIs).
- **Push subscriptions:** Stored in `push_subscriptions` table with user-scoped RLS. VAPID keys prevent unauthorized push senders.
- **Strava OAuth CSRF:** State token generated with `crypto.randomUUID()`, stored in `sessionStorage`, validated on callback before exchanging the code.

---

## Known Limitations & Constraints

### Exercise Database

- **274 exercises** — a solid general-purpose library but not exhaustive. Uncommon or highly specialized movements may be missing. Users can type any name during logging; unrecognized names are stored as freeform strings but receive no muscle group metadata, which means they don't appear in heatmaps or influence the ML model.
- Lookup is fuzzy but not AI-powered — if a user types a synonym or brand name (e.g., "leg press" vs. "machine leg press"), matching depends on substring overlap.

### ML Recommender

- The RF model was developed during beta with **21 reactions across 3 users** — well below the 500+ interactions needed for collaborative filtering (SVD, Apriori). Those approaches are implemented but disabled due to overfitting risk.
- The rule-based fallback in `workoutModel.js` is the de-facto production algorithm. The RF model is an enhancement layer, not the core engine.
- New users get generic, profile-rule-based recommendations until they accumulate 10+ exercise reactions.
- Model is per-device (localStorage) — not shared across devices or users. No server-side model hosting.

### Strava Integration

- Read-only. The app cannot post workouts back to Strava.
- Sync is polling-based (4-hour interval), not webhook-driven. New Strava activities take up to 4 hours to appear.
- Heart rate data, calorie data, and cadence are nullable — many activities won't have them, which degrades TSS accuracy.
- The TSS calculation for cardio uses `220 − age` as max HR, which is a population-average estimate. Individual max HR varies significantly; no way to calibrate without a true max HR test.
- Historical backfill depth depends on Strava API pagination behavior at connection time; very long activity histories may not fully sync.
- Strava's published API rate limit (600 req/15 min) is not enforced client-side — a bug or infinite loop could trigger a 429 lockout.

### Food / Nutrition

- **USDA coverage:** Generic whole foods and major US branded products are well-covered. Niche products, regional brands, and restaurant items may be absent.
- **Open Food Facts:** Community-contributed; data quality and completeness vary, especially for non-US products. Barcodes for the same product may appear under multiple entries with inconsistent macros.
- **Barcode scanning:** Requires camera access and HTTPS. Open Food Facts lookup has an 8-second timeout; slow network conditions cause visible latency before the USDA fallback fires.
- **Custom foods:** Macros are user-entered; no validation against official data.
- **Adaptive TDEE:** Requires consistent daily weigh-ins and food logging for 14+ days. Most users will see formula TDEE for the first 2 weeks.
- **No micronutrient tracking:** The app tracks calories, protein, carbs, and fats only. Vitamins, minerals, fiber, and sodium are not surfaced even when available from USDA.

### Training Load (TSS/CTL/ATL)

- CTL/ATL/TSB metrics require 28+ days of logged data. New users see no training load graphs.
- Lifting TSS accuracy depends on users logging RIR/RPE. Without those inputs, the model assumes RPE 7, which may over- or underestimate stress.
- HR-based cardio TSS uses an age-estimated max HR — inaccurate for individuals with significantly above- or below-average cardiovascular fitness.

### PWA / Offline

- The PWA implementation is minimal. There is no configured service worker caching strategy (no `vite-pwa` plugin). The app is installable to the home screen and has a manifest, but offline functionality is limited to whatever the browser caches automatically.
- Internet-dependent features: food search, Strava sync, auth, all database reads/writes, social features, push notifications.
- Potential offline features (not yet implemented): exercise database access, in-progress session logging (localStorage persistence already exists).

### Push Notifications

- Requires explicit user permission grant. Many users decline browser notification prompts.
- Not supported on iOS Safari below version 16.4, or when the PWA is not installed to the home screen on iOS.
- No in-app notification center — notifications are ephemeral browser/OS alerts.

### Social

- Leaderboard 1RM estimation method and the specific Supabase RPC implementation are not exposed in client code — behavior depends on the database function definition.
- No moderation tools for shared content beyond deletion by the owner.
- Comments are not threaded.

### Auth

- Email/password only — no Google, Apple, or other social login. Higher friction for new user signups.
- No multi-factor authentication (MFA).

### Data Export

- Exports as CSV (3 files). No JSON export for food/weight data (JSON export exists for workouts and programs via separate UI controls).
- No date range filter on export — exports full history.
- No import capability for food or weight data.
