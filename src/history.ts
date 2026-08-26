// M4: per-repo score history + trend comparison.
// Stores an append-only log under .agent-readiness/history.json (git-ignored).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReadinessReport } from './engine.ts';

export interface HistoryEntry {
  date: string;
  rubric_version: string;
  config_hash: string;
  level: string;
  overall: number;
  perPillar: Record<string, number>;
}

export function historyPath(root: string, dir?: string): string {
  return path.join(dir || path.join(root, '.agent-readiness'), 'history.json');
}

export function readHistory(root: string, dir?: string): HistoryEntry[] {
  const p = historyPath(root, dir);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

// Append the current run to history (dedupe runs with identical overall+level within a short window is left to caller).
export function appendHistory(report: ReadinessReport, root: string, dir?: string): HistoryEntry[] {
  const hist = readHistory(root, dir);
  const entry: HistoryEntry = {
    date: report.run.date,
    rubric_version: report.rubric_version,
    config_hash: report.config_hash,
    level: report.level,
    overall: report.overall,
    perPillar: Object.fromEntries(Object.entries(report.pillars).map(([k, v]) => [k, v.pct])),
  };
  hist.push(entry);
  const p = historyPath(root, dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(hist, null, 2));
  return hist;
}

export interface TrendDelta {
  from: HistoryEntry | null;
  to: HistoryEntry;
  overallDelta: number | null;
  levelDelta: string | null;
  perPillarDelta: Record<string, number>;
  count: number;
}

// Compare the most recent run against the previous one (if any) for a simple trend.
export function trend(last: HistoryEntry[], opts: { report?: ReadinessReport } = {}): TrendDelta {
  const to = opts.report
    ? ({
        date: opts.report.run.date,
        rubric_version: opts.report.rubric_version,
        config_hash: opts.report.config_hash,
        level: opts.report.level,
        overall: opts.report.overall,
        perPillar: Object.fromEntries(Object.entries(opts.report.pillars).map(([k, v]) => [k, v.pct])),
      } as HistoryEntry)
    : last[last.length - 1];
  const from = last.length >= 2 ? last[last.length - 2] : last.length === 1 ? null : null;
  const prev = from || null;
  const perPillarDelta: Record<string, number> = {};
  if (prev) {
    for (const k of Object.keys(to.perPillar))
      perPillarDelta[k] = Math.round((to.perPillar[k] - (prev.perPillar[k] ?? 0)) * 10) / 10;
  }
  return {
    from: prev,
    to,
    overallDelta: prev ? Math.round((to.overall - prev.overall) * 10) / 10 : null,
    levelDelta: prev ? (to.level === prev.level ? prev.level : prev.level + ' -> ' + to.level) : null,
    perPillarDelta,
    count: last.length,
  };
}
