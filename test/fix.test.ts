// M9: tests for agentic remediation prompt generation + static fix drafts (no regression).
import { runReadiness } from '../src/engine.ts';
import { agentPromptFor, draftsFor } from '../src/fix.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log('FAIL', label, 'got', got, 'want', want); }
  else console.log('ok', label);
};

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ar-f-'));
}
function write(d: string, rel: string, content: string) {
  const p = path.join(d, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---- agentPromptFor: contains every high-severity failing check ----
{
  const d = mkRepo();
  // Minimal repo — many checks will fail.
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const prompt = agentPromptFor(r);
  const highFails = r.findings.filter((f) => !f.pass && f.severity === 'high');
  // M10: prompt now focuses on top 5 (sorted by severity then difficulty).
  // Verify that the top-5 sorted failing checks appear in the prompt.
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  const sorted = highFails.sort((a, b) =>
    (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) ||
    (diffRank[a.difficulty || 'intermediate'] ?? 1) - (diffRank[b.difficulty || 'intermediate'] ?? 1)
  );
  for (const f of sorted.slice(0, 5)) {
    eq(`prompt contains ${f.id}`, prompt.includes(f.id), true);
  }
  // Prompt includes safety instructions (M10: now markdown header format).
  eq('prompt has safety section', prompt.includes('## Safety'), true);
  eq('prompt has re-run instruction', prompt.includes('re-run the readiness engine'), true);
  // M10: prompt includes behavioral verification and negative testing instructions.
  eq('prompt has behavioral verification', prompt.includes('Verify the fix works'), true);
  eq('prompt has negative testing', prompt.includes('Negative-test'), true);
  eq('prompt has commit instruction', prompt.includes('Commit after each'), true);
  eq('prompt has install deps instruction', prompt.includes('install real dependencies'), true);
  eq('prompt has strategy section', prompt.includes('## Strategy'), true);
  eq('prompt has top-5 focus', prompt.includes('highest-leverage'), true);
  // M11: prompt includes quality standards from Droid trace analysis.
  eq('prompt has quality standards', prompt.includes('## Quality standards'), true);
  eq('prompt has no-placeholder rule', prompt.includes('NO** empty placeholder'), true);
  eq('prompt has BAD/GOOD examples', prompt.includes('BAD') && prompt.includes('GOOD'), true);
  // M12: prompt includes full criterion descriptions from registry.
  eq('prompt has description field', prompt.includes('**Description**'), true);
  eq('prompt has evaluation field', prompt.includes('**Evaluation**'), true);
  // M12: prompt includes agent-only criteria section.
  eq('prompt has agent-only section', prompt.includes('## Additional criteria'), true);
  eq('prompt mentions agent-only count', prompt.includes('agent-only'), true);
  // M12: prompt includes hybrid scoring model.
  eq('prompt has scoring model', prompt.includes('## Scoring model'), true);
  eq('prompt mentions deterministic floor', prompt.includes('floor'), true);
  eq('prompt mentions agent ceiling', prompt.includes('ceiling'), true);
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
  eq('prompt mentions monorepo', prompt.includes('monorepo'), true);
  eq('prompt lists apps', prompt.includes('packages/web') && prompt.includes('packages/api'), true);
}

// ---- agentPromptFor: includes level and score ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const prompt = agentPromptFor(r);
  eq('prompt has level', prompt.includes(r.level), true);
  eq('prompt has overall score', prompt.includes(String(r.overall)), true);
}

// ---- static draftsFor: no regression (still works) ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const drafts = draftsFor(r, d);
  eq('static drafts produced', drafts.length > 0, true);
  // Should include AGENTS.md draft (P1.1/P1.2 will fail)
  eq('drafts include AGENTS.md', drafts.some((dr) => dr.file === 'AGENTS.md'), true);
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
