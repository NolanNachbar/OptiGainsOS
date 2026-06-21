export const meta = {
  name: 'audit-round',
  description: 'One audit round: vision-judge captured screenshots vs the design system, map findings to source files, fan out fixers',
  phases: [
    { title: 'Judge', detail: 'reuse audit-judge: one vision agent per journey' },
    { title: 'Map', detail: 'map findings to the source file that owns them' },
    { title: 'Fix', detail: 'reuse audit-fix: one fixer per file + serial shared pass' },
  ],
};

// args: { root, manifest: [<capture results>], round, strictness }
// `manifest` is capture.mjs's manifest.json `results` array (passed in by the
// caller; workflow scripts have no fs). We reuse judge.workflow.js and
// fix.workflow.js verbatim via workflow({scriptPath}); the only new work is the
// Map step that turns judge findings into per-file fix groups.
const a = typeof args === 'string' ? JSON.parse(args) : (args || {});
const root = a.root;
const round = a.round || 1;
const strictness = a.strictness || 'critical';
const manifest = a.manifest || [];
const journeys = manifest.filter((j) => j.shots && j.shots.length);
log(`round ${round} (${strictness}): ${journeys.length} journeys, ${manifest.filter((j) => j.hardFail).length} hard fail(s)`);

phase('Judge');
const judgeRes = await workflow({ scriptPath: `${root}/ui-audit/harness/judge.workflow.js` }, { root, journeys });
const allFindings = (judgeRes && judgeRes.findings) || [];
log(`judge: ${allFindings.length} findings ${JSON.stringify(judgeRes && judgeRes.bySeverity || {})}`);

// Convergence gate: always fix real defects (BLOCKER/DATA/SEQ/MOBILE/A11Y/PERF);
// only fix TASTE when the judge is confident (>=0.8). Low-confidence subjective
// taste calls are where the loop oscillates (one round adds a fill, the next
// removes it), so we leave those for human review instead of churning on them.
const findings = allFindings.filter((f) =>
  f.severity !== 'TASTE' || (f.confidence ?? 1) >= 0.8);
const deferred = allFindings.length - findings.length;
log(`actionable: ${findings.length} (deferred ${deferred} low-confidence TASTE)`);

// Nothing actionable — return the verdict so the caller can decide to stop the loop.
if (!findings.length) {
  return { round, clean: true, hardFails: (judgeRes && judgeRes.hardFails) || [], bySeverity: (judgeRes && judgeRes.bySeverity) || {}, deferredTaste: deferred, findings: [], fix: null };
}

phase('Map');
const GROUPS = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'repo-relative path, e.g. src/pages/Today.jsx' },
          label: { type: 'string' },
          shots: { type: 'array', items: { type: 'string' } },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' }, severity: { type: 'string' }, evidence: { type: 'string' }, confidence: { type: 'number' },
              },
              required: ['title', 'severity', 'evidence'],
            },
          },
        },
        required: ['file', 'findings'],
      },
    },
  },
  required: ['groups'],
};
// shots-by-journey so the map agent can attach the right screenshots to each group.
const shotsByJourney = Object.fromEntries(journeys.map((j) => [j.id, j.shots]));
const mapped = await agent(
  `Map UI audit findings to the SOURCE FILE that owns each one, so a fixer can be pointed at exactly one file.\n\n` +
  `Resolve files against this repo (root ${root}):\n` +
  `- Surface journeys have ids like "surface-Today"; the route table in src/App.jsx maps name->component, and the file is src/pages/<Component>.jsx. READ src/App.jsx to resolve names whose component differs from the name (e.g. Recovery->RecoveryDetail.jsx, Physique->PhysiqueTracker.jsx).\n` +
  `- Findings about shared chrome (bottom dock/nav, app header, dialogs/sheets, generic cards/buttons) belong to the shared component under src/components/** or src/components/ui/**, NOT the page. Grep/inspect if unsure.\n` +
  `- A finding's screenshots are the shots of its journey id.\n\n` +
  `Group findings by resolved file (one group per file, merge findings that share a file). Use the exact repo-relative path. Drop a finding only if you truly cannot resolve a file.\n\n` +
  `Findings (each has journey id + surface + title + severity + evidence + confidence):\n` +
  JSON.stringify(findings, null, 1) + `\n\n` +
  `Shots by journey id:\n` + JSON.stringify(shotsByJourney, null, 1),
  { label: 'map:findings->files', phase: 'Map', schema: GROUPS },
);
const groups = (mapped && mapped.groups || []).filter((g) => g.file && g.findings && g.findings.length);
log(`mapped to ${groups.length} files`);

phase('Fix');
const fixRes = await workflow({ scriptPath: `${root}/ui-audit/harness/fix.workflow.js` }, { root, groups });

return {
  round,
  clean: false,
  hardFails: (judgeRes && judgeRes.hardFails) || [],
  bySeverity: (judgeRes && judgeRes.bySeverity) || {},
  findingsCount: findings.length,
  deferredTaste: deferred,
  filesFixed: (fixRes && fixRes.filesFixed) || [],
  skipped: (fixRes && fixRes.skipped) || [],
  sharedApplied: (fixRes && fixRes.sharedApplied) || null,
};
