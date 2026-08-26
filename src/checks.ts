// Deterministic readiness check batteries for the 10 pillars (D-checks only).
// Numeric score uses only these; the narrative judgment is separate (see engine).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export type Repo = { root: string };

export type Difficulty = 'basic' | 'intermediate' | 'advanced';
export type CheckResult = { id: string; pillar: string; pass: boolean; evidence: string; severity: 'high' | 'med' | 'low'; difficulty?: Difficulty; app?: string };

export interface Pillar {
  id: string;
  scope: 'repo' | 'app';
  checks: Array<(r: Repo) => CheckResult>;
}

// ---- filesystem helpers ----
const has = (r: Repo, ...parts: string[]) => fs.existsSync(path.join(r.root, ...parts));
const read = (r: Repo, ...parts: string[]) => { try { return fs.readFileSync(path.join(r.root, ...parts), 'utf8'); } catch { return ''; } };
const sizeOf = (r: Repo, ...parts: string[]) => { try { return fs.statSync(path.join(r.root, ...parts)).size; } catch { return 0; } };
const dirs = (r: Repo) => { try { return fs.readdirSync(r.root); } catch { return []; } };

// ---- git-aware helpers ----
// Enumerate files tracked by git (falls back to empty array if not a git repo).
const gitTracked = (r: Repo): string[] => {
  try {
    const res = spawnSync('git', ['ls-files'], { cwd: r.root, encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) return res.stdout.split('\n').filter(Boolean);
  } catch { /* not git or git missing */ }
  return [];
};

// Read a file by relative path from repo root.
const readRel = (r: Repo, rel: string): string => {
  try { return fs.readFileSync(path.join(r.root, rel), 'utf8'); } catch { return ''; }
};

// Check whether a CLI tool is available on PATH.
function toolOnPath(name: string): boolean {
  try {
    const res = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 3000 });
    return res.status === 0 || (res.stderr && res.stderr.length > 0); // some tools print to stderr
  } catch { return false; }
}

// ---- anti-gaming helpers ----
// Strip YAML frontmatter and HTML comments from markdown, return residual text.
function stripBoilerplate(text: string): string {
  let t = text.replace(/^---\n[\s\S]*?\n---\n?/, ''); // frontmatter
  t = t.replace(/<!--[\s\S]*?-->/g, '');               // HTML comments
  return t;
}

// Count non-empty lines that aren't just a heading or frontmatter border.
function contentLineCount(text: string): number {
  const stripped = stripBoilerplate(text);
  return stripped.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#') && !t.startsWith('---');
  }).length;
}

// Extract commands from markdown: backtick-quoted commands and fenced code block lines.
function extractCommands(text: string): string[] {
  const cmds: string[] = [];
  // backtick-quoted: `npm test`, `make lint`
  const tickMatches = text.match(/`([^`\n]{3,80})`/g) || [];
  for (const m of tickMatches) cmds.push(m.replace(/`/g, '').trim());
  // fenced code blocks: lines inside ``` blocks that look like commands
  const fenced = text.match(/```[\s\S]*?```/g) || [];
  for (const block of fenced) {
    for (const line of block.split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('```') && !t.startsWith('#') && /\S/.test(t)) cmds.push(t);
    }
  }
  return cmds;
}

// Check if any extracted command maps to a real script key, Makefile target, or pyproject entry.
function commandsMatchRealScript(r: Repo, commands: string[]): boolean {
  const pkg = read(r, 'package.json');
  const makefile = read(r, 'Makefile');
  const pyproject = read(r, 'pyproject.toml');
  const scriptKeys: string[] = [];
  try { const p = JSON.parse(pkg); if (p.scripts) scriptKeys.push(...Object.keys(p.scripts)); } catch { /* not json */ }
  const makeTargets = makefile.split('\n').filter((l) => /^[a-zA-Z_-]+:/.test(l)).map((l) => l.split(':')[0].trim());
  const pyEntries = pyproject.match(/console_scripts[\s\S]*?=(.*)/g) || [];

  for (const cmd of commands) {
    // `npm test` / `npm run lint` → script key "test" / "lint"
    const npmRun = cmd.match(/npm\s+(?:run\s+)?(\S+)/);
    if (npmRun && scriptKeys.includes(npmRun[1])) return true;
    // `make test` → Makefile target "test"
    const makeMatch = cmd.match(/make\s+(\S+)/);
    if (makeMatch && makeTargets.includes(makeMatch[1])) return true;
    // `pytest` / `python -m pytest` → pyproject pytest config
    if (/pytest/.test(cmd) && /\[tool\.pytest/.test(pyproject)) return true;
    // `go test` → go.mod exists
    if (/go\s+test/.test(cmd) && has(r, 'go.mod')) return true;
    // `cargo test` → Cargo.toml exists
    if (/cargo\s+test/.test(cmd) && has(r, 'Cargo.toml')) return true;
    // direct script key match
    if (scriptKeys.includes(cmd)) return true;
  }
  return false;
}

// Count distinct non-comment, non-empty .gitignore patterns.
function gitignorePatternCount(text: string): number {
  return text.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#');
  }).length;
}

