// Self-contained visual HTML report renderer.
// The report is intentionally dependency-free so it remains useful from file:// and in CI artifacts.
import type { ReadinessReport } from './engine.ts';
import type { HistoryEntry } from './history.ts';
import { LEVEL_GATES, MANDATORY, GATE_PCT } from './engine.ts';
import { getCriterionByPiId } from './criteria-registry.ts';

const LEVEL_NAMES: Record<string, string> = {
  L0: 'Unknown', L1: 'Functional', L2: 'Documented', L3: 'Standardized', L4: 'Optimized', L5: 'Autonomous',
};

const CHECK_NAMES: Record<string, string> = {
  'P0.2': 'Run/usage section in README', 'P0.4': 'Changelog or version history', 'P0.5': 'Examples directory',
  'P0.6': 'H1 title in README', 'P1.2': 'Enforceable rules + verified commands in AGENTS.md', 'P1.3': 'Contributing docs',
  'P1.5': 'Task shortcut for agents', 'P1.8': 'Connector integrations', 'P2.2': 'Test runner configured',
  'P2.3': 'Run-test one-liner', 'P2.5': 'Test fixtures', 'P2.6': 'Fast/smoke test path',
  'P3.3': 'Root scripts documented', 'P3.4': 'Dependency manifest', 'P3.6': 'Dev/prod dependency split',
  'P4.1': 'CI workflow', 'P4.2': 'CI runs real tests + lint', 'P5.4': 'No mega-files', 'P5.5': 'Consistent config files',
  'P6.2': 'No committed secrets', 'P6.3': 'No tracked .env files', 'P7.2': 'No silent error swallowing',
  'P7.3': 'Mock/dev observability path', 'P7.4': 'Log level configuration', 'P8.4': 'Pinned tool versions',
  'P8.5': 'Non-GUI run path', 'P9.1': 'Clear entry points', 'P9.2': 'Legible repo shape', 'P9.4': 'Per-module docs',
};

const PILLAR_NAMES: Record<string, string> = {
  P0: 'Documentation', P1: 'Agent Guidance', P2: 'Testing & Verification', P3: 'Build & Dependencies',
  P4: 'CI, Automation & Gates', P5: 'Code Quality & Style', P6: 'Security & Secrets',
  P7: 'Observability & Debugging', P8: 'Environment & Onboarding', P9: 'Task Discovery & Modularity',
};

const PILLAR_RATIONALE: Record<string, string> = {
  P0: 'Agents need a reliable map of the product, its interfaces, and the commands that make it run.',
  P1: 'Explicit repository guidance keeps autonomous changes aligned with local conventions and constraints.',
  P2: 'Fast, trustworthy verification lets an agent detect mistakes before a human has to review them.',
  P3: 'Reproducible builds and dependencies turn setup from guesswork into a deterministic feedback loop.',
  P4: 'Automated gates provide an independent safety net for every agent-authored change.',
  P5: 'Consistent, bounded code is easier for an agent to understand, edit, and validate safely.',
  P6: 'Security controls reduce the blast radius of autonomous access and prevent accidental data exposure.',
  P7: 'Useful runtime signals let agents move from a symptom to a grounded diagnosis.',
  P8: 'A repeatable environment minimizes onboarding time and machine-specific failures.',
  P9: 'Clear boundaries and discoverable work help agents make focused changes with fewer unintended effects.',
};

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function levelStates(pillars: Record<string, { pct: number }>): Array<{ lvl: string; unlocked: boolean; pct: number }> {
  const mandatoryOk = MANDATORY.every((m) => (pillars[m]?.pct ?? 0) >= GATE_PCT * 100);
  return ['L1', 'L2', 'L3', 'L4', 'L5'].map((lvl) => {
    const req = LEVEL_GATES[lvl];
    const pct = Math.round(req.reduce((sum, id) => sum + (pillars[id]?.pct ?? 0), 0) / (req.length || 1));
    return { lvl, pct, unlocked: mandatoryOk && req.every((id) => (pillars[id]?.pct ?? 0) >= GATE_PCT * 100) };
  });
}

interface FindingView {
  id: string; pillar: string; pass: boolean; skipped: boolean; severity: string; difficulty: string;
  evidence: string; app?: string; name: string; droidLevel: number | null; scope: string;
  rationale: string; description: string; evaluation: string; action: string; prompt: string;
}

interface ReportView {
  level: string; levelName: string; overall: number; droidPassRate: number; droidScoring: boolean;
  repo: { path: string; language: string };
  run: { date: string; model: string; strict: boolean; commitHash: string; branch: string; hasLocalChanges: boolean; hasNonRemoteCommits: boolean };
  rubric_version: string; config_hash: string;
  pillars: Record<string, { name: string; rationale: string; passed: number; total: number; pct: number; perApp?: Record<string, { passed: number; total: number }> }>;
  apps: Record<string, { name: string; type: string; description: string }>;
  punchlist: Array<{ pillar: string; id: string; severity: string; difficulty: string; action: string; evidence: string }>;
  findings: FindingView[];
  history: Array<{ date: string; level: string; overall: number }>;
  levels: Array<{ lvl: string; unlocked: boolean; pct: number }>;
  delta: { overall: number | null; level: string | null; perPillar: Record<string, number> } | null;
}

