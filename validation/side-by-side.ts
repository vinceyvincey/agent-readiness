// M13: Side-by-side evaluation harness — runs pi deterministic engine and Droid's
// /readiness-report + /readiness-fix on the same repos, parses both outputs, and
// produces a structured comparison report (JSON + markdown).
//
// Usage:
//   node --experimental-strip-types validation/side-by-side.ts [repo...] [--skip-fix] [--timeout=300]
//
// Defaults to validation/corpus/{low,med,high} if no repos specified.
// --skip-fix: skip the fix comparison (assessment only, faster).
// --timeout=N: Droid exec timeout in seconds (default 300).

import { runReadiness, type ReadinessReport, type PunchItem } from '../src/engine.ts';
import { agentPromptFor } from '../src/fix.ts';
import { CRITERIA_REGISTRY, getCriterionByDroidId, getCriterionByPiId, type CriterionDef } from '../src/criteria-registry.ts';
import type { CheckResult } from '../src/checks.ts';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---- Types ----

export interface DroidSignal {
  id: string;       // droidId from registry, or raw name if unmatched
  name: string;     // display name from Droid output
  passed: boolean;
  score: string;    // raw score string (e.g., "1/1", "0/1")
  rationale: string;
  skipped: boolean;
}

export interface DroidAssessment {
  level: number;
  passRate: number;       // percentage
  passedSignals: number;
  totalSignals: number;
  skippedSignals: number;
  signals: DroidSignal[];
  actionItems: string[];
  rawOutput: string;
  durationMs: number;
  error?: string;
}

export interface PiAssessment {
  level: string;
  overall: number;
  findings: CheckResult[];
  punchlist: PunchItem[];
  agentPrompt: string;
  durationMs: number;
}

export type AgreementType = 'agree-pass' | 'agree-fail' | 'pi-lenient' | 'pi-strict' | 'agent-only';

export interface CriteriaComparison {
  droidId: string;
  droidName: string;
  piId: string | null;
  droidPassed: boolean;
  droidSkipped: boolean;
  piPassed: boolean | null;
  agreement: AgreementType;
}

export interface FixResult {
  approach: 'pi' | 'droid';
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  beforeLevel: string;
  afterLevel: string;
  filesChanged: string[];
  commitsMade: number;
  durationMs: number;
  error?: string;
}

export interface SideBySideReport {
  repo: string;
  pi: PiAssessment;
  droid: DroidAssessment;
  comparisons: CriteriaComparison[];
  fixes: { pi: FixResult; droid: FixResult } | null;
  summary: {
    agreementRate: number;
    agreePass: number;
    agreeFail: number;
    piLenient: number;
    piStrict: number;
    agentOnly: number;
    piDurationMs: number;
    droidDurationMs: number;
  };
}

// ---- Droid output parser ----

