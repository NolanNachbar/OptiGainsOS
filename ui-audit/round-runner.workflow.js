export const meta = {
  name: 'ui-audit-round',
  description: 'One mobile-first UI audit round: serial capture (shared browser) → parallel audit → IA → synthesize → parallel fix',
  phases: [
    { title: 'Capture', detail: 'serial batches against the single shared browse daemon, 390px + 1280px' },
    { title: 'Audit', detail: 'one opus agent per surface, parallel, reads screenshots + source', model: 'opus' },
    { title: 'IA', detail: 'tap-count + placement from source/inventory (rounds 1–2 only)', model: 'opus' },
    { title: 'Synthesize', detail: 'dedupe into systemic + per-surface fix plan', model: 'opus' },
    { title: 'Fix', detail: 'systemic serial on main tree; per-surface parallel in worktrees' },
  ],
}

// Self-contained: surfaces are embedded (passing 65 inline via args proved fragile).
// args only carries small scalars: { round, baseUrl, runIA, login:{email,password} }.
const round = (args && args.round) || 1
const baseUrl = (args && args.baseUrl) || 'http://localhost:5173'
const runIA = args && typeof args.runIA === 'boolean' ? args.runIA : (round <= 2)
const login = (args && args.login) || { email: 'nvtnachbar@gmail.com', password: 'Gains123' }
const DIR = `./ui-audit/round-${round}`
const CAPTURE_BATCH = 10

// browse is ONE shared Chromium daemon → capture MUST be serial. Audit/IA/Fix never touch it.
const SURFACES = [
  { id: 'login', type: 'page', route: '/login', reach: 'requires logout first; authed nav redirects to /dashboard', states: ['empty', 'error'] },
  { id: 'forgot-password', type: 'page', route: '/forgot-password', reach: 'from /login → Forgot password link (needs logout)', states: ['empty', 'email-sent'] },
  { id: 'reset-password', type: 'page', route: '/reset-password', reach: 'via email recovery link (needs token)', states: ['empty'] },
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

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['surface', 'findings'],
  properties: {
    surface: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'category', 'file', 'whatsWrong', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          category: { type: 'string', enum: ['drift', 'mobile', 'consistency', 'hierarchy', 'density', 'belonging', 'slop', 'motion'] },
          file: { type: 'string' }, whatsWrong: { type: 'string' }, fix: { type: 'string' },
        },
      },
    },
  },
}

const IA_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['tapCounts', 'findings', 'recommendedHomeOrder'],
  properties: {
    tapCounts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['feature', 'tapsFromLaunch', 'verdict'], properties: { feature: { type: 'string' }, tapsFromLaunch: { type: 'number' }, verdict: { type: 'string', enum: ['too-buried', 'over-promoted', 'ok'] } } } },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'whatsWrong', 'fix'], properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, whatsWrong: { type: 'string' }, fix: { type: 'string' } } } },
    recommendedHomeOrder: { type: 'array', items: { type: 'string' } },
  },
}

const FIXPLAN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['systemic', 'perSurface'],
  properties: {
    systemic: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'title', 'files', 'instruction'], properties: { id: { type: 'string' }, title: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, instruction: { type: 'string' } } } },
    perSurface: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['surface', 'files', 'instruction'], properties: { surface: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, instruction: { type: 'string' } } } },
  },
}

const FIXRESULT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'filesChanged', 'buildPass', 'lintPass', 'summary'],
  properties: { id: { type: 'string' }, filesChanged: { type: 'array', items: { type: 'string' } }, buildPass: { type: 'boolean' }, lintPass: { type: 'boolean' }, summary: { type: 'string' } },
}

