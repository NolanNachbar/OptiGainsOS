export const meta = {
  name: 'ui-audit-round',
  description: 'One mobile-first UI audit round: capture → audit → IA → synthesize → fix, fanned out per surface (390px primary)',
  phases: [
    { title: 'Capture', detail: 'one /browse agent per surface, 390px + 1280px' },
    { title: 'Audit', detail: 'one opus agent per surface, blind agnostic walkthrough', model: 'opus' },
    { title: 'IA', detail: 'tap-count + placement analysis (rounds 1–2 only)', model: 'opus' },
    { title: 'Synthesize', detail: 'dedupe findings into systemic + per-surface fix plan', model: 'opus' },
    { title: 'Fix', detail: 'systemic serial on main tree; per-surface parallel in worktrees' },
  ],
}

// ── args (passed by the /loop main thread) ──────────────────────────────────
// {
//   round:     number,
//   baseUrl:   string,                 // dev server, e.g. http://localhost:5173
//   runIA:     boolean,                // true on rounds 1–2 or when nav changed
//   surfaces:  [{ id, type, route, reach, states }]   // from SURFACE_INVENTORY.md
// }
const { round, baseUrl, runIA, surfaces } = args
const DIR = `./ui-audit/round-${round}`

// ── design-system contract injected into every audit + fix agent ────────────
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

// ── schemas ─────────────────────────────────────────────────────────────────
const CAPTURE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['surface', 'reached', 'shots', 'scrollHeight390'],
  properties: {
    surface: { type: 'string' },
    reached: { type: 'boolean', description: 'false if the surface could not be reached on mobile' },
    note: { type: 'string', description: 'if not reached, why (coverage gap)' },
    scrollHeight390: { type: 'number', description: 'full scroll height in px at 390px' },
    shots: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['state', 'viewport', 'path'],
        properties: {
          state: { type: 'string', description: 'empty|loading|populated|error|expanded|scrolled' },
          viewport: { type: 'string', enum: ['390', '1280'] },
          path: { type: 'string' },
        },
      },
    },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['surface', 'findings'],
  properties: {
    surface: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'category', 'file', 'whatsWrong', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          category: {
            type: 'string',
            enum: ['drift', 'mobile', 'consistency', 'hierarchy', 'density', 'belonging', 'slop', 'motion'],
          },
          file: { type: 'string', description: 'exact file:line' },
          whatsWrong: { type: 'string' },
          fix: { type: 'string', description: 'concrete fix using existing tokens / ui primitives' },
        },
      },
    },
  },
}

const IA_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['tapCounts', 'findings', 'recommendedHomeOrder'],
  properties: {
    tapCounts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['feature', 'tapsFromLaunch', 'verdict'],
        properties: {
          feature: { type: 'string' },
          tapsFromLaunch: { type: 'number' },
          verdict: { type: 'string', enum: ['too-buried', 'over-promoted', 'ok'] },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['severity', 'whatsWrong', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          whatsWrong: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    recommendedHomeOrder: { type: 'array', items: { type: 'string' } },
  },
}

const FIXPLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['systemic', 'perSurface'],
  properties: {
    systemic: {
      type: 'array',
      description: 'cross-page fixes that touch SHARED files (tokens, ui primitives). Run serially on main tree.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'title', 'files', 'instruction'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          instruction: { type: 'string' },
        },
      },
    },
    perSurface: {
      type: 'array',
      description: 'per-surface fixes. Files MUST be disjoint across entries so worktree edits never collide.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['surface', 'files', 'instruction'],
        properties: {
          surface: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          instruction: { type: 'string' },
        },
      },
    },
  },
}

const FIXRESULT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'filesChanged', 'buildPass', 'lintPass', 'summary'],
  properties: {
    id: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    buildPass: { type: 'boolean' },
    lintPass: { type: 'boolean' },
    summary: { type: 'string' },
  },
}

// ── STEP A+B: capture then audit, pipelined per surface (no global barrier) ──
log(`Round ${round}: ${surfaces.length} surfaces @ ${baseUrl}`)

const auditPromise = pipeline(
  surfaces,
  (s) => agent(
    `STEP A — CAPTURE surface "${s.id}" (type: ${s.type}).
Use the gstack headless browse CLI (the same engine /browse uses) against ${baseUrl}${s.route}.
Reach it on mobile by: ${s.reach}
Capture at 390px FIRST (primary), then 1280px (secondary check). Capture every meaningful state
that exists for this surface: ${(s.states || ['empty', 'loading', 'populated', 'error', 'expanded']).join(', ')}.
Record the full scroll height at 390px. Save PNGs under ${DIR}/${s.id}/ with descriptive names.
If you cannot reach the surface on mobile, set reached=false and explain (this is a logged coverage gap, never silent).
Return the capture manifest.`,
    { label: `capture:${s.id}`, phase: 'Capture', schema: CAPTURE_SCHEMA }
  ),
  (cap, s) => agent(
    `STEP B — AGNOSTIC AUDIT of surface "${s.id}", blind to all other surfaces. Ruthless design-eye walkthrough.
${SYSTEM_LAW}
Screenshots for this surface: ${JSON.stringify(cap?.shots || [])} (scrollHeight@390 = ${cap?.scrollHeight390}px).
Open the relevant source: route ${s.route}, reached via ${s.reach}.
Audit against this 8-point rubric and report EVERYTHING that looks bad, doesn't belong, is confusing,
or would be better placed elsewhere:
  1. DESIGN-SYSTEM DRIFT — any VAPOR × MACRO violation.
  2. MOBILE FITNESS — touch targets, thumb zone, bottom-sheet behavior, safe areas, zero horizontal scroll, no dock/notch clipping.
  3. VISUAL CONSISTENCY — spacing, radii, type ramp, card material, icon weight, button hierarchy.
  4. HIERARCHY & CLARITY — primary action obvious in <2s? anything confusing/mislabeled/ambiguous/competing?
  5. VERTICAL DENSITY — does it scroll excessively at 390px? propose density fixes (collapse/tab/summarize-then-expand).
  6. BELONGING & PLACEMENT — does each element belong on THIS surface, or better elsewhere / in a sheet / removed?
  7. AI-SLOP / UNFINISHED — placeholders, dead controls, lorem, debug UI, misalignment, orphaned/empty states.
  8. MOTION & FEEDBACK — interactions confirm state per the motion law.
Per finding give: severity (blocker/major/minor), category, exact file:line, what's wrong, concrete fix using
existing tokens and src/components/ui/* primitives. Do NOT fix anything in this step.`,
    { label: `audit:${s.id}`, phase: 'Audit', schema: FINDINGS_SCHEMA, model: 'opus' }
  )
)

