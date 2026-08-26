// M12: tests for the 84-criterion registry.
import { CRITERIA_REGISTRY, getCriterionByPiId, getCriterionByDroidId, getAgentOnlyCriteria, getPiMappedCriteria } from '../src/criteria-registry.ts';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log('FAIL', label, 'got', got, 'want', want); }
  else console.log('ok', label);
};

// Registry completeness
eq('registry has 84 entries', CRITERIA_REGISTRY.length, 84);
eq('all entries have droidId', CRITERIA_REGISTRY.every(c => c.droidId.length > 0), true);
eq('all entries have name', CRITERIA_REGISTRY.every(c => c.name.length > 0), true);
eq('all entries have description', CRITERIA_REGISTRY.every(c => c.description.length > 0), true);
eq('all entries have evaluation', CRITERIA_REGISTRY.every(c => c.evaluation.length > 0), true);
eq('all entries have valid scope', CRITERIA_REGISTRY.every(c => c.scope === 'repo' || c.scope === 'app'), true);
eq('all entries have valid level', CRITERIA_REGISTRY.every(c => c.level >= 1 && c.level <= 5), true);

// Pi mapping
const piMapped = getPiMappedCriteria();
const agentOnly = getAgentOnlyCriteria();
eq('pi-mapped + agent-only = 84', piMapped.length + agentOnly.length, 84);
eq('agent-only count is 7', agentOnly.length, 7);
eq('pi-mapped count is 77', piMapped.length, 77);
eq('agent-only has no piId', agentOnly.every(c => c.piId === null), true);
eq('pi-mapped has piId', piMapped.every(c => c.piId !== null), true);

// Lookup functions
eq('getCriterionByPiId P5.1 finds lint_config', getCriterionByPiId('P5.1')?.droidId, 'lint_config');
eq('getCriterionByPiId P5.6 finds strict_typing', getCriterionByPiId('P5.6')?.droidId, 'strict_typing');
eq('getCriterionByPiId P4.6 finds issue_templates', getCriterionByPiId('P4.6')?.droidId, 'issue_templates');
eq('getCriterionByDroidId lint_config finds P5.1', getCriterionByDroidId('lint_config')?.piId, 'P5.1');
eq('getCriterionByDroidId branch_protection has P6.6', getCriterionByDroidId('branch_protection')?.piId, 'P6.6');
eq('getCriterionByPiId unknown returns undefined', getCriterionByPiId('P99.9'), undefined);

// Spot-check known mappings
eq('readme maps to P0.1', getCriterionByDroidId('readme')?.piId, 'P0.1');
eq('agents_md maps to P1.1', getCriterionByDroidId('agents_md')?.piId, 'P1.1');
eq('unit_tests_exist maps to P2.1', getCriterionByDroidId('unit_tests_exist')?.piId, 'P2.1');
eq('codeowners maps to P4.4', getCriterionByDroidId('codeowners')?.piId, 'P4.4');
eq('gitignore_comprehensive maps to P6.1', getCriterionByDroidId('gitignore_comprehensive')?.piId, 'P6.1');
eq('env_template maps to P8.1', getCriterionByDroidId('env_template')?.piId, 'P8.1');

// Agent-only criteria includes known ones
const agentOnlyIds = agentOnly.map(c => c.droidId);
eq('circuit_breakers is agent-only', agentOnlyIds.includes('circuit_breakers'), true);
eq('n_plus_one_detection is agent-only', agentOnlyIds.includes('n_plus_one_detection'), true);
eq('interactive_qa_runnable is agent-only', agentOnlyIds.includes('interactive_qa_runnable'), true);
eq('log_scrubbing is agent-only', agentOnlyIds.includes('log_scrubbing'), true);

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
