export const meta = {
  name: 'ui-audit-gan',
  description: 'Planner → (capture → adversarial evaluator → maker/checker contract → fix)* GAN loop. Runs rounds until clean-sweep or a hard round cap, re-verifying every fix on a fresh capture.',
  phases: [
    { title: 'Plan', detail: 'opus advisor: rubric weights + IA priority sprints (runs once)', model: 'opus' },
    { title: 'Capture', detail: 'sonnet workers, serial batches against the single shared browse daemon, 390px + 1280px', model: 'sonnet' },
    { title: 'Evaluate', detail: 'opus advisor: adversarial evaluator per surface, scores rubric + verifies prior contract on the LIVE app', model: 'opus' },
    { title: 'Contract', detail: 'sonnet maker proposes fixes + assertions; opus advisor critiques and signs off before any code is written' },
    { title: 'Fix', detail: 'sonnet workers: systemic serial on main tree; per-surface parallel; build-gated', model: 'sonnet' },
  ],
}

// ── Loop knobs (the guide's stop condition + cost trap live here) ────────────
// maxRounds is the HARD cap so the loop can't run all night for nothing (Ralph Wiggum).
// gate is the rubric bar: clean-sweep = zero blocker/major AND every rubric criterion >= gate.
// args can arrive as a parsed object OR a JSON string depending on the caller — parse defensively
// (the sibling workflows do the same; not doing it here once made startRound silently default to 1).
const A = (typeof args === 'string' ? JSON.parse(args) : args) || {}
const startRound = A.startRound || 1
const maxRounds = Math.min(6, Math.max(1, A.maxRounds || 3))
const gate = A.gate || 8
const baseUrl = A.baseUrl || 'http://localhost:5173'
const diagnoseOnly = !!A.diagnoseOnly
const CAPTURE_BATCH = 10
const MIN_BUDGET_PER_ROUND = 80000 // bail before starting a round we likely can't finish