// ── STEP A — CAPTURE (serial batches; browser is single-threaded) ───────────
log(`Round ${round}: ${SURFACES.length} surfaces @ ${baseUrl} (serial capture, parallel audit)`)
phase('Capture')
const batches = chunk(SURFACES, CAPTURE_BATCH)
const allShots = []
const gaps = []
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i]
  const r = await agent(
    `STEP A — CAPTURE (batch ${i + 1}/${batches.length}). Drive the gstack headless browser to screenshot each surface.
CRITICAL: the browser is a SINGLE shared daemon — issue browse commands one at a time, never in parallel.
Setup: ${BROWSE}  (invoke as "$B <cmd>"). Base URL: ${baseUrl} (a PWA; service worker anchors this origin).
The session is PRE-AUTHENTICATED by the orchestrator. Verify: $B goto ${baseUrl}/dashboard ; $B url.
If it lands on /login, run \`$B state load uiauth\` then \`$B goto ${baseUrl}/dashboard\` and re-check.
Do NOT type or guess a password — the safety classifier blocks credential entry and it wastes the run.
If it STILL shows /login after state-load, mark every authed surface in this batch as a gap
("session expired; orchestrator must re-auth") and capture only public routes (login/forgot/reset).

For EACH surface in this batch: ${JSON.stringify(batch)}
  1. $B viewport 390x844
  2. Reach it. type "page" → $B goto ${baseUrl}<route>. type "overlay" → goto the host route, $B snapshot -i,
     then click the control in "reach" to open it. Always $B wait --networkidle after navigation.
  3. Record full scroll height at 390: $B js "document.body.scrollHeight".
  4. Screenshot each meaningful state it actually has (from "states"; skip states needing unseedable data and
     record them in gaps): $B screenshot ${DIR}/<surface-id>/390-<state>.png
  5. Secondary check: $B viewport 1280x900 ; $B screenshot ${DIR}/<surface-id>/1280-populated.png
  6. If a surface cannot be reached on mobile, add it to gaps with the reason (never skip silently).
Return the manifest of every shot saved (surface, state, viewport, path, reached, scrollHeight390) plus gaps.`,
    { label: `capture:b${i + 1}`, phase: 'Capture', schema: CAPTURE_BATCH_SCHEMA }
  )
  if (r && r.shots) allShots.push(...r.shots)
  if (r && r.gaps) gaps.push(...r.gaps)
}

const shotsBySurface = {}
for (const s of allShots) { (shotsBySurface[s.surface] || (shotsBySurface[s.surface] = [])).push(s) }

// ── STEP B — AUDIT (parallel) + STEP C — IA (concurrent, source-only) ───────
phase('Audit')
const auditPromise = parallel(SURFACES.map((s) => () => {
  const shots = shotsBySurface[s.id] || []
  if (!shots.length) return Promise.resolve({ surface: s.id, findings: [] })
  return agent(
    `STEP B — AGNOSTIC AUDIT of surface "${s.id}" (${s.type}, route ${s.route}), blind to all other surfaces.
Ruthless design-eye walkthrough at 390px primary.
${SYSTEM_LAW}
Screenshots to inspect (Read each PNG): ${JSON.stringify(shots)}
Open the source for this surface to cite exact file:line.
Report EVERYTHING against this 8-point rubric:
  1. DESIGN-SYSTEM DRIFT  2. MOBILE FITNESS  3. VISUAL CONSISTENCY  4. HIERARCHY & CLARITY
  5. VERTICAL DENSITY (excessive 390px scroll?)  6. BELONGING & PLACEMENT  7. AI-SLOP / UNFINISHED  8. MOTION & FEEDBACK
Per finding: severity (blocker/major/minor), category, exact file:line, what's wrong, concrete fix using
existing tokens + src/components/ui/* primitives. Do NOT fix anything.`,
    { label: `audit:${s.id}`, phase: 'Audit', schema: FINDINGS_SCHEMA, model: 'opus' }
  )
}))

const iaPromise = runIA
  ? agent(
      `STEP C — INFORMATION ARCHITECTURE for the OptiGains mobile PWA. Reason from source, do NOT drive the browser.
${SYSTEM_LAW}
Read src/App.jsx (routes) and src/components/Layout.jsx (5-section dock Today·Train·Fuel·Body·Analyze + FAB).
Importance = real usage: log today's workout, log food/macros, daily brief / readiness, weigh in. For each,
count taps from a cold launch and judge whether it deserves a faster path (dock slot, FAB, home thumb-zone card).
Flag buried high-value and over-promoted low-value features. Propose a concrete home priority order a
MacroFactor/Whoop user finds instantly.`,
      { label: 'ia', phase: 'IA', schema: IA_SCHEMA, model: 'opus' }
    )
  : Promise.resolve(null)

