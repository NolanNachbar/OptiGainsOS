# Sisyphus' Schedule — Production Launch Audit

**Date**: May 2026 | **Auditor**: Senior technical review (full codebase read)
**Stack**: React 19 + Vite 7 + Supabase + TanStack Query v5 + vanilla-JS Random Forest

---

## Executive Summary

**Verdict: YELLOW — Pilot-ready after five specific fixes.**

The core workout and program engine is genuinely production-worthy. The session persistence architecture is sound. The ML is real. The USDA proxy is smart. The progression math is solid. The feature gap versus Hevy or Strong does not exist — this app competes on features.

What makes it YELLOW: three functional holes sit directly in the marketing funnel (crash reporting missing, analytics missing, conversion CTA missing on the deep-link page). Without those three, you cannot measure what the pilot teaches you and you cannot convert the users the deep link brings in. Those are not polish problems — they are pilot-fatal.

The remaining gaps — no CSV import, 3-step onboarding vs. the marketed 6-step TDEE wizard, no monetization infrastructure — are real but not blocking for a controlled gym pilot if you fix the funnel first.

---

## Section 1: Core Functional Integrity

### Workout Logging

**Rating: Solid with one silent failure mode.**

`useWorkoutSession.js` is well-designed. Sessions are persisted to a `workout_sessions` Supabase table on create, updated on every set, and marked complete or cancelled on finish. The resume-detection pattern (check for `in_progress` session on mount, offer resume) handles interruption correctly. Cross-device sync works because state lives in Supabase, not localStorage.

The one real problem: `saveProgress()` is fire-and-forget.

```js
// useWorkoutSession.js:84
const saveProgress = (exercises, notes) => {
  const id = sessionIdRef.current;
  if (!id) return;
  supabase
    .from("workout_sessions")
    .update({ exercises, notes: notes || null })
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("Error saving workout session progress:", error);
    });
};
```

If the network drops between sets — which happens in basements, parking garages, and gyms with concrete walls — the error is logged to console only. The user sees nothing. The next `saveProgress` call may also fail. On a bad connection, the user can complete a full workout and lose every set logged after the last successful save. There is no offline queue, no retry, no toast on save failure. This is the most operationally risky issue in the app for gym use specifically.

**Secondary issue**: No transaction atomicity between `createSession`, the final `completeSession`, and the `workout_logs` write. If `completeSession` succeeds but the workout log write fails, the session is marked complete but no permanent log exists.

### Program Execution Engine

**Rating: Strongest utility in the codebase.**

`programProgression.js` is the best-written code in the project. The RIR-based progression logic handles:
- Average RIR calculated excluding the final set (correct — users intentionally take the last set to failure)
- Per-exercise stall detection after 3 sessions at the same weight
- Muscle group weekly set tracking with automatic week-start reset
- Exercise substitution carries working weight but resets session count
- Advisory coaching messages calibrated by exercise type (compound vs. isolation)

There is no deload automation. The `skip_deload` flag exists in onboarding state but the progression engine has no logic to trigger a deload week automatically. Users receive stall suggestions ("consider a short deload") but nothing is scheduled. For 5/3/1 users who expect automatic deload scheduling, this is a gap.

**Week counter edge case**: The weekly muscle counter resets by comparing the `last_trained` date to the current week start. If a user takes a full week off and returns, the reset fires correctly. But if the user has never logged a workout, `lastTrainedDates` is empty and the reset never runs. Minor, but can cause stale volume counts in edge cases.

### JSON Import Resilience for Advanced Programs

**Rating: Partially ready. Handles structure, silently degrades on exercise names.**

`parseProgramJson` (programIO.js:77-136) correctly handles:
- Bounds enforcement on cycle\_length (1–30) and num\_cycles (1–20)
- String length limits on all fields
- Missing day filling up to cycle\_length
- Sensible defaults throughout

What it does not do: validate exercise names against the exerciseDB. An imported 5/3/1 program using "Barbell Back Squat" instead of "Squat" will import successfully, but `lookupExercise()` returns null, the lower-body increment (5%) falls back to upper-body default (2.5%), and muscle group tracking does not fire.