// browse is ONE shared Chromium daemon → capture MUST be serial. Evaluate/Plan/Fix never touch it.
// Public routes (login / forgot-password / reset-password) are deliberately EXCLUDED: reaching them
// requires logging out, which destroys the shared daemon session for every later batch. They are stable
// and already audited. Audit them separately if needed, never inline with authed surfaces.
const SURFACES = [
  { id: 'today', type: 'page', route: '/today', reach: 'default landing (Today dock)', states: ['populated', 'rest-day', 'workout-in-progress'] },
  { id: 'dashboard', type: 'page', route: '/dashboard', reach: 'deep link (nav maps to Today)', states: ['populated', 'morning-checkin'] },
  { id: 'train-schedule', type: 'page', route: '/train?tab=schedule', reach: 'Train dock → Schedule', states: ['populated', 'empty'] },
  { id: 'train-library', type: 'page', route: '/train?tab=library', reach: 'Train dock → Library', states: ['populated', 'empty', 'filters'] },
  { id: 'train-programs', type: 'page', route: '/train?tab=programs', reach: 'Train dock → Programs', states: ['populated', 'empty'] },
  { id: 'train-activity', type: 'page', route: '/train?tab=activity-log', reach: 'Train dock → Activity', states: ['populated', 'empty'] },
  { id: 'fuel-nutrition', type: 'page', route: '/fuel', reach: 'Fuel dock → Nutrition', states: ['populated', 'empty'] },
  { id: 'fuel-wellness', type: 'page', route: '/fuel?tab=wellness', reach: 'Fuel dock → Wellness', states: ['populated', 'empty'] },
  { id: 'food-tracker', type: 'page', route: '/food-tracker', reach: 'FAB → Log Food', states: ['populated', 'empty'] },
  { id: 'athlete-state', type: 'page', route: '/athlete-state', reach: 'Body dock → State', states: ['populated', 'empty'] },
  { id: 'recovery', type: 'page', route: '/recovery', reach: 'Body dock → Recovery', states: ['populated', 'empty'] },
  { id: 'physique', type: 'page', route: '/physique', reach: 'Body dock → Physique', states: ['gallery', 'empty'] },
  { id: 'insights', type: 'page', route: '/insights', reach: 'Analyze dock → Daily Brief', states: ['populated', 'empty'] },
  { id: 'brief-history', type: 'page', route: '/brief-history', reach: 'Analyze dock → Brief History', states: ['list', 'empty'] },
  { id: 'mind', type: 'page', route: '/mind', reach: 'Analyze dock → Mind', states: ['populated', 'empty'] },
  { id: 'career', type: 'page', route: '/career', reach: 'direct URL (unlinked in nav)', states: ['populated', 'empty'] },
  { id: 'profile', type: 'page', route: '/profile', reach: 'header avatar tap', states: ['hub', 'stats', 'forms'] },
  { id: 'weekly-schedule', type: 'page', route: '/weekly-schedule', reach: 'Train → Schedule → Edit week', states: ['populated', 'empty'] },
  { id: 'program-detail', type: 'page', route: '/program/_probe', reach: 'Train → Programs → tap a program card (needs real id)', states: ['enrolled', 'not-enrolled', 'not-found'] },
  { id: 'program-builder', type: 'page', route: '/program-builder', reach: 'Train → Library → Create Program', states: ['wizard'] },
  { id: 'create-workout', type: 'page', route: '/create-workout', reach: 'FAB → Create Workout', states: ['empty-form'] },
  { id: 'quick-workout', type: 'page', route: '/quick-workout', reach: 'FAB → Quick Workout', states: ['empty', 'prescribed'] },
  { id: 'workout-detail', type: 'page', route: '/workout-detail', reach: 'Today/Schedule → Start Workout (needs params)', states: ['logging', 'not-found'] },
  // overlays
  { id: 'fab-menu', type: 'overlay', route: '/today', reach: 'tap FAB (+) bottom-right', states: ['open'] },
  { id: 'weigh-in-modal', type: 'overlay', route: '/today', reach: 'FAB → Weigh In', states: ['empty'] },
  { id: 'calculators-modal', type: 'overlay', route: '/today', reach: 'FAB → Calculators', states: ['1rm', 'working-weight', 'plates'] },
  { id: 'stream-note-modal', type: 'overlay', route: '/today', reach: 'FAB → Stream Note', states: ['empty'] },
  { id: 'today-quick-note', type: 'overlay', route: '/today', reach: 'Today → Note Capture tile', states: ['empty'] },
  { id: 'add-food-dialog', type: 'overlay', route: '/food-tracker', reach: 'Food Tracker → Add Food', states: ['search', 'results'] },
  { id: 'barcode-scanner-modal', type: 'overlay', route: '/food-tracker', reach: 'Add Food → Barcode (camera idle in headless)', states: ['idle'] },
  { id: 'week-plan-dialog', type: 'overlay', route: '/fuel', reach: 'Fuel → Review Weekly Plan', states: ['plan'] },
  { id: 'meal-template-apply', type: 'overlay', route: '/food-tracker', reach: 'Food Tracker → template → Apply', states: ['confirm'] },
  { id: 'meal-template-edit', type: 'overlay', route: '/food-tracker', reach: 'Food Tracker → template → edit', states: ['form'] },
  { id: 'save-as-template', type: 'overlay', route: '/food-tracker', reach: 'Meal plan ideas → Save Day', states: ['form'] },
  { id: 'recipe-builder', type: 'overlay', route: '/food-tracker', reach: 'Food Tracker → Recipes → create', states: ['wizard'] },
  { id: 'recipe-log', type: 'overlay', route: '/food-tracker', reach: 'Food Tracker → Recipes → Log', states: ['form'] },
  { id: 'stats-setup-modal', type: 'overlay', route: '/food-tracker', reach: 'TDEE / Setup Stats (probe trigger)', states: ['form'] },
  { id: 'program-duration-modal', type: 'overlay', route: '/program-builder', reach: 'Program create flow → duration', states: ['form'] },
  { id: 'schedule-after-create-modal', type: 'overlay', route: '/program-builder', reach: 'after completing Program Builder → Schedule This? (only mounted in ProgramBuilder)', states: ['form'] },
  { id: 'confirm-dialog-generic', type: 'overlay', route: '/fuel?tab=wellness', reach: 'weight history → delete entry → confirm (danger variant)', states: ['danger'] },
  { id: 'mind-add-dialog', type: 'overlay', route: '/mind', reach: 'Mind → Add Book/Skill', states: ['form'] },
  { id: 'career-form-dialog', type: 'overlay', route: '/career', reach: 'Career → New/Edit application', states: ['form'] },
  { id: 'pst-test-logger', type: 'overlay', route: '/athlete-state', reach: 'PST card → Log Test (probe Mind/AthleteState)', states: ['form'] },
  { id: 'physique-upload-modal', type: 'overlay', route: '/physique', reach: 'Physique → camera / Take Photo (camera idle headless)', states: ['idle'] },
  { id: 'physique-compare-modal', type: 'overlay', route: '/physique', reach: 'Physique → select 2+ → Compare', states: ['side-by-side'] },
  { id: 'rest-timer-bar', type: 'overlay', route: '/quick-workout', reach: 'during set logging → rest timer', states: ['countdown'] },
  { id: 'workout-share-modal', type: 'overlay', route: '/workout-detail', reach: 'logging → Share after completion', states: ['share'] },
  { id: 'sonner-toast', type: 'overlay', route: '/today', reach: 'global → trigger any mutation', states: ['success', 'error'] },
]
const SURFACE_BY_ID = Object.fromEntries(SURFACES.map((s) => [s.id, s]))
const ALL_IDS = SURFACES.map((s) => s.id)
const initialScope = (Array.isArray(A.surfaces) && A.surfaces.length) ? A.surfaces : ALL_IDS

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

