# OptiGains UI Audit — Surface Inventory

Mobile-first (390px) audit coverage map. Source of truth for the convergence loop.
Derived from `src/App.jsx`, `src/pages/*.jsx`, `src/components/Layout.jsx`, and an overlay grep.

- **baseUrl:** `http://localhost:5173` (pre-existing dev server; PWA service worker anchors this origin)
- **Auth:** the browse session is already authenticated (login `nvtnachbar@gmail.com`)
- **Browser:** `browse` is a single shared Chromium daemon → capture is serialized; audit/fix fan out.
- **Total surfaces:** 26 pages + 39 overlays = **65**

## Pages (26)

| id | route | reach (mobile) |
|----|-------|----------------|
| login | /login | needs logout (authed nav redirects to /dashboard) |
| forgot-password | /forgot-password | from /login (needs logout) |
| reset-password | /reset-password | email recovery link (needs token) |
| dashboard | /dashboard | default landing (Today dock) |
| train-schedule | /train?tab=schedule | Train dock → Schedule |
| train-library | /train?tab=library | Train dock → Library |
| train-programs | /train?tab=programs | Train dock → Programs |
| train-activity | /train?tab=activity-log | Train dock → Activity |
| fuel-nutrition | /fuel | Fuel dock → Nutrition |
| fuel-body | /fuel?tab=body | Fuel dock → Body |
| fuel-hydration | /fuel?tab=hydration | Fuel dock → Hydration |
| athlete-state | /athlete-state | Body dock → State |
| recovery | /recovery | Body dock → Recovery |
| physique | /physique | Body dock → Physique |
| insights | /insights | Analyze dock → Daily Brief |
| brief-history | /brief-history | Analyze dock → Brief History |
| mind | /mind | Analyze dock → Mind |
| career | /career | direct URL (unlinked in current IA) |
| profile | /profile | header avatar tap |
| weekly-schedule | /weekly-schedule | Train → Schedule → Edit week |
| program-detail | /program/:id | Train → Programs → tap program (needs real id) |
| program-builder | /program-builder | Train → Library → Create Program |
| create-workout | /create-workout | FAB → Create Workout |
| food-tracker | /food-tracker | FAB → Log Food |
| quick-workout | /quick-workout | FAB → Quick Workout |
| workout-detail | /workout-detail | Dashboard → Start Workout (needs params) |

## Overlays (39)

Grouped by host. Each reachable via the trigger noted in `STATE.json`.

- **Global FAB / dashboard:** weigh-in-modal, calculators-modal, stream-note-modal, sonner-toast
- **Food Tracker:** add-food-dialog, save-meal-template-dialog, meal-templates-sidebar, recipe-builder-panel, stats-setup-modal, barcode-scanner-modal, new-meal-dialog, meal-ideas-panel
- **Fuel:** macro-goals-modal, week-plan-dialog, quick-capture-modal
- **Workout logging:** workout-detail-share-modal, rest-timer-overlay, workout-logging-confirm-dialog
- **Program builder / create:** program-duration-modal, schedule-after-create-modal
- **Weekly schedule:** custom-split-selector-dialog
- **Program detail:** program-enroll-dialog, program-restart-dialog, program-delete-dialog, program-workout-detail-modal, all-cycles-modal, all-progression-modal, confirm-pause-dialog
- **Train library:** format-guide-dialog
- **Mind:** mind-add-reading-dialog, mind-edit-reading-dialog, mind-delete-confirm-dialog
- **Career:** career-add-app-dialog, career-edit-app-dialog, career-delete-confirm-dialog
- **Physique:** physique-upload-modal, physique-compare-modal, physique-pose-edit-modal
- **Profile:** profile-section-modal-mobile, profile-delete-confirm-dialog

## Known coverage gaps (logged, not silent)

- **Auth pages** (login / forgot / reset) need a logged-out session or a recovery token; captured opportunistically, otherwise logged as gaps each round.
- **Data-dependent surfaces** (program-detail `:id`, workout-detail params, recovery charts, insights/brief-history engine output, physique photos, mind/career lists) render empty states without seeded backend data — empty state is still audited; populated state logged as a gap when unseedable.
- **Camera surfaces** (barcode-scanner, physique-upload) cannot grab a real camera feed headless — UI chrome audited, live feed logged as a gap.
