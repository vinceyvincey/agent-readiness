// agent-readiness pi extension: /readiness-report, /readiness-fix, readiness_check tool.
import { Type } from '@earendil-works/pi-ai';
import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { runReadiness, writeReport, renderMarkdown } from '../../../src/engine.ts';

export default function (pi: ExtensionAPI) {
  const reportCommand = async (args: string, ctx: any) => {
    const target = (args && args.trim()) || ctx.cwd;
    const report = runReadiness(target, { model: ctx.model?.id || 'pi' });
    const dir = writeReport(target, report);
    ctx.ui.notify(`Readiness ${report.level} (${report.overall}/100) -> ${dir}`, report.level !== 'L0' ? 'info' : 'warning');
    return renderMarkdown(report);
  };

  pi.registerCommand('readiness-report', {
    description: 'Run the agent-readiness audit and write a report (level, per-pillar, punchlist).',
    handler: reportCommand,
  });

  pi.registerCommand('readiness-fix', {
    description: 'Show the high-priority remediation punchlist to apply.',
    handler: async (args, ctx) => {
      const target = (args && args.trim()) || ctx.cwd;
      const report = runReadiness(target, { model: ctx.model?.id || 'pi' });
      const top = report.punchlist.filter((p: any) => p.severity === 'high').slice(0, 5);
      if (!top.length) { ctx.ui.notify('No high-priority remediation needed.', 'info'); return 'No high-priority remediation.'; }
      return top.map((p: any) => `[${p.pillar} ${p.id}] ${p.action}`).join('\n');
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
      const report = runReadiness(target, { model: ctx.model?.id || 'pi', strict: params.strict });
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
        details: { level: report.level, overall: report.overall },
      };
    },
  });
  pi.registerTool(readinessCheck);
}
