// --fix remediation: draft concrete file contents for the highest-priority failed checks.
// Writes into <target>/.agent-readiness/fix/ (git-ignored) by default; does NOT touch
// tracked files unless `apply` is true. This keeps write-safety (dry-run default).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CRITERIA_REGISTRY, getCriterionByPiId, getAgentOnlyCriteria, type CriterionDef } from './criteria-registry.ts';
import type { ReadinessReport } from './engine.ts';

export interface FixDraft {
  file: string;
  content: string;
  note: string;
}

// Map a failed check id to a concrete draft file.
export function draftsFor(report: ReadinessReport, target: string): FixDraft[] {
  const out: FixDraft[] = [];
  const failed = new Set(report.findings.filter((c) => !c.pass).map((c) => c.id));
  const add = (file: string, content: string, note: string) => out.push({ file, content: content.trim() + '\n', note });

  // P1.1 / P1.2 -> AGENTS.md
  if (failed.has('P1.1') || failed.has('P1.2')) {
    add(
      'AGENTS.md',
      `# Agent instructions

Working here, you must:
- Always run the project's tests and linter before finishing.
- Never commit secrets; keep .env out of git.
- Follow the existing module structure and naming conventions.
- Prefer small, reviewable changes over large rewrites.
`,
      'Create/replace AGENTS.md with enforceable behavior rules.',
    );
  }
  // P2.1 / P2.2 / P2.3 -> test scaffold
  if (failed.has('P2.1') || failed.has('P2.2') || failed.has('P2.3')) {
    add(
      'test/fixture.test.ts',
      `import { describe, it, expect } from 'vitest';
// Replace with a real test of the project's core behavior.
describe('core', () => { it('works', () => { expect(true).toBe(true); }); });`,
      'Scaffold a test dir + a runner so a run-test one-liner exists.',
    );
  }
  // P3.1 -> lockfile note
  if (failed.has('P3.1')) {
    add(
      'README.md',
      `\n## Reproducibility\nCommit a lockfile (package-lock.json / poetry.lock / go.sum) for deterministic installs.`,
      'Commit a lockfile for reproducible builds.',
    );
  }
  // P4.1 -> CI workflow
  if (failed.has('P4.1')) {
    add(
      '.github/workflows/ci.yml',
      `name: CI\non:\n  push:\n  pull_request:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo 'Add your build + test + lint steps here'`,
      'Add a CI workflow that builds, tests, and lints.',
    );
  }
  // P6.1 -> gitignore hardening
  if (failed.has('P6.1')) {
    add(
      '.gitignore',
      `# Secrets\n.env\n.env.*\n*.pem\n*.key\n# Caches / build\nnode_modules/\ndist/\n.cache/\n.agent-readiness/\n*.log`,
      'Harden .gitignore to cover secrets and caches.',
    );
  }
  // P8.1 -> .env.example
  if (failed.has('P8.1')) {
    add(
      '.env.example',
      `# Required environment variables (fill real values locally, never commit)\n# DATABASE_URL=***********************************/db\n# API_KEY=`,
      'Add .env.example listing required env vars.',
    );
  }
  // P0.2 -> README usage note
  if (failed.has('P0.2')) {
    add(
      'README-usage-note.md',
      `Add a Usage / Quickstart section to the README describing how to run and verify this project.`,
      'Add a run/usage section to README.',
    );
  }

  return out;
}

export function writeFixes(target: string, drafts: FixDraft[], apply = false): string {
  const dir = apply ? target : path.join(target, '.agent-readiness', 'fix');
  fs.mkdirSync(dir, { recursive: true });
  for (const d of drafts) {
    const p = path.join(dir, d.file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, d.content);
  }
  return dir;
}