const SYSTEM_LAW = `
VAPOR × MACRO design system (read src/index.css + tailwind.config.js to confirm tokens):
- Field #0A0D12; tiered translucent glass surfaces; 0.5px hairline edges; inset top highlight.
- Manrope everywhere; tabular numerals for ALL numbers.
- Coral #EF7368 is THE single action color, never decoration. A second action color = DRIFT.
- Each datum owns ONE hue per the token map. Color is data, not garnish.
- Physiological spectrum (ok/warn/bad/info) is for biometrics ONLY.
- One easing cubic-bezier(.2,.7,.3,1), 180–320ms; entrances rise 8px.
- Raw text-white / slate-* / hardcoded hex / arbitrary radii / decorative color = DRIFT defect.
MOBILE LAWS (390px is the product; 1280px is a secondary sanity check only):
- Touch targets ≥ 44px. Primary actions in the thumb zone (lower third).
- Overlays are bottom sheets on mobile, not centered dialogs, unless there's a reason.
- Zero horizontal scroll. Nothing clipped under dock / notch / safe-area insets.
- Core content of a primary page lands within ~2 phone viewport heights before fold-heavy stuff.
- Text legible without zoom; tap feedback on every interactive element.`

const BROWSE = `B="$HOME/.claude/skills/gstack/browse/dist/browse"`

const CAPTURE_BATCH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['shots'],
  properties: {
    shots: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['surface', 'state', 'viewport', 'path', 'reached'],
        properties: {
          surface: { type: 'string' }, state: { type: 'string' },
          viewport: { type: 'string', enum: ['390', '1280'] }, path: { type: 'string' },
          reached: { type: 'boolean' }, scrollHeight390: { type: 'number' }, note: { type: 'string' },
        },
      },
    },
    gaps: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['surface', 'note'], properties: { surface: { type: 'string' }, note: { type: 'string' } } },
    },
  },
}

// PLAN — the planner role: a written rubric (the guide: "subjective quality IS gradable if you
// write the opinion down") + IA sprint order. Deliberately high-level, not granular tech detail,
// so a planner error doesn't cascade through every round.
const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['rubric', 'priorityOrder'],
  properties: {
    rubric: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['criterion', 'weight', 'whatGoodLooksLike', 'whatFailsLooksLike'],
        properties: { criterion: { type: 'string', enum: ['design', 'originality', 'craft', 'functionality'] }, weight: { type: 'number' }, whatGoodLooksLike: { type: 'string' }, whatFailsLooksLike: { type: 'string' } },
      },
    },
    priorityOrder: { type: 'array', items: { type: 'string' } },
    recommendedHomeOrder: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

