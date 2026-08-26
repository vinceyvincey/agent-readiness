// Aggregated unit-test runner for the agent-readiness repo.
// Runs every *.test.ts under test/ as its own node --experimental-strip-types subprocess
// and reports a unified pass/fail summary. Kept dependency-free on purpose.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testDir = path.join(root, 'test');
const reporter =
  process.argv.indexOf('--reporter') !== -1 ? process.argv[process.argv.indexOf('--reporter') + 1] : 'console';

const collect = (dir: string): string[] => {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (e.isFile() && e.name.endsWith('.test.ts')) out.push(p);
  }
  return out.sort();
};
const files = collect(testDir);

let pass = 0;
const failures: string[] = [];
const suites: { name: string; ok: boolean; ms: number }[] = [];
const startAll = Date.now();

for (const f of files) {
  const start = Date.now();
  const res = spawnSync(process.execPath, ['--experimental-strip-types', f], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
  });
  const ms = Date.now() - start;
  const ok = res.status === 0;
  suites.push({ name: f, ok, ms });
  const last = (res.stdout || '').trim().split('\n').filter(Boolean).slice(-3).join(' | ');
  if (ok) {
    pass++;
    if (reporter === 'junit') continue;
    console.log(`PASS  ${f}  (${ms}ms)  ::  ${last}`);
  } else {
    failures.push(f);
    console.log(`FAIL  ${f}  (${ms}ms)`);
    console.log((res.stdout || res.stderr || '').slice(-600));
  }
}

if (reporter === 'junit') {
  const totalMs = Date.now() - startAll;
  let xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="' +
    suites.length +
    '" time="' +
    (totalMs / 1000).toFixed(2) +
    '">';
  for (const s of suites) {
    xml +=
      '<testsuite name="' +
      s.name +
      '" tests="1" failures="' +
      (s.ok ? 0 : 1) +
      '" time="' +
      (s.ms / 1000).toFixed(3) +
      '"/>';
  }
  xml += '</testsuites>';
  console.log(xml);
} else {
  console.log(`\n=== ${pass}/${files.length} suites passed (${((Date.now() - startAll) / 1000).toFixed(1)}s) ===`);
  if (failures.length) {
    console.log('Failed suites:', failures.join(', '));
    process.exit(1);
  }
}
