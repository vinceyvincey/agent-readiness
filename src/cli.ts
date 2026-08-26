// Minimal deterministic CLI for the agent-readiness engine.
// Usage: node --experimental-strip-types src/cli.ts <path> [--json] [--strict] [--fix] [--apply] [--agent] [--history] [--badge] [--verify] [--droid-scoring] [--model <id>] [--timeout <sec>]
//
// Modes:
//   (default)         Deterministic only (fast, ~3s)
//   --agent            Hybrid assessment: deterministic floor + agent verifies findings + discovers agent-only criteria (~100-300s)
//   --fix              Static remediation drafts (dry-run)
//   --fix --agent      Agent-driven remediation (runs agentPromptFor via droid/pi)
//   --verify           Runtime verification: actually runs commands to verify configs work
//   --strict           CI gate: exit 1 if mandatory pillars (P2/P6) fail
//   --droid-scoring    Use Droid's flat pass rate for level calculation
//
// Model control:
//   --model <id>       Model ID for agentic modes (default: claude-opus-5, or PI_MODEL env var)
//                      Passed to droid exec via -m, or to pi via PI_MODEL env var.
//                      Examples: claude-opus-5, claude-sonnet-4, gpt-4o, gemini-2.5-pro
import { runReadiness, writeReport, renderMarkdown, MANDATORY } from './engine.ts';
import { draftsFor, writeFixes, agentPromptFor, assessmentPromptFor } from './fix.ts';
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
const verify = args.includes('--verify');
const droidScoring = args.includes('--droid-scoring');

// Model control: --model <id> or --model=<id>, default to PI_MODEL env or droid's default (claude-opus-5)
const modelArg = args.find(a => a.startsWith('--model'));
const modelId = modelArg
  ? (modelArg.includes('=') ? modelArg.split('=')[1] : args[args.indexOf(modelArg) + 1])
  : (process.env.PI_MODEL || 'claude-opus-5');

// Timeout for agentic modes: --timeout=<sec> or --timeout <sec>, default 300
const timeoutArg = args.find(a => a.startsWith('--timeout'));
const timeoutSec = timeoutArg
  ? parseInt(timeoutArg.includes('=') ? timeoutArg.split('=')[1] : args[args.indexOf(timeoutArg) + 1] || '300', 10)
  : 300;

const report = runReadiness(target, { model: modelId, strict, verify, droidScoring });

// Helper: build droid exec args with model flag
function droidExecArgs(prompt: string, auto: string = 'high'): string[] {
  return ['exec', prompt, '--auto', auto, '--model', modelId];
}