// EVALUATE — the discriminator. Scores the 4 rubric criteria 1-10 AND, in verification rounds,
// reports whether each prior-contract assertion actually HOLDS on the live capture (the gate that
// stops the fixer from grading its own homework).
const EVAL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['surface', 'scores', 'findings'],
  properties: {
    surface: { type: 'string' },
    scores: {
      type: 'object', additionalProperties: false, required: ['design', 'originality', 'craft', 'functionality'],
      properties: { design: { type: 'number' }, originality: { type: 'number' }, craft: { type: 'number' }, functionality: { type: 'number' } },
    },
    verifiedFixes: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['assertion', 'holds'], properties: { id: { type: 'string' }, assertion: { type: 'string' }, holds: { type: 'boolean' }, note: { type: 'string' } } },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'severity', 'category', 'file', 'whatsWrong', 'fix', 'verifyBy'],
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          category: { type: 'string', enum: ['drift', 'mobile', 'consistency', 'hierarchy', 'density', 'belonging', 'slop', 'motion'] },
          file: { type: 'string' }, whatsWrong: { type: 'string' }, fix: { type: 'string' },
          verifyBy: { type: 'string', description: 'the concrete observable that proves this is fixed next round' },
        },
      },
    },
  },
}

// CONTRACT — maker proposes, checker signs off BEFORE any code is written. The finalized contract
// is the fix plan, every entry carrying a testable assertion the next round's evaluator grades against.
const CONTRACT_PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['systemic', 'perSurface'],
  properties: {
    systemic: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'files', 'instruction', 'assertion'], properties: { id: { type: 'string' }, title: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, instruction: { type: 'string' }, assertion: { type: 'string' } } } },
    perSurface: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['surface', 'files', 'instruction', 'assertion'], properties: { surface: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, instruction: { type: 'string' }, assertion: { type: 'string' } } } },
  },
}
const CONTRACT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['accepted', 'systemic', 'perSurface'],
  properties: {
    accepted: { type: 'boolean' },
    rejected: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ref', 'reason'], properties: { ref: { type: 'string' }, reason: { type: 'string' } } } },
    systemic: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'files', 'instruction', 'assertion'], properties: { id: { type: 'string' }, title: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, instruction: { type: 'string' }, assertion: { type: 'string' } } } },
    perSurface: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['surface', 'files', 'instruction', 'assertion'], properties: { surface: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, instruction: { type: 'string' }, assertion: { type: 'string' } } } },
  },
}

const FIXRESULT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'filesChanged', 'buildPass', 'summary'],
  properties: { id: { type: 'string' }, filesChanged: { type: 'array', items: { type: 'string' } }, buildPass: { type: 'boolean' }, summary: { type: 'string' } },
}

// ── capture helper: serial batches against the single shared browse daemon ──
async function captureSurfaces(roundDir, ids) {
  const list = ids.map((id) => SURFACE_BY_ID[id]).filter(Boolean)
  const batches = chunk(list, CAPTURE_BATCH)
  const shots = [], gaps = []
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const r = await agent(
      `CAPTURE (batch ${i + 1}/${batches.length}). Drive the gstack headless browser to screenshot each surface.
CRITICAL: the browser is a SINGLE shared daemon — issue browse commands one at a time, never in parallel.
Setup: ${BROWSE}  (invoke as "$B <cmd>"). Base URL: ${baseUrl} (a PWA; service worker anchors this origin).
AUTH: this dev server auto-logs-in via the \`?bypass_auth=true\` query param (it stores a Supabase
session in localStorage). Verify: $B goto ${baseUrl}/dashboard ; $B url.
If it lands on /login, RE-AUTH by running \`$B goto ${baseUrl}/?bypass_auth=true\` ; \`$B wait --load\` ;
sleep 3 ; then \`$B goto ${baseUrl}/dashboard\` and re-check the url. (Do NOT use \`state load\` — the saved
state does not contain the auth token. Do NOT type or guess a password — the classifier blocks it.)
NEVER log out and NEVER clear localStorage — that destroys the shared session for every later batch.
NOTE: the Vite dev server holds an HMR websocket open, so \`$B wait --networkidle\` NEVER settles. Use
\`$B wait --load\` plus a short sleep or a selector wait — never networkidle, or you will loop forever.
If a surface STILL shows /login after the bypass_auth re-auth, mark it a gap (do not log out to retry).

For EACH surface in this batch: ${JSON.stringify(batch)}
  1. $B viewport 390x844
  2. Reach it. type "page" → $B goto ${baseUrl}<route>. type "overlay" → goto the host route, $B snapshot -i,
     then click the control in "reach" to open it. $B wait --load after navigation (NOT networkidle).
  3. Record full scroll height at 390: $B js "document.body.scrollHeight".
  4. Screenshot each meaningful state it actually has (from "states"; skip states needing unseedable data and
     record them in gaps): $B screenshot ${roundDir}/<surface-id>/390-<state>.png
  5. Secondary check: $B viewport 1280x900 ; $B screenshot ${roundDir}/<surface-id>/1280-populated.png
  6. If a surface cannot be reached on mobile, add it to gaps with the reason (never skip silently).
Return the manifest of every shot saved (surface, state, viewport, path, reached, scrollHeight390) plus gaps.`,
      { label: `capture:b${i + 1}`, phase: 'Capture', schema: CAPTURE_BATCH_SCHEMA, model: 'sonnet' }
    )
    if (r && r.shots) shots.push(...r.shots)
    if (r && r.gaps) gaps.push(...r.gaps)
  }
  const bySurface = {}
  for (const s of shots) (bySurface[s.surface] || (bySurface[s.surface] = [])).push(s)
  return { bySurface, gaps }
}

