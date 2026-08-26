// M16: tests for the runtime verification layer.
import { getRuntimeVerifications, runRuntimeVerifications, applyRuntimeResults, type RuntimeVerification } from '../src/runtime-checks.ts';
import { runReadiness } from '../src/engine.ts';
import type { CheckResult } from '../src/checks.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log('FAIL', label, 'got', got, 'want', want); }
  else console.log('ok', label);
};

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ar-rt-'));
}
function write(d: string, rel: string, content: string) {
  const p = path.join(d, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---- getRuntimeVerifications: TS/JS with vitest ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({
    name: 'test', scripts: { test: 'vitest', lint: 'eslint .' },
    devDependencies: { vitest: '^1.0', eslint: '^8.0' },
  }));
  write(d, 'tsconfig.json', '{"compilerOptions":{"strict":true}}');
  write(d, 'test/foo.test.ts', 'import { test } from "vitest"; test("x", () => {});');
  const r = runReadiness(d);
  const passingIds = new Set(r.findings.filter(f => f.pass && !f.skipped).map(f => f.id));
  const verifications = getRuntimeVerifications(d, 'typescript', passingIds);
  eq('TS has P2.2 verification', verifications.some(v => v.checkId === 'P2.2'), true);
  eq('TS P2.2 uses vitest', verifications.find(v => v.checkId === 'P2.2')?.command.includes('vitest'), true);
  // P5.1/P5.3 verifications correctly gated on node_modules existing (not present in test repo)
  eq('TS P5.1 not verified without node_modules', verifications.some(v => v.checkId === 'P5.1'), false);
  eq('TS P5.3 not verified without node_modules', verifications.some(v => v.checkId === 'P5.3'), false);
}

// ---- getRuntimeVerifications: Python ----
{
  const d = mkRepo();
  write(d, 'pyproject.toml', '[tool.pytest]\n[tool.ruff]\n[tool.mypy]\n');
  write(d, 'test/test_foo.py', 'def test_foo(): pass\n');
  const r = runReadiness(d);
  const passingIds = new Set(r.findings.filter(f => f.pass && !f.skipped).map(f => f.id));
  const verifications = getRuntimeVerifications(d, 'python', passingIds);
  eq('Python has P2.2 verification', passingIds.has('P2.2') ? verifications.some(v => v.checkId === 'P2.2') : true, true);
}

// ---- getRuntimeVerifications: unknown language → empty ----
{
  const d = mkRepo();
  write(d, 'README.md', '# test\n');
  const verifications = getRuntimeVerifications(d, 'unknown', new Set());
  eq('unknown lang has no verifications', verifications.length, 0);
}

// ---- getRuntimeVerifications: only includes passing checks ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { test: 'vitest' }, devDependencies: { vitest: '^1.0' } }));
  write(d, 'test/foo.test.ts', 'test("x", () => {});');
  // P5.1 (linter) is NOT passing (no eslint config)
  const verifications = getRuntimeVerifications(d, 'typescript', new Set(['P2.2', 'P2.12']));
  eq('only passing checks get verifications', verifications.some(v => v.checkId === 'P5.1'), false);
  eq('passing P2.2 gets verification', verifications.some(v => v.checkId === 'P2.2'), true);
}

// ---- runRuntimeVerifications: marks verified on exit 0 ----
{
  const d = mkRepo();
  // Use 'true' command which always exits 0
  const verifications: RuntimeVerification[] = [
    { checkId: 'TEST.1', description: 'test', command: ['true'], timeoutMs: 5000 },
  ];
  const results = runRuntimeVerifications(d, verifications);
  eq('exit 0 → verified', results[0].verified, true);
  eq('exit 0 → not downgraded', results[0].downgraded, false);
}

// ---- runRuntimeVerifications: downgrades on non-zero exit ----
{
  const d = mkRepo();
  const verifications: RuntimeVerification[] = [
    { checkId: 'TEST.2', description: 'test', command: ['false'], timeoutMs: 5000 },
  ];
  const results = runRuntimeVerifications(d, verifications);
  eq('exit 1 → not verified', results[0].verified, false);
  eq('exit 1 → downgraded', results[0].downgraded, true);
  eq('downgrade has evidence', results[0].evidence.includes('failed'), true);
}