// --agent (without --fix): hybrid assessment mode.
// Runs assessmentPromptFor via droid exec, then shows augmented results.
if (agent && !fix) {
  const prompt = assessmentPromptFor(report);

  // Try droid exec first (what the side-by-side harness uses), then pi as fallback.
  const droidCheck = spawnSync('droid', ['--version'], { encoding: 'utf8', timeout: 3000 });
  const droidAvailable = droidCheck.status === 0 || (droidCheck.stderr && droidCheck.stderr.length > 0);

  if (droidAvailable) {
    if (!json) process.stdout.write(renderMarkdown(report) + `\n## Agent Assessment (hybrid mode, model: ${modelId})\nRunning assessmentPromptFor via droid exec...\n\n`);
    const res = spawnSync('droid', droidExecArgs(prompt), {
      cwd: target, encoding: 'utf8', timeout: timeoutSec * 1000, env: { ...process.env },
    });
    const agentOutput = (res.stdout || '') + (res.stderr || '');

    if (json) {
      // Output the deterministic report + agent output as JSON
      process.stdout.write(JSON.stringify({
        ...report,
        agentAssessment: {
          prompt,
          model: modelId,
          output: agentOutput,
          error: res.error?.message || (res.status !== 0 ? `droid exec exited with status ${res.status}` : undefined),
        },
      }, null, 2) + '\n');
    } else {
      // Print agent output, then summarize
      process.stdout.write('### Agent Output\n\n' + agentOutput + '\n');

      // Parse agent output for agent-only criteria mentions and false positive findings
      const agentOnlyIds = ['devcontainer_runnable', 'n_plus_one_detection', 'interactive_qa_runnable'];
      const mentioned = agentOnlyIds.filter(id => agentOutput.toLowerCase().includes(id.toLowerCase()));
      const falsePositives = (agentOutput.match(/false.?positive|VERIFIED.*PASS|actually passes/i) || []).length;

      process.stdout.write('\n### Hybrid Summary\n');
      process.stdout.write(`- Deterministic floor: ${report.overall}/100 (${report.level})\n`);
      process.stdout.write(`- Droid-compatible pass rate: ${report.droidPassRate}%\n`);
      process.stdout.write(`- Model: ${modelId}\n`);
      process.stdout.write(`- Agent-only criteria discovered: ${mentioned.length}/3 (${mentioned.join(', ') || 'none'})\n`);
      process.stdout.write(`- False positive indicators: ${falsePositives}\n`);
      if (res.error) process.stdout.write(`- Agent error: ${res.error.message}\n`);
      process.stdout.write(`- Note: Agent assessment augments the deterministic floor with runtime verification and agent-only criteria evaluation.\n`);
    }
  } else {
    // Fallback: try pi with PI_MODEL env var
    const piCheck = spawnSync('pi', ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (piCheck.status === 0 || (piCheck.stderr && piCheck.stderr.length > 0)) {
      if (!json) process.stdout.write(renderMarkdown(report) + `\n## Agent Assessment (hybrid mode via pi, model: ${modelId})\n\n`);
      const res = spawnSync('pi', ['-p', prompt], { cwd: target, env: { ...process.env, PI_MODEL: modelId }, encoding: 'utf8', timeout: timeoutSec * 1000 });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
    } else {
      // Neither droid nor pi available — print prompt for manual use
      if (json) process.stdout.write(JSON.stringify({ ...report, agentPrompt: prompt, model: modelId }) + '\n');
      else process.stdout.write(renderMarkdown(report) + `\n## Agent Assessment Prompt (droid/pi not on PATH)\n\n_Use with: droid exec -m ${modelId} --auto high <prompt-file>_\n\n` + prompt + '\n');
    }
  }
} else {
  // Default: deterministic only
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(renderMarkdown(report));
  }
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
    // Try droid exec first, then pi as fallback.
    const droidCheck = spawnSync('droid', ['--version'], { encoding: 'utf8', timeout: 3000 });
    const droidAvailable = droidCheck.status === 0 || (droidCheck.stderr && droidCheck.stderr.length > 0);

    if (droidAvailable) {
      if (!json) process.stdout.write(`\n## Agent remediation session (model: ${modelId})\nLaunching droid exec with a grounded remediation prompt...\n`);
      const res = spawnSync('droid', droidExecArgs(prompt), { cwd: target, encoding: 'utf8', timeout: timeoutSec * 1000, env: { ...process.env } });
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      // Re-run readiness to show the delta.
      const postReport = runReadiness(target, { model: modelId, strict });
      if (!json) process.stdout.write('\n## Post-fix readiness\n' + renderMarkdown(postReport));
    } else {
      const piCheck = spawnSync('pi', ['--version'], { encoding: 'utf8', timeout: 3000 });
      if (piCheck.status === 0 || (piCheck.stderr && piCheck.stderr.length > 0)) {
        if (!json) process.stdout.write(`\n## Agent remediation session (via pi, model: ${modelId})\n`);
        const res = spawnSync('pi', ['-p', prompt], { cwd: target, env: { ...process.env, PI_MODEL: modelId }, encoding: 'utf8', timeout: timeoutSec * 1000 });
        if (res.stdout) process.stdout.write(res.stdout);
        if (res.stderr) process.stderr.write(res.stderr);
        const postReport = runReadiness(target, { model: modelId, strict });
        if (!json) process.stdout.write('\n## Post-fix readiness\n' + renderMarkdown(postReport));
      } else {
        if (json) process.stdout.write('\nAGENT_PROMPT=' + JSON.stringify({ prompt, model: modelId }) + '\n');
        else process.stdout.write(`\n## Agent remediation prompt (droid/pi not on PATH)\n\n_Use with: droid exec -m ${modelId} --auto high <prompt-file>_\n\n` + prompt + '\n');
      }
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
