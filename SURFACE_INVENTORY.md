# OptiGains — Surface Inventory (UI Audit, mobile-first 390px)

Generated Phase 0. Every page + every overlay + how to reach it on mobile.
Primary viewport: **390×844**. Login: nvtnachbar@gmail.com (real data account).

## Navigation model (src/components/Layout.jsx)
5-section dock (mobile) / sidebar (desktop): **Today · Train · Fuel · Body · Analyze**.
FAB present on all pages EXCEPT `/profile`, `/create-workout`, `/quick-workout`, `/program-builder`.

---

## PAGES (real, user-reachable)

### Today section
| # | Surface | Route | File | States to capture | Reach |
|---|---|---|---|---|---|
| P1 | Today (home) | `/today` | pages/Today.jsx | populated (default), workout-in-progress banner, rest-day, heatmap expanded | Dock |
| P2 | Dashboard (legacy variant) | `/dashboard` | pages/Dashboard.jsx | populated, morning-checkin, secondary tabs | Deep link (nav maps to Today) |

### Train section
| # | Surface | Route | File | States | Reach |
|---|---|---|---|---|---|
| P3 | Train: Schedule | `/train?tab=schedule` | Train→WeeklySchedule | week nav, day cards, rest days | Dock |
| P4 | Train: Library | `/train?tab=library` | Train→Workouts | populated, empty, filters | Sub-tab |
| P5 | Train: Programs | `/train?tab=programs` | Train→Workouts | populated, empty | Sub-tab |
| P6 | Train: Activity | `/train?tab=activity-log` | Train→Workouts | populated, empty | Sub-tab |
| P7 | CreateWorkout | `/create-workout` | pages/CreateWorkout.jsx | empty form, strength vs cardio | Deep link (FAB hidden) |
| P8 | ProgramBuilder | `/program-builder` | pages/ProgramBuilder.jsx | 4-step wizard | Deep link (FAB hidden) |
| P9 | WorkoutDetail (logging) | `/workout-detail?...` | pages/WorkoutDetail.jsx | session-check, logging, heatmap, not-found | From Today/Schedule |
| P10 | QuickWorkout | `/quick-workout` | pages/QuickWorkout.jsx | empty, prescribed, run-zones | FAB / prescribed card (FAB hidden) |
| P11 | ProgramDetail | `/program/:id` | pages/ProgramDetail.jsx | enrolled, not-enrolled, not-found | Deep link |

### Fuel section
| # | Surface | Route | File | States | Reach |
|---|---|---|---|---|---|
| P12 | Fuel: Nutrition | `/fuel` | Fuel→FoodTracker | populated log, empty day, macro bars | Dock |
| P13 | Fuel: Wellness | `/fuel?tab=wellness` | Fuel→Progress+Supplements | weight/water/supps | Sub-tab |
| P14 | FoodTracker (direct) | `/food-tracker` | pages/FoodTracker.jsx | same as P12 + ?addFood=true | FAB |

### Body section
| # | Surface | Route | File | States | Reach |
|---|---|---|---|---|---|
| P15 | AthleteState | `/athlete-state` | pages/AthleteState.jsx | engine panel, load chart, heatmap, empty | Dock |
| P16 | RecoveryDetail | `/recovery` | pages/RecoveryDetail.jsx | readiness/sleep/metrics tabs, empty | Sub-tab |
| P17 | PhysiqueTracker | `/physique` | pages/PhysiqueTracker.jsx | camera, gallery, compare, empty | Sub-tab |

### Analyze section
| # | Surface | Route | File | States | Reach |
|---|---|---|---|---|---|
| P18 | Insights (Daily Brief) | `/insights` | pages/Insights.jsx | brief populated, empty | Dock |
| P19 | BriefHistory | `/brief-history` | pages/BriefHistory.jsx | list, expanded, empty | Sub-tab |
| P20 | Mind | `/mind` | pages/Mind.jsx | reading/finished/paused/want tabs, empty | Sub-tab |
| P21 | Career | `/career` | pages/Career.jsx | applied/screening/interview/offer/rejected, empty | Deep link (unlinked from nav) |