// ── STEP 0 — PLAN (the planner role; runs once) ─────────────────────────────
phase('Plan')
const plan = await agent(
  `PLANNER for the OptiGains mobile PWA UI audit. Reason from source; do NOT drive the browser.
${SYSTEM_LAW}
Two jobs, both high-level (do NOT plan granular per-file changes — that cascades errors over a long run):
1. RUBRIC: write the grading opinion DOWN as 4 weighted criteria — design, originality, craft, functionality —
   weights summing to 1.0, weighted toward design + originality (the model already handles functionality well).
   For each, state in one line what GOOD looks like and what a FAIL looks like at the Whoop/MacroFactor bar.
   The point is to make taste gradable and to kill AI slop (purple gradients, centered desktop dialogs, dead space).
2. IA PRIORITY: read src/App.jsx (routes) and src/components/Layout.jsx (5-section dock Today·Train·Fuel·Body·Analyze
   + FAB). Real usage = log today's workout, log food/macros, daily brief/readiness, weigh in. Return priorityOrder
   (surface ids, most user-critical first) and recommendedHomeOrder (home thumb-zone priority a MacroFactor/Whoop
   user finds instantly).`,
  { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA, model: 'opus' }
)
const RUBRIC_TEXT = (plan && plan.rubric || []).map((r) => `- ${r.criterion} (w=${r.weight}): GOOD = ${r.whatGoodLooksLike}; FAIL = ${r.whatFailsLooksLike}`).join('\n')

const FIX_RULES = `Edit ONLY the files in your contract entry, on the current working tree. Use existing tokens +
src/components/ui/* primitives; extend the system only for a genuine gap, and document it. After editing run
\`npm run build\` — it MUST pass. Do NOT run \`npm run lint\` (the project has pre-existing lint debt unrelated
to this audit). Do NOT run ANY git commands.`

// ── THE GAN LOOP ────────────────────────────────────────────────────────────
const scoreboard = []
let inScope = initialScope
let priorContract = null
let stopped = null
let round = startRound
const lastRound = startRound + maxRounds - 1