For 5/3/1 specifically: the schema has no field for percentage-based loading (e.g., "work at 75% of training max"). The progression system is absolute-weight-based. A real 5/3/1 import would need manual starting weight entry and treats the program as linear progression with RIR targets — a fundamentally different model.

**Critical gap: No CSV import.** The entire spreadsheet-replacement pitch requires users to either recreate their program in the builder or hand-craft a JSON file. A real intermediate lifter with 5/3/1 in Google Sheets cannot import it. This is the largest functional gap for the stated target user.

### Food Tracking

**Rating: API architecture is correct. Coverage adequate for gym pilot, borderline for consumer launch.**

The USDA proxy architecture is the right call — it keeps the API key server-side, requires auth on every call, and the Edge Function pattern is appropriate. Dual-source barcode lookup (Open Food Facts → USDA branded) is a sensible fallback chain.

The USDA proxy function has no rate limiting. With gym users actively tracking nutrition, this is a real budget risk. Add a per-user daily call limit before consumer launch.

**API sufficiency assessment**:

| Criteria | USDA FDC | Verdict |
|---|---|---|
| Generic/whole foods | Excellent (SR Legacy, Foundation) | Ready |
| US branded foods | Good (Branded database) | Ready |
| International foods | Limited | Gap |
| Protein powders, bars | Inconsistent | Gap |
| Barcode coverage | Via OFF fallback | Adequate |
| Cost | Free (1000 req/hr/IP) | Ready |

**Recommendation**: Keep USDA for gym pilot. If branded food misses become a consistent complaint post-pilot, evaluate Edamam ($0–$0.004/call, better branded coverage). Do not migrate before you have evidence the gap matters.

### Social System

**Rating: Functional but not hardened for public acquisition.**

The social layer exists and works. Privacy controls are implemented. The leaderboard correctly scopes to friends + self. Content moderation: none visible. Abuse reporting: none visible.

One specific finding on user search — exact username lookup does not filter by `privacy_level`. A private user can be discovered by exact username match. Whether this is intentional is a product decision, but it should be explicit.

### ML Recommendations

**Rating: Real ML, launch-worthy. Three caveats the team should understand.**

This is a genuine random forest in vanilla JavaScript (`rfModel.js`). Bootstrap sampling, gini-based splitting, majority-vote prediction across 5 trees. Not a rule-based system. The fallback chain (cached model → retrain → rule-based) is appropriate.

**Caveat 1 — Training accuracy is not predictive accuracy.**

The logged "77.6% accuracy" is measured on the training data with no held-out test set. On mostly-synthetic data, a random forest will trivially memorize training examples. The real accuracy for a new user with minimal real reactions is unknown. Do not cite this number as a performance claim.

**Caveat 2 — All users' reactions train the model together.**

`loadRealReactions` fetches ALL exercise reactions without a user\_id filter. This is collaborative filtering by design but constitutes a privacy consideration that should be in your privacy policy. If RLS on `exercise_reactions` restricts reads to own rows, the query returns empty and the model trains on synthetic data only — which defeats the purpose. Confirm RLS intent is intentionally permissive for reads.

**Caveat 3 — Model is device-local.** The trained model lives in `localStorage`. A new device or incognito session starts from the rule-based fallback. Acceptable for Phase 1.

---

## Section 2: Security and Trust Audit

### Authentication

Standard Supabase auth. Session persistence, auto-refresh, and global sign-out are correctly implemented. Account deletion uses a transactional RPC (`delete_user_data`) that rolls back on failure. Password reset redirect URL is configured correctly.

### Admin Access Control — High Priority

```jsx
// ProtectedAdminRoute.jsx
export default function ProtectedAdminRoute({ children }) {
  const { profile, isLoading } = useProfile();
  if (isLoading) return <LoadingScreen />;
  if (!profile?.is_admin) return <Navigate to="/dashboard" replace />;
  return children;
}
```

