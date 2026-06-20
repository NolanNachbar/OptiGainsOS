export const meta = {
  name: 'audit-fix',
  description: 'Fan out one fixer per source file to apply audit findings, conforming to the design system',
  phases: [
    { title: 'Fix', detail: 'one agent per file, edits that file only' },
    { title: 'Shared', detail: 'serial pass for global/shared-file recommendations' },
  ],
};

// args: { root, groups: [{ file, label, shots, findings:[{title,severity,evidence,confidence}] }] }
// One agent per file => no two agents ever edit the same file => safe parallel fixing.
// Agents edit ONLY their assigned file; anything needing a shared/global file
// (index.css, ui/* primitives, tokens) is returned as a recommendation and applied
// serially afterward, so shared files are never raced.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : (args || {});
const root = parsedArgs.root;

// groups can be passed inline, or via groupsPath (a JSON file an agent reads —
// workflow scripts have no fs). The bootstrap agent just returns the parsed array.
let rawGroups = parsedArgs.groups;
if (!rawGroups && parsedArgs.groupsPath) {
  const boot = await agent(
    `Read the JSON file at ${parsedArgs.groupsPath}. It has shape {root, groups:[{file,label,shots,findings:[{title,severity,evidence,confidence}]}]}. Return its "groups" array EXACTLY, unmodified.`,
    {
      label: 'bootstrap:read-groups', phase: 'Fix',
      schema: { type: 'object', properties: { groups: { type: 'array', items: { type: 'object', properties: {
        file: { type: 'string' }, label: { type: 'string' },
        shots: { type: 'array', items: { type: 'string' } },
        findings: { type: 'array', items: { type: 'object', properties: {
          title: { type: 'string' }, severity: { type: 'string' }, evidence: { type: 'string' }, confidence: { type: 'number' },
        }, required: ['title', 'severity', 'evidence'] } },
      }, required: ['file', 'findings'] } } }, required: ['groups'] },
    },
  );
  rawGroups = (boot && boot.groups) || [];
}
const groups = (rawGroups || []).filter((g) => g.file && g.findings && g.findings.length);
log(`fixing ${groups.length} files`);

const FIX_RESULT = {
  type: 'object',
  properties: {
    changed: { type: 'boolean' },
    summary: { type: 'string', description: 'what was changed in this file, one line per finding addressed' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'findings not fixed and why' },
    sharedRecommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'the shared/global file that needs a change' },
          change: { type: 'string', description: 'the specific change to make' },
        },
        required: ['file', 'change'],
      },
    },
  },
  required: ['changed', 'summary'],
};

phase('Fix');
const fixed = await parallel(groups.map((g) => () =>
  agent(
    `You are a senior frontend engineer fixing real UI audit findings in the OptiGains PWA (React 19 + Vite + Tailwind). The bar is Whoop / MacroFactor: premium, intentional, mobile-first at 390px.\n\n` +
    `THE design system (the standard — color, type, spacing, components, motion). Read it and conform to it: ${root}/ui-audit/design-system.html\n` +
    `Project rules: no emojis in UI, no em dashes in copy, coral is the SINGLE primary-action color (don't put two coral CTAs on one screen).\n\n` +
    `You own EXACTLY ONE file. Edit only it: ${root}/${g.file}\n` +
    `Screenshots of the current (broken) state — Read them:\n` + (g.shots || []).map((s) => `  ${root}/${s}`).join('\n') + `\n\n` +
    `Findings to fix in this file:\n` +
    g.findings.map((f, i) => `  ${i + 1}. [${f.severity}] ${f.title}\n     ${f.evidence}`).join('\n') + `\n\n` +
    `Instructions:\n` +
    `- Read the file first, understand it, then make surgical edits that fix the findings and match the design system.\n` +
    `- Fix DATA findings only if they are presentation bugs (e.g. rendering raw values, off-by-one dates, missing fallbacks). Do NOT touch seed data or DB — note those as skipped.\n` +
    `- If a fix requires editing a SHARED/GLOBAL file (src/index.css, src/components/ui/*, design tokens, a component shared by other screens), DO NOT edit it. Put it in sharedRecommendations instead so it can be applied without conflicts.\n` +
    `- Do not invent features or refactor beyond the findings. Smallest diff that fixes them.\n` +
    `- Verify your edits are syntactically valid.\n` +
    `Return: changed, a summary (one line per finding addressed), skipped[], and sharedRecommendations[].`,
    { label: `fix:${g.file.split('/').pop()}`, phase: 'Fix', schema: FIX_RESULT },
  ).then((r) => ({ file: g.file, ...(r || { changed: false, summary: 'agent died', skipped: [], sharedRecommendations: [] }) }))
));

// Collect shared recommendations, dedup by file+change, apply serially (no race).
phase('Shared');
const sharedRecs = fixed.filter(Boolean).flatMap((f) => (f.sharedRecommendations || []).map((r) => ({ ...r, from: f.file })));
const seen = new Set();
const uniqueRecs = sharedRecs.filter((r) => { const k = r.file + '::' + r.change; if (seen.has(k)) return false; seen.add(k); return true; });

let sharedResult = null;
if (uniqueRecs.length) {
  sharedResult = await agent(
    `You are applying shared/global design-system fixes that page-level fixers deferred (they touch files used by many screens, so they must be done in one serial pass).\n\n` +
    `Design system (the standard): ${root}/ui-audit/design-system.html\n\n` +
    `Apply these changes. Group by file, read each file first, make surgical edits, keep them consistent with the design system. Skip any that are redundant or risky and say why.\n\n` +
    uniqueRecs.map((r, i) => `${i + 1}. ${r.file}: ${r.change} (from ${r.from})`).join('\n'),
    { label: 'fix:shared', phase: 'Shared', schema: { type: 'object', properties: { summary: { type: 'string' }, applied: { type: 'array', items: { type: 'string' } } }, required: ['summary'] } },
  );
}

return {
  filesFixed: fixed.filter((f) => f && f.changed).map((f) => ({ file: f.file, summary: f.summary })),
  filesUnchanged: fixed.filter((f) => f && !f.changed).map((f) => f.file),
  skipped: fixed.filter(Boolean).flatMap((f) => (f.skipped || []).map((s) => ({ file: f.file, reason: s }))),
  sharedApplied: sharedResult,
};
