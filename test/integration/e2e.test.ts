// E2E integration test: run the CLI end-to-end on a temp repo and check the report.
import { runReadiness } from '../../src/engine.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log('FAIL', label, 'got', got, 'want', want);
  } else console.log('ok', label);
};

const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-e2e-'));
fs.mkdirSync(path.join(d, 'src'), { recursive: true });
fs.writeFileSync(path.join(d, 'src', 'index.ts'), 'export const handler = () => 42;\n');
fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'e2e', version: '1.0.0' }));
fs.writeFileSync(path.join(d, 'README.md'), '# E2E project\n\nHow to run things locally and install deps.\n');

const report = runReadiness(d);
eq('report has overall score', typeof report.overall, 'number');
eq('report has level', typeof report.level, 'string');
eq('report has findings', report.findings.length > 0, true);
eq(
  'report has P0.1 finding',
  report.findings.some((f) => f.id === 'P0.1'),
  true,
);

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
