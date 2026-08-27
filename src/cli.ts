// Minimal deterministic CLI for the agent-readiness engine.
// Usage: node --experimental-strip-types src/cli.ts <path> [--json] [--strict] [--fix] [--apply] [--agent] [--history] [--badge] [--verify] [--droid-scoring] [--model <id>] [--timeout <sec>]
//
// Modes:
//   (default)         Deterministic only (fast, ~3s)
//   --agent            Hybrid assessment: deterministic floor + pi agent verifies findings + discovers agent-only criteria
//   --fix              Static remediation drafts (dry-run)
//   --fix --agent      Agent-driven remediation (runs agentPromptFor via pi)
//   --verify           Runtime verification: actually runs commands to verify configs work
//   --strict           CI gate: exit 1 if mandatory pillars (P2/P6) fail
//   --droid-scoring    Use Droid's flat pass rate for level calculation
//   --no-html           Skip the visual HTML report
//   --open              Open the HTML report in the default browser
//
// Model control:
//   --model <id>       Model ID for agentic modes (default: PI_MODEL env var, or 'default')
//                      Passed to pi via PI_MODEL env var.
//                      Examples: claude-sonnet-4, gpt-4o, gemini-2.5-pro
import { runReadiness, writeReport, renderMarkdown, MANDATORY } from './engine.ts';
import { draftsFor, writeFixes, agentPromptFor, assessmentPromptFor } from './fix.ts';
import { readHistory, trend } from './history.ts';
import { badgeMarkdown } from './badge.ts';
import { spawnSync, spawn } from 'node:child_process';
import * as path from 'node:path';
import { resolveFlags } from './flags.ts';

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
const noHtml = args.includes('--no-html');
const open = args.includes('--open');

// Model control: --model <id> or --model=<id>, default to PI_MODEL env var
const modelArg = args.find((a) => a.startsWith('--model'));
const modelId = modelArg
  ? modelArg.includes('=')
    ? modelArg.split('=')[1]
    : args[args.indexOf(modelArg) + 1]
  : process.env.PI_MODEL || 'default';

// Timeout for agentic modes: --timeout=<sec> or --timeout <sec>, default 300
const timeoutArg = args.find((a) => a.startsWith('--timeout'));
const timeoutSec = timeoutArg
  ? parseInt(timeoutArg.includes('=') ? timeoutArg.split('=')[1] : args[args.indexOf(timeoutArg) + 1] || '300', 10)
  : 300;

const report = runReadiness(target, { model: modelId, strict, verify, droidScoring });

// Feature flags (P4.14): repo-local, evaluated via GrowthBook; see src/flags.ts.
const flags = resolveFlags({ repoRoot: path.resolve(target) });

// Helper: check if pi CLI is available
function piAvailable(): boolean {
  try {
    const res = spawnSync('pi', ['--version'], { encoding: 'utf8', timeout: 3000 });
    return res.status === 0 || (!!res.stderr && res.stderr.length > 0);
  } catch {
    return false;
  }
}

// Helper: run a prompt via pi agent with the configured model
function runPiAgent(
  prompt: string,
  cwd: string,
): { stdout: string; stderr: string; error?: string; status: number | null } {
  const env = { ...process.env, PI_MODEL: modelId };
  const res = spawnSync('pi', ['-p', prompt], { cwd, env, encoding: 'utf8', timeout: timeoutSec * 1000 });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.error?.message,
    status: res.status,
  };
}

// Helper: run a prompt via pi agent with streaming output (async).
// Pipes pi's stdout/stderr directly to the parent process so output is visible
// in real time during long agent sessions.
function runPiAgentAsync(prompt: string, cwd: string, timeoutSec: number): Promise<{ status: number | null }> {
  return new Promise((resolve) => {
    const env = { ...process.env, PI_MODEL: modelId };
    const child = spawn('pi', ['-p', prompt], { cwd, env, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutSec * 1000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ status: code });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ status: 1 });
    });
  });
}

