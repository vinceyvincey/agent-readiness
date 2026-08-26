// M13: tests for the side-by-side evaluation harness parsing and comparison logic.
// No actual Droid execution needed — tests use sample text and mock data.
import {
  parseDroidOutput,
  compareCriteria,
  compareHybridCriteria,
  summarizeComparison,
  computeFixResult,
  renderComparisonMarkdown,
  type DroidSignal,
  type SideBySideReport,
  type FixResult,
  type PiHybridAssessment,
} from '../validation/side-by-side.ts';
import type { CheckResult } from '../src/checks.ts';
import type { ReadinessReport } from '../src/engine.ts';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log('FAIL', label, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
  else console.log('ok', label);
};

// ---- Droid output parser ----

const sampleDroidOutput = `Report stored successfully. Here is the evaluation summary:

# Level
Level 2 (pass rate 24.2%: 15 of 62 evaluated signals passed; 5 skipped as N/A)

# Applications
1. \`.\` (repo root) - Test repo

# Criteria
**Documentation**
- README.md exists at repo root with setup/usage instructions.: 1/1 - README.md found at repo root
- AGENTS.md exists at repo root: 0/1 - No AGENTS.md found
- Service architecture documented: 0/1 - No architecture docs found

**Style & Validation**
- Linter configured: 1/1 - ESLint config found
- Type checker: 0/1 - No tsconfig.json found
- Formatter: 0/1 - No Prettier config

**Testing**
- Unit tests present: 0/1 - No test files found
- Tests runnable locally: skipped - No test runner configured

# Action Items
- Add AGENTS.md with setup and behavior rules
- Configure a type checker (tsconfig.json)
- Add unit tests with a test runner
`;

const parsed = parseDroidOutput(sampleDroidOutput);

eq('parseDroidOutput level', parsed.level, 2);
eq('parseDroidOutput passRate', parsed.passRate, 24.2);
eq('parseDroidOutput passedSignals', parsed.passedSignals, 15);
eq('parseDroidOutput totalSignals', parsed.totalSignals, 62);
eq('parseDroidOutput signals count', parsed.signals.length, 8);
eq('parseDroidOutput first signal passed', parsed.signals[0].passed, true);
eq('parseDroidOutput second signal failed', parsed.signals[1].passed, false);
eq('parseDroidOutput skipped signal', parsed.signals[7].skipped, true);
eq('parseDroidOutput action items count', parsed.actionItems.length, 3);
eq('parseDroidOutput action items[0]', parsed.actionItems[0], 'Add AGENTS.md with setup and behavior rules');

// Signal name-to-droidId mapping
eq('parseDroidOutput readme maps to readme droidId', parsed.signals[0].id, 'readme');
eq('parseDroidOutput agents_md maps to agents_md droidId', parsed.signals[1].id, 'agents_md');
eq('parseDroidOutput lint_config maps', parsed.signals[3].id, 'lint_config');

// Test combined signal line parsing (Droid format: "Feature Flags / Release Notes: 0/1 each")
// Also tests "null" as skip marker (Droid uses both "skipped" and "null")
const combinedOutput = `# Level
Level 1

# Criteria
**Build System**
- Feature Flags / Release Notes / Release Automation: 0/1 each - Nothing configured
- Monorepo / Version Drift: null - single-app
- Code Modularization: skipped - trivial project

# Action Items
- Fix things
`;
const combinedParsed = parseDroidOutput(combinedOutput);
eq('combined output splits 6 signals', combinedParsed.signals.length, 6); // 3 + 2 skipped + 1 skipped
eq('combined output first is feature_flag_infrastructure', combinedParsed.signals[0].id, 'feature_flag_infrastructure');
eq('combined output all 3 failed', combinedParsed.signals.slice(0, 3).every(s => !s.passed), true);
eq('combined output last 2 skipped', combinedParsed.signals.slice(3, 5).every(s => s.skipped), true);
eq('combined output null skip detected', combinedParsed.signals[3].skipped, true);
eq('combined output skipped detected', combinedParsed.signals[4].skipped, true);

// ---- Criteria comparison ----

const mockPiFindings: CheckResult[] = [
  { id: 'P0.1', pillar: 'P0', pass: true, evidence: 'README found', severity: 'high' },
  { id: 'P1.1', pillar: 'P1', pass: false, evidence: 'No AGENTS.md', severity: 'high' },
  { id: 'P0.3', pillar: 'P0', pass: false, evidence: 'No architecture docs', severity: 'med' },
  { id: 'P5.1', pillar: 'P5', pass: true, evidence: 'ESLint found', severity: 'high' },
  { id: 'P5.3', pillar: 'P5', pass: false, evidence: 'No tsconfig', severity: 'high' },
  { id: 'P2.1', pillar: 'P2', pass: false, evidence: 'No tests', severity: 'high' },
];