// Short grounding prompt for /readiness-fix.
// Replaces the previous 3000+ word mega-prompt with a compact prompt that instructs
// the agent to use the readiness_check tool iteratively: fix one check, verify, commit, repeat.
export function agentPromptFor(report: ReadinessReport): string {
  const failed = report.findings.filter((c) => !c.pass && !c.skipped);
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  const sorted = [...failed].sort(
    (a, b) =>
      (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) ||
      (diffRank[a.difficulty || 'intermediate'] ?? 1) - (diffRank[b.difficulty || 'intermediate'] ?? 1),
  );

  const failingList = sorted
    .slice(0, 10)
    .map((c) => `- [${c.id}/${c.severity}] ${c.evidence}`)
    .join('\n');
  const remaining =
    sorted.length > 10
      ? `\n... and ${sorted.length - 10} more (call readiness_check with summary=true to see all)`
      : '';

  const lang = report.repo.language;
  const langContext = lang !== 'unknown' ? `Language: ${lang}. ` : '';
  const appInfo =
    Object.keys(report.apps).length > 1
      ? `\nMonorepo with ${Object.keys(report.apps).length} apps: ${Object.entries(report.apps)
          .map(([p, a]) => `${p} (${a.name})`)
          .join(', ')}.`
      : '';

  return `## Agent Readiness Remediation

Current: ${report.level} (${report.overall}/100, droid pass rate: ${report.droidPassRate}%)
${langContext}Repo: ${report.repo.path}${appInfo}

### Failing checks (sorted by severity)
${failingList}${remaining}

### Instructions
1. Call readiness_check with summary=true to see the current state.
2. For any check you need more detail on, call readiness_check with checkId (e.g., checkId="P5.8") to get the full criterion description, evaluation instructions, and remediation action.
3. Fix one check at a time, highest severity first.
4. After each fix, call readiness_check with summary=true to verify the check now passes.
5. Commit after each successful fix.
6. If a fix doesn't improve the score, revert and try the next check.
7. Stop when all checks pass or you've attempted the top 10.

### Quality standards
- Install real dependencies (npm install -D), not just config stubs
- Verify each fix by running the actual command
- No empty placeholders, no disabling checks, no metric gaming

### Safety
- Never commit secrets or remove existing tests
- If a mandatory gate (P2/P6) would regress, stop and report it
- If a fix requires domain knowledge you don't have, note it and skip to the next item`;
}

// Short assessment prompt for /readiness-report --agent.
// Instructs the agent to use readiness_check for per-check details instead of
// embedding all criterion descriptions in the prompt.
export function assessmentPromptFor(report: ReadinessReport): string {
  const failed = report.findings.filter((c) => !c.pass && !c.skipped);
  const skipped = report.findings.filter((c) => c.skipped);
  const passed = report.findings.filter((c) => c.pass && !c.skipped);
  const agentOnly = getAgentOnlyCriteria();
  const isMonorepo = Object.keys(report.apps).length > 1;

  const lang = report.repo.language;
  const langContext = lang !== 'unknown' ? `Language: ${lang}. ` : '';
  const appInfo = isMonorepo
    ? `\nMonorepo with ${Object.keys(report.apps).length} apps: ${Object.entries(report.apps)
        .map(([p, a]) => `${p} (${a.name})`)
        .join(', ')}.`
    : '';

  const agentOnlyNames = agentOnly.map((c) => `- ${c.droidId}`).join('\n');

  const skippedInfo =
    skipped.length > 0 ? `\nSkipped checks (${skipped.length}): ${skipped.map((s) => s.id).join(', ')}` : '';

  return `## Agent Readiness Assessment (read-only)

Current: ${report.level} (${report.overall}/100, droid pass rate: ${report.droidPassRate}%)
${langContext}Repo: ${report.repo.path}${appInfo}
Passing: ${passed.length} | Failing: ${failed.length} | Skipped: ${skipped.length}${skippedInfo}

**CRITICAL: DO NOT modify any files. This is an assessment-only evaluation.**

### Instructions
1. Call readiness_check with summary=true to see the failing checks list.
2. For each failing check, call readiness_check with checkId (e.g., checkId="P2.2") to get the full criterion description, evaluation instructions, evidence, and remediation action.
3. Run the actual command (e.g., \`npm test\`, \`npm run lint\`, \`tsc --noEmit\`, \`gh api ...\`) to verify it truly fails.
4. If it passes behaviorally, mark as FALSE POSITIVE.
5. Evaluate ${agentOnly.length} agent-only criteria (not checked by the deterministic engine):
${agentOnlyNames}
   For each, reason about the codebase and run verification commands. Mark as PASS, FAIL, or SKIP.

### Output Format
### Verification Results
- [check-id] CONFIRMED FAIL / FALSE POSITIVE — [evidence: command run + output summary]

### Agent-Only Criteria
- [droid-id] PASS / FAIL / SKIP — [evidence]

### Augmented Score
- Deterministic floor: ${report.overall}/100 (${report.level})
- False positives found: [count]
- Agent-only results: [N pass, N fail, N skip]
- Augmented score: [estimated] / 100
- Estimated level: [L0-L5]

### Action Items
- [specific, actionable recommendation]
- [specific, actionable recommendation]`;
}

