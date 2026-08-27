import {
  resolveLevel,
  resolveLevelDroid,
  GATE_PCT,
  LEVEL_GATES,
  MANDATORY,
  runReadiness,
  writeReport,
  getRemediationAction,
} from '../src/engine.ts';
import { getCriterionByPiId } from '../src/criteria-registry.ts';
import { getPillars } from '../src/checks.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
const p = (n: number) => ({ passed: Math.round(n * 10), total: 10, pct: n });
let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log('FAIL', label, 'got', got, 'want', want);
  } else console.log('ok', label);
};
const mk = (over: Record<string, number> = {}) => {
  const m: any = {};
  for (const lvl of Object.values(LEVEL_GATES).flat()) m[lvl] = p(100);
  for (const k of Object.keys(over)) m[k] = p(over[k]);
  for (const mm of MANDATORY) m[mm] = p(over[mm] ?? 100);
  return m;
};

eq('all-pass L5', resolveLevel(mk()), 'L5');
eq('P2 fail -> L0', resolveLevel(mk({ P2: 50 })), 'L0');
// L1 is the entry-level floor and is exempt from mandatory (P2/P6) gates.
// P6 below 80% blocks L2+ (which require mandatory) but L1 still passes.
eq('P6 fail mandatory -> L1 (L1 exempt)', resolveLevel(mk({ P6: 40 })), 'L1');
eq('P2 50 + P6 40 -> L0 (P2 is in L1 gates)', resolveLevel(mk({ P2: 50, P6: 40 })), 'L0');
eq('P0/P2/P3 pass, P6 fail, P4 fail -> L1', resolveLevel(mk({ P4: 30, P6: 40 })), 'L1');
eq('L2 ok, L4/L5 low -> L2', resolveLevel(mk({ P4: 30 })), 'L2');
eq('P6 85 mandatory ok -> L5', resolveLevel(mk({ P6: 85 })), 'L5');
eq('P0 79 -> L0', resolveLevel(mk({ P0: 79 })), 'L0');
eq('GATE_PCT 0.8', GATE_PCT, 0.8);

// M16: Droid-compatible flat pass rate level resolution
eq('droid L0 at 0%', resolveLevelDroid(0), 'L0');
eq('droid L1 at 10%', resolveLevelDroid(10), 'L1');
eq('droid L1 at 19.9%', resolveLevelDroid(19.9), 'L1');
eq('droid L2 at 20%', resolveLevelDroid(20), 'L2');
eq('droid L3 at 40%', resolveLevelDroid(40), 'L3');
eq('droid L4 at 60%', resolveLevelDroid(60), 'L4');
eq('droid L4 at 79.9%', resolveLevelDroid(79.9), 'L4');
eq('droid L5 at 80%', resolveLevelDroid(80), 'L5');
eq('droid L5 at 100%', resolveLevelDroid(100), 'L5');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-'));
const rep = runReadiness('.');
const dir = writeReport(rep.repo.path, rep, tmp);
const hasJson = fs.existsSync(path.join(tmp, 'report.json'));
const hasMd = fs.existsSync(path.join(tmp, 'report.md'));
const j = JSON.parse(fs.readFileSync(path.join(tmp, 'report.json'), 'utf8'));
eq('writeReport creates json', hasJson, true);
eq('writeReport creates md', hasMd, true);
eq('report.json level', j.level, rep.level);
eq('report.json rubric_version', j.rubric_version, '0.9.0');
eq('report.json has droidPassRate', typeof j.droidPassRate, 'number');
eq('report.json droidPassRate > 0', j.droidPassRate > 0, true);
eq('report.json droidScoring is boolean', typeof j.droidScoring, 'boolean');
eq('report.json droidScoring false by default', j.droidScoring, false);
eq('report.json run.commitHash non-empty (git repo)', j.run.commitHash.length > 0, true);
eq('report.json run.branch non-empty (git repo)', j.run.branch.length > 0, true);

// Completeness: every deterministic check ID must have a criterion registry entry.
const pillars = getPillars();
const allCheckIds: string[] = [];
const tmpAudit = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-audit-'));
for (const pillar of pillars) {
  for (const check of pillar.checks) {
    try {
      allCheckIds.push(check({ root: tmpAudit }).id);
    } catch {
      /* skip checks that error on empty dir */
    }
  }
}
fs.rmSync(tmpAudit, { recursive: true, force: true });

for (const id of allCheckIds) {
  const criterion = getCriterionByPiId(id);
  eq(`registry has entry for ${id}`, criterion !== undefined, true);
}

// Completeness: every deterministic check ID must have a remediation action.
for (const id of allCheckIds) {
  const action = getRemediationAction(id);
  eq(`remediation has entry for ${id}`, action !== 'No mapped remediation', true);
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