// Scan .github/workflows/*.yml for real test/lint invocations (not just echo stubs).
function scanWorkflowForTestInvocation(r: Repo): { hasTest: boolean; hasLint: boolean; evidence: string } {
  const wfDir = path.join(r.root, '.github', 'workflows');
  let hasTest = false, hasLint = false;
  const files: string[] = [];
  try { for (const f of fs.readdirSync(wfDir)) if (/\.ya?ml$/i.test(f)) files.push(f); } catch { /* no workflows dir */ }
  const testCmds = /\b(npm\s+(?:run\s+)?test|npx\s+vitest|npx\s+jest|pytest|make\s+test|go\s+test|cargo\s+test|deno\s+test)\b/;
  const lintCmds = /\b(npm\s+run\s+lint|npx\s+eslint|npx\s+biome|npx\s+tsc|ruff|flake8|golangci|cargo\s+clippy)\b/;
  for (const f of files) {
    const content = read(r, '.github', 'workflows', f);
    // Strip echo lines so `echo 'npm test'` doesn't count as a real invocation.
    const stripped = content.split('\n').filter((l) => !/^\s*-?\s*echo\s/i.test(l)).join('\n');
    if (testCmds.test(stripped)) hasTest = true;
    if (lintCmds.test(stripped)) hasLint = true;
  }
  return { hasTest, hasLint, evidence: `${files.length} workflow(s), test=${hasTest}, lint=${hasLint}` };
}

// ---- secret-scanning helpers ----
const SECRET_PATTERNS: RegExp[] = [
  /BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY/,
  /-----BEGIN[\s\w]+PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,                 // AWS access key
  /ghp_[A-Za-z0-9]{36}/,              // GitHub PAT
  /github_pat_[A-Za-z0-9_]{40,}/,     // GitHub fine-grained PAT
  /sk-[A-Za-z0-9]{20,}/,              // OpenAI-style key
  /xox[baprs]-[0-9A-Za-z-]{10,}/,     // Slack token
  /AIza[0-9A-Za-z_-]{35}/,            // Google API key
];
const BINARY_EXT = /\.(png|jpg|jpeg|gif|bmp|ico|woff2?|ttf|eot|otf|zip|tar|gz|bz2|jar|class|so|dylib|dll|exe|bin|pdf|mp[34]|mov|webp|wasm)$/i;

// Scan git-tracked files (or a best-effort recursive fallback) for secret patterns.
function scanTrackedSecrets(r: Repo): { hit: boolean; evidence: string } {
  let files = gitTracked(r);
  let source = 'tracked';
  if (!files.length) {
    // Not a git repo: best-effort recursive scan (top-level + src/, test/, lib/).
    files = ['src', 'test', 'lib', ''].flatMap((d) => {
      try { return fs.readdirSync(path.join(r.root, d), { withFileTypes: true }) .filter((e) => e.isFile()) .map((e) => (d ? d + '/' + e.name : e.name)); } catch { return []; }
    });
    source = 'best-effort (no git)';
  }
  const candidates = files.filter((f) => !BINARY_EXT.test(f)).slice(0, 200);
  for (const rel of candidates) {
    const content = readRel(r, rel);
    if (!content) continue;
    for (const pat of SECRET_PATTERNS) {
      const m = content.match(pat);
      if (m) return { hit: true, evidence: `secret pattern "${m[0].slice(0, 24)}..." in ${rel}` };
    }
  }
  return { hit: false, evidence: `scanned ${candidates.length} ${source} files, no secret patterns` };
}

// package-ish manifest names
const PKG = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt', 'composer.json', 'pubspec.yaml', 'Gemfile', 'mix.exs', 'pom.xml', 'build.gradle'];
const LOCK = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'Pipfile.lock', 'requirements.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock', 'mix.lock'];
const TESTDIRS = ['test', 'tests', '__tests__', 'spec', 'specs'];

