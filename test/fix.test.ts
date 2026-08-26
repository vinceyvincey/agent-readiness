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
  // Every high-severity failing check ID should appear in the prompt.
  for (const f of highFails.slice(0, 5)) {
    eq(`prompt contains ${f.id}`, prompt.includes(f.id), true);
  }
  // Prompt includes safety instructions.
  eq('prompt has safety section', prompt.includes('Safety:'), true);
  eq('prompt has re-run instruction', prompt.includes('re-run the readiness engine'), true);
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