// ---- runRuntimeVerifications: handles missing command gracefully ----
{
  const d = mkRepo();
  const verifications: RuntimeVerification[] = [
    { checkId: 'TEST.3', description: 'test', command: ['nonexistent-cmd-xyz'], timeoutMs: 5000 },
  ];
  const results = runRuntimeVerifications(d, verifications);
  eq('missing cmd → not verified', results[0].verified, false);
  eq('missing cmd → not downgraded', results[0].downgraded, false);
  eq('missing cmd → skipped evidence', results[0].evidence.includes('skipped'), true);
}

// ---- applyRuntimeResults: downgrades passing checks ----
{
  const findings: CheckResult[] = [
    { id: 'P5.1', pillar: 'P5', pass: true, evidence: 'eslint config', severity: 'med' },
    { id: 'P5.3', pillar: 'P5', pass: true, evidence: 'tsconfig', severity: 'med' },
  ];
  const results = [
    { checkId: 'P5.1', verified: false, downgraded: true, evidence: 'lint failed: 3 errors', durationMs: 100 },
    { checkId: 'P5.3', verified: true, downgraded: false, evidence: 'tsc passed', durationMs: 200 },
  ];
  const updated = applyRuntimeResults(findings, results as any);
  eq('downgraded check → pass=false', updated[0].pass, false);
  eq('downgraded check → has runtimeEvidence', !!updated[0].runtimeEvidence, true);
  eq('verified check → pass=true', updated[1].pass, true);
  eq('verified check → verified=true', updated[1].verified, true);
}

// ---- applyRuntimeResults: skips non-passing and unmatched checks ----
{
  const findings: CheckResult[] = [
    { id: 'P5.1', pillar: 'P5', pass: false, evidence: 'no eslint', severity: 'med' },
    { id: 'P5.3', pillar: 'P5', pass: true, evidence: 'tsconfig', severity: 'med', skipped: true },
  ];
  const results = [
    { checkId: 'P5.1', verified: false, downgraded: true, evidence: 'should not apply', durationMs: 100 },
  ];
  const updated = applyRuntimeResults(findings, results as any);
  eq('failing check unchanged', updated[0].pass, false);
  eq('skipped check unchanged', updated[1].pass, true);
  eq('skipped check still skipped', updated[1].skipped, true);
}

// ---- Engine with verify=true runs runtime verification ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { test: 'vitest', lint: 'eslint .' }, devDependencies: { vitest: '^1.0' } }));
  write(d, 'test/foo.test.ts', 'test("x", () => {});');
  // Without verify: standard deterministic
  const r1 = runReadiness(d);
  // With verify: runs commands (may skip if npx/deps unavailable)
  const r2 = runReadiness(d, { verify: true });
  eq('verify mode produces report', typeof r2.overall, 'number');
  eq('verify mode has droidPassRate', typeof r2.droidPassRate, 'number');
  // Both should have findings
  eq('verify mode has findings', r2.findings.length > 0, true);
}

// ---- P2.12 check: passes with test runner + test files ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { test: 'vitest' }, devDependencies: { vitest: '^1.0' } }));
  write(d, 'test/foo.test.ts', 'test("x", () => {});');
  const r = runReadiness(d);
  const p212 = r.findings.find(f => f.id === 'P2.12');
  eq('P2.12 exists', !!p212, true);
  eq('P2.12 passes with runner + files', p212?.pass, true);
}

// ---- P2.12 check: fails without test files ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { test: 'vitest' }, devDependencies: { vitest: '^1.0' } }));
  // No test files
  const r = runReadiness(d);
  const p212 = r.findings.find(f => f.id === 'P2.12');
  eq('P2.12 fails without test files', p212?.pass, false);
}

// ---- CLI --verify flag doesn't crash ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const res = spawnSync('node', ['--experimental-strip-types', 'src/cli.ts', d, '--json', '--verify'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 60000,
  });
  const output = res.stdout || '';
  eq('CLI --verify produces output', output.length > 0, true);
  // Should contain droidPassRate in JSON — parse the full stdout as JSON
  try {
    const j = JSON.parse(output);
    eq('CLI --verify has droidPassRate', typeof j.droidPassRate, 'number');
  } catch {
    eq('CLI --verify produces valid JSON', false, true);
  }
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
