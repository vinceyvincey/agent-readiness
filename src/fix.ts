// --fix remediation: draft concrete file contents for the highest-priority failed checks.
// Writes into <target>/.agent-readiness/fix/ (git-ignored) by default; does NOT touch
// tracked files unless `apply` is true. This keeps write-safety (dry-run default).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReadinessReport } from './engine.ts';

export interface FixDraft { file: string; content: string; note: string; }

// Map a failed check id to a concrete draft file.
export function draftsFor(report: ReadinessReport, target: string): FixDraft[] {
  const out: FixDraft[] = [];
  const failed = new Set(report.findings.filter((c) => !c.pass).map((c) => c.id));
  const add = (file: string, content: string, note: string) =>
    out.push({ file, content: content.trim() + '\n', note });

  // P1.1 / P1.2 -> AGENTS.md
  if (failed.has('P1.1') || failed.has('P1.2')) {
    add('AGENTS.md', `# Agent instructions

Working here, you must:
- Always run the project's tests and linter before finishing.
- Never commit secrets; keep .env out of git.
- Follow the existing module structure and naming conventions.
- Prefer small, reviewable changes over large rewrites.
`, 'Create/replace AGENTS.md with enforceable behavior rules.');
  }
  // P2.1 / P2.2 / P2.3 -> test scaffold
  if (failed.has('P2.1') || failed.has('P2.2') || failed.has('P2.3')) {
    add('test/fixture.test.ts', `import { describe, it, expect } from 'vitest';
// Replace with a real test of the project's core behavior.
describe('core', () => { it('works', () => { expect(true).toBe(true); }); });`, 'Scaffold a test dir + a runner so a run-test one-liner exists.');
  }
  // P3.1 -> lockfile note
  if (failed.has('P3.1')) {
    add('README.md', `\n## Reproducibility\nCommit a lockfile (package-lock.json / poetry.lock / go.sum) for deterministic installs.`, 'Commit a lockfile for reproducible builds.');
  }
  // P4.1 -> CI workflow
  if (failed.has('P4.1')) {
    add('.github/workflows/ci.yml', `name: CI\non:\n  push:\n  pull_request:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo 'Add your build + test + lint steps here'`, 'Add a CI workflow that builds, tests, and lints.');
  }
  // P6.1 -> gitignore hardening
  if (failed.has('P6.1')) {
    add('.gitignore', `# Secrets\n.env\n.env.*\n*.pem\n*.key\n# Caches / build\nnode_modules/\ndist/\n.cache/\n.agent-readiness/\n*.log`, 'Harden .gitignore to cover secrets and caches.');
  }
  // P8.1 -> .env.example
  if (failed.has('P8.1')) {
    add('.env.example', `# Required environment variables (fill real values locally, never commit)\n# DATABASE_URL=postgres://user:pass@localhost:5432/db\n# API_KEY=`, 'Add .env.example listing required env vars.');
  }
  // P0.2 -> README usage note
  if (failed.has('P0.2')) {
    add('README-usage-note.md', `Add a Usage / Quickstart section to the README describing how to run and verify this project.`, 'Add a run/usage section to README.');
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

// M9: Build a grounded agentic remediation prompt from the report's punchlist.
// This is the single source the extension and CLI both use to drive agent-driven fixes.
export function agentPromptFor(report: ReadinessReport): string {
  const failed = report.findings.filter((c) => !c.pass);
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  const sorted = failed.sort((a, b) =>
    (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) ||
    (diffRank[a.difficulty || 'intermediate'] ?? 1) - (diffRank[b.difficulty || 'intermediate'] ?? 1)
  );

  const items = sorted.slice(0, 15).map((c) =>
    `- [${c.severity}/${c.difficulty || 'intermediate'}] ${c.pillar} ${c.id}: ${c.evidence}${c.app ? ` (app: ${c.app})` : ''}`
  ).join('\n');

  const appInfo = Object.keys(report.apps).length > 1
    ? `\n\nThis is a monorepo with ${Object.keys(report.apps).length} applications: ${Object.entries(report.apps).map(([p, a]) => `${p} (${a.name})`).join(', ')}. Apply app-scoped fixes to the correct app directory.`
    : '';

  return `You are remediating agent-readiness failures in a codebase.

Current readiness: ${report.level} (${report.overall}/100), rubric ${report.rubric_version}.

The following checks are failing, sorted by severity then difficulty (cheapest high-impact fixes first):

${items}${appInfo}

Instructions:
1. Work through the failing checks from top to bottom (highest severity, easiest difficulty first).
2. For each check, create or modify the specific file(s) needed to pass it. Use the evidence as a guide.
3. Only touch files that are directly relevant to a failing check — do not refactor unrelated code.
4. After applying fixes, re-run the readiness engine to verify the score improved:
   node --experimental-strip-types src/cli.ts . --json
5. If a mandatory gate (P2 testing or P6 security) would regress from your change, stop and report it.
6. Prefer project-specific, real content over generic templates. Read existing code to match conventions.
7. For AGENTS.md, include backtick-quoted commands that match the project's actual scripts.

Safety:
- Default to dry-run: show proposed changes before applying.
- Never commit secrets or remove existing tests.
- If a fix requires domain knowledge you don't have, note it and skip to the next item.`;
}
