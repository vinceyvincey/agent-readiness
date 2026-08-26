// M16: Runtime verification layer — actually runs commands to verify that
// configs work, not just that they exist. Closes the "presence≠signal" gap
// where a vitest.config.ts file exists but tests don't actually run.
//
// Opt-in via --verify flag. Only runs for checks that already pass deterministically.
// If a command fails, the check is downgraded from pass to fail with runtimeEvidence.
// If a command is missing or deps aren't installed, verification is skipped (keep deterministic result).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CheckResult, Repo } from './checks.ts';

export interface RuntimeVerification {
  checkId: string;
  description: string;
  command: string[];
  timeoutMs: number;
}

export interface RuntimeResult {
  checkId: string;
  verified: boolean;
  downgraded: boolean;
  evidence: string;
  durationMs: number;
}

// Detect which runtime verifications to run based on language + passing checks.
// Only returns verifications for checks that are currently passing.
export function getRuntimeVerifications(
  root: string,
  lang: string,
  passingIds: Set<string>,
): RuntimeVerification[] {
  const verifications: RuntimeVerification[] = [];
  const pkgPath = path.join(root, 'package.json');
  const hasPkg = fs.existsSync(pkgPath);
  const pkg = hasPkg ? (() => { try { return JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { return {}; } })() : {};
  const scripts = pkg.scripts || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Helper to check if node_modules exists (deps installed)
  const nodeModulesExists = fs.existsSync(path.join(root, 'node_modules'));

  if (lang === 'typescript' || lang === 'javascript') {
    // P2.2: Test runner — verify tests are collectable
    if (passingIds.has('P2.2') && scripts.test) {
      if (deps.vitest) {
        verifications.push({ checkId: 'P2.2', description: 'Verify vitest can list tests', command: ['npx', 'vitest', '--listTests'], timeoutMs: 30000 });
      } else if (deps.jest) {
        verifications.push({ checkId: 'P2.2', description: 'Verify jest can list tests', command: ['npx', 'jest', '--listTests'], timeoutMs: 30000 });
      } else if (scripts.test) {
        // Generic test command — run with --listTests if possible, else just check exit
        verifications.push({ checkId: 'P2.2', description: 'Verify test runner works', command: ['npm', 'test', '--', '--listTests'], timeoutMs: 30000 });
      }
    }

    // P5.1: Linter — verify lint runs
    if (passingIds.has('P5.1') && scripts.lint && nodeModulesExists) {
      verifications.push({ checkId: 'P5.1', description: 'Verify linter runs', command: ['npm', 'run', 'lint'], timeoutMs: 30000 });
    }

    // P5.3: Type checker — verify tsc runs
    if (passingIds.has('P5.3') && fs.existsSync(path.join(root, 'tsconfig.json')) && nodeModulesExists) {
      verifications.push({ checkId: 'P5.3', description: 'Verify type checker runs', command: ['npx', 'tsc', '--noEmit'], timeoutMs: 60000 });
    }

    // P3.2: Build — verify build runs
    if (passingIds.has('P3.2') && scripts.build && nodeModulesExists) {
      verifications.push({ checkId: 'P3.2', description: 'Verify build runs', command: ['npm', 'run', 'build'], timeoutMs: 60000 });
    }

    // P5.2: Formatter — verify format check runs
    if (passingIds.has('P5.2') && nodeModulesExists) {
      if (deps.prettier) {
        verifications.push({ checkId: 'P5.2', description: 'Verify prettier check', command: ['npx', 'prettier', '--check', '.'], timeoutMs: 30000 });
      }
    }

    // P2.12: unit_tests_runnable — verify tests are actually runnable
    if (passingIds.has('P2.12') && scripts.test) {
      if (deps.vitest) {
        verifications.push({ checkId: 'P2.12', description: 'Verify tests are runnable (vitest)', command: ['npx', 'vitest', '--listTests'], timeoutMs: 30000 });
      } else if (deps.jest) {
        verifications.push({ checkId: 'P2.12', description: 'Verify tests are runnable (jest)', command: ['npx', 'jest', '--listTests'], timeoutMs: 30000 });
      }
    }
  } else if (lang === 'python') {
    const pyproject = path.join(root, 'pyproject.toml');
    const requirements = path.join(root, 'requirements.txt');
    const hasPyproject = fs.existsSync(pyproject);
    const hasRequirements = fs.existsSync(requirements);

    // P2.2: Test runner — pytest --collect-only
    if (passingIds.has('P2.2') && (hasPyproject || hasRequirements || fs.existsSync(path.join(root, 'pytest.ini')))) {
      verifications.push({ checkId: 'P2.2', description: 'Verify pytest can collect tests', command: ['pytest', '--collect-only'], timeoutMs: 30000 });
    }

    // P5.1: Linter — ruff or flake8
    if (passingIds.has('P5.1')) {
      if (hasPyproject && /ruff/i.test(fs.readFileSync(pyproject, 'utf8'))) {
        verifications.push({ checkId: 'P5.1', description: 'Verify ruff runs', command: ['ruff', 'check', '.'], timeoutMs: 30000 });
      } else if (hasPyproject && /flake8/i.test(fs.readFileSync(pyproject, 'utf8'))) {
        verifications.push({ checkId: 'P5.1', description: 'Verify flake8 runs', command: ['flake8', '.'], timeoutMs: 30000 });
      }
    }

    // P5.3: Type checker — mypy
    if (passingIds.has('P5.3') && hasPyproject && /mypy/i.test(fs.readFileSync(pyproject, 'utf8'))) {
      verifications.push({ checkId: 'P5.3', description: 'Verify mypy runs', command: ['mypy', '.'], timeoutMs: 60000 });
    }

    // P2.12: unit_tests_runnable
    if (passingIds.has('P2.12')) {
      verifications.push({ checkId: 'P2.12', description: 'Verify tests are runnable (pytest)', command: ['pytest', '--collect-only'], timeoutMs: 30000 });
    }
  } else if (lang === 'go') {
    if (passingIds.has('P2.2') || passingIds.has('P2.12')) {
      const cmd = ['go', 'test', '-list', '.*', './...'];
      if (passingIds.has('P2.2')) verifications.push({ checkId: 'P2.2', description: 'Verify go test can list tests', command: cmd, timeoutMs: 30000 });
      if (passingIds.has('P2.12')) verifications.push({ checkId: 'P2.12', description: 'Verify tests are runnable (go)', command: cmd, timeoutMs: 30000 });
    }
    if (passingIds.has('P5.3')) {
      verifications.push({ checkId: 'P5.3', description: 'Verify go vet runs', command: ['go', 'vet', './...'], timeoutMs: 30000 });
    }
  } else if (lang === 'rust') {
    if (passingIds.has('P2.2') || passingIds.has('P2.12')) {
      const cmd = ['cargo', 'test', '--no-run'];
      if (passingIds.has('P2.2')) verifications.push({ checkId: 'P2.2', description: 'Verify cargo test compiles', command: cmd, timeoutMs: 60000 });
      if (passingIds.has('P2.12')) verifications.push({ checkId: 'P2.12', description: 'Verify tests are runnable (cargo)', command: cmd, timeoutMs: 60000 });
    }
    if (passingIds.has('P5.3')) {
      verifications.push({ checkId: 'P5.3', description: 'Verify cargo check runs', command: ['cargo', 'check'], timeoutMs: 60000 });
    }
  }

  return verifications;
}

// Run all verifications and return results.
// If a command can't be found or times out, verification is skipped (not downgraded).
export function runRuntimeVerifications(
  root: string,
  verifications: RuntimeVerification[],
): RuntimeResult[] {
  const results: RuntimeResult[] = [];

  for (const v of verifications) {
    const start = Date.now();
    try {
      const res = spawnSync(v.command[0], v.command.slice(1), {
        cwd: root,
        encoding: 'utf8',
        timeout: v.timeoutMs,
        env: { ...process.env },
      });
      const durationMs = Date.now() - start;
      const output = ((res.stdout || '') + (res.stderr || '')).trim();

      // If the command itself wasn't found (ENOENT), skip verification
      if (res.error && (res.error as any).code === 'ENOENT') {
        results.push({
          checkId: v.checkId,
          verified: false,
          downgraded: false,
          evidence: `verification skipped: ${v.command[0]} not found`,
          durationMs,
        });
        continue;
      }

      // If timed out, skip verification (don't downgrade — might just be slow)
      if (res.error && (res.error as any).signal === 'SIGTERM') {
        results.push({
          checkId: v.checkId,
          verified: false,
          downgraded: false,
          evidence: `verification skipped: timed out after ${v.timeoutMs}ms`,
          durationMs,
        });
        continue;
      }

      const exitOk = res.status === 0;
      const evidenceSnippet = output ? output.split('\n').slice(0, 3).join(' | ') : `exit ${res.status}`;

      results.push({
        checkId: v.checkId,
        verified: exitOk,
        downgraded: !exitOk,
        evidence: exitOk
          ? `verified: ${v.description} (exit 0, ${durationMs}ms)`
          : `verification failed: ${v.description} (exit ${res.status}, ${evidenceSnippet})`,
        durationMs,
      });
    } catch (err) {
      results.push({
        checkId: v.checkId,
        verified: false,
        downgraded: false,
        evidence: `verification skipped: ${(err as Error).message}`,
        durationMs: Date.now() - start,
      });
    }
  }

  return results;
}

// Apply runtime verification results to findings, downgrading passing checks that fail verification.
export function applyRuntimeResults(findings: CheckResult[], results: RuntimeResult[]): CheckResult[] {
  const resultMap = new Map(results.map(r => [r.checkId, r]));
  return findings.map(f => {
    const result = resultMap.get(f.id);
    if (!result || !f.pass || f.skipped) return f;
    if (result.downgraded) {
      return {
        ...f,
        pass: false,
        verified: false,
        runtimeEvidence: result.evidence,
        evidence: `${f.evidence} [RUNTIME: ${result.evidence}]`,
      };
    }
    if (result.verified) {
      return { ...f, verified: true, runtimeEvidence: result.evidence };
    }
    // Skipped verification (command not found, timeout) — keep deterministic result
    return { ...f, verified: false, runtimeEvidence: result.evidence };
  });
}