const C: Array<() => Pillar> = [
  () => ({ id: 'P0', scope: 'repo', checks: [
    (r) => { const txt = read(r, 'README.md'); const bytes = sizeOf(r, 'README.md'); const lines = contentLineCount(txt); return { id: 'P0.1', pillar: 'P0', pass: bytes > 200 && lines >= 2, evidence: `README.md ${bytes}b, ${lines} content lines`, severity: 'high', difficulty: 'advanced' }; },
    (r) => ({ id: 'P0.2', pillar: 'P0', pass: /run|install|start|usage|quickstart/i.test(read(r, 'README.md')), evidence: 'run/usage section', severity: 'high', difficulty: 'intermediate' }),
    (r) => ({ id: 'P0.3', pillar: 'P0', pass: has(r, 'docs') || has(r, 'ARCHITECTURE.md'), evidence: 'docs or ARCHITECTURE', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P0.4', pillar: 'P0', pass: has(r, 'CHANGELOG.md') || /version/i.test(read(r, 'package.json')), evidence: 'changelog or version', severity: 'low', difficulty: 'basic' }),
    (r) => ({ id: 'P0.5', pillar: 'P0', pass: has(r, 'examples') || has(r, 'example'), evidence: 'examples dir', severity: 'low', difficulty: 'basic' }),
    (r) => ({ id: 'P0.6', pillar: 'P0', pass: /^#\s+[^\n]+/.test(read(r, 'README.md')) && read(r,'README.md').length>0, evidence: 'H1 in README', severity: 'med', difficulty: 'intermediate' }),
    // M11: documentation_freshness — docs modified within 180 days.
    (r) => { try { const res = spawnSync('git', ['log', '--since=180 days ago', '--name-only', '--pretty=format:', '--', 'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'docs/'], { cwd: r.root, encoding: 'utf8', timeout: 5000 }); const fresh = res.status === 0 && res.stdout.trim().length > 0; return { id: 'P0.7', pillar: 'P0', pass: fresh, evidence: fresh ? 'docs modified within 180 days' : 'docs not modified in 180+ days', severity: 'med', difficulty: 'intermediate' }; } catch { return { id: 'P0.7', pillar: 'P0', pass: false, evidence: 'git not available', severity: 'med', difficulty: 'intermediate' }; } },
    // M11: automated_doc_generation — typedoc/jsdoc/sphinx config.
    (r) => ({ id: 'P0.8', pillar: 'P0', pass: has(r,'typedoc.json')||has(r,'typedoc.config.js')||/typedoc|jsdoc|sphinx|mkdocs|docusaurus/i.test(read(r,'package.json')+read(r,'pyproject.toml')+read(r,'.github','workflows','ci.yml')), evidence: 'automated doc generation config', severity: 'low', difficulty: 'intermediate' }),
    // M11: api_schema_docs — OpenAPI/Swagger/GraphQL schema files.
    (r) => ({ id: 'P0.9', pillar: 'P0', pass: ['openapi.json','openapi.yaml','openapi.yml','swagger.json','swagger.yaml','swagger.yml','schema.graphql'].some(f => { try { return fs.existsSync(path.join(r.root, f)); } catch { return false; } }) || (() => { try { for (const d of ['docs','api','openapi']) { const p = path.join(r.root, d); if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) if (/openapi|swagger|\.graphql$|\.gql$/.test(f)) return true; } } catch {} return false; })(), evidence: 'API schema docs', severity: 'med', difficulty: 'intermediate' }),
  ]}),
  () => ({ id: 'P1', scope: 'repo', checks: [
    (r) => { const bytes = sizeOf(r, 'AGENTS.md'); const lines = contentLineCount(read(r, 'AGENTS.md')); return { id: 'P1.1', pillar: 'P1', pass: bytes > 100 && lines >= 2, evidence: `AGENTS.md ${bytes}b, ${lines} content lines`, severity: 'high', difficulty: 'advanced' }; },
    (r) => { const txt = read(r, 'AGENTS.md'); const cmds = extractCommands(txt); const hasRules = /must|always|never|run |\n- /i.test(txt); const cmdVerified = commandsMatchRealScript(r, cmds); return { id: 'P1.2', pillar: 'P1', pass: hasRules && cmdVerified, evidence: cmdVerified ? `AGENTS rules + ${cmds.length} command(s) verified` : 'AGENTS rules but no verified commands', severity: 'high', difficulty: 'advanced' }; },
    (r) => ({ id: 'P1.3', pillar: 'P1', pass: has(r, 'CONTRIBUTING.md') || sizeOf(r,'AGENTS.md')>200, evidence: 'contrib docs', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P1.4', pillar: 'P1', pass: has(r, 'mcp.json') || has(r, '.mcp.json') || has(r, 'CLAUDE.md'), evidence: 'agent config/MCP', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P1.5', pillar: 'P1', pass: has(r, 'Makefile') || has(r, 'justfile') || has(r, 'Taskfile.yml') || has(r, 'scripts', 'setup'), evidence: 'task shortcut', severity: 'low', difficulty: 'basic' }),
    (r) => ({ id: 'P1.6', pillar: 'P1', pass: has(r, '.factory', 'hooks.json') || has(r, '.factory', 'settings.json') && /hooks/.test(read(r, '.factory', 'settings.json')) || has(r, '.pi', 'settings.json') && /hooks/.test(read(r, '.pi', 'settings.json')), evidence: 'droid/pi lifecycle hooks', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P1.7', pillar: 'P1', pass: has(r, '.factory', 'droids') || has(r, '.factory', 'subagents') || has(r, '.pi', 'fabric', 'droids'), evidence: 'custom droids/subagents', severity: 'low', difficulty: 'basic' }),
    (r) => ({ id: 'P1.8', pillar: 'P1', pass: has(r, '.factory', 'connectors.json') || /connectors/i.test(read(r, '.factory', 'settings.json')), evidence: 'connectors integration', severity: 'low', difficulty: 'intermediate' }),
  ]}),
  () => ({ id: 'P2', scope: 'app', checks: [
    (r) => ({ id: 'P2.1', pillar: 'P2', pass: dirs(r).some((d) => TESTDIRS.includes(d)) || dirs(r).some((f) => /(_test|_spec|\.test|\.spec)\./.test(f)), evidence: 'test files/dir', severity: 'high', difficulty: 'basic' }),
    (r) => ({ id: 'P2.2', pillar: 'P2', pass: /"test"\s*[:=]|jest|vitest|pytest|cypress|make test/i.test(read(r, ...PKG.filter(p=>has(r,p)).slice(0,1)) as string) || has(r, 'jest.config.ts') || has(r, 'jest.config.js') || has(r, 'vitest.config.ts') || has(r, 'vitest.config.js') || has(r, 'pytest.ini'), evidence: 'test config', severity: 'high', difficulty: 'intermediate' }),
    (r) => ({ id: 'P2.3', pillar: 'P2', pass: /"test"/.test(read(r, 'package.json')) || has(r, 'Makefile') || has(r,'pytest.ini') || /\[tool.pytest|pytest|coverage/.test(read(r,'pyproject.toml')), evidence: 'run-test one-liner', severity: 'high', difficulty: 'intermediate' }),
    (r) => { const pkg = read(r, 'package.json'); const py = read(r, 'pyproject.toml') + read(r, 'tox.ini') + read(r, '.coveragerc'); const zeroThreshold = /coverage\s*[:=]\s*0\b/.test(pkg) || /fail_under\s*=\s*0\b/.test(py); if (zeroThreshold) return { id: 'P2.4', pillar: 'P2', pass: false, evidence: 'coverage threshold is 0 (decorative)', severity: 'med', difficulty: 'advanced' }; const configured = /coverage\s*[:=]\s*[1-9]/.test(pkg) || /--coverage/.test(pkg) || has(r,'.nycrc') || has(r,'.nycrc.json') || has(r,'.coveragerc') || has(r,'coveragerc') || /\[tool\.coverage|fail_under\s*=\s*[1-9]/.test(py); return { id: 'P2.4', pillar: 'P2', pass: configured, evidence: configured ? 'coverage threshold configured' : 'no coverage config', severity: 'med', difficulty: 'advanced' }; },
    (r) => ({ id: 'P2.5', pillar: 'P2', pass: dirs(r).some((d)=>['fixtures','testdata','__fixtures__'].includes(d)) , evidence: 'fixtures', severity: 'low', difficulty: 'basic' }),
    (r) => { const pkg = read(r, 'package.json'); const makefile = read(r, 'Makefile'); const pyproject = read(r, 'pyproject.toml'); const hasFastScript = /"(test:fast|test:smoke|test-fast|test-smoke)"\s*[:=]/.test(pkg); const hasMakeFast = /^test-(fast|smoke):/m.test(makefile); const vitestCfg = has(r,'vitest.config.ts') ? read(r,'vitest.config.ts') : has(r,'vitest.config.js') ? read(r,'vitest.config.js') : ''; const hasVitestIgnore = /testPathIgnorePatterns|exclude/i.test(vitestCfg); const jestCfg = has(r,'jest.config.ts') ? read(r,'jest.config.ts') : has(r,'jest.config.js') ? read(r,'jest.config.js') : ''; const hasJestIgnore = /testPathIgnorePatterns/i.test(jestCfg); const fast = hasFastScript || hasMakeFast || hasVitestIgnore || hasJestIgnore; const hasRunner = has(r,'vitest.config.ts') || has(r,'vitest.config.js') || has(r,'jest.config.ts') || has(r,'jest.config.js'); return { id: 'P2.6', pillar: 'P2', pass: fast || /\^|<test>|--runInBand|--watch/i.test(pkg) || hasRunner, evidence: fast ? 'fast/smoke test path found' : 'test runner present', severity: 'med', difficulty: 'intermediate' }; },
    // M11: integration_tests_exist — cypress/playwright/e2e config.
    (r) => ({ id: 'P2.7', pillar: 'P2', pass: has(r,'cypress.config.ts')||has(r,'cypress.config.js')||has(r,'cypress.json')||has(r,'playwright.config.ts')||has(r,'playwright.config.js')||dirs(r).some(d => ['e2e','tests/e2e','__e2e__'].includes(d))||has(r,'tests','integration')||has(r,'test','integration'), evidence: 'integration/e2e test config', severity: 'med', difficulty: 'intermediate' }),
    // M11: test_naming_conventions — testMatch/testRegex in jest/vitest config.
    (r) => { const vitest = read(r,'vitest.config.ts')+read(r,'vitest.config.js'); const jest = read(r,'jest.config.ts')+read(r,'jest.config.js'); const pyproject = read(r,'pyproject.toml'); const hasPattern = /testMatch|testRegex|testPathPattern/i.test(vitest+jest) || /\[tool\.pytest/.test(pyproject) && /python_files|testpaths/.test(pyproject); return { id: 'P2.8', pillar: 'P2', pass: hasPattern, evidence: hasPattern ? 'test naming conventions configured' : 'no test naming config', severity: 'low', difficulty: 'intermediate' }; },
    // M11: test_isolation — parallelization/sharding config.
    (r) => { const pkg = read(r,'package.json'); const vitest = read(r,'vitest.config.ts')+read(r,'vitest.config.js'); const jest = read(r,'jest.config.ts')+read(r,'jest.config.js'); const pyproject = read(r,'pyproject.toml'); const hasIsolation = /--parallel|shard|xdist|pytest-xdist|--runInBand/i.test(pkg+vitest+jest+pyproject) || /threads|parallel/i.test(vitest+jest); return { id: 'P2.9', pillar: 'P2', pass: hasIsolation, evidence: hasIsolation ? 'test isolation/parallelization configured' : 'no isolation config', severity: 'low', difficulty: 'advanced' }; },
  ]}),
  () => ({ id: 'P3', scope: 'app', checks: [
    (r) => ({ id: 'P3.1', pillar: 'P3', pass: LOCK.some((l)=>has(r,l)), evidence: 'lockfile', severity: 'high', difficulty: 'basic' }),
    (r) => ({ id: 'P3.2', pillar: 'P3', pass: /"build"\s*[:=]/.test(read(r,'package.json')) || /build/i.test(read(r,'Makefile')) || has(r,'Dockerfile'), evidence: 'build step', severity: 'high', difficulty: 'intermediate' }),
    (r) => ({ id: 'P3.3', pillar: 'P3', pass: /"(build|start)"\s*[:=]/.test(read(r,'package.json')) || has(r,'Makefile') || /\[project\.scripts|\[tool\.hatch|console_scripts|entry.?points/.test(read(r,'pyproject.toml')), evidence: 'root scripts', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P3.4', pillar: 'P3', pass: PKG.some((p)=>has(r,p)), evidence: 'dependency manifest', severity: 'high', difficulty: 'basic' }),
    (r) => ({ id: 'P3.6', pillar: 'P3', pass: /devDependencies|dev\s*=|requirements-dev|group\s*dev/i.test(read(r,'package.json')) || /^dev/i.test(read(r,'requirements.txt')) || has(r,'requirements-dev.txt') || /\[tool\.poetry\.group\.dev|dev\s*=\s*\[/.test(read(r,'pyproject.toml')), evidence: 'dev/prod split', severity: 'low', difficulty: 'intermediate' }),
  ]}),
  () => ({ id: 'P4', scope: 'repo', checks: [
    (r) => ({ id: 'P4.1', pillar: 'P4', pass: has(r,'.github','workflows') || has(r,'.gitlab-ci.yml') || has(r,'.circleci') || has(r,'Jenkinsfile'), evidence: 'CI workflow', severity: 'high', difficulty: 'basic' }),
    (r) => { const wf = scanWorkflowForTestInvocation(r); return { id: 'P4.2', pillar: 'P4', pass: wf.hasTest, evidence: wf.evidence, severity: 'med', difficulty: 'advanced' }; },
    (r) => ({ id: 'P4.3', pillar: 'P4', pass: has(r,'.pre-commit-config.yaml') || has(r,'.husky') || has(r,'.githooks') ||/husky|lint-staged/.test(read(r,'package.json'))||has(r,'lint-staged.config'), evidence: 'pre-commit hooks', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P4.4', pillar: 'P4', pass: has(r,'CODEOWNERS','.github') || has(r,'CODEOWNERS'), evidence: 'ownership/rulesets', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P4.5', pillar: 'P4', pass: /dependabot|renovate/i.test(read(r,'.github','dependabot.yml')) || has(r,'.github','dependabot.yml'), evidence: 'dep checker', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P4.6', pillar: 'P4', pass: has(r,'.github','ISSUE_TEMPLATE') || has(r,'.github','issue_template'), evidence: 'issue templates', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P4.7', pillar: 'P4', pass: has(r,'.github','PULL_REQUEST_TEMPLATE.md') || has(r,'.github','pull_request_template.md') || has(r,'.github','PULL_REQUEST_TEMPLATE') || has(r,'.github','pull_request_template'), evidence: 'PR templates', severity: 'low', difficulty: 'basic' }),
    // M11: issue_labeling_system — .github/labels.yml or label config.
    (r) => ({ id: 'P4.8', pillar: 'P4', pass: has(r,'.github','labels.yml') || has(r,'.github','labels.json') || has(r,'.github','labeler.yml') || has(r,'.github','labeler.yaml') || /labels/i.test(read(r,'.github','workflows','ci.yml')), evidence: 'issue labeling system', severity: 'low', difficulty: 'basic' }),
    // M11: release_automation — CD workflow or semantic-release config.
    (r) => ({ id: 'P4.9', pillar: 'P4', pass: has(r,'.github','workflows','release.yml') || has(r,'.github','workflows','deploy.yml') || has(r,'.releaserc.json') || has(r,'.releaserc') || has(r,'release.config.js') || /semantic-release|changesets|release-please/i.test(read(r,'package.json')), evidence: 'release automation config', severity: 'med', difficulty: 'intermediate' }),
  ]}),
  () => ({ id: 'P5', scope: 'app', checks: [
    (r) => ({ id: 'P5.1', pillar: 'P5', pass: ['.eslintrc','.eslintrc.json','.eslintrc.js','biome.json','.flake8','.ruff.toml','golangci.yml','.golangci.yml','clippy.toml'].some(f=>has(r,f)) || /eslint|biome|ruff|golangci/i.test(read(r,'package.json')), evidence: 'linter', severity: 'high', difficulty: 'basic' }),
    (r) => ({ id: 'P5.2', pillar: 'P5', pass: has(r,'.prettierrc')||has(r,'.prettierrc.json')||has(r,'.prettierrc.js')||has(r,'pyproject.toml')||has(r,'.editorconfig')||/prettier|black|gofmt|dprint/i.test(read(r,'package.json')), evidence: 'formatter', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P5.3', pillar: 'P5', pass: has(r,'tsconfig.json')||/mypy|pyright|typecheck/i.test(read(r,'pyproject.toml')+read(r,'setup.cfg'))||has(r,'go.mod')||has(r,'Cargo.toml'), evidence: 'type check config', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P5.4', pillar: 'P5', pass: (()=>{ const big=dirs(r).filter(d=>{ try{return fs.statSync(path.join(r.root,d)).isFile()&&fs.statSync(path.join(r.root,d)).size>500000;}catch{return false;} }).length; return big===0; })(), evidence: 'no mega-files', severity: 'low', difficulty: 'intermediate' }),
    (r) => ({ id: 'P5.5', pillar: 'P5', pass: has(r,'tsconfig.json')||has(r,'.editorconfig'), evidence: 'consistent config', severity: 'low', difficulty: 'basic' }),
    // M10: strict typing — not just tsconfig existence, but strict mode enabled (presence ≠ signal).
    (r) => { const tsconfig = read(r,'tsconfig.json'); const hasStrict = /"strict"\s*:\s*true/.test(tsconfig); const hasPyStrict = has(r,'pyproject.toml') && /strict\s*=\s*true|mypy.*strict|disallow_untyped/i.test(read(r,'pyproject.toml')); return { id: 'P5.6', pillar: 'P5', pass: hasStrict || hasPyStrict, evidence: hasStrict ? 'strict TypeScript enabled' : hasPyStrict ? 'strict Python typing enabled' : 'no strict typing config', severity: 'med', difficulty: 'intermediate' }; },
    // M11: naming_consistency — naming convention docs or ESLint naming rules.
    (r) => ({ id: 'P5.7', pillar: 'P5', pass: /naming-convention|naming.style|camelCase|snake_case|PascalCase/i.test(read(r,'AGENTS.md')+read(r,'CONTRIBUTING.md')) || /naming-convention/i.test(read(r,'.eslintrc')+read(r,'.eslintrc.json')+read(r,'.eslintrc.js')+read(r,'eslint.config.js')), evidence: 'naming consistency rules', severity: 'low', difficulty: 'intermediate' }),
    // M11: dead_code_detection — knip/vulture/staticcheck config.
    (r) => ({ id: 'P5.8', pillar: 'P5', pass: has(r,'knip.json')||has(r,'knip.ts')||has(r,'.knip.json')||has(r,'.vulture')||/knip|vulture|unimported|dead/i.test(read(r,'package.json')+read(r,'pyproject.toml')), evidence: 'dead code detection tooling', severity: 'low', difficulty: 'intermediate' }),
    // M11: duplicate_code_detection — jscpd/CPD config.
    (r) => ({ id: 'P5.9', pillar: 'P5', pass: has(r,'.jscpd.json')||has(r,'jscpd.json')||/jscpd|cpd|duplicate/i.test(read(r,'package.json')+read(r,'pyproject.toml')), evidence: 'duplicate code detection tooling', severity: 'low', difficulty: 'intermediate' }),
    // M11: cyclomatic_complexity — complexity analysis config.
    (r) => ({ id: 'P5.10', pillar: 'P5', pass: /complexity|max-complexity|cognitive/i.test(read(r,'.eslintrc')+read(r,'.eslintrc.json')+read(r,'.eslintrc.js')+read(r,'eslint.config.js')+read(r,'.flake8')+read(r,'.ruff.toml')+read(r,'pyproject.toml')) || has(r,'gocyclo') || has(r,'.golangci.yml'), evidence: 'cyclomatic complexity analysis', severity: 'low', difficulty: 'advanced' }),
    // M11: unused_dependencies_detection — depcheck/knip/deptry config.
    (r) => ({ id: 'P5.11', pillar: 'P5', pass: has(r,'.depcheckrc')||has(r,'.depcheckrc.json')||has(r,'knip.json')||has(r,'knip.ts')||/depcheck|deptry|knip/i.test(read(r,'package.json')+read(r,'pyproject.toml')), evidence: 'unused dependencies detection', severity: 'low', difficulty: 'intermediate' }),
    // M11: large_file_detection — .gitattributes LFS or linter max-lines rules.
    (r) => ({ id: 'P5.12', pillar: 'P5', pass: /filter=lfs|lfs/i.test(read(r,'.gitattributes')) || /max-lines|max-module-lines|max-file-lines/i.test(read(r,'.eslintrc')+read(r,'.eslintrc.json')+read(r,'.eslintrc.js')+read(r,'eslint.config.js')+read(r,'.flake8')+read(r,'.ruff.toml')+read(r,'pyproject.toml')), evidence: 'large file detection tooling', severity: 'low', difficulty: 'intermediate' }),
  ]}),
  () => ({ id: 'P6', scope: 'repo', checks: [
    (r) => { const gi = read(r, '.gitignore'); const patterns = gitignorePatternCount(gi); return { id: 'P6.1', pillar: 'P6', pass: /env|pem|node_modules|dist|agent-readiness/i.test(gi) && patterns >= 3, evidence: `.gitignore ${patterns} patterns`, severity: 'high', difficulty: 'intermediate' }; },
    (r) => { const scan = scanTrackedSecrets(r); return { id: 'P6.2', pillar: 'P6', pass: !scan.hit, evidence: scan.evidence, severity: 'high', difficulty: 'advanced' }; },
    (r) => ({ id: 'P6.3', pillar: 'P6', pass: (()=>{ const tracked=gitTracked(r); if(tracked.length) return !tracked.some((f)=>/^\.env(\.(prod|local|development|staging))?$/i.test(f)); return !has(r,'.env') && !has(r,'.env.prod'); })(), evidence: 'no tracked .env (git-aware)', severity: 'high', difficulty: 'advanced' }),
    (r) => { const hasGitleaks = toolOnPath('gitleaks'); const hasTrufflehog = toolOnPath('trufflehog'); if (hasGitleaks || hasTrufflehog) { const tool = hasGitleaks ? 'gitleaks' : 'trufflehog'; try { const res = spawnSync(tool, hasGitleaks ? ['detect', '--no-banner'] : ['filesystem', '--no-verify'], { cwd: r.root, encoding: 'utf8', timeout: 15000 }); const clean = res.status === 0; return { id: 'P6.4', pillar: 'P6', pass: clean, evidence: `${tool} scan ${clean ? 'clean' : 'found findings'}`, severity: 'med', difficulty: 'advanced' }; } catch { /* fall through */ } } const auditRe = /npm audit|pip-audit|govulncheck|cargo audit|safety|trivy/i; const wired = auditRe.test(read(r,'package.json')+read(r,'Makefile')+read(r,'.github','workflows','ci.yml')) || has(r,'.github','dependabot.yml'); return { id: 'P6.4', pillar: 'P6', pass: wired, evidence: wired ? 'vuln scan wired' : 'no vuln scan', severity: 'med', difficulty: 'advanced' }; },
    (r) => ({ id: 'P6.5', pillar: 'P6', pass: /[A-Za-z_]*TOKEN|SECRET|_KEY\s*[:=]|getenv|process\.env/i.test(read(r,'.env.example')) || has(r,'.env.example'), evidence: 'credential pattern', severity: 'low', difficulty: 'basic' }),
  ]}),
  () => ({ id: 'P7', scope: 'app', checks: [
    (r) => ({ id: 'P7.1', pillar: 'P7', pass: has(r,'src','logging')||has(r,'src','logger')||/winston|pino|structlog|logging/i.test(read(r,'package.json')+read(r,'requirements.txt')), evidence: 'structured logging', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P7.2', pillar: 'P7', pass: !/except\s*:\s*pass|catch\s*\([^)]*\)\s*\{\s*\}/.test(read(r,'src','app.js')+read(r,'src','main.py')), evidence: 'no silent errors', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P7.3', pillar: 'P7', pass: /NODE_ENV|TEST|--dry-run|--mock|test\s*mode/i.test(read(r,'package.json')+read(r,'README.md')) || has(r,'.env.example'), evidence: 'mock/dev path', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P7.4', pillar: 'P7', pass: /LOG_LEVEL|verbosity/i.test(read(r,'.env.example')+read(r,'config')), evidence: 'log level config', severity: 'low', difficulty: 'intermediate' }),
    // M11: distributed_tracing — OpenTelemetry/X-Request-ID in deps.
    (r) => ({ id: 'P7.5', pillar: 'P7', pass: /opentelemetry|otel|x-request-id|trace.id|jaeger|zipkin/i.test(read(r,'package.json')+read(r,'requirements.txt')+read(r,'pyproject.toml')+read(r,'go.mod')), evidence: 'distributed tracing', severity: 'med', difficulty: 'intermediate' }),
    // M11: metrics_collection — Datadog/Prometheus/New Relic in deps.
    (r) => ({ id: 'P7.6', pillar: 'P7', pass: /datadog|prometheus|new.?relic|cloudwatch|statsd|grafana|axiom/i.test(read(r,'package.json')+read(r,'requirements.txt')+read(r,'pyproject.toml')+read(r,'go.mod')), evidence: 'metrics collection', severity: 'med', difficulty: 'intermediate' }),
    // M11: error_tracking_contextualized — Sentry/Bugsnag/Rollbar in deps.
    (r) => ({ id: 'P7.7', pillar: 'P7', pass: /sentry|bugsnag|rollbar|catchpoint|airbrake/i.test(read(r,'package.json')+read(r,'requirements.txt')+read(r,'pyproject.toml')+read(r,'go.mod')), evidence: 'error tracking', severity: 'med', difficulty: 'intermediate' }),
    // M11: product_analytics_instrumentation — Mixpanel/Amplitude/PostHog in deps.
    (r) => ({ id: 'P7.8', pillar: 'P7', pass: /mixpanel|amplitude|posthog|heap|ga4|google.?analytics|segment/i.test(read(r,'package.json')+read(r,'requirements.txt')+read(r,'pyproject.toml')), evidence: 'product analytics', severity: 'low', difficulty: 'intermediate' }),
    // M11: runbooks_documented — runbook dir or SRE docs.
    (r) => ({ id: 'P7.9', pillar: 'P7', pass: has(r,'runbooks')||has(r,'runbook')||has(r,'docs','runbooks')||has(r,'docs','runbook')||/runbook|playbook|sre/i.test(read(r,'README.md')+read(r,'AGENTS.md')+read(r,'CONTRIBUTING.md')), evidence: 'runbooks documented', severity: 'med', difficulty: 'basic' }),
  ]}),
  () => ({ id: 'P8', scope: 'repo', checks: [
    (r) => ({ id: 'P8.1', pillar: 'P8', pass: has(r,'.env.example') || has(r,'.env.sample'), evidence: '.env.example', severity: 'high', difficulty: 'basic' }),
    (r) => ({ id: 'P8.2', pillar: 'P8', pass: /"start"\s*[:=]|make\s+(setup|install)|script[^\\n]*setup/i.test(read(r,'package.json')+read(r,'Makefile')) || has(r,'scripts','setup'), evidence: 'one-command setup', severity: 'high', difficulty: 'intermediate' }),
    (r) => ({ id: 'P8.3', pillar: 'P8', pass: has(r,'.devcontainer','devcontainer.json') || has(r,'Dockerfile') || has(r,'docker-compose.yml'), evidence: 'devcontainer/docker', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P8.4', pillar: 'P8', pass: has(r,'.nvmrc')||has(r,'.tool-versions')||/engines/.test(read(r,'package.json'))||has(r,'pyproject.toml'), evidence: 'pinned version', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P8.5', pillar: 'P8', pass: /"test"\s*[:=]|headless|--no-sandbox|renderless/i.test(read(r,'package.json')+read(r,'README.md')) || has(r,'pytest.ini'), evidence: 'non-GUI run', severity: 'low', difficulty: 'intermediate' }),
    // M11: local_services_setup — docker-compose.yml or tiltfile.
    (r) => ({ id: 'P8.6', pillar: 'P8', pass: has(r,'docker-compose.yml')||has(r,'docker-compose.yaml')||has(r,'compose.yml')||has(r,'compose.yaml')||has(r,'Tiltfile')||has(r,'skaffold.yaml')||/docker.?compose/i.test(read(r,'README.md')+read(r,'AGENTS.md')), evidence: 'local services setup', severity: 'med', difficulty: 'basic' }),
  ]}),
  () => ({ id: 'P9', scope: 'app', checks: [
    (r) => ({ id: 'P9.1', pillar: 'P9', pass: /"main"\s*[:=]|"bin"|__main__|def main|func main/i.test(read(r,'package.json')+read(r,'main.go')) || has(r,'bin') || has(r,'src','main'), evidence: 'entry points', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P9.2', pillar: 'P9', pass: (()=>{ const top=dirs(r).filter(d=>!d.startsWith('.')); return top.length>=2 && top.length<=30; })(), evidence: 'legible repo shape', severity: 'med', difficulty: 'intermediate' }),
    (r) => ({ id: 'P9.3', pillar: 'P9', pass: has(r,'src')||has(r,'lib')||has(r,'packages')||has(r,'internal'), evidence: 'module boundaries', severity: 'med', difficulty: 'basic' }),
    (r) => ({ id: 'P9.4', pillar: 'P9', pass: has(r,'src','README.md')||has(r,'lib','README.md')||has(r,'packages'), evidence: 'per-module docs', severity: 'low', difficulty: 'basic' }),
  ]}),
];

// Difficulty map: fallback for checks that don't stamp difficulty inline.
// basic = file-existence, intermediate = content-regex, advanced = git-aware/external-tool/anti-gaming.
export const DIFFICULTY: Record<string, Difficulty> = {};

// expose check registry
let REGISTRY: Pillar[] | null = null;
export function getPillars(): Pillar[] { if (!REGISTRY) REGISTRY = C.map((f) => f()); return REGISTRY; }
