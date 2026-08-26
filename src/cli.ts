// Minimal deterministic CLI for the agent-readiness engine.
// Usage: node --experimental-strip-types src/cli.ts <path> [--json] [--strict] [--fix] [--apply] [--agent] [--history] [--badge]
import { runReadiness, writeReport, renderMarkdown, MANDATORY } from './engine.ts';
import { draftsFor, writeFixes, agentPromptFor } from './fix.ts';
import { readHistory, trend } from './history.ts';
import { badgeMarkdown } from './badge.ts';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || process.cwd();
const json = args.includes('--json');
const strict = args.includes('--strict');
const fix = args.includes('--fix');
const apply = args.includes('--apply');
const agent = args.includes('--agent');
const hist = args.includes('--history');
const badge = args.includes('--badge');

const report = runReadiness(target, { model: process.env.PI_MODEL || 'cli', strict });

if (json) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  process.stdout.write(renderMarkdown(report));
}

// --badge: emit an inline markdown badge.
if (badge) process.stdout.write(badgeMarkdown(report) + '\n');

// --history: show trend vs previous run (chronological history; trend() vs last two).
if (hist) {
  const all = readHistory(target);
  const dt = trend(all, { report });
  process.stdout.write('\n## History (' + dt.count + ' run(s))\n');
  if (dt.count === 0) process.stdout.write('- no history yet\n');
  else {
    process.stdout.write('- current: ' + dt.to.level + ' / ' + dt.to.overall + ' @ ' + dt.to.date + '\n');
    process.stdout.write('- overall delta vs prev: ' + (dt.overallDelta === null ? 'n/a' : (dt.overallDelta >= 0 ? '+' : '') + dt.overallDelta) + '\n');
    if (dt.levelDelta && dt.levelDelta !== dt.to.level) process.stdout.write('- level: ' + dt.levelDelta + '\n');
  }
}

// --fix: draft remediation for high-priority failed checks (dry-run unless --apply).
// --fix --agent: drive an agent session with a grounded prompt instead of static drafts.
if (fix) {
  if (agent) {
    const prompt = agentPromptFor(report);
    // Try to delegate to pi; if not on PATH, print the prompt for manual use.
    const piCheck = spawnSync('pi', ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (piCheck.status === 0 || (piCheck.stderr && piCheck.stderr.length > 0)) {
      if (!json) process.stdout.write('\n## Agent remediation session\nLaunching pi with a grounded remediation prompt...\n');
      const res = spawnSync('pi', ['-p', prompt], { cwd: target, env: { ...process.env, PI_MODEL: process.env.PI_MODEL || '' }, encoding: 'utf8', timeout: 120000 });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      // Re-run readiness to show the delta.
      const postReport = runReadiness(target, { model: process.env.PI_MODEL || 'cli', strict });
      if (!json) process.stdout.write('\n## Post-fix readiness\n' + renderMarkdown(postReport));
    } else {
      if (json) process.stdout.write('\nAGENT_PROMPT=' + JSON.stringify(prompt) + '\n');
      else process.stdout.write('\n## Agent remediation prompt (pi not on PATH)\n\n' + prompt + '\n');
    }
  } else {
    const drafts = draftsFor(report, target);
    const dir = writeFixes(target, drafts, apply);
    if (json) process.stdout.write('\nFIX_DRAFTS=' + JSON.stringify({ dir, count: drafts.length, files: drafts.map((d) => d.file) }) + '\n');
    else { process.stdout.write('\n## Fix drafts -> ' + dir + '\n' + drafts.map((d) => '- ' + d.file + ' : ' + d.note).join('\n') + '\n'); }
  }
}

// --strict: exit non-zero if any mandatory scope (P2/P6) fails the gate.
if (strict) {
  const gateFail = MANDATORY.some((m) => (report.pillars[m]?.pct ?? 0) < 80);
  // persist report so CI/PR can diff
  try { writeReport(target, report); } catch { /* read-only ok */ }
  process.exit(gateFail ? 1 : 0);
}