const [audited, ia] = await Promise.all([auditPromise, iaPromise])
const findings = (audited || []).filter(Boolean).flatMap((r) => (r && r.findings) || [])
const all = [...findings, ...((ia && ia.findings) || [])]
const counts = {
  blockers: all.filter((f) => f.severity === 'blocker').length,
  majors: all.filter((f) => f.severity === 'major').length,
  minors: all.filter((f) => f.severity === 'minor').length,
}
log(`Round ${round} findings — blocker:${counts.blockers} major:${counts.majors} minor:${counts.minors}`)

// ── STEP D — SYNTHESIZE (barrier) ───────────────────────────────────────────
phase('Synthesize')
const plan = await agent(
  `STEP D — SYNTHESIZE. Merge and DEDUPE these findings into a fix plan. Collapse cross-page issues into
SYSTEMIC fixes (e.g. "12 pages use raw slate text" → ONE token sweep, not 12 edits).
${SYSTEM_LAW}
Findings: ${JSON.stringify(all)}
IA: ${JSON.stringify(ia ? { tapCounts: ia.tapCounts, recommendedHomeOrder: ia.recommendedHomeOrder } : null)}
Order of work: token sweep → shared primitives → per-page drift → mobile/IA → density → polish.
Partition:
  - systemic[]: fixes touching SHARED files (tokens, src/components/ui/*, Layout). Run serially on main tree.
  - perSurface[]: per-page fixes. CRITICAL: files MUST be DISJOINT across entries so parallel worktree edits
    never collide. If two surfaces need the same file, hoist that edit into systemic[].`,
  { label: 'synth', phase: 'Synthesize', schema: FIXPLAN_SCHEMA, model: 'opus' }
)

// ── STEP E — FIX (ALL serial on the MAIN working tree; no worktrees) ────────
// Worktree isolation branched from a stale ancestor in round 1, so fixes were made
// against old code and had to be discarded. Apply directly on the current main tree,
// serially (the tree is shared; serial = zero race). build is the per-fix gate; lint
// is project-wide and has PRE-EXISTING debt unrelated to this audit, so do not gate on it.
const FIX_RULES = `Edit ONLY the files in your list, on the current working tree. Use existing tokens +
src/components/ui/* primitives; extend the system only for a genuine gap, and document it. After editing run
\`npm run build\` — it MUST pass. Do NOT run \`npm run lint\` (the project has pre-existing lint debt unrelated
to this audit; do not try to fix it). Do NOT run ANY git commands.`
phase('Fix')
const systemic = []
for (const fix of ((plan && plan.systemic) || [])) {
  const r = await agent(
    `STEP E — SYSTEMIC FIX "${fix.title}" (id ${fix.id}). Shared files: ${fix.files.join(', ')}.
${SYSTEM_LAW}
Instruction: ${fix.instruction}
${FIX_RULES}`,
    { label: `fix:sys:${fix.id}`, phase: 'Fix', schema: FIXRESULT_SCHEMA }
  )
  if (r) systemic.push(r)
}
const perSurface = []
for (const fix of ((plan && plan.perSurface) || [])) {
  const r = await agent(
    `STEP E — PER-SURFACE FIX for "${fix.surface}". Files: ${fix.files.join(', ')}.
${SYSTEM_LAW}
Instruction: ${fix.instruction}
${FIX_RULES}`,
    { label: `fix:${fix.surface}`, phase: 'Fix', schema: FIXRESULT_SCHEMA }
  )
  if (r) perSurface.push(r)
}

return {
  round,
  counts,
  cleanSweep: counts.blockers === 0 && counts.majors === 0,
  coverageGaps: gaps,
  findings: all,
  ia,
  plan,
  fixes: { systemic, perSurface },
}