export function parseDroidOutput(raw: string): DroidAssessment {
  const lines = raw.split('\n');

  // Extract level: "Level N" (first occurrence)
  const levelMatch = raw.match(/Level\s+(\d)/);
  const level = levelMatch ? parseInt(levelMatch[1], 10) : 0;

  // Extract pass rate — handle multiple Droid output formats:
  //   "Level 1 (pass rate 1.6%: 1 of 62 evaluated signals passed; 22 skipped as N/A)"
  //   "Level 1 (2/61 non-skipped signals pass = 3.3%)"
  //   "X/Y non-skipped signals passed (Z%)"
  let passedSignals = 0;
  let totalSignals = 0;
  let passRate = 0;

  // Extract passed/total signal counts
  const fmtA = raw.match(/(\d+)\s+of\s+(\d+)\s+(?:evaluated|non-skipped)\s+signals?\s+passed/);
  const fmtB = raw.match(/(\d+)\/(\d+)\s+non-skipped\s+signals?\s+(?:pass|passed)/);
  if (fmtA) {
    passedSignals = parseInt(fmtA[1], 10);
    totalSignals = parseInt(fmtA[2], 10);
  } else if (fmtB) {
    passedSignals = parseInt(fmtB[1], 10);
    totalSignals = parseInt(fmtB[2], 10);
  }

  // Extract pass rate percentage — try multiple patterns
  const rateA = raw.match(/pass\s+rate\s+(\d+(?:\.\d+)?)%/i);
  const rateB = raw.match(/=\s*(\d+(?:\.\d+)?)%/);
  const rateC = raw.match(/\((\d+(?:\.\d+)?)%\)/);
  if (rateA) {
    passRate = parseFloat(rateA[1]);
  } else if (rateB) {
    passRate = parseFloat(rateB[1]);
  } else if (rateC) {
    passRate = parseFloat(rateC[1]);
  }

  // Extract signals — parse bullet lines under criteria sections.
  // Droid uses **bold section headers** and "- Signal Name: score - rationale" lines.
  const signals: DroidSignal[] = [];
  let inCriteria = false;
  let inActionItems = false;
  const actionItems: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Track sections by # headings
    if (/^#{1,4}\s+Criteria/i.test(trimmed)) { inCriteria = true; inActionItems = false; continue; }
    if (/^#{1,4}\s+Action\s+Items/i.test(trimmed)) { inCriteria = false; inActionItems = true; continue; }
    if (/^#{1,4}\s+/i.test(trimmed) && !/Criteria/i.test(trimmed) && !/Action/i.test(trimmed)) {
      inCriteria = false; inActionItems = false;
    }

    // Parse action items
    if (inActionItems && trimmed.startsWith('- ')) {
      actionItems.push(trimmed.substring(2).trim());
    }

    // Parse signal lines (only in criteria section, must have a colon)
    if (inCriteria && trimmed.startsWith('- ') && trimmed.includes(':')) {
      const parsed = parseSignalLine(trimmed);
      if (parsed) signals.push(...parsed);
    }
  }

  // Count skipped
  const skippedSignals = signals.filter(s => s.skipped).length;

  // Fallback: compute pass rate from parsed signals if not found in level line
  if (passRate === 0 && signals.length > 0) {
    const nonSkipped = signals.filter(s => !s.skipped);
    const passedCount = nonSkipped.filter(s => s.passed).length;
    passedSignals = passedSignals || passedCount;
    totalSignals = totalSignals || nonSkipped.length;
    if (totalSignals > 0) {
      passRate = Math.round((passedCount / totalSignals) * 1000) / 10;
    }
  }

  return {
    level,
    passRate,
    passedSignals,
    totalSignals,
    skippedSignals,
    signals,
    actionItems,
    rawOutput: raw,
    durationMs: 0,
  };
}

function parseSignalLine(line: string): DroidSignal[] {
  // Remove leading "- "
  let text = line.replace(/^-\s+/, '');

  // Extract name: everything before the first colon
  // Droid format: "- Linter Configured: 0/1 - No ESLint config"
  // Also bold: "- **Linter Configured**: 0/1 - rationale"
  let name = '';
  const boldMatch = text.match(/^\*\*(.+?)\*\*/);
  if (boldMatch) {
    name = boldMatch[1];
    text = text.substring(boldMatch[0].length).replace(/^[:\s]+/, '');
  } else {
    const colonIdx = text.indexOf(':');
    if (colonIdx < 0) return [];
    name = text.substring(0, colonIdx).trim();
    text = text.substring(colonIdx + 1).trim();
  }

  // Check for skip markers first (before score extraction)
  // Droid uses "skipped" or "null" as keywords
  const isSkipped = /^(?:skipped|null)\b/i.test(text);
  if (isSkipped) {
    const rationale = text.replace(/^skipped\s*-?\s*/i, '').trim();
    // Handle combined signal lines: "Feature Flags / Release Notes / Release Automation"
    // Only split on " / " (space-slash-space) to avoid splitting within names like "setup/usage"
    const names = name.split(/\s+\/\s+/);
    return names.map(n => {
      const droidId = matchDroidId(n.trim());
      return { id: droidId, name: n.trim(), passed: false, score: 'skip', rationale, skipped: true };
    });
  }

  // Extract score: "1/1" or "0/1" or "1/2"
  const scoreMatch = text.match(/^(\d+)\/(\d+)/);
  const score = scoreMatch ? scoreMatch[0] : '';
  const passed = scoreMatch ? parseInt(scoreMatch[1], 10) > 0 : false;

  // Handle "0/1 each" — combined signal lines with same score
  const isEach = /\beach\b/i.test(text);

  // Remainder is rationale
  let rationale = text;
  if (scoreMatch) {
    rationale = text.substring(scoreMatch[0].length).replace(/^[\s]*(?:each)?[\s-]*/i, '').trim();
  }

  // Handle combined signal lines: "Unit Tests Exist / Integration Tests Exist / Runnable"
  // Only split on " / " (space-slash-space) to avoid splitting within names like "setup/usage"
  const names = name.split(/\s+\/\s+/);
  return names.map(n => {
    const droidId = matchDroidId(n.trim());
    return { id: droidId, name: n.trim(), passed, score, rationale, skipped: false };
  });
}

function matchDroidId(name: string): string {
  // Try exact name match first
  const exact = CRITERIA_REGISTRY.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact.droidId;

  // Try partial match (name contains or is contained) — prefer longest overlap
  const lower = name.toLowerCase();
  let bestMatch: CriterionDef | undefined;
  let bestScore = 0;
  for (const c of CRITERIA_REGISTRY) {
    const cName = c.name.toLowerCase();
    if (cName.includes(lower) || lower.includes(cName)) {
      const overlap = Math.min(cName.length, lower.length);
      if (overlap > bestScore) { bestScore = overlap; bestMatch = c; }
    }
  }
  if (bestMatch) return bestMatch.droidId;

  // Try keyword match — match on ALL significant words, not just the first
  const keywords = lower.split(/[\s\-_,.()]+/).filter(w => w.length > 3);
  let bestKwMatch: CriterionDef | undefined;
  let bestKwScore = 0;
  for (const c of CRITERIA_REGISTRY) {
    const cName = c.name.toLowerCase();
    const cId = c.droidId.toLowerCase();
    let matchCount = 0;
    for (const kw of keywords) {
      if (cName.includes(kw) || cId.includes(kw)) matchCount++;
    }
    if (matchCount > bestKwScore) { bestKwScore = matchCount; bestKwMatch = c; }
  }
  if (bestKwMatch && bestKwScore > 0) return bestKwMatch.droidId;

  return name; // fallback to raw name
}

// ---- Criteria comparison ----

export function compareCriteria(
  piFindings: CheckResult[],
  droidSignals: DroidSignal[],
): CriteriaComparison[] {
  const comparisons: CriteriaComparison[] = [];

  for (const sig of droidSignals) {
    if (sig.skipped) continue;

    const reg = getCriterionByDroidId(sig.id);
    const piId = reg?.piId ?? null;

    // Find the matching pi finding
    let piPassed: boolean | null = null;
    if (piId) {
      const finding = piFindings.find(f => f.id === piId);
      if (finding) piPassed = finding.pass;
    }

    let agreement: AgreementType;
    if (piId === null) {
      agreement = 'agent-only';
    } else if (piPassed === null) {
      // piId mapped but finding not found — treat as agent-only
      agreement = 'agent-only';
    } else if (piPassed && sig.passed) {
      agreement = 'agree-pass';
    } else if (!piPassed && !sig.passed) {
      agreement = 'agree-fail';
    } else if (piPassed && !sig.passed) {
      agreement = 'pi-lenient'; // pi says pass, droid says fail
    } else {
      agreement = 'pi-strict'; // pi says fail, droid says pass
    }

    comparisons.push({
      droidId: sig.id,
      droidName: sig.name,
      piId,
      droidPassed: sig.passed,
      droidSkipped: sig.skipped,
      piPassed,
      agreement,
    });
  }

  return comparisons;
}

export function summarizeComparison(comparisons: CriteriaComparison[]) {
  const agreePass = comparisons.filter(c => c.agreement === 'agree-pass').length;
  const agreeFail = comparisons.filter(c => c.agreement === 'agree-fail').length;
  const piLenient = comparisons.filter(c => c.agreement === 'pi-lenient').length;
  const piStrict = comparisons.filter(c => c.agreement === 'pi-strict').length;
  const agentOnly = comparisons.filter(c => c.agreement === 'agent-only').length;

  const total = comparisons.length || 1;
  const agreementRate = Math.round(((agreePass + agreeFail) / total) * 1000) / 10;

  return { agreementRate, agreePass, agreeFail, piLenient, piStrict, agentOnly };
}

// ---- Fix result helpers ----

export function computeFixResult(
  approach: 'pi' | 'droid',
  beforeReport: ReadinessReport,
  afterReport: ReadinessReport,
  repoPath: string,
  durationMs: number,
  error?: string,
): FixResult {
  const filesChanged = gitChangedFiles(repoPath);
  const commitsMade = gitCommitCount(repoPath);

  return {
    approach,
    beforeScore: beforeReport.overall,
    afterScore: afterReport.overall,
    scoreDelta: Math.round((afterReport.overall - beforeReport.overall) * 10) / 10,
    beforeLevel: beforeReport.level,
    afterLevel: afterReport.level,
    filesChanged,
    commitsMade,
    durationMs,
    error,
  };
}

function gitChangedFiles(repoPath: string): string[] {
  try {
    // Get all files changed since the initial commit (HEAD~N..HEAD where N = new commits)
    const res = spawnSync('git', ['log', '--name-only', '--pretty=format:', 'HEAD'], {
      cwd: repoPath, encoding: 'utf8', timeout: 5000,
    });
    if (res.status === 0 && res.stdout) {
      const files = res.stdout.split('\n').filter(f => f.trim().length > 0);
      return [...new Set(files)];
    }
  } catch { /* not git */ }
  return [];
}

function gitCommitCount(repoPath: string): number {
  try {
    const res = spawnSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: repoPath, encoding: 'utf8', timeout: 5000,
    });
    if (res.status === 0) return parseInt(res.stdout.trim(), 10) || 0;
  } catch { /* not git */ }
  return 0;
}