const mockDroidSignals: DroidSignal[] = [
  { id: 'readme', name: 'README.md exists', passed: true, score: '1/1', rationale: 'found', skipped: false },
  { id: 'agents_md', name: 'AGENTS.md exists', passed: false, score: '0/1', rationale: 'not found', skipped: false },
  { id: 'service_flow_documented', name: 'Service architecture', passed: false, score: '0/1', rationale: 'not found', skipped: false },
  { id: 'lint_config', name: 'Linter configured', passed: true, score: '1/1', rationale: 'ESLint', skipped: false },
  { id: 'type_check', name: 'Type checker', passed: false, score: '0/1', rationale: 'no tsconfig', skipped: false },
  { id: 'unit_tests_exist', name: 'Unit tests present', passed: false, score: '0/1', rationale: 'no tests', skipped: false },
  { id: 'circuit_breakers', name: 'Circuit breakers', passed: false, score: '0/1', rationale: 'no circuit breakers', skipped: false }, // agent-only (code-analysis)
];

const comparisons = compareCriteria(mockPiFindings, mockDroidSignals);

eq('compareCriteria count', comparisons.length, 7);
eq('compareCriteria agree-pass (readme)', comparisons[0].agreement, 'agree-pass');
eq('compareCriteria agree-fail (agents_md)', comparisons[1].agreement, 'agree-fail');
eq('compareCriteria agree-fail (arch)', comparisons[2].agreement, 'agree-fail');
eq('compareCriteria agree-pass (linter)', comparisons[3].agreement, 'agree-pass');
eq('compareCriteria agree-fail (type_check)', comparisons[4].agreement, 'agree-fail');
eq('compareCriteria agree-fail (tests)', comparisons[5].agreement, 'agree-fail');
eq('compareCriteria agent-only (circuit_breakers)', comparisons[6].agreement, 'agent-only');
eq('compareCriteria circuit_breakers has null piId', comparisons[6].piId, null);

// Test pi-lenient: pi says pass, droid says fail
const lenientSignals: DroidSignal[] = [
  { id: 'readme', name: 'README', passed: false, score: '0/1', rationale: 'too short', skipped: false },
];
const lenientFindings: CheckResult[] = [
  { id: 'P0.1', pillar: 'P0', pass: true, evidence: 'README found', severity: 'high' },
];
const lenientComparisons = compareCriteria(lenientFindings, lenientSignals);
eq('compareCriteria pi-lenient', lenientComparisons[0].agreement, 'pi-lenient');

// Test pi-strict: pi says fail, droid says pass
const strictSignals: DroidSignal[] = [
  { id: 'lint_config', name: 'Linter', passed: true, score: '1/1', rationale: 'ESLint', skipped: false },
];
const strictFindings: CheckResult[] = [
  { id: 'P5.1', pillar: 'P5', pass: false, evidence: 'No linter', severity: 'high' },
];
const strictComparisons = compareCriteria(strictFindings, strictSignals);
eq('compareCriteria pi-strict', strictComparisons[0].agreement, 'pi-strict');

// ---- Summary aggregation ----

const summary = summarizeComparison(comparisons);
eq('summarize agreementRate', summary.agreementRate, Math.round((3 + 3) / 7 * 1000) / 10);
eq('summarize agreePass', summary.agreePass, 2);
eq('summarize agreeFail', summary.agreeFail, 4); // agents_md, arch, type_check, tests = 4 fails both
eq('summarize piLenient', summary.piLenient, 0);
eq('summarize piStrict', summary.piStrict, 0);
eq('summarize agentOnly', summary.agentOnly, 1);

// ---- Hybrid comparison (pi hybrid ceiling vs Droid) ----

// Simulate ceiling findings: agent fixed P1.1 (AGENTS.md) and P5.3 (tsconfig)
const ceilingFindings: CheckResult[] = [
  { id: 'P0.1', pillar: 'P0', pass: true, evidence: 'README found', severity: 'high' },
  { id: 'P1.1', pillar: 'P1', pass: true, evidence: 'Agent created AGENTS.md', severity: 'high' },  // fixed
  { id: 'P0.3', pillar: 'P0', pass: false, evidence: 'No architecture docs', severity: 'med' },
  { id: 'P5.1', pillar: 'P5', pass: true, evidence: 'ESLint found', severity: 'high' },
  { id: 'P5.5', pillar: 'P5', pass: true, evidence: 'Agent created tsconfig.json', severity: 'high' },  // fixed (was P5.3 fail)
  { id: 'P5.3', pillar: 'P5', pass: true, evidence: 'Agent created tsconfig.json', severity: 'high' },  // fixed
  { id: 'P2.1', pillar: 'P2', pass: false, evidence: 'No tests', severity: 'high' },
];