This is a UI gate only. Any authenticated user can call admin Supabase functions directly from browser dev tools. Security depends entirely on RLS policies enforcing `is_admin` at the database level. Confirm your RLS policies on admin-readable tables do not rely on the UI gate.

### Vulnerability Priority List

**Critical**: None identified assuming RLS is correctly configured.

**High**:
1. Admin route is UI-gate only — audit RLS policies on admin tables
2. `loadRealReactions` fetches all users' reactions — confirm RLS intent is permissive reads
3. USDA proxy has no rate limiting — budget abuse risk at consumer scale

**Medium**:
4. Private user existence discoverable via exact username search
5. `saveProgress` fire-and-forget — silent data loss during network interruptions with no user feedback
6. No CSRF token (mitigated by JWT header-based auth, but document this assumption)
7. `sanitizeHtml` uses manual string replacement, not DOMPurify — insufficient if output is ever rendered as HTML

**Low**:
8. USDA proxy `Access-Control-Allow-Origin: "*"` — exposes endpoint URL to discovery
9. No Sentry or crash reporting — operational blind spot
10. Analytics absent — cannot detect abuse patterns or anomalous usage

---

## Section 3: Consumer UX Readiness

### Onboarding: What the Code Says vs. What the Marketing Says

**The marketing plan describes a 6-step wizard with TDEE collection. The code is 3 steps, and TDEE is not collected.**

```jsx
// Onboarding.jsx:163-168
{[1, 2, 3].map(i => (   // Only 3 steps
  <div key={i} className={`h-1.5 rounded-full ...`} />
))}
<p className="text-xs text-slate-400 mt-2">Step {step} of 3</p>
```

The `formData` state contains `height_cm`, `age`, `sex`, `activity_level` fields, but they are never presented to the user in the 3-step flow. `handleSubmit` explicitly deletes them if empty. Calorie goals use `DEFAULT_GOALS` constants — they are not calculated from the user's TDEE. This is a significant gap between the marketing claim and the implementation.

**Step-by-step dropout risk assessment**:

| Step | Content | Drop-off Risk |
|---|---|---|
| 1 | Username, display name, privacy | Medium — username character restrictions frustrate users with short names |
| 2 | Fitness level, goals | Low — clear selections |
| 3 | Equipment, duration, days/week, extras | Medium — too many decisions at once |

No "skip" option visible. If the user closes the tab mid-onboarding, their profile is not created and they restart from Step 1 on next login.

### First-Session Activation Path

Onboarding completes → `navigate("/dashboard")` with generated workout plan in query cache.

The path from dashboard to "first workout logged" requires the user to find and click into a workout without explicit direction. The UI audit scores Dashboard as the weakest screen. If the generated week is not immediately prominent post-onboarding, users land on a dense page with no clear next action. The "3-second time-to-value" goal requires the generated week to be the first visible element after onboarding completes.

---

## Section 4: Monetization Architecture

No paywall, Stripe, or subscription management exists in the codebase. The app is fully free.

**Recommended architecture**:

**Free tier (forever)**:
- 2 custom programs max
- 30 days of food logging history
- Unlimited workout logging
- Community program enrollment (view and enroll, no creation)
- Social features (basic follow/feed)
- ML recommendations

**Pro ($9/month or $72/year)**:
- Unlimited programs
- Full food logging history + export
- JSON import/export
- Strava integration
- Full analytics (training load charts, bodyweight trend, TDEE tracking)
- Priority ML retraining (retrains on reaction, not weekly)

**The "aha moment"**: When a user successfully enrolls in a program with their starting weights set and sees the first workout queued with progression targets pre-calculated. This is the moment the app earns its promise. The paywall should sit immediately before or after this event.

**Recommended placement**: Option C — gate the second program creation or JSON import. First program and first 30 days free.

---

## Section 5: Feature Completeness

**Must-have before gym pilot**:

