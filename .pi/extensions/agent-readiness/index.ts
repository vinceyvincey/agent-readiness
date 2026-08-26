// agent-readiness pi extension: /readiness-report, /readiness-fix, /readiness-full, readiness_check tool.
import { Type } from '@earendil-works/pi-ai';
import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

// Engine + fix modules live at repo-root /src in dev, or bundled next to the extension in a package.
// Try both so the extension works in-repo AND when installed as a pi package.
async function loadModule(name: string): Promise<any> {
  const here = new URL('.', import.meta.url).pathname; // .../.pi/extensions/agent-readiness/
  const candidates = [
    here + `../../../src/${name}.ts`,   // in-repo dev layout
    here + `${name}.ts`,                // bundled package layout
  ];
  for (const c of candidates) {
    try { return await import(c); } catch { /* try next */ }
  }
  throw new Error(`agent-readiness ${name} not found (tried ${candidates.join(', ')})`);
}

async function loadEngine() { return loadModule('engine'); }
async function loadFix() { return loadModule('fix'); }

// Parse flags from command args string (e.g. "/readiness-report --verify --droid-scoring ./repo").
// Returns { target, flags } where target is the non-flag argument and flags is a Set of flag names.
function parseArgs(args: string): { target: string; flags: Set<string> } {
  const parts = (args || '').trim().split(/\s+/).filter(Boolean);
  const flags = new Set<string>();
  let target = '';
  for (const p of parts) {
    if (p.startsWith('--')) flags.add(p.replace(/^--/, ''));
    else target = p;
  }
  return { target, flags };
}

export default function (pi: ExtensionAPI) {
  // /readiness-report [--verify] [--droid-scoring] [--strict] [path]
  // Runs the deterministic engine, optionally with runtime verification and/or Droid scoring.
  pi.registerCommand('readiness-report', {
    description: 'Run the agent-readiness audit and write a report (markdown + JSON + visual HTML). Flags: --verify (runtime verification), --droid-scoring (flat pass rate), --strict (CI gate).',
    handler: async (args: string, ctx: any) => {
      const { target: rawTarget, flags } = parseArgs(args);
      const target = rawTarget || ctx.cwd;
      const engine = await loadEngine();
      const report = engine.runReadiness(target, {
        model: ctx.model?.id || 'pi',
        verify: flags.has('verify'),
        droidScoring: flags.has('droid-scoring'),
        strict: flags.has('strict'),
      });
      const dir = engine.writeReport(target, report);
      ctx.ui.notify(
        `Readiness ${report.level} (${report.overall}/100, droid pass rate: ${report.droidPassRate}%) -> ${dir}/report.html`,
        report.level !== 'L0' ? 'info' : 'warning',
      );
      return engine.renderMarkdown(report);
    },
  });

  // /readiness-fix [--verify] [path]
  // Runs the deterministic engine, then returns a grounded remediation prompt for the agent.
  pi.registerCommand('readiness-fix', {
    description: 'Run an agent session to remediate failing readiness checks (grounded by the latest report). Flags: --verify (runtime verification first).',
    handler: async (args: string, ctx: any) => {
      const { target: rawTarget, flags } = parseArgs(args);
      const target = rawTarget || ctx.cwd;
      const engine = await loadEngine();
      const fix = await loadFix();
      const report = engine.runReadiness(target, {
        model: ctx.model?.id || 'pi',
        verify: flags.has('verify'),
      });
      const prompt = fix.agentPromptFor(report);
      ctx.ui.notify(
        `Readiness-fix: ${report.punchlist.length} failing checks${flags.has('verify') ? ' (runtime-verified)' : ''}. Delegating to agent session.`,
        'info',
      );
      return prompt;
    },
  });

  // /readiness-full [--verify] [--droid-scoring] [path]
  // Full hybrid: deterministic floor + runtime verification + agent assessment + agent remediation.
  // Returns a combined prompt that instructs pi to verify findings, discover agent-only criteria,
  // implement fixes, validate, and re-run for a delta.
  pi.registerCommand('readiness-full', {
    description: 'Full hybrid assessment + fix: deterministic floor with runtime verification, agent assessment of findings and agent-only criteria, agent-driven remediation, and delta re-run. Flags: --verify (runtime verification, default on), --droid-scoring (flat pass rate).',
    handler: async (args: string, ctx: any) => {
      const { target: rawTarget, flags } = parseArgs(args);
      const target = rawTarget || ctx.cwd;
      const engine = await loadEngine();
      const fix = await loadFix();

      // --verify is default on for /readiness-full (can be disabled with --no-verify)
      const useVerify = !flags.has('no-verify');

      const report = engine.runReadiness(target, {
        model: ctx.model?.id || 'pi',
        verify: useVerify,
        droidScoring: flags.has('droid-scoring'),
      });

      // Write report artifacts.
      const dir = engine.writeReport(target, report);

      // Build the combined assessment + remediation prompt.
      const prompt = fix.fullHybridPromptFor(report);

      const failedCount = report.findings.filter((c) => !c.pass && !c.skipped).length;
      const skippedCount = report.findings.filter((c) => c.skipped).length;
      ctx.ui.notify(
        `Readiness-full: ${report.level} (${report.overall}/100, droid: ${report.droidPassRate}%). ${failedCount} failing, ${skippedCount} skipped. Full hybrid prompt ready.`,
        'info',
      );

      // Return the deterministic report summary + the combined prompt.
      // Pi's agent loop will read this and execute the 4 phases (assess, fix, validate, re-run).
      return `${engine.renderMarkdown(report)}

---

## Full Hybrid Prompt (agent execution)

${prompt}`;
    },
  });

  // readiness_check tool — deterministic check callable by the agent at any time.
  const readinessCheck = defineTool({
    name: 'readiness_check',
    label: 'Readiness Check',
    description: 'Run the deterministic agent-readiness audit on a repo path and return level, overall score, per-pillar scores, and punchlist.',
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: 'Repo path to audit (defaults to cwd)' })),
      strict: Type.Optional(Type.Boolean({ description: 'Treat missing mandatory scopes as failure' })),
      verify: Type.Optional(Type.Boolean({ description: 'Run runtime verification (actually run test/lint/build commands)' })),
    }),
    async execute(_id, params, _sig, _up, ctx) {
      const target = params.path || ctx.cwd;
      const engine = await loadEngine();
      const report = engine.runReadiness(target, {
        model: ctx.model?.id || 'pi',
        strict: params.strict,
        verify: params.verify,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
        details: { level: report.level, overall: report.overall, droidPassRate: report.droidPassRate },
      };
    },
  });
  pi.registerTool(readinessCheck);
}
