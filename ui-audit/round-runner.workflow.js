export const meta = {
  name: 'ui-audit-gan',
  description: 'Planner → (capture → adversarial evaluator → maker/checker contract → fix)* GAN loop. Runs rounds until clean-sweep or a hard round cap, re-verifying every fix on a fresh capture.',
  phases: [
    { title: 'Plan', detail: 'opus advisor: rubric weights + IA priority sprints (runs once)', model: 'opus' },
    { title: 'Capture', detail: 'sonnet workers, serial batches against the single shared browse daemon, 390px + 1280px', model: 'sonnet' },
    { title: 'Evaluate', detail: 'adversarial evaluator per journey: opus on a run\'s first (broad) round, sonnet on re-verify rounds; scores rubric + verifies prior contract on the LIVE app' },
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
const MIN_BUDGET_PER_ROUND = 80000 // bail before starting a round we likely can't finish
// capture.mjs grabs ALL ~130 journeys in parallel cheaply, but the opus taste-evaluation is the cost
// driver and the session-limit risk, so we bound how many journeys get opus-evaluated per round.
const MAX_EVAL = A.maxEval || 40

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

// capture.mjs manifest shape: results[] of { id, label, hardFail, shots:[paths], finalText }.
const MANIFEST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['results'],
  properties: {
    note: { type: 'string' },
    results: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'shots'],
        properties: {
          id: { type: 'string' }, label: { type: 'string' },
          hardFail: { type: ['string', 'null'] },
          shots: { type: 'array', items: { type: 'string' } },
          finalText: { type: 'string' },
        },
      },
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

// ── capture: deterministic, parallel, isolated Playwright contexts via capture.mjs ──
// Replaces the old serial agent-driven browse loop. capture.mjs launches one chromium and gives every
// journey its own browser.newContext() (no shared-daemon tab-stomping), auths each via ?bypass_auth=true,
// captures ~130 journeys (App.jsx routes + the 114 flows in flows.json) in ~1-2 min, and flags HARD
// failures (white-screen, pageerror, missing-text) deterministically — those are ground truth, no LLM.
async function runCapture() {
  const r = await agent(
    `Run the deterministic parallel capture harness for the OptiGains mobile audit, then return its manifest.
Run EXACTLY this (cwd is the repo root; the dev server is already up at ${baseUrl}):
  CONCURRENCY=8 BASE=${baseUrl} bun ui-audit/harness/capture.mjs
It launches Playwright, captures every journey in parallel, and prints "captured N journeys in Xs ...".
WAIT for it to finish (up to ~5 min). It writes ui-audit/harness/out/manifest.json.
Then read ui-audit/harness/out/manifest.json and return its "results" array VERBATIM: each item is
{ id, label, hardFail, shots:[repo-relative png paths], finalText }. Do not edit, filter, or invent items.
If the command errors (e.g. bun missing, dev server down), return results:[] and put the error in note.`,
    { label: 'capture', phase: 'Capture', schema: MANIFEST_SCHEMA, model: 'sonnet' }
  )
  return (r && r.results) || []
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
// inScope = the journey ids to opus-evaluate. null on round 1 = auto-pick a bounded set after capture;
// later rounds carry the journey ids a prior fix touched. Optional A.surfaces pins it for round 1.
let inScope = (Array.isArray(A.surfaces) && A.surfaces.length) ? A.surfaces : null
let priorContract = null
let stopped = null
let round = startRound
const lastRound = startRound + maxRounds - 1

for (; round <= lastRound; round++) {
  if (budget && budget.total && budget.remaining() < MIN_BUDGET_PER_ROUND) { stopped = 'budget'; break }
  const roundDir = `./ui-audit/round-${round}`
  log(`── Round ${round}/${lastRound} — eval scope: ${inScope ? inScope.length + ' touched journeys' : 'auto-select'} @ ${baseUrl}`)

  // CAPTURE — deterministic + parallel via capture.mjs; re-runs every round = live re-verification of fixes.
  phase('Capture')
  const journeys = await runCapture()
  const withShots = journeys.filter((j) => j.shots && j.shots.length)
  const gaps = journeys.filter((j) => !(j.shots && j.shots.length)).map((j) => ({ surface: j.id, note: 'no shots (selector-miss or unreachable)' }))
  // capture.mjs hardFails are two kinds, and they must NOT be treated the same:
  //  - intrinsic CRASHES (white-screen / pageerror / exception): real ground truth → auto-promote to blocker.
  //  - flow-ASSERTION misses (missing text / expected element / topInside / etc.): a hand-authored flows.json
  //    selector that may simply be STALE, not a bug. Auto-blockering these floods the contract with phantom
  //    fixes (observed: 42→40 hardFails across a full fix round = drift, not real defects). Instead, hand the
  //    journey to the opus evaluator with the failed assertion as a hint so it judges from the screenshots.
  const isCrash = (hf) => /^(white-screen|pageerror|exception)/.test(hf)
  const hardFindings = journeys.filter((j) => j.hardFail && isCrash(j.hardFail)).map((j) => ({
    id: `${j.id}-crash`, surface: j.id, severity: 'blocker', category: 'mobile',
    file: '(deterministic capture)', whatsWrong: `Crash on capture: ${j.hardFail}`,
    fix: 'Investigate and fix the crash / blank screen.',
    verifyBy: `capture.mjs reports no crash for journey ${j.id}`,
  }))
  // journeyId → the failed flow assertion, passed to the evaluator as a triage hint (not auto-blockered).
  const assertionMiss = Object.fromEntries(
    journeys.filter((j) => j.hardFail && !isCrash(j.hardFail)).map((j) => [j.id, j.hardFail])
  )

  // capture grabbed every journey cheaply; the opus taste-evaluation is the cost driver, so bound it.
  // Round 1 (inScope null): hard-fails + page surfaces first, fill to MAX_EVAL with flows.
  // Later rounds: only journeys a prior fix touched (re-verify), plus any new hard-fail.
  let evalJourneys
  if (inScope) {
    const want = new Set(inScope)
    evalJourneys = withShots.filter((j) => want.has(j.id) || j.hardFail)
  } else {
    const pages = withShots.filter((j) => j.id.startsWith('surface-'))
    const fails = withShots.filter((j) => j.hardFail)
    const rest = withShots.filter((j) => !j.id.startsWith('surface-') && !j.hardFail)
    evalJourneys = [...new Map([...fails, ...pages, ...rest].map((j) => [j.id, j])).values()].slice(0, MAX_EVAL)
  }
  const deferred = withShots.length - evalJourneys.length
  log(`Round ${round}: captured ${journeys.length} journeys (${withShots.length} with shots, ${hardFindings.length} crash, ${Object.keys(assertionMiss).length} assertion-miss→triage); evaluating ${evalJourneys.length} (${round === startRound ? 'opus' : 'sonnet'}), deferring ${deferred}`)

  // EVALUATE — adversarial evaluator, one per journey, parallel. Harsh by design.
  phase('Evaluate')
  const priorAssertions = {}
  if (priorContract) for (const c of priorContract.perSurface || []) (priorAssertions[c.surface] || (priorAssertions[c.surface] = [])).push(c.assertion)
  const systemicAssertions = priorContract ? (priorContract.systemic || []).map((s) => s.assertion) : []
  // First round of a run = the fresh broad audit → opus (the strict advisor where it matters most).
  // Re-verification rounds re-grade mostly-fixed journeys against concrete assertions, which sonnet handles
  // well and far faster/cheaper. Contract sign-off stays opus regardless. Set A.evalModel to override.
  const evalModel = A.evalModel || (round === startRound ? 'opus' : 'sonnet')
  const evaluated = await parallel(evalJourneys.map((j) => () => {
    const toVerify = [...(priorAssertions[j.id] || []), ...systemicAssertions]
    return agent(
      `ADVERSARIAL EVALUATOR for journey "${j.id}" (${j.label || j.id}). You are a ruthless, hard-to-please
design + UX critic. Your bias is to be HARSH: when unsure, mark it down. You did NOT write this code; your only
job is to find what is wrong and to refuse to pass weak work. Self-congratulation is failure.
${SYSTEM_LAW}
GRADING RUBRIC (score each 1-10, brutally honest, against this written standard):
${RUBRIC_TEXT}
Screenshots to inspect (Read each PNG; paths are repo-relative): ${JSON.stringify(j.shots)}
Captured page text for context: ${JSON.stringify((j.finalText || '').slice(0, 300))}
Open the source for this screen to cite exact file:line.
${assertionMiss[j.id] ? `TRIAGE A FAILED CHECK: a scripted flow assertion failed here — "${assertionMiss[j.id]}". This is
EITHER a real user-visible defect OR just a stale test selector. Decide from the screenshots + source: only
report a finding (and pick its real severity) if it's a genuine problem a user would hit. If the screen looks
correct and the assertion is just out of date, do NOT report it as a defect.` : ''}
${toVerify.length ? `VERIFY PRIOR FIXES — for EACH assertion below, look at the live screenshots and report holds=true ONLY
if the screenshots actually show it satisfied. Default to holds=false if you cannot SEE it satisfied:
${toVerify.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}` : 'No prior contract to verify (first round).'}
Then report EVERY remaining defect against the 8-point lens (drift, mobile, consistency, hierarchy, density,
belonging, slop, motion). Per finding: a stable id "${j.id}-N", severity (blocker/major/minor), category, exact
file:line, what's wrong, concrete fix using existing tokens + src/components/ui/* primitives, and verifyBy (the
observable that will prove it fixed next round). Do NOT fix anything.`,
      { label: `eval:${j.id}`, phase: 'Evaluate', schema: EVAL_SCHEMA, model: evalModel }
    )
  }))

  // A null entry = the evaluator agent itself died (rate limit, crash). That is NOT "no findings" — it is
  // missing data. Counting it as clean is the quiet-failure trap, so track it and refuse to stop on it.
  const failedEvals = (evaluated || []).filter((r) => !r).length
  const surfaces = (evaluated || []).filter(Boolean)
  const scored = surfaces.filter((r) => r.scores)   // real evals only
  const findings = [...hardFindings, ...surfaces.flatMap((r) => (r.findings || []).map((f) => ({ ...f, surface: r.surface })))]
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
  if (failedEvals > Math.max(2, evalJourneys.length * 0.25)) { stopped = 'evaluation-incomplete'; break }
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

  // Next round re-verifies exactly the journeys we touched (systemic touches shared chrome → re-check every
  // journey that had a finding, since a token/primitive change can regress any of them). No silent capping.
  priorContract = contract
  const touched = new Set((contract.perSurface || []).map((f) => f.surface))
  if ((contract.systemic || []).length) for (const f of findings) touched.add(f.surface)
  inScope = [...touched]
  if (!inScope.length) inScope = null   // nothing identifiable touched → auto-pick the bounded set again
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