// STEP C — IA runs concurrently with capture/audit; rounds 1–2 (or nav changed) only.
const iaPromise = runIA
  ? agent(
      `STEP C — INFORMATION ARCHITECTURE pass for the OptiGains mobile PWA.
${SYSTEM_LAW}
Importance = real usage: log today's workout, log food/macros, daily brief / readiness, weigh in.
Drive the app at 390px from a cold launch via the gstack browse CLI against ${baseUrl}.
For each high-value feature: count taps from app launch, judge whether it deserves a faster path
(bottom-dock slot, FAB, or a home card in the thumb zone). Flag buried high-value features and
over-promoted low-value ones. Propose a concrete home priority order a MacroFactor/Whoop user finds instantly.`,
      { label: 'ia', phase: 'IA', schema: IA_SCHEMA, model: 'opus' }
    )
  : Promise.resolve(null)

const [audited, ia] = await Promise.all([auditPromise, iaPromise])

const captured = (audited || []).filter(Boolean)
const findings = captured.flatMap((r) => r?.findings || [])
const iaFindings = (ia?.findings || [])
const all = [...findings, ...iaFindings]
const counts = {
  blockers: all.filter((f) => f.severity === 'blocker').length,
  majors: all.filter((f) => f.severity === 'major').length,
  minors: all.filter((f) => f.severity === 'minor').length,
}
log(`Round ${round} findings — blocker:${counts.blockers} major:${counts.majors} minor:${counts.minors}`)

// ── STEP D: synthesize (barrier — needs ALL findings to dedupe cross-page) ───
phase('Synthesize')
const plan = await agent(
  `STEP D — SYNTHESIZE. Merge and DEDUPE these findings into a fix plan. Collapse cross-page issues into
SYSTEMIC fixes (e.g. "12 pages use raw slate text" → ONE token sweep, not 12 edits).
${SYSTEM_LAW}
Findings: ${JSON.stringify(all)}
IA recommendations: ${JSON.stringify(ia ? { tapCounts: ia.tapCounts, recommendedHomeOrder: ia.recommendedHomeOrder } : null)}
Order of work: token sweep → shared primitives → per-page drift → mobile/IA → density → polish.
Partition into:
  - systemic[]: fixes touching SHARED files (tokens, src/components/ui/*, Layout). These run serially on the main tree.
  - perSurface[]: per-page fixes. CRITICAL: files must be DISJOINT across perSurface entries so parallel
    worktree edits never collide. If two surfaces need the same file, hoist that edit into systemic[].`,
  { label: 'synth', phase: 'Synthesize', schema: FIXPLAN_SCHEMA, model: 'opus' }
)

// ── STEP E: fix. Systemic serial on main tree, then per-surface in worktrees ─
phase('Fix')
const systemic = []
for (const fix of (plan?.systemic || [])) {
  const r = await agent(
    `STEP E — SYSTEMIC FIX "${fix.title}" (id ${fix.id}). Touches shared files: ${fix.files.join(', ')}.
${SYSTEM_LAW}
Instruction: ${fix.instruction}
Use existing tokens and src/components/ui/* primitives; only extend the system for a genuine gap, and
document any new token/primitive. Then run \`npm run build\` and \`npm run lint\` — both MUST pass clean.
Do NOT run any git commands.`,
    { label: `fix:sys:${fix.id}`, phase: 'Fix', schema: FIXRESULT_SCHEMA }
  )
  if (r) systemic.push(r)
}

const perSurface = (await parallel(
  (plan?.perSurface || []).map((fix) => () =>
    agent(
      `STEP E — PER-SURFACE FIX for "${fix.surface}". Files (disjoint from other fixes): ${fix.files.join(', ')}.
${SYSTEM_LAW}
Instruction: ${fix.instruction}
Use existing tokens and src/components/ui/* primitives. Run \`npm run build\` and \`npm run lint\` — both MUST
pass clean before you finish. Do NOT run any git commands (the harness owns the worktree).`,
      { label: `fix:${fix.surface}`, phase: 'Fix', isolation: 'worktree', schema: FIXRESULT_SCHEMA }
    )
  )
)).filter(Boolean)

return {
  round,
  counts,
  cleanSweep: counts.blockers === 0 && counts.majors === 0,
  coverageGaps: captured.filter((c) => c && c.reached === false).map((c) => ({ surface: c.surface, note: c.note })),
  findings: all,
  ia,
  plan,
  fixes: { systemic, perSurface },
}