| Feature | Status | Effort |
|---|---|---|
| Crash reporting (Sentry) | Missing | 1 day |
| Analytics instrumentation (PostHog) | Missing | 1 day |
| "Sign up to enroll" CTA for unauthenticated deep links | Missing | 2–3 hours |
| Rate limiting on USDA proxy | Missing | 2–3 hours |
| Offline workout queue | Missing | 3–5 days |
| 5/3/1, GZCLP, PPL template seeding | Missing | 2–3 days |

**Must-have before public launch**:

| Feature | Status |
|---|---|
| Monetization / Stripe | Missing |
| TDEE collection in onboarding | Missing |
| Privacy policy and Terms of Service | Missing |
| Medical disclaimer on ML recommendations | Missing |
| Account deletion UI accessible from settings | Exists in code, unverified in UI |
| Apple Sign In (App Store requirement) | Missing |

**Nice-to-have**:
- CSV/Excel import
- Cross-device ML model sync
- Chart redesign (per UI audit)
- Template marketplace with ratings
- Percentage-based loading field in exercise schema (for authentic 5/3/1)

---

## Section 6: Gym Pilot Readiness

### Spreadsheet Extraction Lab

**5/3/1**: Structure yes, semantics no. The day/cycle grid handles the week structure. But percentage-based loading ("work at 75% of training max") has no field in the schema. The app treats 5/3/1 as linear progression with RIR targets — a different model.

**GZCLP**: Yes. GZCLP is essentially linear progression with stall-triggered deloads. The stall detection (3 sessions, same weight) and adjustment suggestions align well.

**DUP templates**: Partial. Daily undulating periodization needs different rep schemes per session for the same exercise. Possible but requires duplicate exercise configurations per day — manual setup required.

### QR Deep Link Funnel Audit

`/program/:id` is publicly accessible (no `ProtectedRoute` wrapper in `App.jsx`). Good for cold-start. Two issues:

1. `useEnrollment` in `useProgramQueries.js` accesses `user.id` in its query function. If there is no `enabled: !!user` guard, this throws a TypeError when an unauthenticated user visits. **Needs immediate confirmation.**

2. No "Sign up to enroll" CTA exists for unauthenticated users. The Enroll button renders, user clicks it, mutation fires with `user` null, fails with no meaningful feedback. The entire marketing funnel ends at a dead end.

### In-Person Test Script

1. Hand user phone, no app installed. Give QR code URL. Observe: Do they reach Program Detail? How long?
2. Click Enroll. Observe: Does signup redirect work? Do they lose their place?
3. Complete signup. Observe: Do they return to the program, or land on dashboard confused?
4. Set starting weights and enroll. Observe: Cognitive load of the weight-entry dialog.
5. Navigate to first workout. Log 3 sets with RIR. Observe: Is the RIR field discoverable?
6. Interrupt: close browser tab. Reopen. Observe: Does resume session prompt appear?
7. Complete workout. Observe: Is success state clear? Does next day index advance?
8. Log a post-workout meal. Observe: Can they find a common food within 30 seconds?
9. Return the next day and start the next workout. Observe: Is today's workout discoverable from Dashboard or Schedule?

---

## Section 7: App Store Conversion Feasibility

**Technical effort: Moderate (Capacitor wrapper) to Major (native rebuild)**

**Current assets**:
- `manifest.json` and `sw.js` present — valid PWA, installable from browser
- Service worker handles push notifications via VAPID
- Supabase auth works in WebView

**App Store blockers before submission**:

| Blocker | Notes |
|---|---|
| Account deletion must be in-app | Code exists, confirm settings UI exposes it |
| Subscriptions via IAP only | Stripe not allowed for in-app purchases — requires RevenueCat + StoreKit |
| Apple Sign In required if social login added | N/A now, blocks future OAuth addition |
| Privacy policy URL required | Missing |
| ATT framework if analytics added | PostHog/Mixpanel require ATT disclosure |
| Offline capability | Fitness category App Store expectations include offline logging |

**Recommendation: Stay web-only initially (Option A).**

