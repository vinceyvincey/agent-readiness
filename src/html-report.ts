// M17: visual HTML report renderer — self-contained, offline, Droid-inspired.
// Single file: inline CSS + embedded JSON data + ~100 lines of vanilla JS.
// Light-first theme; dark via prefers-color-scheme AND html[data-theme] overrides.
import type { ReadinessReport } from './engine.ts';
import type { HistoryEntry } from './history.ts';
import { LEVEL_GATES, MANDATORY, GATE_PCT } from './engine.ts';
import { getCriterionByPiId } from './criteria-registry.ts';

const LEVEL_NAMES: Record<string, string> = {
  L0: 'Unknown', L1: 'Functional', L2: 'Documented', L3: 'Standardized', L4: 'Optimized', L5: 'Autonomous',
};
const LEVEL_DESC: Record<string, string> = {
  L0: 'Barely parses — not yet assessed.',
  L1: 'Code runs; manual setup; no automated validation.',
  L2: 'Docs and process exist; some automation in place.',
  L3: 'Processes defined, documented, enforced via automation.',
  L4: 'Fast feedback loops; data-driven, continuous improvement.',
  L5: 'Self-improving systems with sophisticated orchestration.',
};

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Pillar display names (P0..P9).
const PILLAR_NAMES: Record<string, string> = {
  P0: 'Documentation', P1: 'Agent Guidance', P2: 'Testing & Verification', P3: 'Build & Dependencies',
  P4: 'CI / Automation & Gates', P5: 'Code Quality & Style', P6: 'Security & Secrets',
  P7: 'Observability & Debuggability', P8: 'Environment & Onboarding', P9: 'Task Discovery & Modularity',
};

const scoreColor = (pct: number): string => (pct >= 70 ? 'var(--ok)' : pct >= 40 ? 'var(--warn)' : 'var(--bad)');

// SVG donut for the overall score.
function donut(pct: number, label: string, sub: string): string {
  const r = 54, c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;
  const color = scoreColor(pct);
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Overall ${esc(label)}">
<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--track)" stroke-width="12"/>
<circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
  stroke-dasharray="${filled.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 70 70)"/>
<text x="70" y="66" text-anchor="middle" class="donut-num">${esc(label)}</text>
<text x="70" y="88" text-anchor="middle" class="donut-sub">${esc(sub)}</text>
</svg>`;
}

// SVG sparkline for history trend.
function sparkline(values: number[], w = 220, h = 48): string {
  if (values.length === 0) return '';
  const min = Math.min(...values, 0), max = Math.max(...values, 100);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 8) + 4;
    const y = h - 6 - ((v - min) / range) * (h - 12);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(',');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="score history">
<polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
<circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--accent)"/>
</svg>`;
}

// Level-ladder math mirroring resolveLevel(): a level is unlocked when all
// previous-level gates (cumulative supersets) + mandatory pillars pass the 80% gate.
function levelStates(pillars: Record<string, { pct: number }>): Array<{ lvl: string; unlocked: boolean; pct: number }> {
  const gatePct = (pillars: Record<string, { pct: number }>, ids: string[]) =>
    ids.reduce((a, id) => a + (pillars[id]?.pct ?? 0), 0) / (ids.length || 1);
  const mandatoryOk = MANDATORY.every((m) => (pillars[m]?.pct ?? 0) >= GATE_PCT * 100);
  const out: Array<{ lvl: string; unlocked: boolean; pct: number }> = [];
  for (const lvl of ['L1', 'L2', 'L3', 'L4', 'L5']) {
    const req = LEVEL_GATES[lvl];
    const pct = Math.round(gatePct(pillars, req));
    const unlocked = mandatoryOk && req.every((id) => (pillars[id]?.pct ?? 0) >= GATE_PCT * 100);
    out.push({ lvl, unlocked, pct });
  }
  return out;
}

