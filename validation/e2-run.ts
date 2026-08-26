// M4.5 E2 behavioral harness (H1/H2): a READINESS-SENSITIVE agent task on corpus repos.
//
// Task: fix the off-by-one bug in src/bug.ts (count should return n, not n-1).
// Success: the agent edits src/bug.ts so it returns n (we parse the file post-run).
// This is a real navigation+edit task whose difficulty depends on how ready the repo is
// (docs/AGENTS/fixtures lower the agent's cost to find & verify).
//
// Controlled: runner=pi, model=$PI_MODEL, thinking=$PI_THINKING pinned; only the repo varies (H8/H1).
// Usage: PI_MODEL=<pinned> node --experimental-strip-types validation/e2-run.ts <repo> [--n=3]
import { runReadiness } from '../src/engine.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || '.';
const n = parseInt(args.find((a) => a.startsWith('--n='))?.split('=')[1] || '1', 10);
const model = process.env.PI_MODEL || 'unknown';
const thinking = process.env.PI_THINKING || 'medium';

const report = runReadiness(target);
const bugFile = path.join(target, 'src/bug.ts');
const task = 'There is a bug in src/bug.ts: the exported function count(n) returns n-1 but should return n. Fix it so count returns the input n unchanged. Verify with the repo\'s existing test/lint tooling if present.';

function isFixed(): boolean {
  try {
    const src = fs.readFileSync(bugFile, 'utf8');
    // The bug is 'return n - 1' (returns n-1). A correct fix returns the input unchanged.
    // Fail if a decrement appears in the return expression; pass otherwise.
    const line = src.split('\n').find((l) => /return/.test(l)) || '';
    const hasDecr = /return\s*\w+\s*-\s*1/.test(line);
    return !hasDecr;
  } catch { return false; }
}

const results: any[] = [];
for (let i = 0; i < n; i++) {
  const r = spawnSync('pi', ['-p', task], { cwd: target, env: { ...process.env, PI_MODEL: model, PI_THINKING: thinking }, encoding: 'utf8', timeout: 60000 });
  const ok = isFixed();
  results.push({ run: i, solved: ok });
}
const solved = results.filter((x) => x.solved).length;
const successRate = solved / n;
console.log(JSON.stringify({
  repo: target, level: report.level, overall: report.overall, model, thinking, n, solved, successRate,
  results, bugFile,
}, null, 2));
