// agent-readiness pi extension: /readiness-report, /readiness-fix, readiness_check tool.
import { Type } from '@earendil-works/pi-ai';
import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';

// Engine lives at repo-root /src in dev, or bundled next to the extension in a package.
// Try both so the extension works in-repo AND when installed as a pi package.
async function loadEngine() {
  const here = new URL('.', import.meta.url).pathname; // .../.pi/extensions/agent-readiness/
  const candidates = [
    here + '../../../src/engine.ts',   // in-repo dev layout
    here + 'engine.ts',                // bundled package layout
  ];
  for (const c of candidates) {
    try { return await import(c); } catch { /* try next */ }
  }
  throw new Error('agent-readiness engine not found (tried ' + candidates.join(', ') + ')');
}

export default function (pi: ExtensionAPI) {
  const reportCommand = async (args: string, ctx: any) => {
    const target = (args && args.trim()) || ctx.cwd;
    const engine = await loadEngine();
    const report = engine.runReadiness(target, { model: ctx.model?.id || 'pi' });
    const dir = engine.writeReport(target, report);
    ctx.ui.notify(`Readiness ${report.level} (${report.overall}/100) -> ${dir}`, report.level !== 'L0' ? 'info' : 'warning');
    return engine.renderMarkdown(report);
  };

  pi.registerCommand('readiness-report', {
    description: 'Run the agent-readiness audit and write a report (level, per-pillar, punchlist).',
    handler: reportCommand,
  });

  pi.registerCommand('readiness-fix', {
    description: 'Run an agent session to remediate failing readiness checks (grounded by the latest report).',
    handler: async (args, ctx) => {
      const target = (args && args.trim()) || ctx.cwd;
      const engine = await loadEngine();
      const report = engine.runReadiness(target, { model: ctx.model?.id || 'pi' });
      // Build the grounded remediation prompt from the report's punchlist.
      const prompt = engine.agentPromptFor(report);
      // Delegate to the agent: it reads the prompt, plans, and implements fixes.
      // The user reviews changes as they happen (normal pi session flow).
      ctx.ui.notify(`Readiness-fix: ${report.punchlist.length} failing checks. Delegating to agent session.`, 'info');
      return prompt;
    },
  });

  const readinessCheck = defineTool({
    name: 'readiness_check',
    label: 'Readiness Check',
    description: 'Run the deterministic agent-readiness audit on a repo path and return level, overall score, per-pillar scores, and punchlist.',
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: 'Repo path to audit (defaults to cwd)' })),
      strict: Type.Optional(Type.Boolean({ description: 'Treat missing mandatory scopes as failure' })),
    }),
    async execute(_id, params, _sig, _up, ctx) {
      const target = params.path || ctx.cwd;
      const engine = await loadEngine();
      const report = engine.runReadiness(target, { model: ctx.model?.id || 'pi', strict: params.strict });
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
        details: { level: report.level, overall: report.overall },
      };
    },
  });
  pi.registerTool(readinessCheck);
}