// Trimmed serializable view of the report for __DATA__.
interface ReportView {
  level: string; overall: number; droidPassRate: number; droidScoring: boolean;
  repo: { path: string; language: string };
  run: { date: string; model: string; strict: boolean; commitHash: string; branch: string; hasLocalChanges: boolean; hasNonRemoteCommits: boolean };
  rubric_version: string; config_hash: string;
  pillars: Record<string, { name: string; passed: number; total: number; pct: number; perApp?: Record<string, { passed: number; total: number }> }>;
  apps: Record<string, { name: string; type: string; description: string }>;
  punchlist: Array<{ pillar: string; id: string; severity: string; difficulty: string; action: string; evidence: string }>;
  findings: Array<{ id: string; pillar: string; pass: boolean; skipped: boolean; severity: string; difficulty: string; evidence: string; app?: string; name: string; droidLevel: number | null; scope: string }>;
  history: Array<{ date: string; level: string; overall: number }>;
  levels: Array<{ lvl: string; unlocked: boolean; pct: number }>;
  delta: { overall: number | null; level: string | null; perPillar: Record<string, number> } | null;
}

function buildView(report: ReadinessReport, history: HistoryEntry[]): ReportView {
  const prev = history.length > 0 ? history[history.length - 1] : null;
  const findings = report.findings.map((f) => {
    const crit = getCriterionByPiId(f.id);
    return {
      id: f.id, pillar: f.pillar, pass: !!f.pass, skipped: !!f.skipped,
      severity: f.severity, difficulty: f.difficulty || 'intermediate',
      evidence: f.evidence, app: f.app,
      name: crit ? crit.name : f.id,
      droidLevel: crit ? crit.level : null,
      scope: crit ? crit.scope : 'repo',
    };
  });
  const pillars: ReportView['pillars'] = {};
  for (const [k, v] of Object.entries(report.pillars)) {
    pillars[k] = { name: PILLAR_NAMES[k] || k, passed: v.passed, total: v.total, pct: v.pct, perApp: v.perApp };
  }
  const delta = prev
    ? {
        overall: Math.round((report.overall - prev.overall) * 10) / 10,
        level: prev.level === report.level ? report.level : `${prev.level} → ${report.level}`,
        perPillar: Object.fromEntries(
          Object.entries(report.pillars).map(([k, v]) => [k, Math.round((v.pct - (prev.perPillar[k] ?? v.pct)) * 10) / 10]),
        ),
      }
    : null;
  return {
    level: report.level, overall: report.overall, droidPassRate: report.droidPassRate, droidScoring: report.droidScoring,
    repo: report.repo, run: report.run, rubric_version: report.rubric_version, config_hash: report.config_hash,
    pillars, apps: report.apps, punchlist: report.punchlist, findings,
    history: history.map((h) => ({ date: h.date, level: h.level, overall: h.overall })),
    levels: levelStates(report.pillars), delta,
  };
}