- Target user already uses web tools for program planning
- PWA is installable from browser — covers gym use case
- Build Stripe paywall before App Store = lower acquisition cost per paying user
- Workout logging screen needs thumb-first redesign regardless — do it once for native, not twice

Revisit Capacitor wrapper (Option B) after reaching $3–5k MRR. Commit to native rebuild (Option C) only with validated revenue and a clear retention advantage requiring native APIs (HealthKit, Apple Watch).

---

## Section 8: Launch Decision

**YELLOW — Pilot-ready after fixes. Not ready in current state.**

### The Five Blocking Issues

1. **No crash reporting.** If something breaks during the pilot, you won't know until a user tells you. Sentry takes one day to add. Without it, pilot data is unreliable.

2. **No analytics.** You cannot measure QR scan → signup → enrollment → first workout completion. Without a funnel, the pilot produces no quantitative learning.

3. **Missing conversion CTA on `/program/:id` for unauthenticated users.** A user scans the QR code, sees the program, clicks Enroll, gets an error or nothing. The funnel ends. Highest-priority fix in the codebase.

4. **`useEnrollment` null-user safety unconfirmed.** The public program page may throw a TypeError on unauthenticated visit. Needs immediate verification.

5. **No offline workout logging.** Gyms have inconsistent cell service. Fire-and-forget saves that fail silently produce user reports of "the app lost my workout." This poisons the pilot.

---

## Top 10 Fixes Ranked by Impact

| Rank | Fix | Effort | Why It Matters |
|---|---|---|---|
| 1 | Add Sentry crash reporting | 1 day | Blind without it |
| 2 | Add PostHog analytics (funnel tracking) | 1 day | Can't measure the pilot |
| 3 | Add "Sign up to enroll" CTA for unauthenticated `/program/:id` visitors | 2–3 hours | This is the entire marketing funnel endpoint |
| 4 | Verify `useEnrollment` has `enabled: !!user` guard | 30 min | Potential crash on deep-link cold start |
| 5 | Add offline workout save queue (IndexedDB + service worker sync) | 3–5 days | Gyms have bad cell service; silent failure causes data loss |
| 6 | Add TDEE / body stats step to onboarding | 1–2 days | Marketing claims 6-step wizard; code has 3; calorie targets are defaults |
| 7 | Rate limit USDA proxy (per-user daily cap) | 2–3 hours | Budget risk at any real user count |
| 8 | Seed 5/3/1, GZCLP, PPL templates | 2–3 days | Content seeding is the stated hard dependency |
| 9 | Add percentage-based loading field to exercise schema | 2–3 days | Required for authentic 5/3/1 import |
| 10 | Add medical/liability disclaimer on ML and nutrition coaching | 1 hour | Legal hygiene before any real user acquisition |

---

## 30-Day Launch Hardening Plan

### Week 1: Funnel Integrity
- Days 1–2: Sentry + PostHog. Instrument: signup, onboarding completion, program enrollment, first workout complete, food log entry.
- Day 3: Fix `/program/:id` unauthenticated UX. Add "Sign up to start this program" CTA. Verify `useEnrollment` null-user safety.
- Days 4–5: USDA proxy rate limiting. Medical/liability disclaimer in UI.

### Week 2: Content Seeding + Program Fidelity
- Days 1–3: Build and seed 5/3/1 (basic variant), GZCLP, PPL templates. Run each through `programProgression.js` to confirm targets calculate correctly across two cycles.
- Days 4–5: Add TDEE collection step to onboarding. Connect to calorie goal calculation so defaults are personalized.

### Week 3: Operational Resilience
- Days 1–3: Offline workout queue. IndexedDB local save on set log, service worker background sync to Supabase when connectivity returns. Toast on save failure.
- Days 4–5: `saveProgress` retry logic with backoff. User-visible save status indicator on workout logging.

### Week 4: Pilot Prep
- Days 1–2: UI priority fixes (gradient removal, button system, font — hours per fix, not days).
- Day 3: QR funnel dry run with 3 internal users following the test script above.
- Days 4–5: Fix anything the dry run surfaces. Ship.
