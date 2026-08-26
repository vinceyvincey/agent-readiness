// M7: tests for anti-gaming guards and deepened checks.
import { runReadiness } from '../src/engine.ts';
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ar-d-'));
}
function write(d: string, rel: string, content: string) {
  const p = path.join(d, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---- P0.1: template README fails, real README passes ----
{
  const d = mkRepo();
  write(d, 'README.md', '---\ntitle: test\n---\n# Test\n\n<!-- placeholder -->\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P0.1')!;
  eq('P0.1 fails on boilerplate-only README', c.pass, false);
}
{
  const d = mkRepo();
  write(d, 'README.md', '# Acme\n\nA real project that does X. It processes events, transforms them, and exposes a clean HTTP API for consumers. This README covers setup, usage, and verification.\n\n## Usage\nInstall deps with npm install. Run with npm start. Verify with npm test.\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P0.1')!;
  eq('P0.1 passes on real README', c.pass, true);
}

// ---- P1.2: AGENTS.md with platitudes fails, one with verified commands passes ----
{
  const d = mkRepo();
  write(d, 'AGENTS.md', '# Agent instructions\n\nBe careful. Make sure everything works.\n');
  write(d, 'package.json', JSON.stringify({ scripts: { test: 'vitest' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.2')!;
  eq('P1.2 fails on platitude-only AGENTS.md', c.pass, false);
}
{
  const d = mkRepo();
  write(d, 'AGENTS.md', '# Agent instructions\n\nYou must:\n- run `npm test` before finishing\n');
  write(d, 'package.json', JSON.stringify({ scripts: { test: 'vitest' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.2')!;
  eq('P1.2 passes with verified backtick command', c.pass, true);
}
{
  const d = mkRepo();
  write(d, 'AGENTS.md', '# Agent instructions\n\nYou must:\n- run `npm test` before finishing\n');
  write(d, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } })); // no "test" script
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.2')!;
  eq('P1.2 fails when command does not match real script', c.pass, false);
}

// ---- P4.2: CI yaml with only echo fails, one with real test passes ----
{
  const d = mkRepo();
  write(d, '.github/workflows/ci.yml', 'name: CI\non: push\njobs:\n  test:\n    steps:\n      - run: echo \'Add your steps here\'\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.2')!;
  eq('P4.2 fails on echo-only CI', c.pass, false);
}
{
  const d = mkRepo();
  write(d, '.github/workflows/ci.yml', 'name: CI\non: push\njobs:\n  test:\n    steps:\n      - run: npm test\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.2')!;
  eq('P4.2 passes on CI with real test invocation', c.pass, true);
}

// ---- P6.1: one-liner .gitignore fails, multi-pattern passes ----
{
  const d = mkRepo();
  write(d, '.gitignore', 'node_modules\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.1')!;
  eq('P6.1 fails on one-pattern .gitignore', c.pass, false);
}
{
  const d = mkRepo();
  write(d, '.gitignore', '# secrets\n.env\n*.pem\n# caches\ndist\nnode_modules\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.1')!;
  eq('P6.1 passes on multi-pattern .gitignore', c.pass, true);
}

// ---- P2.4: decorative coverage (threshold=0) fails ----
{
  const d = mkRepo();
  write(d, 'pyproject.toml', '[tool.coverage.report]\nfail_under = 0\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P2.4')!;
  eq('P2.4 fails on fail_under=0 (decorative)', c.pass, false);
}
{
  const d = mkRepo();
  write(d, 'pyproject.toml', '[tool.coverage.report]\nfail_under = 80\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P2.4')!;
  eq('P2.4 passes on fail_under=80', c.pass, true);
}

// ---- Difficulty axis: findings carry difficulty ----
{
  const d = mkRepo();
  write(d, 'README.md', '# Test\n');
  const r = runReadiness(d);
  const hasDifficulty = r.findings.every((f) => f.difficulty !== undefined);
  eq('all findings have difficulty stamp', hasDifficulty, true);
  // P0.3 is a basic file-existence check
  const p03 = r.findings.find((f) => f.id === 'P0.3')!;
  eq('P0.3 difficulty is basic', p03.difficulty, 'basic');
  // P0.1 is advanced (anti-stub)
  const p01 = r.findings.find((f) => f.id === 'P0.1')!;
  eq('P0.1 difficulty is advanced', p01.difficulty, 'advanced');
}

// ---- Punchlist sorted by severity then difficulty ----
{
  const d = mkRepo();
  write(d, 'README.md', '# Test\n');
  const r = runReadiness(d);
  const pl = r.punchlist;
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  let sorted = true;
  for (let i = 1; i < pl.length; i++) {
    const prev = pl[i - 1], curr = pl[i];
    const s = (sevRank[prev.severity] ?? 3) - (sevRank[curr.severity] ?? 3);
    if (s > 0 || (s === 0 && (diffRank[prev.difficulty] ?? 1) > (diffRank[curr.difficulty] ?? 1))) { sorted = false; break; }
  }
  eq('punchlist sorted by severity then difficulty', sorted, true);
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