const hybridComparisons = compareHybridCriteria(ceilingFindings, mockDroidSignals);
// P1.1 (agents_md): hybrid now PASS, droid FAIL → was agree-fail, now pi-lenient
const hybridAgentsMd = hybridComparisons.find(c => c.droidId === 'agents_md');
eq('hybrid agents_md is pi-lenient after fix', hybridAgentsMd?.agreement, 'pi-lenient');
// P5.3 (type_check): hybrid now PASS, droid FAIL → pi-lenient
const hybridTypeCheck = hybridComparisons.find(c => c.droidId === 'type_check');
eq('hybrid type_check is pi-lenient after fix', hybridTypeCheck?.agreement, 'pi-lenient');

const hybridSummary = summarizeComparison(hybridComparisons);
eq('hybrid summary has pi-lenient from fixed checks', hybridSummary.piLenient > 0, true);

// ---- Fix result computation ----

const mockBeforeReport = { overall: 30, level: 'L0' } as unknown as ReadinessReport;
const mockAfterReport = { overall: 55, level: 'L1' } as unknown as ReadinessReport;
const fixResult = computeFixResult('pi', mockBeforeReport, mockAfterReport, '/tmp/test', 5000);
eq('computeFixResult approach', fixResult.approach, 'pi');
eq('computeFixResult beforeScore', fixResult.beforeScore, 30);
eq('computeFixResult afterScore', fixResult.afterScore, 55);
eq('computeFixResult scoreDelta', fixResult.scoreDelta, 25);
eq('computeFixResult beforeLevel', fixResult.beforeLevel, 'L0');
eq('computeFixResult afterLevel', fixResult.afterLevel, 'L1');
eq('computeFixResult durationMs', fixResult.durationMs, 5000);

// ---- Markdown rendering ----

const mockHybrid: PiHybridAssessment = {
  floorScore: 30,
  floorLevel: 'L0',
  floorFindings: mockPiFindings,
  agentOutput: 'agent verified findings, discovered circuit_breakers and n_plus_one_detection as agent-only',
  agentDurationMs: 180000,
  agentOnlyMentioned: ['circuit_breakers', 'n_plus_one_detection'],
  skippedCheckIds: ['P3.7', 'P4.10'],
  findingsToVerify: 5,
};

const mockReport: SideBySideReport = {
  repo: 'test-repo',
  pi: { level: 'L1', overall: 30, findings: mockPiFindings, punchlist: [], agentPrompt: 'test', durationMs: 50 },
  piHybrid: mockHybrid,
  droid: { level: 2, passRate: 24.2, passedSignals: 15, totalSignals: 62, skippedSignals: 1, signals: mockDroidSignals, actionItems: ['Add AGENTS.md'], rawOutput: '', durationMs: 120000 },
  comparisons,
  hybridComparisons,
  fixes: null,
  summary: {
    ...summary,
    hybridAgreementRate: hybridSummary.agreementRate,
    hybridAgreePass: hybridSummary.agreePass,
    hybridAgreeFail: hybridSummary.agreeFail,
    hybridPiLenient: hybridSummary.piLenient,
    hybridPiStrict: hybridSummary.piStrict,
    hybridAgentOnly: hybridSummary.agentOnly,
    piDurationMs: 50,
    piHybridDurationMs: 180000,
    droidDurationMs: 120000,
  },
};

const md = renderComparisonMarkdown([mockReport]);
eq('markdown has title', md.includes('# Side-by-Side Evaluation'), true);
eq('markdown has repo name', md.includes('test-repo'), true);
eq('markdown has 3-way summary table', md.includes('| Repo | Pi Det. | Pi Hybrid'), true);
eq('markdown has 3-way comparison table', md.includes('3-Way Criteria Agreement'), true);
eq('markdown has pi level', md.includes('L1'), true);
eq('markdown has droid level', md.includes('L2'), true);
eq('markdown has hybrid section', md.includes('Pi Hybrid Assessment'), true);
eq('markdown has floor score', md.includes('Floor: **30'), true);
eq('markdown has findings to verify', md.includes('Findings to verify'), true);
eq('markdown has skipped checks', md.includes('Skipped checks'), true);
eq('markdown has hybrid vs droid section', md.includes('Pi Hybrid vs Droid'), true);
eq('markdown has hybrid assessment section', md.includes('Hybrid Assessment'), true);

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
