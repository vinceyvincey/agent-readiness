// Tests for agentic remediation prompt generation + static fix drafts.
// Validates the new tool-driven iterative prompt structure (short prompts
// that instruct using readiness_check, not mega-prompts with embedded descriptions).
import { runReadiness, getRemediationAction } from '../src/engine.ts';
import { agentPromptFor, assessmentPromptFor, draftsFor, fullHybridPromptFor } from '../src/fix.ts';
import { getCriterionByPiId, getAgentOnlyCriteria } from '../src/criteria-registry.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log('FAIL', label, 'got', got, 'want', want);
  } else console.log('ok', label);
};

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ar-f-'));
}
function write(d: string, rel: string, content: string) {
  const p = path.join(d, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---- agentPromptFor: short grounding prompt with failing checks ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const prompt = agentPromptFor(r);
  const highFails = r.findings.filter((f) => !f.pass && !f.skipped && f.severity === 'high');
  // Sort same way as the prompt (severity then difficulty) to verify top items appear
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  const sortedHigh = [...highFails].sort(
    (a, b) =>
      (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) ||
      (diffRank[a.difficulty || 'intermediate'] ?? 1) - (diffRank[b.difficulty || 'intermediate'] ?? 1),
  );
  // Verify that the top sorted failing checks appear in the prompt
  for (const f of sortedHigh.slice(0, 3)) {
    eq(`agentPrompt contains ${f.id}`, prompt.includes(f.id), true);
  }
  // Prompt is short (< 2000 chars)
  eq('agentPrompt is short', prompt.length < 2000, true);
  // Prompt instructs using readiness_check tool
  eq('agentPrompt mentions readiness_check', prompt.includes('readiness_check'), true);
  eq('agentPrompt mentions summary=true', prompt.includes('summary=true'), true);
  eq('agentPrompt mentions checkId', prompt.includes('checkId'), true);
  // Prompt has quality standards
  eq('agentPrompt has quality standards', prompt.includes('## Quality standards'), true);
  eq('agentPrompt has no-placeholder rule', prompt.includes('No empty placeholders'), true);
  // Prompt has safety section
  eq('agentPrompt has safety section', prompt.includes('## Safety'), true);
  // Prompt no longer embeds full criterion descriptions
  eq('agentPrompt does not embed **Description**', prompt.includes('**Description**'), false);
  eq('agentPrompt does not embed **Evaluation**', prompt.includes('**Evaluation**'), false);
}

// ---- agentPromptFor: includes level and score ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const prompt = agentPromptFor(r);
  eq('agentPrompt has level', prompt.includes(r.level), true);
  eq('agentPrompt has overall score', prompt.includes(String(r.overall)), true);
  eq('agentPrompt has droid pass rate', prompt.includes(String(r.droidPassRate)), true);
}

// ---- agentPromptFor: monorepo awareness ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write(d, 'packages/web/package.json', JSON.stringify({ name: 'web' }));
  write(d, 'packages/api/package.json', JSON.stringify({ name: 'api' }));
  write(d, 'README.md', '# Monorepo\n\nA test monorepo with web and api packages.\n');
  write(d, '.gitignore', '.env\nnode_modules\ndist\n');
  const r = runReadiness(d);
  const prompt = agentPromptFor(r);
  eq('agentPrompt mentions monorepo', prompt.includes('Monorepo'), true);
  eq('agentPrompt lists apps', prompt.includes('packages/web') && prompt.includes('packages/api'), true);
}

// ---- static draftsFor: no regression (still works) ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const drafts = draftsFor(r, d);
  eq('static drafts produced', drafts.length > 0, true);
  eq(
    'drafts include AGENTS.md',
    drafts.some((dr) => dr.file === 'AGENTS.md'),
    true,
  );
}

