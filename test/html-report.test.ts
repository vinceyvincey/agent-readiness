// M17: tests for the visual HTML report renderer.
import { renderHtml } from '../src/html-report.ts';
import { resolveLevel, runReadiness, writeReport } from '../src/engine.ts';
import type { HistoryEntry } from '../src/history.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log('FAIL', label, 'got', got, 'want', want); } else console.log('ok', label);
};

const report = runReadiness('.');
const html = renderHtml(report);

// 1. Core content
for (const pillarId of Object.keys(report.pillars)) {
  eq(`contains pillar ${pillarId}`, html.includes(`"${pillarId}":`), true);
}
eq('contains level', html.includes(report.level), true);
eq('contains overall', html.includes(String(report.overall)), true);
const firstAction = report.punchlist[0]?.action;
if (firstAction) eq('contains punchlist action text', html.includes(firstAction), true);
else console.log('ok (skipped) no punchlist action to check');

// 2. Escaping: hostile evidence must not appear raw
const hostile = { ...report, findings: [{ ...report.findings[0], evidence: '<script>alert(1)</script>' }] } as typeof report;
const hostileHtml = renderHtml(hostile);
eq('script tag escaped (JSON blob)', hostileHtml.includes('\\u003cscript\\u003e') || !hostileHtml.includes('<script>alert(1)</script>'), true);

// 3. No external resources
const externalRefs = html.match(/(src|href)="https?:\/\/[^"/]/g) || [];
eq('zero external src/href refs', externalRefs.length, 0);

// 4. First run vs update variants
const firstRun = renderHtml(report, { history: [] });
eq('first run shows baseline', firstRun.includes('Baseline established') || firstRun.includes('baseline'), true);
eq('first run has no delta section marker', firstRun.includes('"delta":null'), true);
const prev: HistoryEntry = {
  date: '2026-01-01T00:00:00.000Z', rubric_version: '0.9.0', config_hash: '',
  level: 'L0', overall: Math.max(0, report.overall - 10),
  perPillar: Object.fromEntries(Object.entries(report.pillars).map(([k, v]) => [k, Math.max(0, v.pct - 20)])),
};
const updateRun = renderHtml(report, { history: [prev] });
eq('update run has delta', updateRun.includes('"delta":{'), true);
eq('update run has overall delta value', updateRun.includes('10'), true);
eq('update run has sparkline', updateRun.includes('spark'), true);

// 5. Level lock math mirrors resolveLevel
// The embedded levels array must mark a level unlocked iff resolveLevel reaches >= that level.
const view = JSON.parse(updateRun.match(/window\.__DATA__ = (\{.*\});<\/script>/s)![1]);
const resolved = resolveLevel(report.pillars);
const resolvedNum = parseInt(resolved.slice(1), 10) || 0;
for (const L of view.levels) {
  const n = parseInt(L.lvl.slice(1), 10);
  eq(`lock math ${L.lvl}`, L.unlocked, n <= resolvedNum);
}

// 6. Self-contained structure
eq('doctype present', html.startsWith('<!doctype html>'), true);
eq('single style block', (html.match(/<style>/g) || []).length, 1);
eq('no link tags', html.includes('<link'), false);
eq('data-theme dark support', html.includes('html[data-theme="dark"]') || html.includes(':root[data-theme="dark"]'), true);

// 7. writeReport emits html (integration)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-html-'));
const dir = writeReport(report.repo.path, report, tmp);
eq('writeReport creates report.html', fs.existsSync(path.join(dir, 'report.html')), true);
const onDisk = fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
eq('on-disk html contains level', onDisk.includes(report.level), true);
// second write should include history delta (history appended by first write)
writeReport(report.repo.path, report, tmp);
const onDisk2 = fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
eq('second write has delta vs first run', onDisk2.includes('"delta":{'), true);

// 8. --no-html honored
const dir2 = writeReport(report.repo.path, report, path.join(tmp, 'nohtml'), { html: false });
eq('html:false skips report.html', fs.existsSync(path.join(dir2, 'report.html')), false);

// size guard
eq('html under 500KB', onDisk2.length < 500 * 1024, true);

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
