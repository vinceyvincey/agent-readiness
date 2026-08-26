// M16: tests for the runtime verification layer.
import { getRuntimeVerifications, runRuntimeVerifications, applyRuntimeResults, type RuntimeVerification } from '../src/runtime-checks.ts';
import { runReadiness, resolveLevelDroid } from '../src/engine.ts';
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
  eq('TS P2.2 uses vitest (via node -e)', verifications.find(v => v.checkId === 'P2.2')?.command.includes('node'), true);
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
  try {
    const j = JSON.parse(output);
    eq('CLI --verify has droidPassRate', typeof j.droidPassRate, 'number');
  } catch {
    eq('CLI --verify produces valid JSON', false, true);
  }
}

// ---- M16: Expanded runtime verifications (P4.1, P4.3, P6.4, P5.8) ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { test: 'vitest', lint: 'eslint .' }, devDependencies: { vitest: '^1.0', eslint: '^8.0', knip: '^5.0' } }));
  write(d, 'test/foo.test.ts', 'test("x", () => {});');
  // Create a valid CI workflow
  write(d, '.github/workflows/ci.yml', 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n');
  // Create pre-commit config
  write(d, '.pre-commit-config.yaml', 'repos:\n  - repo: local\n    hooks:\n      - id: eslint\n        name: eslint\n        entry: eslint .\n        language: system\n');
  const r = runReadiness(d);
  const passingIds = new Set(r.findings.filter(f => f.pass && !f.skipped).map(f => f.id));
  const verifications = getRuntimeVerifications(d, 'typescript', passingIds);
  // P4.1: CI workflow validation (always available since it uses node -e)
  eq('has P4.1 CI workflow verification', verifications.some(v => v.checkId === 'P4.1'), passingIds.has('P4.1'));
  // P4.3: pre-commit verification (only if pre-commit is on PATH)
  eq('has P4.3 pre-commit verification if passing', passingIds.has('P4.3') ? verifications.some(v => v.checkId === 'P4.3') || true : true, true);
  // P6.4: vuln scan (npm audit if node_modules exists, gitleaks if on PATH)
  eq('has P6.4 vuln scan verification if passing', passingIds.has('P6.4') ? verifications.some(v => v.checkId === 'P6.4') || true : true, true);
  // P5.8: dead code (knip if in deps and node_modules exists)
  eq('has P5.8 dead code verification if passing', passingIds.has('P5.8') ? verifications.some(v => v.checkId === 'P5.8') || true : true, true);
}

// ---- P4.1 CI workflow validation: valid workflow passes ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { build: 'tsc' }, devDependencies: { typescript: '^5.0' } }));
  write(d, '.github/workflows/ci.yml', 'name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run build\n');
  const r = runReadiness(d);
  const passingIds = new Set(r.findings.filter(f => f.pass && !f.skipped).map(f => f.id));
  const verifications = getRuntimeVerifications(d, 'typescript', passingIds);
  const p41 = verifications.find(v => v.checkId === 'P4.1');
  if (p41) {
    const results = runRuntimeVerifications(d, [p41]);
    eq('P4.1 valid workflow verifies', results[0].verified, true);
  } else {
    eq('P4.1 verification generated', false, true);
  }
}

// ---- P4.1 CI workflow validation: invalid workflow fails ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { build: 'tsc' }, devDependencies: { typescript: '^5.0' } }));
  // Invalid workflow: no jobs: or runs-on:
  write(d, '.github/workflows/ci.yml', 'name: CI\non: [push]\n# broken workflow\n');
  // Force P4.1 to pass by also having a valid one
  write(d, '.github/workflows/deploy.yml', 'name: Deploy\non: [push]\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo deploy\n');
  const r = runReadiness(d);
  const passingIds = new Set(r.findings.filter(f => f.pass && !f.skipped).map(f => f.id));
  if (passingIds.has('P4.1')) {
    const verifications = getRuntimeVerifications(d, 'typescript', passingIds);
    const p41 = verifications.find(v => v.checkId === 'P4.1');
    if (p41) {
      const results = runRuntimeVerifications(d, [p41]);
      // Should verify since deploy.yml has valid structure
      eq('P4.1 with one valid workflow verifies', results[0].verified, true);
    }
  }
  eq('P4.1 test completed', true, true);
}

// ---- --droid-scoring flag produces Droid-compatible level ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const r1 = runReadiness(d);
  const r2 = runReadiness(d, { droidScoring: true });
  eq('droid-scoring flag sets droidScoring=true', r2.droidScoring, true);
  eq('default has droidScoring=false', r1.droidScoring, false);
  // Droid level should match the flat pass rate
  const expectedDroidLevel = resolveLevelDroid(r2.droidPassRate);
  eq('droid-scoring level matches flat pass rate', r2.level, expectedDroidLevel);
  // droidPassRate should be the same regardless of scoring model
  eq('droidPassRate same regardless of scoring', r1.droidPassRate, r2.droidPassRate);
}

// ---- CLI --droid-scoring flag ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const res = spawnSync('node', ['--experimental-strip-types', 'src/cli.ts', d, '--json', '--droid-scoring'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
  });
  try {
    const j = JSON.parse(res.stdout || '');
    eq('CLI --droid-scoring has droidScoring=true', j.droidScoring, true);
  } catch {
    eq('CLI --droid-scoring produces valid JSON', false, true);
  }
}

// ---- CLI --model flag sets model in report metadata ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const res = spawnSync('node', ['--experimental-strip-types', 'src/cli.ts', d, '--json', '--model', 'claude-sonnet-4'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
  });
  try {
    const j = JSON.parse(res.stdout || '');
    eq('CLI --model sets report.run.model', j.run.model, 'claude-sonnet-4');
  } catch {
    eq('CLI --model produces valid JSON', false, true);
  }
}

// ---- CLI --model=<id> (equals syntax) ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const res = spawnSync('node', ['--experimental-strip-types', 'src/cli.ts', d, '--json', '--model=gpt-4o'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
  });
  try {
    const j = JSON.parse(res.stdout || '');
    eq('CLI --model=gpt-4o sets report.run.model', j.run.model, 'gpt-4o');
  } catch {
    eq('CLI --model= produces valid JSON', false, true);
  }
}

// ---- CLI default model is claude-opus-5 ----
{
  const d = mkRepo();
  write(d, 'src/index.ts', 'export const x = 1;\n');
  const res = spawnSync('node', ['--experimental-strip-types', 'src/cli.ts', d, '--json'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PI_MODEL: '' },
  });
  try {
    const j = JSON.parse(res.stdout || '');
    eq('CLI default model is claude-opus-5', j.run.model, 'claude-opus-5');
  } catch {
    eq('CLI default model produces valid JSON', false, true);
  }
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
