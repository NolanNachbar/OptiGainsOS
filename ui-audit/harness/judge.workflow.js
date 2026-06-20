export const meta = {
  name: 'audit-judge',
  description: 'Vision-judge captured mobile screenshots against the OptiGains rubric, one agent per journey',
  phases: [
    { title: 'Judge', detail: 'one agent per captured journey, scores screenshots' },
    { title: 'Synthesize', detail: 'dedup + rank findings' },
  ],
};

// args: { root, journeys: [{ id, label, shots, finalText, hardFail }] }
// `journeys` is the manifest.json results array (passed in by the caller, since
// workflow scripts have no fs). Each judge READS the PNGs + rubric and reports
// only what the pixels show. Hard failures are already verified by capture, so
// judges don't re-confirm crashes — they cover taste/layout/sequencing/data.
log(`args type=${typeof args} keys=${args && typeof args === 'object' ? Object.keys(args).join(',') : 'n/a'}`);
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : (args || {});
const root = parsedArgs.root;
let rawJourneys = parsedArgs.journeys;
if (!rawJourneys && parsedArgs.journeysPath) {
  const boot = await agent(
    `Read the JSON file at ${parsedArgs.journeysPath}. Return its "journeys" array EXACTLY: each item has id, label, shots (string array), hardFail.`,
    { label: 'bootstrap:read-journeys', phase: 'Judge',
      schema: { type: 'object', properties: { journeys: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, label: { type: 'string' }, shots: { type: 'array', items: { type: 'string' } }, hardFail: {} },
        required: ['id', 'shots'] } } }, required: ['journeys'] } },
  );
  rawJourneys = (boot && boot.journeys) || [];
}
const journeys = (rawJourneys || []).filter((j) => j.shots && j.shots.length);
log(`judging ${journeys.length} journeys`);

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['BLOCKER', 'DATA', 'MOBILE', 'A11Y', 'PERF', 'SEQ', 'TASTE'] },
          surface: { type: 'string' },
          evidence: { type: 'string', description: 'what you SEE, and in which screenshot file' },
          confidence: { type: 'number' },
        },
        required: ['title', 'severity', 'evidence', 'confidence'],
      },
    },
  },
  required: ['findings'],
};

phase('Judge');
const judged = await parallel(journeys.map((j) => () =>
  agent(
    `You are a ruthless mobile-first design + UX judge for the OptiGains PWA. The bar is Whoop / MacroFactor: everything must look intentional and premium at 390px.\n\n` +
    `Read the rubric first: ${root}/ui-audit/AUDIT_RUBRIC.md\n` +
    `THE canonical design system (the standard for color, type, spacing, components, motion) — judge conformance against it: ${root}/ui-audit/design-system.html\n` +
    `Persona criteria: ${root}/personas/daily-athlete.md\n\n` +
    `Judge this journey: "${j.label}" (${j.id}). Screenshots (Read each one):\n` +
    j.shots.map((s) => `  ${root}/${s}`).join('\n') +
    (j.hardFail ? `\n\nNote: capture already flagged a hard failure here (${j.hardFail}); don't re-report it, judge the surrounding UX.` : '') +
    `\n\nReport ONLY real, visible problems. Categories: MOBILE (overflow/cramped/centered-not-bottom-sheet at 390px), SEQ (something shown at the wrong time, e.g. a post-session field before the session), DATA (empty where seeded data should appear), A11Y (target <44px, contrast), TASTE (AI-slop, weak hierarchy, wrong emphasis, the screen doesn't look designed), PERF (visible spinner/jank). ` +
    `For each finding give: title, severity, surface, evidence (what you SEE + which file), confidence 0-1. ` +
    `Do NOT invent crashes or guess at code. If a screen looks good, return zero findings for it. Be specific; vague findings are useless.`,
    { label: `judge:${j.id}`, phase: 'Judge', schema: FINDINGS },
  ).then((r) => ({ id: j.id, label: j.label, findings: (r && r.findings) || [] }))
));

phase('Synthesize');
const all = judged.filter(Boolean).flatMap((j) => j.findings.map((f) => ({ ...f, journey: j.id })));
const order = { BLOCKER: 0, DATA: 1, SEQ: 2, MOBILE: 3, A11Y: 4, PERF: 5, TASTE: 6 };
all.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9) || (b.confidence - a.confidence));

const hardFails = (parsedArgs.journeys || []).filter((j) => j.hardFail).map((j) => ({ id: j.id, label: j.label, hardFail: j.hardFail }));

return {
  hardFails,
  total: all.length,
  bySeverity: all.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {}),
  findings: all,
};