// ---- assessmentPromptFor: short assessment prompt ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const prompt = assessmentPromptFor(r);

  // Prompt is shorter than old mega-prompt (< 2000 chars)
  eq('assessment prompt is short', prompt.length < 2000, true);

  // Do-not-modify instruction
  eq('assessment says DO NOT modify', prompt.includes('DO NOT modify'), true);

  // Instructs using readiness_check
  eq('assessment mentions readiness_check', prompt.includes('readiness_check'), true);
  eq('assessment mentions summary=true', prompt.includes('summary=true'), true);
  eq('assessment mentions checkId', prompt.includes('checkId'), true);

  // Deterministic floor score included
  eq('assessment has floor score', prompt.includes(String(r.overall)), true);
  eq('assessment has floor level', prompt.includes(r.level), true);

  // Agent-only criteria mentioned
  const agentOnly = getAgentOnlyCriteria();
  for (const c of agentOnly) {
    eq(`assessment mentions ${c.droidId}`, prompt.includes(c.droidId), true);
  }

  // No longer embeds full criterion descriptions
  eq('assessment does not embed **Description**', prompt.includes('**Description**'), false);

  // Structured output format
  eq('assessment has verification results format', prompt.includes('### Verification Results'), true);
  eq('assessment has agent-only criteria format', prompt.includes('### Agent-Only Criteria'), true);
  eq('assessment has augmented score format', prompt.includes('### Augmented Score'), true);
  eq('assessment has action items format', prompt.includes('### Action Items'), true);
}

// ---- assessmentPromptFor: monorepo awareness ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write(d, 'packages/web/package.json', JSON.stringify({ name: 'web' }));
  write(d, 'packages/api/package.json', JSON.stringify({ name: 'api' }));
  write(d, 'README.md', '# Monorepo\n\nA test monorepo with web and api packages.\n');
  write(d, '.gitignore', '.env\nnode_modules\ndist\n');
  const r = runReadiness(d);
  const prompt = assessmentPromptFor(r);
  eq('assessment mentions monorepo', prompt.includes('Monorepo'), true);
}

// ---- fullHybridPromptFor: short phased prompt ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const prompt = fullHybridPromptFor(r);

  // Prompt has 4 phases
  eq('fullHybrid has Phase 1 Assess', prompt.includes('Phase 1') && prompt.includes('Assess'), true);
  eq('fullHybrid has Phase 2 Fix', prompt.includes('Phase 2') && prompt.includes('Fix'), true);
  eq('fullHybrid has Phase 3 Validate', prompt.includes('Phase 3') && prompt.includes('Validate'), true);
  eq('fullHybrid has Phase 4 Re-run', prompt.includes('Phase 4') && prompt.includes('Re-run'), true);

  // Prompt is shorter than old mega-prompt (< 2000 chars)
  eq('fullHybrid prompt is short', prompt.length < 2000, true);

  // Instructs using readiness_check
  eq('fullHybrid mentions readiness_check', prompt.includes('readiness_check'), true);
  eq('fullHybrid mentions summary=true', prompt.includes('summary=true'), true);
  eq('fullHybrid mentions checkId', prompt.includes('checkId'), true);

  // Mentions current scores
  eq('fullHybrid mentions current level', prompt.includes(r.level), true);
  eq('fullHybrid mentions current overall', prompt.includes(String(r.overall)), true);
  eq('fullHybrid mentions droidPassRate', prompt.includes(String(r.droidPassRate)), true);

  // Agent-only criteria mentioned
  const agentOnly = getAgentOnlyCriteria();
  for (const c of agentOnly) {
    eq(`fullHybrid mentions ${c.droidId}`, prompt.includes(c.droidId), true);
  }

  // No longer embeds full criterion descriptions
  eq('fullHybrid does not embed **Description**', prompt.includes('**Description**'), false);

  // Output format sections
  eq('fullHybrid has OUTPUT FORMAT', prompt.includes('### Output Format') || prompt.includes('Output Format'), true);
  eq('fullHybrid has Score Delta section', prompt.includes('Score Delta'), true);
  eq('fullHybrid has Assessment Results', prompt.includes('Assessment Results'), true);
  eq('fullHybrid has Fixes Applied', prompt.includes('Fixes Applied'), true);
  eq('fullHybrid has Remaining Issues', prompt.includes('Remaining Issues'), true);
}

// ---- fullHybridPromptFor: monorepo awareness ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
  write(d, 'packages/web/package.json', JSON.stringify({ name: 'web' }));
  write(d, 'packages/api/package.json', JSON.stringify({ name: 'api' }));
  write(d, 'README.md', '# Monorepo\n\nA test monorepo with web and api packages.\n');
  write(d, '.gitignore', '.env\nnode_modules\ndist\n');
  const r = runReadiness(d);
  const prompt = fullHybridPromptFor(r);
  eq('fullHybrid mentions monorepo', prompt.includes('Monorepo'), true);
}