export function renderHtml(report: ReadinessReport, opts: { history?: HistoryEntry[] } = {}): string {
  const view = buildView(report, opts.history || []);
  const data = JSON.stringify(view).replace(/</g, '\\u003c');
  const repoName = report.repo.path.split('/').pop() || report.repo.path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Readiness — ${esc(repoName)}</title>
<style>
:root {
  --bg: #f6f7f9; --card: #ffffff; --ink: #1a1d21; --muted: #6b7280; --line: #e5e7eb;
  --accent: #4f46e5; --accent-soft: #eef2ff;
  --ok: #16a34a; --ok-soft: #f0fdf4; --warn: #d97706; --warn-soft: #fffbeb;
  --bad: #dc2626; --bad-soft: #fef2f2; --skip: #9ca3af; --skip-soft: #f3f4f6;
  --track: #e5e7eb; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --bg: #0f1115; --card: #171a21; --ink: #e5e7eb; --muted: #9ca3af; --line: #2a2f3a;
  --accent: #818cf8; --accent-soft: #1e1b4b;
  --ok: #22c55e; --ok-soft: #052e16; --warn: #f59e0b; --warn-soft: #451a03;
  --bad: #ef4444; --bad-soft: #450a0a; --skip: #6b7280; --skip-soft: #1f2937;
  --track: #2a2f3a; color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1115; --card: #171a21; --ink: #e5e7eb; --muted: #9ca3af; --line: #2a2f3a;
    --accent: #818cf8; --accent-soft: #1e1b4b;
    --ok: #22c55e; --ok-soft: #052e16; --warn: #f59e0b; --warn-soft: #451a03;
    --bad: #ef4444; --bad-soft: #450a0a; --skip: #6b7280; --skip-soft: #1f2937;
    --track: #2a2f3a; color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.wrap { max-width: 1060px; margin: 0 auto; padding: 0 20px 64px; }
nav { position: sticky; top: 0; z-index: 10; background: var(--card); border-bottom: 1px solid var(--line); }
nav .inner { max-width: 1060px; margin: 0 auto; padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
nav .brand { font-weight: 700; font-size: 14px; }
nav .brand .dot { color: var(--accent); }
nav a { color: var(--muted); text-decoration: none; font-size: 13px; }
nav a:hover { color: var(--ink); }
nav .level-chip { margin-left: auto; }
.chip { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; border: 1px solid var(--line); background: var(--card); }
.chip.level { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
.chip.ok { background: var(--ok-soft); color: var(--ok); border-color: transparent; }
.chip.warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
.chip.bad { background: var(--bad-soft); color: var(--bad); border-color: transparent; }
.chip.skip { background: var(--skip-soft); color: var(--skip); border-color: transparent; }
section { margin-top: 40px; }
h2 { font-size: 19px; margin: 0 0 4px; }
h2 .sub { display: block; font-size: 13px; font-weight: 400; color: var(--muted); margin-top: 2px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
.hero { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }
.hero .donut { width: 150px; height: 150px; flex: none; }
.donut-num { font-size: 30px; font-weight: 700; fill: var(--ink); }
.donut-sub { font-size: 12px; fill: var(--muted); }
.hero .facts { display: flex; flex-direction: column; gap: 8px; min-width: 260px; flex: 1; }
.hero .facts .big { font-size: 22px; font-weight: 700; }
.hero .facts .kv { font-size: 13px; color: var(--muted); display: flex; gap: 6px; flex-wrap: wrap; }
.hero .facts .kv b { color: var(--ink); font-weight: 600; }
.prov { margin-top: 14px; font-size: 12.5px; color: var(--muted); display: flex; gap: 14px; flex-wrap: wrap; font-family: var(--mono); }
.prov .dirty { color: var(--warn); }
.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.stat .n { font-size: 24px; font-weight: 700; }
.stat .l { font-size: 12px; color: var(--muted); margin-top: 2px; }
.stat .n .delta-up { color: var(--ok); font-size: 15px; }
.stat .n .delta-down { color: var(--bad); font-size: 15px; }
.ladder { display: flex; flex-direction: column; gap: 10px; }
.rung { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; display: grid; grid-template-columns: 64px 1fr 220px; gap: 16px; align-items: center; }
.rung.locked { opacity: 0.62; }
.rung.current { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.rung .lvl { font-weight: 700; font-size: 15px; }
.rung .lvl .nm { display: block; font-size: 12px; color: var(--muted); font-weight: 500; }
.rung .desc { font-size: 13px; color: var(--muted); }
.bar { height: 10px; border-radius: 999px; background: var(--track); overflow: hidden; }
.bar > i { display: block; height: 100%; border-radius: 999px; }
.rung .pctline { font-size: 12px; color: var(--muted); margin-bottom: 4px; display: flex; justify-content: space-between; gap: 8px; }
.fixgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.fixcard { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.fixcard .head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.fixcard .ids { font-family: var(--mono); font-size: 12px; color: var(--muted); }
.fixcard .action { font-size: 14px; }
.fixcard .evidence { font-family: var(--mono); font-size: 11.5px; color: var(--muted); background: var(--bg); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; word-break: break-word; }
.fixcard button.copy { align-self: flex-start; margin-top: auto; cursor: pointer; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 8px; padding: 5px 12px; font-size: 12.5px; }
.fixcard button.copy:hover { border-color: var(--accent); color: var(--accent); }
.pillargrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.pillar { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; cursor: pointer; text-align: left; width: 100%; color: inherit; font: inherit; }
.pillar:hover { border-color: var(--accent); }
.pillar .pid { font-family: var(--mono); font-size: 11px; color: var(--muted); }
.pillar .nm { font-weight: 600; margin: 2px 0 8px; font-size: 14px; }
.pillar .nums { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-top: 6px; }
.pillar .apps { margin-top: 8px; font-size: 11.5px; color: var(--muted); font-family: var(--mono); }
.controls { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0; align-items: center; }
.controls .chips { display: flex; gap: 6px; }
.controls button.f { border: 1px solid var(--line); background: var(--card); color: var(--muted); border-radius: 999px; padding: 4px 12px; font-size: 12.5px; cursor: pointer; }
.controls button.f.on { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
.controls input { border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 8px; padding: 6px 10px; font-size: 13px; min-width: 200px; flex: 1; max-width: 320px; }
table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-size: 13.5px; }
tr.crit { border-top: 1px solid var(--line); cursor: pointer; }
tr.crit:hover { background: var(--accent-soft); }
td, th { padding: 9px 12px; text-align: left; vertical-align: top; }
th { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); background: var(--card); border-bottom: 1px solid var(--line); }
td .nm { font-weight: 600; }
td .cid { font-family: var(--mono); font-size: 11px; color: var(--muted); }
td .dot { display: inline-block; width: 10px; height: 10px; border-radius: 999px; margin-right: 6px; vertical-align: baseline; }
td .dot.pass { background: var(--ok); }
td .dot.fail { background: var(--bad); }
td .dot.skip { background: var(--skip); }
tr.why { display: none; }
tr.why.open { display: table-row; }
tr.why td { background: var(--bg); color: var(--muted); font-family: var(--mono); font-size: 12px; white-space: pre-wrap; word-break: break-word; }
footer { margin-top: 48px; color: var(--muted); font-size: 12.5px; }
footer .apps li { margin-top: 2px; }
.spark { width: 220px; height: 48px; }
.empty { color: var(--muted); font-size: 13px; padding: 18px; text-align: center; background: var(--card); border: 1px dashed var(--line); border-radius: 12px; }
@media print {
  nav, .controls, button { display: none !important; }
  body { background: #fff; }
  .card, .stat, .rung, .fixcard, .pillar, table { break-inside: avoid; }
}
</style>
</head>
<body>
<nav><div class="inner">
  <span class="brand">agent<span class="dot">-</span>readiness</span>
  <a href="#overview">Overview</a>
  <a href="#changes">Changes</a>
  <a href="#levels">Levels</a>
  <a href="#fix">Fix next</a>
  <a href="#pillars">Pillars</a>
  <a href="#criteria">Criteria</a>
  <span class="chip level" id="nav-level"></span>
</div></nav>
<div class="wrap">

<section id="overview"><div class="card hero">
  <div id="hero-donut"></div>
  <div class="facts">
    <div class="big" id="hero-repo"></div>
    <div class="kv" id="hero-kv"></div>
  </div>
</div>
<div class="prov" id="prov"></div>
<div class="stat-row" id="stats" style="margin-top:14px"></div>
</section>

<section id="changes"><h2>What changed<span class="sub" id="changes-sub"></span></h2><div id="changes-body"></div></section>

<section id="levels"><h2>Level ladder<span class="sub">A level unlocks when all its gate pillars reach 80% (P2 Testing and P6 Security are mandatory hard gates).</span></h2>
<div class="ladder" id="ladder"></div></section>

<section id="fix"><h2>Fix next<span class="sub">Top remediation items, severity then difficulty (start with Basic — highest leverage).</span></h2>
<div class="fixgrid" id="fixgrid"></div></section>

<section id="pillars"><h2>Pillars<span class="sub">Click a pillar to jump to its criteria.</span></h2>
<div class="pillargrid" id="pillargrid"></div></section>

<section id="criteria"><h2>Criteria<span class="sub">Every check with pass/fail status and expandable evidence. Click a row for rationale.</span></h2>
<div class="controls">
  <div class="chips">
    <button class="f on" data-f="all">All</button>
    <button class="f" data-f="fail">Failed</button>
    <button class="f" data-f="pass">Passed</button>
    <button class="f" data-f="skip">Skipped</button>
  </div>
  <input id="q" type="search" placeholder="Filter by name, id, pillar…">
</div>
<table id="crit-table">
<thead><tr><th style="width:34px"></th><th>Criterion</th><th style="width:70px">Droid</th><th style="width:80px">Scope</th><th style="width:90px">Difficulty</th></tr></thead>
<tbody id="crit-body"></tbody>
</table>
<div class="empty" id="crit-empty" style="display:none">No criteria match the current filter.</div>
</section>

<footer id="footer"></footer>
</div>

<script>window.__DATA__ = ${data};</script>
<script>
(function () {
  'use strict';
  var D = window.__DATA__;
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  var colorFor = function (p) { return p >= 70 ? 'var(--ok)' : p >= 40 ? 'var(--warn)' : 'var(--bad)'; };
  var fmtDelta = function (d) { return d == null ? '' : (d > 0 ? '+' : '') + d.toFixed(1).replace(/\.0$/, ''); };

  // nav + hero
  var repoName = D.repo.path.split('/').pop() || D.repo.path;
  document.getElementById('nav-level').textContent = D.level + ' · ' + (D.levels.names ? '' : '') + D.level;
  document.getElementById('nav-level').textContent = D.level;
  document.getElementById('hero-donut').innerHTML = [
    '<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="overall score">',
    '<circle cx="70" cy="70" r="54" fill="none" stroke="var(--track)" stroke-width="12"/>',
    '<circle cx="70" cy="70" r="54" fill="none" stroke="' + colorFor(D.overall) + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (Math.min(100, Math.max(0, D.overall)) / 100 * 339.3).toFixed(1) + ' 339.3" transform="rotate(-90 70 70)"/>',
    '<text x="70" y="66" text-anchor="middle" class="donut-num">' + Math.round(D.overall) + '</text>',
    '<text x="70" y="88" text-anchor="middle" class="donut-sub">/ 100</text></svg>'
  ].join('');
  document.getElementById('hero-repo').textContent = repoName;
  var passed = D.findings.filter(function (f) { return f.pass && !f.skipped; }).length;
  var failed = D.findings.filter(function (f) { return !f.pass && !f.skipped; }).length;
  var skipped = D.findings.filter(function (f) { return f.skipped; }).length;
  document.getElementById('hero-kv').innerHTML =
    '<b>' + D.level + '</b> ' + esc(D.levelName) +
    ' · <b>' + D.droidPassRate.toFixed(1) + '%</b> Droid-compatible pass rate' +
    ' · <b>' + passed + '/' + (passed + failed) + '</b> checks passing';
  var prov = [];
  prov.push(esc(D.repo.language));
  if (D.run.commitHash) prov.push(esc(D.run.commitHash.slice(0, 8)) + ' (' + esc(D.run.branch) + ')');
  prov.push(new Date(D.run.date).toISOString().slice(0, 16).replace('T', ' '));
  prov.push('model ' + esc(D.run.model));
  prov.push('rubric ' + esc(D.rubric_version));
  prov.push('config ' + esc(D.config_hash));
  if (D.run.hasLocalChanges || D.run.hasNonRemoteCommits) prov.push('<span class="dirty">⚠ uncommitted/unpushed changes</span>');
  document.getElementById('prov').innerHTML = prov.join(' · ');

  // stat cards (incl. delta when present)
  var stats = [
    { n: D.overall.toFixed(1), l: 'Overall score / 100' },
    { n: D.droidPassRate.toFixed(1) + '%', l: 'Droid-compatible pass rate' },
    { n: passed + '/' + (passed + failed), l: 'Deterministic checks passing' },
    { n: String(D.punchlist.length), l: 'Top punchlist items' }
  ];
  var statsEl = document.getElementById('stats');
  statsEl.innerHTML = stats.map(function (s) {
    return '<div class="stat"><div class="n">' + esc(s.n) + '</div><div class="l">' + esc(s.l) + '</div></div>';
  }).join('');
  if (D.delta && D.delta.overall !== null) {
    var d = D.delta.overall;
    var cls = d > 0 ? 'delta-up' : (d < 0 ? 'delta-down' : '');
    statsEl.firstElementChild.querySelector('.n').innerHTML += ' <span class="' + cls + '">' + fmtDelta(d) + '</span>';
  }

  // changes section
  var changesBody = document.getElementById('changes-body');
  var changesSub = document.getElementById('changes-sub');
  if (!D.delta) {
    changesSub.textContent = 'First run — baseline established.';
    changesBody.innerHTML = '<div class="card">Baseline established. Run agent-readiness again after remediation to see deltas and a score trend here.</div>';
  } else {
    changesSub.textContent = 'Compared with previous run (' + D.history[D.history.length - 1].date.slice(0, 10) + ').';
    var rows = Object.keys(D.delta.perPillar).map(function (k) {
      var dd = D.delta.perPillar[k];
      var cls2 = dd > 0 ? 'ok' : (dd < 0 ? 'bad' : 'skip');
      return '<tr><td><span class="cid">' + esc(k) + '</span> ' + esc((D.pillars[k] && D.pillars[k].name) || k) + '</td>' +
        '<td style="text-align:right"><span class="chip ' + cls2 + '">' + fmtDelta(dd) + '</span></td></tr>';
    }).join('');
    var histVals = D.history.map(function (h) { return h.overall; }).concat([D.overall]);
    changesBody.innerHTML = '<div class="card" style="display:flex;gap:28px;flex-wrap:wrap;align-items:center">' +
      '<div><div class="n" style="font-size:24px;font-weight:700">' + (D.delta.level) + '</div>' +
      '<div class="l" style="font-size:12px;color:var(--muted)">level</div></div>' +
      '<div><div style="font-size:24px;font-weight:700;color:' + (D.delta.overall > 0 ? 'var(--ok)' : D.delta.overall < 0 ? 'var(--bad)' : 'var(--ink)') + '">' + fmtDelta(D.delta.overall) + ' overall</div>' +
      '<div class="l" style="font-size:12px;color:var(--muted)">vs previous run</div></div>' +
      '<svg class="spark" viewBox="0 0 220 48"><polyline points="' + histVals.map(function (v, i) {
        var min = Math.min.apply(null, histVals.concat([0])); var max = Math.max.apply(null, histVals.concat([100])); var range = max - min || 1;
        var x = histVals.length === 1 ? 110 : (i / (histVals.length - 1)) * 212 + 4;
        var y = 42 - ((v - min) / range) * 36;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>' +
      '<table style="max-width:420px"><thead><tr><th>Pillar</th><th style="text-align:right">Δ pct</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // level ladder
  var LN = { L1: 'Functional', L2: 'Documented', L3: 'Standardized', L4: 'Optimized', L5: 'Autonomous' };
  var LD = { L1: 'Code runs; manual setup; no automated validation.', L2: 'Docs and process exist; some automation.', L3: 'Processes defined and enforced via automation.', L4: 'Fast feedback loops and continuous measurement.', L5: 'Self-improving systems and orchestration.' };
  var currentNum = parseInt(D.level.slice(1), 10) || 0;
  document.getElementById('ladder').innerHTML = D.levels.map(function (L) {
    var n = parseInt(L.lvl.slice(1), 10);
    var isCurrent = n === currentNum;
    var cls3 = 'rung' + (L.unlocked ? '' : ' locked') + (isCurrent ? ' current' : '');
    return '<div class="' + cls3 + '">' +
      '<div class="lvl">' + esc(L.lvl) + '<span class="nm">' + esc(LN[L.lvl] || '') + (L.unlocked ? '' : ' 🔒') + '</span></div>' +
      '<div class="desc">' + esc(LD[L.lvl] || '') + (isCurrent ? ' — current level' : '') + '</div>' +
      '<div><div class="pctline"><span>' + L.pct + '% of gate pillars</span><span>' + (L.unlocked ? 'unlocked' : 'locked') + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, L.pct) + '%;background:' + colorFor(L.pct) + '"></i></div></div></div>';
  }).join('');

  // fix next
  var sevCls = { high: 'bad', med: 'warn', low: 'skip' };
  document.getElementById('fixgrid').innerHTML = D.punchlist.length ? D.punchlist.map(function (p, i) {
    return '<div class="fixcard"><div class="head">' +
      '<span class="chip ' + (sevCls[p.severity] || 'skip') + '">' + esc(p.severity) + '</span>' +
      '<span class="chip">' + esc(p.difficulty) + '</span>' +
      '<span class="ids">' + esc(p.pillar) + ' · ' + esc(p.id) + '</span></div>' +
      '<div class="action">' + esc(p.action) + '</div>' +
      '<div class="evidence">' + esc(p.evidence) + '</div>' +
      '<button class="copy" data-i="' + i + '">Copy action</button></div>';
  }).join('') : '<div class="empty">Nothing failing — no punchlist items. 🎉</div>';
  Array.prototype.forEach.call(document.querySelectorAll('.fixcard .copy'), function (b) {
    b.addEventListener('click', function () {
      var txt = D.punchlist[parseInt(b.getAttribute('data-i'), 10)].action;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(function () {});
      b.textContent = 'Copied ✓';
      setTimeout(function () { b.textContent = 'Copy action'; }, 1600);
    });
  });

  // pillar grid
  document.getElementById('pillargrid').innerHTML = Object.keys(D.pillars).map(function (k) {
    var P = D.pillars[k];
    var apps = P.perApp ? '<div class="apps">' + Object.keys(P.perApp).map(function (a) {
      return esc(a) + ':' + P.perApp[a].passed + '/' + P.perApp[a].total;
    }).join(' · ') + '</div>' : '';
    return '<button class="pillar" data-pillar="' + esc(k) + '">' +
      '<div class="pid">' + esc(k) + '</div><div class="nm">' + esc(P.name) + '</div>' +
      '<div class="bar"><i style="width:' + Math.min(100, P.pct) + '%;background:' + colorFor(P.pct) + '"></i></div>' +
      '<div class="nums"><span>' + P.passed + '/' + P.total + ' checks</span><span>' + P.pct.toFixed(1) + '%</span></div>' + apps + '</button>';
  }).join('');

  // criteria table
  var filter = 'all', query = '', pillarFilter = '';
  var body = document.getElementById('crit-body');
  var emptyEl = document.getElementById('crit-empty');
  function renderCrit() {
    var q = query.toLowerCase();
    var rows = D.findings.filter(function (f) {
      if (filter === 'fail' && (f.pass || f.skipped)) return false;
      if (filter === 'pass' && (!f.pass || f.skipped)) return false;
      if (filter === 'skip' && !f.skipped) return false;
      if (pillarFilter && f.pillar !== pillarFilter) return false;
      var pn = (D.pillars[f.pillar] && D.pillars[f.pillar].name) || f.pillar;
      if (q && (f.name + ' ' + f.id + ' ' + f.pillar + ' ' + pn + ' ' + (f.app || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    body.innerHTML = rows.map(function (f) {
      var st = f.skipped ? 'skip' : (f.pass ? 'pass' : 'fail');
      return '<tr class="crit" data-id="' + esc(f.id) + '"><td><span class="dot ' + st + '"></span></td>' +
        '<td><span class="nm">' + esc(f.name) + '</span> <span class="cid">' + esc(f.id) + (f.app ? ' · ' + esc(f.app) : '') + '</span></td>' +
        '<td>' + (f.droidLevel ? 'L' + f.droidLevel : '—') + '</td>' +
        '<td>' + esc(f.scope) + '</td>' +
        '<td>' + esc(f.difficulty) + '</td></tr>' +
        '<tr class="why" data-for="' + esc(f.id) + '"><td colspan="5">' + esc(f.evidence || 'no evidence recorded') + '</td></tr>';
    }).join('');
    emptyEl.style.display = rows.length ? 'none' : 'block';
    Array.prototype.forEach.call(body.querySelectorAll('tr.crit'), function (tr) {
      tr.addEventListener('click', function () {
        var why = body.querySelector('tr.why[data-for="' + tr.getAttribute('data-id') + '"]');
        if (why) why.classList.toggle('open');
      });
    });
  }
  renderCrit();
  Array.prototype.forEach.call(document.querySelectorAll('.controls button.f'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.controls button.f'), function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      filter = b.getAttribute('data-f');
      renderCrit();
    });
  });
  document.getElementById('q').addEventListener('input', function (e) { query = e.target.value; renderCrit(); });
  Array.prototype.forEach.call(document.querySelectorAll('.pillar'), function (b) {
    b.addEventListener('click', function () {
      pillarFilter = pillarFilter === b.getAttribute('data-pillar') ? '' : b.getAttribute('data-pillar');
      document.getElementById('criteria').scrollIntoView({ behavior: 'smooth' });
      renderCrit();
    });
  });

  // footer
  var appsList = Object.keys(D.apps).length
    ? '<ul class="apps">' + Object.keys(D.apps).map(function (k) {
        var a = D.apps[k];
        return '<li><code>' + esc(k) + '</code> — ' + esc(a.name) + ' (' + esc(a.type) + ')' + (a.description ? ': ' + esc(a.description) : '') + '</li>';
      }).join('') + '</ul>'
    : '';
  document.getElementById('footer').innerHTML =
    '<div>Scoring model: ' + (D.droidScoring ? 'Droid-compatible flat pass rate' : 'weighted, N-1 gated') +
    ' · strict=' + D.run.strict + ' · generated by agent-readiness (rubric ' + esc(D.rubric_version) + ')</div>' +
    (Object.keys(D.apps).length > 1 ? '<div style="margin-top:8px"><b>Applications discovered</b></div>' + appsList : '');
})();
</script>
</body>
</html>`;
}
