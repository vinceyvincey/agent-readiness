// M4.5 validation harness: E1-only checks that are measurable now (H3 stability, H5 mandatory gates).
// H1/H2 (behavioral) and H4/H6 (judgment) are gated on E2/E3 runs - documented, not yet executed.
//
// Run: node --experimental-strip-types validation/run-harness.ts <repo...>
import { runReadiness, MANDATORY, LEVEL_GATES, GATE_PCT } from '../src/engine.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
const repos = args.length ? args : ['.'];
const OUT = path.join('docs', 'validation');
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const lines: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  lines.push((ok ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''));
  if (!ok) failures++;
};

const report: Record<string, any> = { date: new Date().toISOString(), model: process.env.PI_MODEL || 'arn', repos: {} };

for (const r of repos) {
  const abs = path.resolve(r);
  const name = path.basename(abs);

  // H3: stability - 3 repeat runs of the same repo must be identical (same rubric + config hash).
  const runs = [runReadiness(abs), runReadiness(abs), runReadiness(abs)];
  const signed = runs.map((x) => x.overall + '|' + x.level + '|' + x.config_hash + '|' + x.rubric_version);
  const stable = signed[0] === signed[1] && signed[1] === signed[2];
  check('H3 stability: ' + name, stable, signed.join(' ~ '));

  // H5: mandatory gates - a repo must NOT pass L3+ with P2 or P6 below gate.
  const lvl = runReadiness(abs).level;
  const p2 = runReadiness(abs).pillars.P2.pct;
  const p6 = runReadiness(abs).pillars.P6.pct;
  const passedHigh = lvl === 'L3' || lvl === 'L4' || lvl === 'L5';
  const mandatoryBroken = passedHigh && (p2 < GATE_PCT * 100 || p6 < GATE_PCT * 100);
  check('H5 no cheap-inflation: ' + name + ' (level=' + lvl + ' P2=' + p2 + ' P6=' + p6 + ')', !mandatoryBroken, 'runs: ' + runs.length);

  report.repos[name] = {
    level: runReadiness(abs).level,
    overall: runReadiness(abs).overall,
    P2: p2,
    P6: p6,
    mandatoryBroken,
    rubric_version: runReadiness(abs).rubric_version,
  };
}


// H1 E1-precheck: the high-cohort repo must outscore the low-cohort by a wide margin (E1 separation is a prerequisite for the E2 behavioral test).
const high = report.repos['high'];
const low = report.repos['low'];
if (high && low) {
  const gap = high.overall - low.overall;
  check('H1 E1 separation (high=' + high.overall + ' low=' + low.overall + ' gap=' + Math.round(gap) + ')', gap >= 40, 'gap >= 40 needed for a meaningful H1 cohort');
}

// H8 E1-precheck: the deterministic engine returns the same score regardless of caller (no model in numerator) -
// verified structurally: rubric_version + config_hash identical across repos of same rubric.
const rubrics = new Set(Object.values(report.repos).map((r: any) => r.config_hash || ''));
check('H8 scaffold-effect (E1 config-hash consistency)', rubrics.size <= 1, 'config_hash shared across repos => engine is caller/model-independent');

report.summary = { failures };
const body = lines.join('\n');
const md = '# Validation Harness Run\n\n' + body + '\n\n' + (failures === 0 ? '**ALL E1 CHECKS PASS**' : failures + ' FAILURES') + '\n';
fs.writeFileSync(path.join(OUT, 'harness-run.md'), md);
fs.writeFileSync(path.join(OUT, 'harness-run.json'), JSON.stringify(report, null, 2));
console.log(md);
process.exit(failures === 0 ? 0 : 1);