// ---- Repo preparation ----

function prepareRepo(srcPath: string, name: string, baseDir: string): string {
  const dest = path.join(baseDir, name);

  // Clean if exists
  try { fs.rmSync(dest, { recursive: true, force: true }); } catch {}

  // Copy source repo
  fs.mkdirSync(dest, { recursive: true });
  copyDir(srcPath, dest);

  // Init git
  spawnSync('git', ['init'], { cwd: dest, encoding: 'utf8', timeout: 5000 });
  spawnSync('git', ['add', '-A'], { cwd: dest, encoding: 'utf8', timeout: 5000 });
  spawnSync('git', ['commit', '-m', 'initial'], {
    cwd: dest, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@test.com' },
  });

  // Add fake remote (Droid requires this)
  spawnSync('git', ['remote', 'add', 'origin', `https://github.com/fake/${name}.git`], {
    cwd: dest, encoding: 'utf8', timeout: 5000,
  });

  return dest;
}

function copyDir(src: string, dest: string) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---- Droid runners ----

function runDroidAssessment(repoPath: string, timeoutSec: number): DroidAssessment {
  const start = Date.now();
  const res = spawnSync('droid', ['exec', '/readiness-report', '--auto', 'high'], {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    env: { ...process.env },
  });

  const durationMs = Date.now() - start;
  const rawOutput = (res.stdout || '') + (res.stderr || '');

  if (res.error || res.status !== 0) {
    return {
      ...parseDroidOutput(rawOutput),
      durationMs,
      error: res.error?.message || `droid exec exited with status ${res.status}`,
    };
  }

  const parsed = parseDroidOutput(rawOutput);
  parsed.durationMs = durationMs;
  return parsed;
}