// Short phased prompt for /readiness-full.
// Combines assessment + remediation in 4 phases, using readiness_check tool
// for iterative verification instead of embedding all context in one mega-prompt.
export function fullHybridPromptFor(report: ReadinessReport): string {
  const failed = report.findings.filter((c) => !c.pass && !c.skipped);
  const skipped = report.findings.filter((c) => c.skipped);
  const passed = report.findings.filter((c) => c.pass && !c.skipped);
  const agentOnly = getAgentOnlyCriteria();
  const isMonorepo = Object.keys(report.apps).length > 1;

  const lang = report.repo.language;
  const langContext = lang !== 'unknown' ? `Language: ${lang}. ` : '';
  const appInfo = isMonorepo
    ? `\nMonorepo with ${Object.keys(report.apps).length} apps: ${Object.entries(report.apps)
        .map(([p, a]) => `${p} (${a.name})`)
        .join(', ')}.`
    : '';

  const skippedInfo = skipped.length > 0 ? `\nSkipped: ${skipped.length} (${skipped.map((s) => s.id).join(', ')})` : '';

  const agentOnlyNames = agentOnly.map((c) => `- ${c.droidId}`).join('\n');

  return `## Agent Readiness Full Assessment + Remediation

Current: ${report.level} (${report.overall}/100, droid: ${report.droidPassRate}%)
${langContext}Repo: ${report.repo.path}${appInfo}
Passing: ${passed.length} | Failing: ${failed.length}${skippedInfo}

### Phase 1 — Assess
1. Call readiness_check with summary=true to see failing checks.
2. For each failing check, call readiness_check with checkId for full details (description, evaluation, remediation).
3. Run the actual command to verify it truly fails. If it passes behaviorally, mark as FALSE POSITIVE.
4. Evaluate ${agentOnly.length} agent-only criteria:
${agentOnlyNames}

### Phase 2 — Fix
1. Fix one check at a time, highest severity first.
2. After each fix, call readiness_check with summary=true to verify the check now passes.
3. Commit after each successful fix.
4. Install real dependencies (npm install -D), not just config stubs.
5. No empty placeholders, no disabling checks, no metric gaming.

### Phase 3 — Validate
Run: \`npm test && npm run lint && npm run typecheck\` (or equivalent for this repo's language).

### Phase 4 — Re-run
Call readiness_check with summary=true for the final delta.

### Safety
- Never commit secrets or remove existing tests
- If a mandatory gate (P2/P6) would regress, stop and report it

### Output Format
### Assessment Results
- [check-id] CONFIRMED FAIL / FALSE POSITIVE — [evidence]

### Agent-Only Criteria
- [droid-id] PASS / FAIL / SKIP — [evidence]

### Fixes Applied
- [check-id] Fixed by [action] — [verification: command + result]

### Score Delta
- Before: ${report.level} (${report.overall}/100, droid pass rate: ${report.droidPassRate}%)
- After: [new level] ([new overall]/100, droid pass rate: [new rate]%) — from readiness_check
- Improvement: [+N points / +N levels]

### Remaining Issues
- [check-id] [reason] — [suggested next step]`;
}