for (; round <= lastRound; round++) {
  if (budget && budget.total && budget.remaining() < MIN_BUDGET_PER_ROUND) { stopped = 'budget'; break }
  const roundDir = `./ui-audit/round-${round}`
  log(`── Round ${round}/${lastRound} — ${inScope.length} surfaces in scope @ ${baseUrl}`)

  // CAPTURE (re-capture = the live re-verification of last round's fixes)
  phase('Capture')
  const { bySurface, gaps } = await captureSurfaces(roundDir, inScope)

  // EVALUATE — adversarial evaluator, one per surface, parallel. Harsh by design.
  phase('Evaluate')
  const priorAssertions = {}
  if (priorContract) {
    for (const c of priorContract.perSurface || []) (priorAssertions[c.surface] || (priorAssertions[c.surface] = [])).push(c.assertion)
    // systemic assertions touch shared chrome → check them on every surface still in scope
  }
  const systemicAssertions = priorContract ? (priorContract.systemic || []).map((s) => s.assertion) : []
  const evaluated = await parallel(inScope.map((id) => () => {
    const s = SURFACE_BY_ID[id]
    const shots = bySurface[id] || []
    // No shots = a capture gap (unseedable state / unreachable), NOT a quality-zero surface. Flag it so the
    // rubric floor ignores it; otherwise an uncapturable surface pins minCriterion at 0 and clean-sweep is impossible.
    if (!shots.length) return Promise.resolve({ surface: id, noShots: true, scores: null, findings: [], verifiedFixes: [] })
    const toVerify = [...(priorAssertions[id] || []), ...systemicAssertions]
    return agent(
      `ADVERSARIAL EVALUATOR for surface "${id}" (${s.type}, route ${s.route}). You are a ruthless, hard-to-please
design + UX critic. Your bias is to be HARSH: when unsure, mark it down. You did NOT write this code; your only
job is to find what is wrong and to refuse to pass weak work. Self-congratulation is failure.
${SYSTEM_LAW}
GRADING RUBRIC (score each 1-10, brutally honest, against this written standard):
${RUBRIC_TEXT}
Screenshots to inspect (Read each PNG): ${JSON.stringify(shots)}
Open the source for this surface to cite exact file:line.
${toVerify.length ? `VERIFY PRIOR FIXES — for EACH assertion below, look at the live screenshots and report holds=true ONLY
if the screenshots actually show it satisfied. Default to holds=false if you cannot SEE it satisfied:
${toVerify.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}` : 'No prior contract to verify (first round).'}
Then report EVERY remaining defect against the 8-point lens (drift, mobile, consistency, hierarchy, density,
belonging, slop, motion). Per finding: a stable id "${id}-N", severity (blocker/major/minor), category, exact
file:line, what's wrong, concrete fix using existing tokens + src/components/ui/* primitives, and verifyBy (the
observable that will prove it fixed next round). Do NOT fix anything.`,
      { label: `eval:${id}`, phase: 'Evaluate', schema: EVAL_SCHEMA, model: 'opus' }
    )
  }))

  // A null entry = the evaluator agent itself died (rate limit, crash). That is NOT "no findings" — it is
  // missing data. Counting it as clean is the quiet-failure trap, so track it and refuse to stop on it.
  const failedEvals = (evaluated || []).filter((r) => !r).length
  const surfaces = (evaluated || []).filter(Boolean)
  const scored = surfaces.filter((r) => r.scores)   // real evals only (excludes no-shots gaps)
  const findings = surfaces.flatMap((r) => (r.findings || []).map((f) => ({ ...f, surface: r.surface })))
  const counts = {
    blockers: findings.filter((f) => f.severity === 'blocker').length,
    majors: findings.filter((f) => f.severity === 'major').length,
    minors: findings.filter((f) => f.severity === 'minor').length,
  }
  // Worst single criterion across surfaces that actually have scores (the gate looks at the floor).
  // Uncapturable surfaces (noShots) are gaps, not zeros, so they do not block the floor.
  const minCriterion = scored.length ? Math.min(...scored.flatMap((r) => ['design', 'originality', 'craft', 'functionality'].map((k) => r.scores[k]))) : 0
  const verifiedHeld = surfaces.flatMap((r) => r.verifiedFixes || []).filter((v) => v.holds).length
  const verifiedTotal = surfaces.flatMap((r) => r.verifiedFixes || []).length
  scoreboard.push({
    round, counts, minCriterion,
    regressionsCaught: verifiedTotal - verifiedHeld,
    verified: `${verifiedHeld}/${verifiedTotal}`,
    surfacesEvaluated: scored.length, failedEvals,
    gaps,
  })
  log(`Round ${round}: blocker:${counts.blockers} major:${counts.majors} minor:${counts.minors} | worst rubric ${minCriterion}/10 | prior fixes held ${verifiedHeld}/${verifiedTotal} | ${failedEvals} eval(s) failed`)

  // STOP CHECK — objective, evaluator-decided, Ralph-proof. Clean sweep OR hard cap.
  // Bail loudly if too many evaluators died (rate limit etc.) — never fix on partial data or fake a clean sweep.
  if (failedEvals > Math.max(2, inScope.length * 0.25)) { stopped = 'evaluation-incomplete'; break }
  const cleanSweep = failedEvals === 0 && counts.blockers === 0 && counts.majors === 0 && minCriterion >= gate
  if (cleanSweep) { stopped = 'clean-sweep'; break }
  if (diagnoseOnly) { stopped = 'diagnose-only'; break }
  if (round === lastRound) { stopped = 'max-rounds'; break }
  if (!findings.length) { stopped = failedEvals ? 'evaluation-incomplete' : 'no-actionable-findings'; break }

  // CONTRACT — maker proposes a fix plan + verify-assertions; checker critiques scope and signs off
  // BEFORE a line is written. Grade next round happens against THIS contract, not the vague spec.
  phase('Contract')
  const proposal = await agent(
    `GENERATOR (maker). Propose a fix plan for THIS round's findings. You will negotiate "done" with an adversarial
checker before writing any code.
${SYSTEM_LAW}
Findings: ${JSON.stringify(findings)}
IA priority: ${JSON.stringify({ priorityOrder: plan && plan.priorityOrder, recommendedHomeOrder: plan && plan.recommendedHomeOrder })}
Collapse cross-page issues into SYSTEMIC fixes (e.g. "12 pages use raw slate text" → ONE token sweep). Order:
token sweep → shared primitives → per-page drift → mobile/IA → density → polish. Partition:
  - systemic[]: fixes to SHARED files (tokens, src/components/ui/*, Layout). Applied serially on main tree.
  - perSurface[]: per-page fixes. Files MUST be DISJOINT across entries (parallel worktrees must not collide);
    if two surfaces need the same file, hoist it into systemic[].
For EVERY entry write an assertion: a single concrete, screenshot-checkable statement that will be TRUE iff the
fix worked (the checker will grade exactly this next round). Vague assertions get rejected.`,
    { label: 'contract:propose', phase: 'Contract', schema: CONTRACT_PROPOSAL_SCHEMA, model: 'sonnet' }
  )
  const contract = await agent(
    `EVALUATOR (checker) finalizing the build contract. The maker proposed the plan below. Push back like a hard
reviewer, then SIGN IT.
${SYSTEM_LAW}
Maker proposal: ${JSON.stringify(proposal)}
Do ALL of:
  - Reject entries that are over-scoped, speculative, or churn subjective taste with low confidence (list in rejected[]).
  - Tighten every weak assertion into something objectively checkable on a 390px screenshot. No "looks better".
  - Guarantee perSurface files are DISJOINT across entries; hoist any collision into systemic[].
  - Keep the smallest plan that clears blockers + majors and lifts the worst rubric criterion toward ${gate}/10.
Then write the finalized contract to ${roundDir}/contract.json (use the Write tool) and return it with accepted=true.`,
    { label: 'contract:finalize', phase: 'Contract', schema: CONTRACT_SCHEMA, model: 'opus' }
  )

  // FIX — systemic serial on main tree (shared = serial = zero race), per-surface parallel.
  phase('Fix')
  for (const fix of (contract && contract.systemic || [])) {
    await agent(
      `SYSTEMIC FIX "${fix.title}" (id ${fix.id}). Shared files: ${fix.files.join(', ')}.
${SYSTEM_LAW}
Instruction: ${fix.instruction}
Done means this assertion is TRUE: ${fix.assertion}
${FIX_RULES}`,
      { label: `fix:sys:${fix.id}`, phase: 'Fix', schema: FIXRESULT_SCHEMA, model: 'sonnet' }
    )
  }
  await parallel((contract && contract.perSurface || []).map((fix) => () =>
    agent(
      `PER-SURFACE FIX for "${fix.surface}". Files: ${fix.files.join(', ')}.
${SYSTEM_LAW}
Instruction: ${fix.instruction}
Done means this assertion is TRUE: ${fix.assertion}
${FIX_RULES}`,
      { label: `fix:${fix.surface}`, phase: 'Fix', schema: FIXRESULT_SCHEMA, model: 'sonnet' }
    )
  ))

  // Next round re-verifies exactly the surfaces we touched (systemic touches shared chrome → re-check all
  // surfaces that had findings, since a token/primitive change can regress any of them). No silent capping.
  priorContract = contract
  const touched = new Set((contract.perSurface || []).map((f) => f.surface))
  if ((contract.systemic || []).length) for (const f of findings) touched.add(f.surface)
  inScope = [...touched].filter((id) => SURFACE_BY_ID[id])
  if (!inScope.length) inScope = initialScope
}

return {
  stopped,                 // 'clean-sweep' | 'max-rounds' | 'no-actionable-findings' | 'budget' | 'diagnose-only'
  roundsRun: scoreboard.length,
  finalRound: round > lastRound ? lastRound : round,
  scoreboard,              // per-round counts + worst rubric + prior-fix verification (cost-per-accepted proxy)
  openFindings: scoreboard.length ? scoreboard[scoreboard.length - 1].counts : null,
  rubric: plan && plan.rubric,
  recommendedHomeOrder: plan && plan.recommendedHomeOrder,
}