function runDroidFix(repoPath: string, timeoutSec: number): { durationMs: number; error?: string } {
  const start = Date.now();
  const res = spawnSync('droid', ['exec', '/readiness-fix', '--auto', 'high'], {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    env: { ...process.env },
  });

  const durationMs = Date.now() - start;
  return {
    durationMs,
    error: res.error?.message || (res.status !== 0 ? `droid exec exited with status ${res.status}` : undefined),
  };
}

function runPiFixViaDroid(repoPath: string, prompt: string, timeoutSec: number): { durationMs: number; error?: string } {
  const start = Date.now();
  const res = spawnSync('droid', ['exec', prompt, '--auto', 'high'], {
    cwd: repoPath,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    env: { ...process.env },
  });

  const durationMs = Date.now() - start;
  return {
    durationMs,
    error: res.error?.message || (res.status !== 0 ? `droid exec exited with status ${res.status}` : undefined),
  };
}

// ---- Report writers ----

export function writeReports(reports: SideBySideReport[], outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // JSON
  const jsonPath = path.join(outDir, `side-by-side-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(reports, null, 2));

  // Markdown
  const mdPath = path.join(outDir, `side-by-side-${ts}.md`);
  fs.writeFileSync(mdPath, renderComparisonMarkdown(reports));

  console.log(`\nReports written:\n  ${jsonPath}\n  ${mdPath}`);
  return { jsonPath, mdPath };
}

export function renderComparisonMarkdown(reports: SideBySideReport[]): string {
  const lines: string[] = [];

  lines.push('# Side-by-Side Evaluation: pi vs Droid\n');
  lines.push(`Date: ${new Date().toISOString()}\n`);
  lines.push(`Repos evaluated: ${reports.length}\n`);

  // Summary table
  lines.push('## Summary\n');
  lines.push('| Repo | Pi Level | Pi Score | Droid Level | Droid Pass% | Agreement% | Pi Lenient | Pi Strict | Agent-Only | Pi Time | Droid Time |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');

  for (const r of reports) {
    lines.push(
      `| ${r.repo} | ${r.pi.level} | ${r.pi.overall} | L${r.droid.level} | ${r.droid.passRate}% | ${r.summary.agreementRate}% | ${r.summary.piLenient} | ${r.summary.piStrict} | ${r.summary.agentOnly} | ${formatMs(r.summary.piDurationMs)} | ${formatMs(r.summary.droidDurationMs)} |`
    );
  }

  // Fix comparison (if present)
  const hasFixes = reports.some(r => r.fixes !== null);
  if (hasFixes) {
    lines.push('\n## Fix Comparison\n');
    lines.push('| Repo | Approach | Before → After | Delta | Level Change | Files Changed | Commits | Time |');
    lines.push('|---|---|---|---|---|---|---|---|');

    for (const r of reports) {
      if (!r.fixes) continue;
      for (const approach of ['pi', 'droid'] as const) {
        const f = r.fixes[approach];
        lines.push(
          `| ${r.repo} | ${approach} | ${f.beforeScore} → ${f.afterScore} | ${f.scoreDelta >= 0 ? '+' : ''}${f.scoreDelta} | ${f.beforeLevel} → ${f.afterLevel} | ${f.filesChanged.length} | ${f.commitsMade} | ${formatMs(f.durationMs)} |`
        );
      }
    }
  }

  // Per-repo details
  for (const r of reports) {
    lines.push(`\n## ${r.repo}\n`);

    // Pi assessment
    lines.push('### Pi Assessment\n');
    lines.push(`- Level: **${r.pi.level}**`);
    lines.push(`- Score: **${r.pi.overall}/100**`);
    lines.push(`- Time: ${formatMs(r.pi.durationMs)}`);
    lines.push(`- Failed checks: ${r.pi.findings.filter(f => !f.pass).length}/${r.pi.findings.length}`);
    lines.push(`- Punchlist items: ${r.pi.punchlist.length}`);

    // Droid assessment
    lines.push('\n### Droid Assessment\n');
    if (r.droid.error) lines.push(`- **Error**: ${r.droid.error}`);
    lines.push(`- Level: **L${r.droid.level}**`);
    lines.push(`- Pass rate: **${r.droid.passRate}%** (${r.droid.passedSignals}/${r.droid.totalSignals} signals)`);
    lines.push(`- Skipped signals: ${r.droid.skippedSignals}`);
    lines.push(`- Time: ${formatMs(r.droid.durationMs)}`);
    lines.push(`- Action items: ${r.droid.actionItems.length}`);

    if (r.droid.actionItems.length > 0) {
      lines.push('\n**Droid action items:**');
      for (const item of r.droid.actionItems.slice(0, 10)) {
        lines.push(`- ${item}`);
      }
    }

    // Criteria comparison table
    lines.push('\n### Criteria Comparison\n');
    lines.push('| Droid Criterion | Pi Check | Droid | Pi | Agreement |');
    lines.push('|---|---|---|---|---|');

    for (const c of r.comparisons) {
      const droidStatus = c.droidSkipped ? 'SKIP' : (c.droidPassed ? 'PASS' : 'FAIL');
      const piStatus = c.piPassed === null ? 'N/A' : (c.piPassed ? 'PASS' : 'FAIL');
      const emoji = agreementEmoji(c.agreement);
      lines.push(`| ${c.droidName} | ${c.piId || '—'} | ${droidStatus} | ${piStatus} | ${emoji} ${c.agreement} |`);
    }

    // Fix details
    if (r.fixes) {
      lines.push('\n### Fix Results\n');
      for (const approach of ['pi', 'droid'] as const) {
        const f = r.fixes[approach];
        lines.push(`#### ${approach === 'pi' ? 'Pi (agentPromptFor via Droid)' : 'Droid /readiness-fix'}\n`);
        if (f.error) lines.push(`- **Error**: ${f.error}`);
        lines.push(`- Score: ${f.beforeScore} → ${f.afterScore} (${f.scoreDelta >= 0 ? '+' : ''}${f.scoreDelta})`);
        lines.push(`- Level: ${f.beforeLevel} → ${f.afterLevel}`);
        lines.push(`- Files changed (${f.filesChanged.length}): ${f.filesChanged.slice(0, 5).join(', ')}${f.filesChanged.length > 5 ? '...' : ''}`);
        lines.push(`- Commits made: ${f.commitsMade}`);
        lines.push(`- Time: ${formatMs(f.durationMs)}`);
        lines.push('');
      }
    }

    // Summary stats
    const s = r.summary;
    lines.push('### Agreement Summary\n');
    lines.push(`- Agree (both pass): **${s.agreePass}**`);
    lines.push(`- Agree (both fail): **${s.agreeFail}**`);
    lines.push(`- Pi lenient (pi pass, droid fail): **${s.piLenient}**`);
    lines.push(`- Pi strict (pi fail, droid pass): **${s.piStrict}**`);
    lines.push(`- Agent-only (no pi mapping): **${s.agentOnly}**`);
    lines.push(`- Overall agreement rate: **${s.agreementRate}%**`);
  }

  // Insights section
  lines.push('\n## Insights\n');
  const totalLenient = reports.reduce((a, r) => a + r.summary.piLenient, 0);
  const totalStrict = reports.reduce((a, r) => a + r.summary.piStrict, 0);
  const totalAgentOnly = reports.reduce((a, r) => a + r.summary.agentOnly, 0);
  const totalAgree = reports.reduce((a, r) => a + r.summary.agreePass + r.summary.agreeFail, 0);
  const totalCompared = reports.reduce((a, r) => a + r.comparisons.length, 0);

  lines.push(`- **Total criteria compared**: ${totalCompared}`);
  lines.push(`- **Overall agreement**: ${totalAgree}/${totalCompared} (${Math.round(totalAgree / (totalCompared || 1) * 1000) / 10}%)`);
  lines.push(`- **Pi lenient (missed by pi)**: ${totalLenient}`);
  lines.push(`- **Pi strict (false positives)**: ${totalStrict}`);
  lines.push(`- **Agent-only gaps**: ${totalAgentOnly}`);

  if (hasFixes) {
    const piFixes = reports.filter(r => r.fixes).map(r => r.fixes!.pi);
    const droidFixes = reports.filter(r => r.fixes).map(r => r.fixes!.droid);
    const avgPiDelta = piFixes.reduce((a, f) => a + f.scoreDelta, 0) / (piFixes.length || 1);
    const avgDroidDelta = droidFixes.reduce((a, f) => a + f.scoreDelta, 0) / (droidFixes.length || 1);
    lines.push(`\n### Fix Effectiveness\n`);
    lines.push(`- **Pi fix avg score delta**: ${avgPiDelta >= 0 ? '+' : ''}${Math.round(avgPiDelta * 10) / 10}`);
    lines.push(`- **Droid fix avg score delta**: ${avgDroidDelta >= 0 ? '+' : ''}${Math.round(avgDroidDelta * 10) / 10}`);
    lines.push(`- **Pi fix avg files changed**: ${avgFiles(piFixes)}`);
    lines.push(`- **Droid fix avg files changed**: ${avgFiles(droidFixes)}`);
    lines.push(`- **Pi fix avg commits**: ${avgCommits(piFixes)}`);
    lines.push(`- **Droid fix avg commits**: ${avgCommits(droidFixes)}`);
  }

  return lines.join('\n') + '\n';
}