// --agent (without --fix): hybrid assessment mode.
// Runs assessmentPromptFor via pi agent, then shows augmented results.
if (agent && !fix) {
  const prompt = assessmentPromptFor(report);

  if (piAvailable()) {
    if (!json)
      process.stdout.write(
        renderMarkdown(report) +
          `\n## Agent Assessment (hybrid mode, model: ${modelId})\nRunning assessmentPromptFor via pi agent...\n\n`,
      );
    const result = runPiAgent(prompt, target);
    const agentOutput = result.stdout + result.stderr;

    if (json) {
      process.stdout.write(
        JSON.stringify(
          {
            ...report,
            agentAssessment: {
              prompt,
              model: modelId,
              output: agentOutput,
              error: result.error || (result.status !== 0 ? `pi exited with status ${result.status}` : undefined),
            },
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      process.stdout.write('### Agent Output\n\n' + agentOutput + '\n');

      // Parse agent output for agent-only criteria mentions and false positive findings
      const agentOnlyIds = ['devcontainer_runnable', 'n_plus_one_detection', 'interactive_qa_runnable'];
      const mentioned = agentOnlyIds.filter((id) => agentOutput.toLowerCase().includes(id.toLowerCase()));
      const falsePositives = (agentOutput.match(/false.?positive|VERIFIED.*PASS|actually passes/i) || []).length;

      process.stdout.write('\n### Hybrid Summary\n');
      process.stdout.write(`- Deterministic floor: ${report.overall}/100 (${report.level})\n`);
      process.stdout.write(`- Droid-compatible pass rate: ${report.droidPassRate}%\n`);
      process.stdout.write(`- Model: ${modelId}\n`);
      process.stdout.write(
        `- Agent-only criteria discovered: ${mentioned.length}/3 (${mentioned.join(', ') || 'none'})\n`,
      );
      process.stdout.write(`- False positive indicators: ${falsePositives}\n`);
      if (result.error) process.stdout.write(`- Agent error: ${result.error}\n`);
      process.stdout.write(
        `- Note: Agent assessment augments the deterministic floor with runtime verification and agent-only criteria evaluation.\n`,
      );
    }
  } else {
    // pi not on PATH — print prompt for manual use
    if (json) process.stdout.write(JSON.stringify({ ...report, agentPrompt: prompt, model: modelId }) + '\n');
    else
      process.stdout.write(
        renderMarkdown(report) +
          `\n## Agent Assessment Prompt (pi not on PATH)\n\n_Use with: PI_MODEL=${modelId} pi -p <prompt-file>_\n\n` +
          prompt +
          '\n',
      );
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
    process.stdout.write(
      '- overall delta vs prev: ' +
        (dt.overallDelta === null ? 'n/a' : (dt.overallDelta >= 0 ? '+' : '') + dt.overallDelta) +
        '\n',
    );
    if (dt.levelDelta && dt.levelDelta !== dt.to.level) process.stdout.write('- level: ' + dt.levelDelta + '\n');
  }
}

// --fix: draft remediation for high-priority failed checks (dry-run unless --apply).
// --fix --agent: drive a pi agent session with a grounded prompt instead of static drafts.
if (fix) {
  if (agent && !flags.isOn('remediation.agent-apply')) {
    // Gated risky path: agent-driven remediation mutates the target repo.
    if (!json)
      process.stdout.write(`\n## Agent remediation skipped: feature flag 'remediation.agent-apply' is disabled\n`);
  } else if (agent) {
    const prompt = agentPromptFor(report);
    if (piAvailable()) {
      if (!json)
        process.stdout.write(
          `\n## Agent remediation session (model: ${modelId})\nLaunching pi agent with a grounded remediation prompt...\n`,
        );
      await runPiAgentAsync(prompt, target, timeoutSec);
      // Re-run readiness to show the delta.
      const postReport = runReadiness(target, { model: modelId, strict });
      if (!json) process.stdout.write('\n## Post-fix readiness\n' + renderMarkdown(postReport));
    } else {
      if (json) process.stdout.write('\nAGENT_PROMPT=' + JSON.stringify({ prompt, model: modelId }) + '\n');
      else
        process.stdout.write(
          `\n## Agent remediation prompt (pi not on PATH)\n\n_Use with: PI_MODEL=${modelId} pi -p <prompt-file>_\n\n` +
            prompt +
            '\n',
        );
    }
  } else {
    const drafts = draftsFor(report, target);
    const dir = writeFixes(target, drafts, apply);
    if (json)
      process.stdout.write(
        '\nFIX_DRAFTS=' + JSON.stringify({ dir, count: drafts.length, files: drafts.map((d) => d.file) }) + '\n',
      );
    else {
      process.stdout.write(
        '\n## Fix drafts -> ' + dir + '\n' + drafts.map((d) => '- ' + d.file + ' : ' + d.note).join('\n') + '\n',
      );
    }
  }
}

// Always persist artifacts (json + md + visual html) into .agent-readiness/.
let htmlPath = '';
try {
  const dir = writeReport(target, report, undefined, { html: !noHtml });
  htmlPath = path.join(dir, 'report.html');
  if (!json && !noHtml)
    process.stdout.write(
      '\n## Report artifacts\n- ' + dir + '/report.json\n- ' + dir + '/report.md\n- ' + htmlPath + '\n',
    );
} catch {
  /* read-only target ok */
}

// --open: best-effort open the HTML report in the default browser.
if (open && htmlPath && flags.isOn('ui.auto-open-report')) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawnSync(cmd, [htmlPath], { stdio: 'ignore' });
  } catch {
    /* best-effort */
  }
}

// --strict: exit non-zero if any mandatory scope (P2/P6) fails the gate.
if (strict) {
  const gateFail = MANDATORY.some((m) => (report.pillars[m]?.pct ?? 0) < 80);
  process.exit(gateFail ? 1 : 0);
}
