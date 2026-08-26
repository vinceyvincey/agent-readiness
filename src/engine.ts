// agent-readiness deterministic engine (single source of truth for E1 numeric score).
import { getPillars, type Repo, type CheckResult } from './checks.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export const RUBRIC_VERSION = '0.1.0';

// Level gate map: each entry is the set of pillars that must each pass the 80% gate.
export const LEVEL_GATES: Record<string, string[]> = {
  L1: ['P0', 'P2', 'P3'],                 // functional: runs, linter+unit tests
  L2: ['P0', 'P1', 'P2', 'P3'],           // documented: + agent guidance
  L3: ['P0', 'P1', 'P2', 'P3', 'P4', 'P6'], // standardized: CI + security (hard)
  L4: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'], // optimized: + quality/observability
  L5: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'], // autonomous
};
// Mandatory hard gates: these pillars must not be diluted by the aggregate.
export const MANDATORY = ['P2', 'P6'];
export const GATE_PCT = 0.8;

// Pure level-resolution: given per-pillar pct scores, return the resolved level.
export function resolveLevel(pillars: Record<string, PillarScore>): string {
  // Gates are cumulative supersets, so walk from the highest level down and
  // return the highest whose required pillars all meet the gate (plus mandatory).
  const orders = ['L5', 'L4', 'L3', 'L2', 'L1'];
  for (const lvl of orders) {
    const req = LEVEL_GATES[lvl];
    const meets = req.every((pill) => (pillars[pill]?.pct ?? 0) >= GATE_PCT * 100);
    const mandatoryOk = MANDATORY.every((m) => (pillars[m]?.pct ?? 0) >= GATE_PCT * 100);
    if (meets && mandatoryOk) return lvl;
  }
  return 'L0';
}

export interface PillarScore { passed: number; total: number; pct: number; }
export interface PunchItem { pillar: string; id: string; severity: string; action: string; evidence: string; }
export interface ReadinessReport {
  rubric_version: string;
  config_hash: string;
  repo: { path: string; language: string };
  pillars: Record<string, PillarScore>;
  weights: Record<string, number>;
  overall: number;
  level: string;
  judgment: string[];
  punchlist: PunchItem[];
  run: { date: string; model: string; strict: boolean };
  findings: CheckResult[];
}

function configHash(root: string): string {
  const cfg = path.join(root, 'agent-readiness.config.json');
  let payload = 'default';
  try { payload = fs.readFileSync(cfg, 'utf8'); } catch { /* default */ }
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

export function detectLanguage(root: string): string {
  for (const f of ['package.json', 'tsconfig.json']) if (fs.existsSync(path.join(root, f))) return 'typescript';
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) return 'python';
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(root, 'pom.xml')) || fs.existsSync(path.join(root, 'build.gradle'))) return 'java';
  return 'unknown';
}

function scorePillar(checks: CheckResult[]): PillarScore {
  const dt = checks.filter((c) => c.id && c.pass !== undefined);
  const passed = dt.filter((c) => c.pass).length;
  const total = dt.length || 1;
  return { passed, total, pct: Math.round((passed / total) * 1000) / 10 };
}

export function runReadiness(root: string, opts: { weights?: Record<string, number>; model?: string; strict?: boolean } = {}): ReadinessReport {
  const repo: Repo = { root };
  const pieces = getPillars().map((p) => ({
    pillar: p,
    checks: p.checks.map((fn) => { try { return fn(repo); } catch (e: any) { return { id: p.id + '.x', pillar: p.id, pass: false, evidence: 'check error', severity: 'low' } as CheckResult; } }),
  }));

  const pillars: Record<string, PillarScore> = {};
  const findings: CheckResult[] = [];
  for (const piece of pieces) {
    pillars[piece.pillar.id] = scorePillar(piece.checks);
    findings.push(...piece.checks);
  }

  const weights: Record<string, number> = {};
  for (const p of getPillars()) weights[p.id] = opts.weights?.[p.id] ?? 0.1;
  const overall = getPillars().reduce((a, p) => a + (pillars[p.id].pct / 100) * weights[p.id], 0);

  // Level resolution via N-1 gating across the level's required pillars.
  const level = resolveLevel(pillars);

  const actionById: Record<string, string> = {
    'P0.1': 'Write a real README with an overview (>200 chars).',
    'P0.2': 'Add a run/usage/quickstart section to README.',
    'P1.1': 'Create AGENTS.md with setup + behavior rules.',
    'P1.2': 'Add enforceable rules (must/always/run) to AGENTS.md.',
    'P2.1': 'Add a test directory and at least one real test.',
    'P2.2': 'Configure a test runner (jest/vitest/pytest).',
    'P2.3': 'Add a run-test one-liner (npm test / make test).',
    'P3.1': 'Commit a lockfile for reproducible builds.',
    'P3.2': 'Document/add a build step.',
    'P4.1': 'Add a CI workflow (.github/workflows).',
    'P6.1': 'Harden .gitignore to cover .env, keys, caches.',
    'P8.1': 'Add .env.example listing required env vars.',
  };
  const punchlist: PunchItem[] = findings
    .filter((c) => !c.pass)
    .sort((a, b) => (a.severity === 'high' ? -1 : 1) + (b.severity === 'high' ? 1 : 0))
    .slice(0, 10)
    .map((c) => ({ pillar: c.pillar, id: c.id, severity: c.severity, action: actionById[c.id] || 'No mapped remediation', evidence: c.evidence }));

  return {
    rubric_version: RUBRIC_VERSION,
    config_hash: configHash(root),
    repo: { path: root, language: detectLanguage(root) },
    pillars,
    weights,
    overall: Math.round(overall * 1000) / 10,
    level,
    judgment: [], // filled by the skill/extension narrative pass; excluded from score.
    punchlist,
    run: { date: new Date().toISOString(), model: opts.model || 'unknown', strict: !!opts.strict },
    findings,
  };
}

export function renderMarkdown(report: ReadinessReport): string {
  const rows = Object.keys(report.pillars).map((p) => `| ${p} | ${report.pillars[p].passed}/${report.pillars[p].total} | ${report.pillars[p].pct}% |`).join('\n');
  const punch = report.punchlist.length ? report.punchlist.map((p) => `- [${p.severity}] ${p.pillar} ${p.id}: ${p.action} (${p.evidence})`).join('\n') : '- none';
  return `# Agent Readiness Report\n\n- Level: **${report.level}**\n- Overall: **${report.overall}/100**\n- rubric_version: ${report.rubric_version} · config_hash: ${report.config_hash}\n- repo: ${report.repo.path} (${report.repo.language})\n\n## Pillars\n| Pillar | Passed/Total | Pct |\n|---|---|---|\n${rows}\n\n## Top Punchlist\n${punch}\n\n_Run ${report.run.date} · model ${report.run.model} · strict=${report.run.strict}_\n`;
}

export function writeReport(root: string, report: ReadinessReport, targetDir?: string): string {
  const dir = targetDir || path.join(root, '.agent-readiness');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), renderMarkdown(report));
  return dir;
}

export { getPillars };