// ---- Helpers ----

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function agreementEmoji(a: AgreementType): string {
  switch (a) {
    case 'agree-pass': return '✅';
    case 'agree-fail': return '⚠️';
    case 'pi-lenient': return '🔵';
    case 'pi-strict': return '🔴';
    case 'agent-only': return '⚫';
  }
}

function avgFiles(fixes: FixResult[]): number {
  return Math.round(fixes.reduce((a, f) => a + f.filesChanged.length, 0) / (fixes.length || 1) * 10) / 10;
}

function avgCommits(fixes: FixResult[]): number {
  return Math.round(fixes.reduce((a, f) => a + f.commitsMade, 0) / (fixes.length || 1) * 10) / 10;
}

// ---- Main ----

function main() {
  const args = process.argv.slice(2);
  const skipFix = args.includes('--skip-fix');
  const timeoutArg = args.find(a => a.startsWith('--timeout='));
  const timeoutSec = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 300;

  const repoArgs = args.filter(a => !a.startsWith('--'));
  const repos = repoArgs.length > 0
    ? repoArgs
    : ['validation/corpus/low', 'validation/corpus/med', 'validation/corpus/high'];

  // Check if droid CLI is available
  const droidCheck = spawnSync('droid', ['--version'], { encoding: 'utf8', timeout: 5000 });
  const droidAvailable = droidCheck.status === 0 || (droidCheck.stderr && droidCheck.stderr.length > 0);
  if (!droidAvailable) {
    console.log('WARNING: droid CLI not found. Running pi-only assessment.');
  }

  const baseDir = '/tmp/side-by-side';
  fs.mkdirSync(baseDir, { recursive: true });

  const reports: SideBySideReport[] = [];

  for (const repoPath of repos) {
    const abs = path.resolve(repoPath);
    const name = path.basename(abs);
    console.log(`\n=== Evaluating ${name} ===`);

    // Prepare repo
    const preparedPath = prepareRepo(abs, name, baseDir);
    console.log(`Prepared: ${preparedPath}`);

    // Pi assessment
    console.log('Running pi assessment...');
    const piStart = Date.now();
    const piReport = runReadiness(preparedPath);
    const piDuration = Date.now() - piStart;
    const piAssessment: PiAssessment = {
      level: piReport.level,
      overall: piReport.overall,
      findings: piReport.findings,
      punchlist: piReport.punchlist,
      agentPrompt: agentPromptFor(piReport),
      durationMs: piDuration,
    };
    console.log(`  Pi: ${piReport.level} (${piReport.overall}/100) in ${formatMs(piDuration)}`);

    // Droid assessment
    let droidAssessment: DroidAssessment;
    if (droidAvailable) {
      console.log('Running Droid /readiness-report...');
      droidAssessment = runDroidAssessment(preparedPath, timeoutSec);
      console.log(`  Droid: L${droidAssessment.level} (${droidAssessment.passRate}%) in ${formatMs(droidAssessment.durationMs)}`);
      if (droidAssessment.error) console.log(`  Droid error: ${droidAssessment.error}`);
    } else {
      droidAssessment = {
        level: 0, passRate: 0, passedSignals: 0, totalSignals: 0, skippedSignals: 0,
        signals: [], actionItems: [], rawOutput: '', durationMs: 0, error: 'droid CLI not available',
      };
    }

    // Compare criteria
    const comparisons = compareCriteria(piAssessment.findings, droidAssessment.signals);
    const summaryStats = summarizeComparison(comparisons);

    // Fix comparison
    let fixes: { pi: FixResult; droid: FixResult } | null = null;
    if (!skipFix && droidAvailable) {
      console.log('Running fix comparison...');

      // Pi fix: use agentPromptFor via droid exec
      const piFixPath = prepareRepo(abs, `${name}-pi-fix`, baseDir);
      const piBefore = runReadiness(piFixPath);
      console.log('  Running pi fix (agentPromptFor via Droid)...');
      const piFixResult = runPiFixViaDroid(piFixPath, piAssessment.agentPrompt, timeoutSec);
      const piAfter = runReadiness(piFixPath);
      const piFix = computeFixResult('pi', piBefore, piAfter, piFixPath, piFixResult.durationMs, piFixResult.error);
      console.log(`  Pi fix: ${piBefore.overall} → ${piAfter.overall} (${piFix.scoreDelta >= 0 ? '+' : ''}${piFix.scoreDelta}) in ${formatMs(piFixResult.durationMs)}`);

      // Droid fix: /readiness-fix
      const droidFixPath = prepareRepo(abs, `${name}-droid-fix`, baseDir);
      const droidBefore = runReadiness(droidFixPath);
      console.log('  Running Droid /readiness-fix...');
      const droidFixResult = runDroidFix(droidFixPath, timeoutSec);
      const droidAfter = runReadiness(droidFixPath);
      const droidFix = computeFixResult('droid', droidBefore, droidAfter, droidFixPath, droidFixResult.durationMs, droidFixResult.error);
      console.log(`  Droid fix: ${droidBefore.overall} → ${droidAfter.overall} (${droidFix.scoreDelta >= 0 ? '+' : ''}${droidFix.scoreDelta}) in ${formatMs(droidFixResult.durationMs)}`);

      fixes = { pi: piFix, droid: droidFix };
    }

    reports.push({
      repo: name,
      pi: piAssessment,
      droid: droidAssessment,
      comparisons,
      fixes,
      summary: {
        ...summaryStats,
        piDurationMs: piAssessment.durationMs,
        droidDurationMs: droidAssessment.durationMs,
      },
    });
  }

  // Write reports
  const outDir = path.join('docs', 'validation');
  const { jsonPath, mdPath } = writeReports(reports, outDir);

  // Print summary to console
  console.log('\n=== Summary ===');
  for (const r of reports) {
    console.log(`${r.repo}: pi=${r.pi.level}(${r.pi.overall}) droid=L${r.droid.level}(${r.droid.passRate}%) agreement=${r.summary.agreementRate}%`);
  }

  process.exit(0);
}

// Only run main when executed directly (not when imported by tests).
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace('file://', ''));
if (isDirectRun) main();