### Account / Auth
| # | Surface | Route | File | States | Reach |
|---|---|---|---|---|---|
| P22 | Profile | `/profile` | pages/Profile.jsx | collapsed sections, stats, forms | Avatar (FAB hidden) |
| P23 | Login | `/login` | pages/Login.jsx | form, error | Public |
| P24 | ForgotPassword | `/forgot-password` | pages/ForgotPassword.jsx | form, sent | Link from Login |
| P25 | ResetPassword | `/reset-password` | pages/ResetPassword.jsx | form, access-denied | Email link |

Legacy/redirected (NOT separate surfaces): Progress.jsx & Supplements.jsx → embedded in Fuel Wellness; Workouts.jsx → Train tabs; `/schedule`→`/weekly-schedule`; `/log`,`/supplements`→`/fuel?tab=wellness`.

---

## OVERLAYS (every modal/sheet/popover/FAB)
**SYSTEMIC: all dialogs use src/components/ui/dialog.jsx, which renders a CENTERED modal on mobile (not a bottom sheet).** Flagged for primitive-level fix.

| # | Overlay | Type | File | Trigger on mobile |
|---|---|---|---|---|
| O1 | FAB menu | FAB fan-out | ui/FloatingActionButton.jsx | Tap + (bottom-right). 6 actions: Quick Workout, Log Food, Weigh In, Stream Note, Create Workout, Calculators |
| O2 | WeighInModal | dialog | WeighInModal.jsx | FAB→Weigh In, or Today→Weigh In tile |
| O3 | CalculatorsModal | dialog (tabs:1RM/Working/Plates) | CalculatorsModal.jsx | FAB→Calculators |
| O4 | Stream Note | dialog | Layout.jsx:298 | FAB→Stream Note |
| O5 | Today Quick Note | dialog | Today.jsx | Today→Note Capture tile |
| O6 | BarcodeScanner | fullscreen (bespoke, z-10001) | nutrition/BarcodeScanner.jsx | FoodTracker→Add Food→Barcode |
| O7 | DietPhase New Phase | dialog (scroll) | nutrition/DietPhaseCard.jsx | Fuel→Diet Phase card→New Phase |
| O8 | Food search/add | dialog | FoodTracker.jsx | FoodTracker→Add Food |
| O9 | Meal Week Plan | dialog | Fuel.jsx:53 | Fuel→Review Weekly Plan |
| O10 | MealTemplate Apply | dialog | nutrition/MealTemplates.jsx:335 | FoodTracker→template→Apply |
| O11 | MealTemplate Edit | dialog (scroll) | nutrition/MealTemplates.jsx:432 | FoodTracker→template→edit |
| O12 | Save as Template | dialog | nutrition/MealTemplates.jsx:655 | MealPlanIdeas→Save Day |
| O13 | RecipeBuilder form | dialog (2-step wizard) | nutrition/RecipeBuilder.jsx:712 | FoodTracker→Recipes→create/edit |
| O14 | Recipe Log | dialog | nutrition/RecipeBuilder.jsx:1265 | FoodTracker→Recipes→Log |
| O15 | StatsSetupModal (TDEE) | dialog (scroll) | nutrition/StatsSetupModal.jsx | TDEE setup (trigger TBD) |
| O16 | ProgramDurationModal | dialog (scroll) | workouts/ProgramDurationModal.jsx | Create program flow |
| O17 | ScheduleAfterCreate | dialog (scroll) | workouts/ScheduleAfterCreateModal.jsx | After program gen |
| O18 | CustomSplitSelector | inline/modal | workouts/CustomSplitSelector.jsx | Program create flow |
| O19 | ConfirmDialog (generic) | dialog (default/danger) | ui/ConfirmDialog.jsx | Any delete (Mind/Career/templates/recipes) |
| O20 | Career App/Contact form | dialog | Career.jsx:287,475 | Career→New/Edit |
| O21 | Mind Book/Skill form | dialog | Mind.jsx:220,613 | Mind→Add Book/Skill |
| O22 | PST Test Logger | dialog | PSTTracker.jsx:191 | (PST card→Log Test) |
| O23 | Rest Timer bar | fixed header (not modal) | workouts/WorkoutLoggingHeader.jsx | During logging |

### Coverage gaps / notes
- O15 StatsSetupModal trigger not definitively mapped (likely Profile/TDEE). Will probe in capture; log if unreachable.
- O22 PSTTracker lives on Mind or AthleteState — confirm in capture.
- Camera-dependent surfaces (O6 BarcodeScanner, P17 Physique camera) cannot grant camera in headless; capture the permission/idle state and audit chrome only — logged as partial.