// ---- fullHybridPromptFor: includes failing check evidence ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const prompt = fullHybridPromptFor(r);
  const failedIds = r.findings.filter((f) => !f.pass && !f.skipped).map((f) => f.id);
  // Should mention at least some failing check IDs
  const mentionsFailed = failedIds.some((id) => prompt.includes(id));
  eq('fullHybrid mentions failing check IDs', mentionsFailed, true);
}

// ---- getRemediationAction: returns meaningful action strings ----
{
  const action = getRemediationAction('P2.2');
  eq('getRemediationAction returns string', typeof action, 'string');
  eq('getRemediationAction P2.2 mentions test runner', action.includes('test runner'), true);
  eq('getRemediationAction P5.8 mentions knip', getRemediationAction('P5.8').includes('knip'), true);
  eq('getRemediationAction unknown returns fallback', getRemediationAction('P99.99'), 'No mapped remediation');
}

// ---- getCriterionByPiId: returns criterion with description ----
{
  const c = getCriterionByPiId('P5.8');
  eq('getCriterionByPiId P5.8 exists', !!c, true);
  eq('getCriterionByPiId P5.8 has description', c!.description.length > 50, true);
  eq('getCriterionByPiId P5.8 has evaluation', c!.evaluation.length > 50, true);
  eq('getCriterionByPiId P5.8 droidId is dead_code_detection', c!.droidId, 'dead_code_detection');
}

// ---- Dogfooding: prompt length on this repo (many failing checks) ----
{
  const r = runReadiness('.');
  const fixPrompt = agentPromptFor(r);
  const fullPrompt = fullHybridPromptFor(r);
  const assessPrompt = assessmentPromptFor(r);
  // All prompts should be under 2000 chars even for a repo with many failures
  eq('dogfood agentPrompt < 2000 chars', fixPrompt.length < 2000, true);
  eq('dogfood fullHybridPrompt < 2000 chars', fullPrompt.length < 2000, true);
  eq('dogfood assessmentPrompt < 2000 chars', assessPrompt.length < 2000, true);
  // All prompts mention readiness_check
  eq('dogfood agentPrompt mentions readiness_check', fixPrompt.includes('readiness_check'), true);
  eq('dogfood fullHybridPrompt mentions readiness_check', fullPrompt.includes('readiness_check'), true);
  eq('dogdog assessmentPrompt mentions readiness_check', assessPrompt.includes('readiness_check'), true);
}

// ---- Dogfooding: iterative loop simulation on synthetic repo ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  write(d, 'package.json', JSON.stringify({ name: 'test' }));

  // Step 1: get initial report
  const r1 = runReadiness(d);
  const p21Before = r1.findings.find((f) => f.id === 'P2.1');
  eq('iterative: P2.1 fails before fix', p21Before?.pass, false);

  // Step 2: agent would call readiness_check with checkId="P2.1" to get detail
  const criterion = getCriterionByPiId('P2.1');
  const remediation = getRemediationAction('P2.1');
  eq('iterative: P2.1 criterion exists', !!criterion, true);
  eq('iterative: P2.1 remediation mentions test', remediation.includes('test'), true);

  // Step 3: simulate fix (add test files)
  write(d, 'test/foo.test.ts', 'test("x", () => {});');
  const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
  pkg.scripts = { test: 'vitest' };
  pkg.devDependencies = { vitest: '^1.0' };
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg));

  // Step 4: re-run readiness_check to verify fix
  const r2 = runReadiness(d);
  const p21After = r2.findings.find((f) => f.id === 'P2.1');
  eq('iterative: P2.1 passes after fix', p21After?.pass, true);

  // Step 5: verify failing count decreased
  const failingBefore = r1.findings.filter((f) => !f.pass && !f.skipped).length;
  const failingAfter = r2.findings.filter((f) => !f.pass && !f.skipped).length;
  eq('iterative: failing count decreased', failingAfter < failingBefore, true);
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