function remediationPrompt(repoPath: string, finding: Omit<FindingView, 'prompt'>): string {
  return [
    `You are working in ${repoPath}.`,
    '',
    `Remediate agent-readiness criterion ${finding.id}: ${finding.name}.`,
    `Pillar: ${finding.pillar} — ${PILLAR_NAMES[finding.pillar] || finding.pillar}`,
    `Priority: ${finding.severity}; expected difficulty: ${finding.difficulty}.`,
    '',
    'Why this matters:',
    finding.rationale,
    '',
    'Criterion standard:',
    finding.description,
    '',
    'Current evidence:',
    finding.evidence || 'No evidence was recorded.',
    '',
    'Required outcome:',
    finding.action,
    '',
    'Instructions:',
    '1. Inspect the existing implementation and verify the finding before editing.',
    '2. Implement the smallest complete fix that fits this repository and its conventions.',
    '3. Run the most targeted behavioral check that proves the criterion now passes.',
    '4. Summarize changed files, commands run, and any remaining limitations.',
    '5. Re-run agent-readiness and report the score delta.',
  ].join('\n');
}

function buildView(report: ReadinessReport, history: HistoryEntry[]): ReportView {
  const prev = history.length ? history[history.length - 1] : null;
  const findings: FindingView[] = report.findings.map((f) => {
    const criterion = getCriterionByPiId(f.id);
    const punch = report.punchlist.find((p) => p.id === f.id);
    const base: Omit<FindingView, 'prompt'> = {
      id: f.id, pillar: f.pillar, pass: !!f.pass, skipped: !!f.skipped,
      severity: f.severity, difficulty: f.difficulty || 'intermediate', evidence: f.evidence, app: f.app,
      name: criterion?.name || CHECK_NAMES[f.id] || f.id,
      droidLevel: criterion?.level ?? null, scope: criterion?.scope || 'repo',
      rationale: PILLAR_RATIONALE[f.pillar] || 'This criterion improves the reliability of autonomous changes.',
      description: criterion?.description || `This check is part of ${PILLAR_NAMES[f.pillar] || f.pillar} and measures whether the repository gives an agent enough reliable evidence to work safely.`,
      evaluation: criterion?.evaluation || `Pass when repository evidence satisfies ${CHECK_NAMES[f.id] || f.id}.`,
      action: punch?.action || (f.pass ? 'No remediation is required; preserve this capability.' : `Address the missing capability reported by ${f.id}: ${f.evidence}.`),
    };
    return { ...base, prompt: remediationPrompt(report.repo.path, base) };
  });
  const pillars: ReportView['pillars'] = {};
  for (const [id, score] of Object.entries(report.pillars)) {
    pillars[id] = { name: PILLAR_NAMES[id] || id, rationale: PILLAR_RATIONALE[id] || '', ...score };
  }
  const delta = prev ? {
    overall: Math.round((report.overall - prev.overall) * 10) / 10,
    level: prev.level === report.level ? report.level : `${prev.level} → ${report.level}`,
    perPillar: Object.fromEntries(Object.entries(report.pillars).map(([id, score]) =>
      [id, Math.round((score.pct - (prev.perPillar[id] ?? score.pct)) * 10) / 10])),
  } : null;
  return {
    level: report.level, levelName: LEVEL_NAMES[report.level] || report.level,
    overall: report.overall, droidPassRate: report.droidPassRate, droidScoring: report.droidScoring,
    repo: report.repo, run: report.run, rubric_version: report.rubric_version, config_hash: report.config_hash,
    pillars, apps: report.apps, punchlist: report.punchlist, findings,
    history: history.map((h) => ({ date: h.date, level: h.level, overall: h.overall })),
    levels: levelStates(report.pillars), delta,
  };
}

