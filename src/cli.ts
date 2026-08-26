// Minimal deterministic CLI for the agent-readiness engine.
// Usage: node --experimental-strip-types src/cli.ts <path> [--json] [--strict]
import { runReadiness, writeReport, renderMarkdown, MANDATORY } from './engine.ts';
import { draftsFor, writeFixes } from './fix.ts';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || process.cwd();
const json = args.includes('--json');
const strict = args.includes('--strict');
const fix = args.includes('--fix');
const apply = args.includes('--apply');

const report = runReadiness(target, { model: process.env.PI_MODEL || 'cli', strict });

if (json) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  process.stdout.write(renderMarkdown(report));
}

// --fix: draft remediation for high-priority failed checks (dry-run unless --apply).
if (fix) {
  const drafts = draftsFor(report, target);
  const dir = writeFixes(target, drafts, apply);
  if (json) process.stdout.write('\nFIX_DRAFTS=' + JSON.stringify({ dir, count: drafts.length, files: drafts.map((d) => d.file) }) + '\n');
  else { process.stdout.write('\n## Fix drafts -> ' + dir + '\n' + drafts.map((d) => '- ' + d.file + ' : ' + d.note).join('\n') + '\n'); }
}

// --strict: exit non-zero if any mandatory scope (P2/P6) fails the gate.
if (strict) {
  const gateFail = MANDATORY.some((m) => (report.pillars[m]?.pct ?? 0) < 80);
  // persist report so CI/PR can diff
  try { writeReport(target, report); } catch { /* read-only ok */ }
  process.exit(gateFail ? 1 : 0);
}