function radarChart(pillars: ReportView['pillars']): string {
  const entries = Object.entries(pillars);
  const cx = 260, cy = 190, radius = 130;
  const point = (i: number, value: number) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / entries.length;
    return `${(cx + Math.cos(angle) * radius * value).toFixed(1)},${(cy + Math.sin(angle) * radius * value).toFixed(1)}`;
  };
  const rings = [0.25, 0.5, 0.75, 1].map((r) =>
    `<polygon points="${entries.map((_, i) => point(i, r)).join(' ')}" class="radar-ring"/>`).join('');
  const axes = entries.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${point(i, 1).split(',')[0]}" y2="${point(i, 1).split(',')[1]}" class="radar-axis"/>`).join('');
  const area = entries.map(([, p], i) => point(i, p.pct / 100)).join(' ');
  const labels = entries.map(([id, p], i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / entries.length;
    const x = cx + Math.cos(angle) * (radius + 32);
    const y = cy + Math.sin(angle) * (radius + 24);
    const anchor = Math.cos(angle) > 0.25 ? 'start' : Math.cos(angle) < -0.25 ? 'end' : 'middle';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="radar-label">${esc(id)} <tspan>${Math.round(p.pct)}%</tspan></text>`;
  }).join('');
  return `<svg class="radar-chart" viewBox="0 0 520 390" role="img" aria-label="Pass rate by readiness pillar">${rings}${axes}<polygon points="${area}" class="radar-area"/>${entries.map(([, p], i) => `<circle cx="${point(i, p.pct / 100).split(',')[0]}" cy="${point(i, p.pct / 100).split(',')[1]}" r="3.5" class="radar-point"/>`).join('')}${labels}</svg>`;
}

function trendChart(view: ReportView): string {
  const values = [...view.history.map((h) => ({ date: h.date, value: h.overall })), { date: view.run.date, value: view.overall }];
  const w = 760, h = 270, left = 48, right = 18, top = 18, bottom = 38;
  const x = (i: number) => values.length === 1 ? (left + w - right) / 2 : left + i * (w - left - right) / (values.length - 1);
  const y = (v: number) => top + (100 - v) * (h - top - bottom) / 100;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v.value).toFixed(1)}`).join(' ');
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" class="trend-grid"/><text x="${left-10}" y="${y(v)+4}" text-anchor="end" class="trend-label">${v}</text>`).join('');
  const dates = values.length === 1
    ? `<text x="${x(0)}" y="${h-10}" text-anchor="middle" class="trend-label">${esc(values[0].date.slice(0, 10))}</text>`
    : values.map((v, i) => (i === 0 || i === values.length - 1 || values.length < 6) ? `<text x="${x(i)}" y="${h-10}" text-anchor="${i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'middle'}" class="trend-label">${esc(v.date.slice(5, 10))}</text>` : '').join('');
  const baseline = values.length === 1 ? `<line x1="${left}" y1="${y(values[0].value)}" x2="${w-right}" y2="${y(values[0].value)}" class="trend-baseline"/>` : '';
  return `<svg class="trend-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Overall readiness score over time">${grid}${baseline}<polyline points="${points}" class="trend-line"/>${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v.value)}" r="5" class="trend-point"><title>${esc(v.date)}: ${v.value}</title></circle>`).join('')}${dates}</svg>`;
}

export function renderHtml(report: ReadinessReport, opts: { history?: HistoryEntry[] } = {}): string {
  const view = buildView(report, opts.history || []);
  const data = JSON.stringify(view).replace(/</g, '\\u003c');
  const repoName = report.repo.path.split('/').pop() || report.repo.path;
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Readiness — ${esc(repoName)}</title>
<style>
:root, :root[data-theme="dark"] {
  --bg:#08090a; --surface:#101113; --surface-2:#15171a; --surface-3:#1b1d21; --ink:#f2f3f5; --muted:#989ba3;
  --line:#292c31; --line-strong:#3a3e45; --accent:#ff6b2c; --accent-2:#f5ae3d; --accent-soft:#2b170e;
  --ok:#48c77b; --ok-soft:#10251a; --warn:#f5ae3d; --warn-soft:#2b210e; --bad:#f0645a; --bad-soft:#2b1313;
  --skip:#858994; --skip-soft:#202227; --track:#202227; --shadow:0 24px 80px rgba(0,0,0,.35);
  --sans:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mono:"SFMono-Regular",Consolas,"Liberation Mono",monospace; color-scheme:dark;
}
:root[data-theme="light"] {
  --bg:#f4f5f6; --surface:#fff; --surface-2:#f8f8f9; --surface-3:#f0f1f3; --ink:#15171a; --muted:#686c74;
  --line:#dddfe3; --line-strong:#c9ccd2; --accent:#e65318; --accent-2:#b66c00; --accent-soft:#fff0e8;
  --ok:#167a43; --ok-soft:#e9f7ef; --warn:#9a6305; --warn-soft:#fbf2dc; --bad:#c83932; --bad-soft:#fcebea;
  --skip:#737780; --skip-soft:#eef0f2; --track:#e4e6e9; --shadow:0 20px 60px rgba(20,25,30,.12); color-scheme:light;
}
*{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--sans)}
button,input{font:inherit} button{color:inherit}.shell{max-width:1480px;margin:auto;padding:0 28px 80px}
.topbar{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(16px)}
.topbar-inner{max-width:1480px;margin:auto;height:62px;padding:0 28px;display:flex;align-items:center;gap:24px}.brand{font:700 13px var(--mono);letter-spacing:.04em}.brand-mark{color:var(--accent)}
.navlinks{display:flex;gap:20px}.navlinks a{color:var(--muted);text-decoration:none;font-size:12px}.navlinks a:hover{color:var(--ink)}.nav-actions{margin-left:auto;display:flex;align-items:center;gap:10px}
.icon-btn,.outline-btn,.primary-btn{border:1px solid var(--line);border-radius:7px;background:var(--surface);cursor:pointer;padding:8px 12px}.icon-btn{width:35px;height:35px;padding:7px}.icon-btn:hover,.outline-btn:hover{border-color:var(--accent);color:var(--accent)}.primary-btn{background:var(--accent);border-color:var(--accent);color:#170903;font-weight:700}.primary-btn:hover{filter:brightness(1.08)}
.level-chip,.tag,.status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 9px;font:700 10px var(--mono);letter-spacing:.04em;text-transform:uppercase}.level-chip{color:var(--accent-2);background:var(--warn-soft);border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)}
section{margin-top:26px}.eyebrow{color:var(--muted);font:11px var(--mono);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:12px}.section-head h2{font-size:19px;margin:0}.section-head p{color:var(--muted);margin:3px 0 0;font-size:12px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:10px}.overview{margin-top:28px;padding:24px}.repo-row{display:flex;align-items:center;gap:14px}.repo-badge{width:48px;height:48px;display:grid;place-items:center;background:linear-gradient(145deg,var(--accent-2),var(--accent));color:#1a0b02;font:800 17px var(--mono);clip-path:polygon(25% 7%,75% 7%,100% 50%,75% 93%,25% 93%,0 50%)}.repo-name{font-size:18px;font-weight:650}.repo-meta{color:var(--muted);font:11px var(--mono);margin-top:2px}.overview-actions{margin-left:auto;display:flex;gap:8px}.score-callout{text-align:center;margin:14px 0 5px}.score-callout strong{font-size:18px}.score-callout span{color:var(--muted);font-size:12px}.segment-wrap{position:relative;padding-top:28px}.segments{display:grid;grid-template-columns:repeat(100,1fr);gap:3px;height:31px}.segment{border-radius:2px;background:var(--track)}.segment.filled{background:linear-gradient(180deg,var(--accent-2),var(--accent))}.segment.current{transform:translateY(-7px);height:38px;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-2) 30%,transparent)}.score-marker{position:absolute;top:0;transform:translateX(-50%);color:var(--ink);font:700 11px var(--mono);white-space:nowrap}.level-labels{display:grid;grid-template-columns:repeat(5,1fr);margin-top:9px;color:var(--muted);font:11px var(--mono)}.level-labels span{text-align:center}.level-labels .active{color:var(--accent-2)}
.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border-top:1px solid var(--line);margin:22px -24px -24px}.summary-stat{background:var(--surface);padding:15px 20px}.summary-stat .value{font:700 21px var(--mono)}.summary-stat .label{color:var(--muted);font-size:11px;margin-top:2px}.delta-up{color:var(--ok)}.delta-down{color:var(--bad)}
.visual-grid{display:grid;grid-template-columns:minmax(360px,.82fr) minmax(520px,1.45fr);gap:14px}.chart-panel{min-height:390px;padding:18px 20px}.chart-title{font:12px var(--mono);text-transform:uppercase;letter-spacing:.08em}.chart-subtitle{color:var(--muted);font-size:11px;margin-top:3px}.radar-chart,.trend-chart{display:block;width:100%;height:315px;margin-top:8px;overflow:visible}.radar-ring,.radar-axis{fill:none;stroke:var(--line);stroke-width:1}.radar-area{fill:color-mix(in srgb,var(--accent) 25%,transparent);stroke:var(--accent);stroke-width:2}.radar-point,.trend-point{fill:var(--accent-2);stroke:var(--surface);stroke-width:2}.radar-label,.trend-label{fill:var(--muted);font:10px var(--mono)}.radar-label tspan{fill:var(--ink)}.trend-grid{stroke:var(--line);stroke-width:1}.trend-baseline{stroke:var(--accent);stroke-width:1.5;stroke-dasharray:5 5;opacity:.65}.trend-line{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.fix-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.fix-card{padding:16px;display:flex;flex-direction:column;min-height:170px;position:relative;overflow:hidden}.fix-card:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--bad)}.fix-top{display:flex;align-items:center;gap:7px}.tag{border:1px solid var(--line);color:var(--muted)}.tag.high{color:var(--bad);background:var(--bad-soft);border-color:transparent}.tag.med{color:var(--warn);background:var(--warn-soft);border-color:transparent}.fix-id{margin-left:auto;color:var(--muted);font:11px var(--mono)}.fix-action{margin:14px 0 10px;font-size:14px}.fix-evidence{color:var(--muted);font:11px var(--mono);margin-bottom:14px}.text-btn{border:0;background:none;color:var(--accent);cursor:pointer;padding:0;text-align:left;font:700 11px var(--mono);margin-top:auto}.text-btn:hover{text-decoration:underline}
.pillar-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.pillar-card{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:14px;text-align:left;cursor:pointer;min-height:132px;display:flex;flex-direction:column}.pillar-card:hover{border-color:var(--accent);transform:translateY(-1px)}.pillar-id{color:var(--accent-2);font:11px var(--mono)}.pillar-name{font-weight:650;margin:4px 0 16px}.pillar-score{font:700 22px var(--mono);margin-top:auto}.pillar-score span{color:var(--muted);font-size:11px;font-weight:400}.mini-bar{height:5px;background:var(--track);border-radius:9px;overflow:hidden;margin-top:8px}.mini-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-2));border-radius:9px}
.levels{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.level-card{padding:13px;border-top:2px solid var(--line-strong)}.level-card.unlocked{border-top-color:var(--ok)}.level-card.current{border-color:var(--accent);background:var(--accent-soft)}.level-name{font-weight:700}.level-gate{color:var(--muted);font:10px var(--mono);margin-top:5px}.lockicon{width:12px;height:12px;vertical-align:-2px}
.criteria-panel{overflow:hidden}.controls{display:flex;gap:8px;padding:14px;border-bottom:1px solid var(--line);align-items:center;flex-wrap:wrap}.filter{border:1px solid var(--line);border-radius:999px;background:var(--surface-2);color:var(--muted);padding:5px 11px;font-size:11px;cursor:pointer}.filter.on{color:var(--accent);border-color:var(--accent);background:var(--accent-soft)}.search{margin-left:auto;min-width:280px;border:1px solid var(--line);border-radius:7px;background:var(--surface-2);color:var(--ink);padding:8px 10px;outline:none}.search:focus{border-color:var(--accent)}
table{border-collapse:collapse;width:100%}th{color:var(--muted);font:10px var(--mono);letter-spacing:.08em;text-transform:uppercase;text-align:left;padding:10px 14px;border-bottom:1px solid var(--line)}td{padding:11px 14px;border-top:1px solid var(--line);vertical-align:middle}.criterion-row{cursor:pointer}.criterion-row:hover{background:var(--surface-2)}.criterion-name{font-weight:600}.criterion-id{color:var(--muted);font:10px var(--mono);margin-top:2px}.status:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.status.pass{color:var(--ok);background:var(--ok-soft)}.status.fail{color:var(--bad);background:var(--bad-soft)}.status.skip{color:var(--skip);background:var(--skip-soft)}.difficulty{color:var(--muted);font:11px var(--mono)}.view-link{color:var(--accent);font:11px var(--mono)}.empty{padding:40px;color:var(--muted);text-align:center}
dialog{width:min(760px,calc(100vw - 32px));max-height:88vh;padding:0;border:1px solid var(--line-strong);border-radius:11px;background:var(--surface);color:var(--ink);box-shadow:var(--shadow)}dialog::backdrop{background:rgba(0,0,0,.72);backdrop-filter:blur(3px)}.dialog-head{position:sticky;top:0;z-index:2;display:flex;gap:16px;padding:20px 22px;border-bottom:1px solid var(--line);background:var(--surface)}.dialog-title{font-size:19px;font-weight:700}.dialog-sub{color:var(--muted);font:11px var(--mono);margin-top:3px}.dialog-close{margin-left:auto;border:1px solid var(--line);background:var(--surface-2);border-radius:7px;width:34px;height:34px;cursor:pointer}.dialog-body{padding:20px 22px;overflow:auto}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.detail-block{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:13px}.detail-block.wide{grid-column:1/-1}.detail-label{color:var(--accent-2);font:10px var(--mono);letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px}.detail-copy{color:var(--muted);font-size:13px;white-space:pre-wrap;word-break:break-word}.prompt-wrap{margin-top:18px}.prompt-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.prompt{max-height:240px;overflow:auto;margin:0;border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:14px;color:var(--ink);font:11px/1.55 var(--mono);white-space:pre-wrap}.copy-feedback{color:var(--ok);font-size:11px;margin-left:8px}
.provenance{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font:10px/1.8 var(--mono)}
@media(max-width:1050px){.visual-grid{grid-template-columns:1fr}.fix-grid{grid-template-columns:1fr 1fr}.pillar-grid{grid-template-columns:repeat(3,1fr)}.summary-grid{grid-template-columns:1fr 1fr}.levels{grid-template-columns:1fr}.navlinks{display:none}}
@media(max-width:680px){.shell,.topbar-inner{padding-left:14px;padding-right:14px}.overview{padding:16px}.overview-actions{width:100%;margin:8px 0 0}.segments{gap:1px}.summary-grid{margin:18px -16px -16px}.fix-grid,.pillar-grid,.detail-grid{grid-template-columns:1fr}.visual-grid{grid-template-columns:minmax(0,1fr)}.chart-panel{min-height:320px}.radar-chart,.trend-chart{height:auto}.search{min-width:100%;margin-left:0}.criteria-panel{overflow-x:auto}.criterion-row td:nth-child(3),.criterion-row td:nth-child(4),th:nth-child(3),th:nth-child(4){display:none}.score-marker{display:none}}
@media print{.topbar,.overview-actions,.controls,.text-btn,.view-link,dialog{display:none!important}.panel,.fix-card,.pillar-card{break-inside:avoid}body{background:#fff}.shell{max-width:none}}
</style>
</head>
<body>
<header class="topbar"><div class="topbar-inner"><div class="brand">agent<span class="brand-mark">/</span>readiness</div><nav class="navlinks"><a href="#overview">Overview</a><a href="#actions">Actions</a><a href="#pillars">Pillars</a><a href="#criteria">Criteria</a></nav><div class="nav-actions"><span class="level-chip" id="nav-level"></span><button class="icon-btn" id="theme" aria-label="Toggle theme" title="Toggle theme"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3.5" stroke="currentColor" stroke-width="1.5"/></svg></button></div></div></header>
<main class="shell">
<section id="overview" class="panel overview">
  <div class="repo-row"><div class="repo-badge">${esc(report.level.replace('L','') || '0')}</div><div><div class="repo-name">${esc(repoName)}</div><div class="repo-meta">${esc(report.repo.language)} · ${esc(report.run.branch || 'local')} · updated ${esc(report.run.date.slice(0,16).replace('T',' '))}</div></div><div class="overview-actions"><button class="outline-btn" id="copy-all">Copy remediation prompt</button><button class="primary-btn" id="open-first">Review top blocker</button></div></div>
  <div class="score-callout"><strong>${report.droidPassRate.toFixed(1)}%</strong> <span>of mapped criteria pass</span></div>
  <div class="segment-wrap"><div class="score-marker" id="score-marker">${report.droidPassRate.toFixed(1)}%</div><div class="segments" id="segments" aria-label="${report.droidPassRate.toFixed(1)} percent criteria passing"></div><div class="level-labels"><span>Level 1</span><span>Level 2</span><span>Level 3</span><span>Level 4</span><span>Level 5</span></div></div>
  <div class="summary-grid" id="summary"></div>
</section>
<section><div class="visual-grid"><article class="panel chart-panel"><div class="chart-title">Pass rate by pillar</div><div class="chart-subtitle">Coverage balance across all ten readiness capabilities</div>${radarChart(view.pillars)}</article><article class="panel chart-panel"><div class="chart-title">Readiness over time</div><div class="chart-subtitle" id="trend-subtitle"></div>${trendChart(view)}</article></div></section>
<section id="actions"><div class="section-head"><div><div class="eyebrow">Prioritized work</div><h2>Fix next</h2><p>Highest-leverage failures first. Open any item for evidence and an agent-ready prompt.</p></div></div><div class="fix-grid" id="fix-grid"></div></section>
<section id="pillars"><div class="section-head"><div><div class="eyebrow">Capability map</div><h2>Readiness pillars</h2><p>Select a pillar to filter its criteria.</p></div></div><div class="pillar-grid" id="pillar-grid"></div></section>
<section id="levels"><div class="section-head"><div><div class="eyebrow">Maturity model</div><h2>Level gates</h2><p>Levels require every gate pillar to reach 80%; Testing and Security are hard gates.</p></div></div><div class="levels" id="levels-grid"></div></section>
<section id="criteria"><div class="section-head"><div><div class="eyebrow">Full assessment</div><h2>All criteria</h2><p>Open a criterion to understand why it exists, see evidence, and copy a remediation prompt.</p></div></div></div><div class="panel criteria-panel"><div class="controls"><button class="filter on" data-filter="all">All</button><button class="filter" data-filter="fail">Failed</button><button class="filter" data-filter="pass">Passed</button><button class="filter" data-filter="skip">Skipped</button><input id="search" class="search" type="search" placeholder="Search criterion, id, pillar, or app…"></div><table><thead><tr><th>Status</th><th>Criterion</th><th>Level</th><th>Scope</th><th>Difficulty</th><th></th></tr></thead><tbody id="criteria-body"></tbody></table><div class="empty" id="criteria-empty" hidden>No criteria match this filter.</div></div></section>
<div class="provenance" id="provenance"></div>
</main>
<dialog id="criterion-dialog" aria-labelledby="dialog-title"><div class="dialog-head"><div><div class="dialog-title" id="dialog-title"></div><div class="dialog-sub" id="dialog-sub"></div></div><button class="dialog-close" id="dialog-close" aria-label="Close">&#215;</button></div><div class="dialog-body"><div id="dialog-status"></div><div class="detail-grid" id="dialog-details"></div><div class="prompt-wrap"><div class="prompt-head"><div><div class="detail-label">Agent remediation prompt</div><span class="copy-feedback" id="copy-feedback"></span></div><button class="primary-btn" id="copy-prompt">Copy prompt</button></div><pre class="prompt" id="dialog-prompt"></pre></div></div></dialog>
<script>window.__DATA__ = ${data};</script>
<script>
(function(){
'use strict';
var D=window.__DATA__,filter='all',query='',pillarFilter='',activeIndex=-1;
var $=function(id){return document.getElementById(id)};
var escapeHtml=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')};
var statusOf=function(f){return f.skipped?'skip':(f.pass?'pass':'fail')};
var formatDelta=function(n){if(n==null)return '';if(n===0)return '±0';return (n>0?'+':'')+n.toFixed(1).replace(/\\.0$/,'')};
var copyText=function(text,button,label){var done=function(){if(button){var old=button.textContent;button.textContent=label||'Copied';setTimeout(function(){button.textContent=old},1500)}};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){fallbackCopy(text);done()})}else{fallbackCopy(text);done()}};
var fallbackCopy=function(text){var area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();try{document.execCommand('copy')}catch(e){}area.remove()};

$('nav-level').textContent=D.level+' · '+D.levelName;
var segmentScore=Math.max(0,Math.min(100,D.droidPassRate));
$('score-marker').style.left=segmentScore+'%';
$('segments').innerHTML=Array.from({length:100},function(_,i){var filled=i<Math.round(segmentScore);var current=i===Math.max(0,Math.round(segmentScore)-1);return '<span class="segment'+(filled?' filled':'')+(current?' current':'')+'"></span>'}).join('');
var levelIndex=Math.max(0,Math.min(4,(parseInt(D.level.slice(1),10)||1)-1));document.querySelectorAll('.level-labels span')[levelIndex].classList.add('active');
var passed=D.findings.filter(function(f){return f.pass&&!f.skipped}).length,failed=D.findings.filter(function(f){return !f.pass&&!f.skipped}).length,skipped=D.findings.filter(function(f){return f.skipped}).length;
var delta=D.delta&&D.delta.overall!=null?'<span class="'+(D.delta.overall>0?'delta-up':D.delta.overall<0?'delta-down':'')+'"> '+formatDelta(D.delta.overall)+'</span>':'';
$('summary').innerHTML=[
  [D.overall.toFixed(1)+delta,'Weighted score / 100'],[passed+'/'+(passed+failed),'Deterministic checks passing'],[String(failed),'Open failures'],[String(skipped),'Skipped as not applicable']
].map(function(s){return '<div class="summary-stat"><div class="value">'+s[0]+'</div><div class="label">'+s[1]+'</div></div>'}).join('');
$('trend-subtitle').textContent=D.history.length?D.history.length+' previous run'+(D.history.length===1?'':'s')+' plus current assessment':'Baseline established — future runs will build the trend';

var severityClass=function(s){return s==='high'?'high':s==='med'?'med':''};
var failedFindings=D.findings.filter(function(f){return !f.pass&&!f.skipped});
var remediationFindings=D.punchlist.map(function(p){return D.findings.find(function(f){return f.id===p.id&&!f.pass&&!f.skipped})}).filter(Boolean);
$('fix-grid').innerHTML=D.punchlist.length?D.punchlist.slice(0,6).map(function(p){var index=D.findings.findIndex(function(f){return f.id===p.id&&!f.pass});return '<article class="panel fix-card"><div class="fix-top"><span class="tag '+severityClass(p.severity)+'">'+escapeHtml(p.severity)+'</span><span class="tag">'+escapeHtml(p.difficulty)+'</span><span class="fix-id">'+escapeHtml(p.id)+'</span></div><div class="fix-action">'+escapeHtml(p.action)+'</div><div class="fix-evidence">'+escapeHtml(p.evidence)+'</div><button class="text-btn open-detail" data-index="'+index+'">View rationale &amp; agent prompt →</button></article>'}).join(''):'<div class="panel empty">All deterministic criteria pass. Preserve these controls as the repository evolves.</div>';

$('pillar-grid').innerHTML=Object.keys(D.pillars).map(function(id){var p=D.pillars[id];return '<button class="pillar-card" data-pillar="'+escapeHtml(id)+'" title="'+escapeHtml(p.rationale)+'"><div class="pillar-id">'+escapeHtml(id)+'</div><div class="pillar-name">'+escapeHtml(p.name)+'</div><div class="pillar-score">'+p.pct.toFixed(1)+'% <span>'+p.passed+'/'+p.total+'</span></div><div class="mini-bar"><i style="width:'+Math.min(100,p.pct)+'%"></i></div></button>'}).join('');
$('levels-grid').innerHTML=D.levels.map(function(l){var current=l.lvl===D.level;return '<div class="panel level-card '+(l.unlocked?'unlocked ':'')+(current?'current':'')+'"><div class="level-name">'+escapeHtml(l.lvl)+' · '+escapeHtml(({L1:'Functional',L2:'Documented',L3:'Standardized',L4:'Optimized',L5:'Autonomous'})[l.lvl])+(l.unlocked?'':' <svg class="lockicon" viewBox="0 0 16 16" aria-label="locked"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="currentColor"/><path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>')+'</div><div class="level-gate">'+l.pct+'% gate average · '+(l.unlocked?'unlocked':'locked')+'</div><div class="mini-bar"><i style="width:'+Math.min(100,l.pct)+'%"></i></div></div>'}).join('');

function renderCriteria(){var q=query.toLowerCase();var rows=D.findings.map(function(f,index){return {f:f,index:index}}).filter(function(item){var f=item.f,st=statusOf(f);if(filter!=='all'&&st!==filter)return false;if(pillarFilter&&f.pillar!==pillarFilter)return false;var pillar=D.pillars[f.pillar];return !q||(f.name+' '+f.id+' '+f.pillar+' '+(pillar?pillar.name:'')+' '+(f.app||'')).toLowerCase().indexOf(q)>=0});$('criteria-body').innerHTML=rows.map(function(item){var f=item.f,st=statusOf(f);return '<tr class="criterion-row" tabindex="0" data-index="'+item.index+'"><td><span class="status '+st+'">'+st+'</span></td><td><div class="criterion-name">'+escapeHtml(f.name)+'</div><div class="criterion-id">'+escapeHtml(f.id)+(f.app?' · '+escapeHtml(f.app):'')+'</div></td><td>'+(f.droidLevel?'L'+f.droidLevel:'—')+'</td><td>'+escapeHtml(f.scope)+'</td><td><span class="difficulty">'+escapeHtml(f.difficulty)+'</span></td><td><span class="view-link">View details →</span></td></tr>'}).join('');$('criteria-empty').hidden=rows.length>0;document.querySelectorAll('.criterion-row').forEach(function(row){var open=function(){openDetail(Number(row.dataset.index))};row.addEventListener('click',open);row.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})})}
function detailBlock(label,text,wide){return '<div class="detail-block'+(wide?' wide':'')+'"><div class="detail-label">'+escapeHtml(label)+'</div><div class="detail-copy">'+escapeHtml(text)+'</div></div>'}
function openDetail(index){if(index<0||!D.findings[index])return;activeIndex=index;var f=D.findings[index],st=statusOf(f);$('dialog-title').textContent=f.name;$('dialog-sub').textContent=f.id+' · '+D.pillars[f.pillar].name+' · '+f.scope;$('dialog-status').innerHTML='<span class="status '+st+'">'+st+'</span><span class="tag" style="margin-left:7px">'+escapeHtml(f.difficulty)+'</span>';$('dialog-details').innerHTML=detailBlock('Why this matters',f.rationale,true)+detailBlock('Criterion standard',f.description,true)+detailBlock(f.pass?'Why this passed':f.skipped?'Why this was skipped':'Why this failed',f.evidence||'No evidence recorded',false)+detailBlock('How it is evaluated',f.evaluation,false)+(!f.pass?detailBlock('Recommended outcome',f.action,true):'');$('dialog-prompt').textContent=f.prompt;$('copy-feedback').textContent='';var dialog=$('criterion-dialog');if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','')}
renderCriteria();
document.querySelectorAll('.filter').forEach(function(button){button.addEventListener('click',function(){document.querySelectorAll('.filter').forEach(function(b){b.classList.remove('on')});button.classList.add('on');filter=button.dataset.filter;renderCriteria()})});
$('search').addEventListener('input',function(e){query=e.target.value;renderCriteria()});
document.querySelectorAll('.pillar-card').forEach(function(button){button.addEventListener('click',function(){pillarFilter=pillarFilter===button.dataset.pillar?'':button.dataset.pillar;filter='all';document.querySelectorAll('.filter').forEach(function(b){b.classList.toggle('on',b.dataset.filter==='all')});$('criteria').scrollIntoView({behavior:'smooth'});renderCriteria()})});
document.querySelectorAll('.open-detail').forEach(function(button){button.addEventListener('click',function(){openDetail(Number(button.dataset.index))})});
$('dialog-close').addEventListener('click',function(){$('criterion-dialog').close()});$('criterion-dialog').addEventListener('click',function(e){if(e.target===$('criterion-dialog'))$('criterion-dialog').close()});
$('copy-prompt').addEventListener('click',function(){if(activeIndex>=0){copyText(D.findings[activeIndex].prompt,$('copy-prompt'),'Copied');$('copy-feedback').textContent='Ready to paste into any coding agent.'}});
$('open-first').addEventListener('click',function(){var first=remediationFindings[0]||failedFindings[0];if(first)openDetail(D.findings.indexOf(first));else $('criteria').scrollIntoView({behavior:'smooth'})});
$('copy-all').addEventListener('click',function(){var prompts=(remediationFindings.length?remediationFindings:failedFindings).slice(0,10).map(function(f){return f.prompt}).join('\\n\\n---\\n\\n');copyText(prompts||'No deterministic remediation is currently required.',$('copy-all'),'Copied all prompts')});
var savedTheme;try{savedTheme=localStorage.getItem('agent-readiness-theme')}catch(e){}if(savedTheme)document.documentElement.dataset.theme=savedTheme;
$('theme').addEventListener('click',function(){var next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('agent-readiness-theme',next)}catch(e){}});
$('provenance').innerHTML='Generated by agent-readiness · rubric '+escapeHtml(D.rubric_version)+' · config '+escapeHtml(D.config_hash)+' · model '+escapeHtml(D.run.model)+' · commit '+escapeHtml(D.run.commitHash||'unavailable')+' · scoring '+(D.droidScoring?'flat pass rate':'weighted N-1 gates')+(D.run.hasLocalChanges||D.run.hasNonRemoteCommits?' · local or unpushed changes present':'');
})();
</script>
</body>
</html>`;
}
