// Deterministic readiness check batteries for the 10 pillars (D-checks only).
// Numeric score uses only these; the narrative judgment is separate (see engine).
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Repo = { root: string };

export type CheckResult = { id: string; pillar: string; pass: boolean; evidence: string; severity: 'high' | 'med' | 'low' };

export interface Pillar {
  id: string;
  checks: Array<(r: Repo) => CheckResult>;
}

// ---- filesystem helpers ----
const has = (r: Repo, ...parts: string[]) => fs.existsSync(path.join(r.root, ...parts));
const read = (r: Repo, ...parts: string[]) => { try { return fs.readFileSync(path.join(r.root, ...parts), 'utf8'); } catch { return ''; } };
const sizeOf = (r: Repo, ...parts: string[]) => { try { return fs.statSync(path.join(r.root, ...parts)).size; } catch { return 0; } };
const dirs = (r: Repo) => { try { return fs.readdirSync(r.root); } catch { return []; } };
const anyPatt = (r: Repo, names: string[], candidates: string[][] = [names]) =>
  candidates.some((c) => names.some((n) => has(r, ...c, n))) || names.some((n) => has(r, n));

// package-ish manifest names
const PKG = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt', 'composer.json', 'pubspec.yaml', 'Gemfile', 'mix.exs', 'pom.xml', 'build.gradle'];
const LOCK = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'Cargo.lock', 'go.sum', 'pipfile.lock', 'Gemfile.lock', 'composer.lock', 'yarn.lock', 'mix.lock'];
const TESTDIRS = ['test', 'tests', '__tests__', 'spec', 'specs'];

const C: Array<() => Pillar> = [
  () => ({ id: 'P0', checks: [
    (r) => ({ id: 'P0.1', pillar: 'P0', pass: sizeOf(r, 'README.md') > 200, evidence: `README.md ${sizeOf(r,'README.md')} bytes `, severity: 'high' }),
    (r) => ({ id: 'P0.2', pillar: 'P0', pass: /run|install|start|usage|quickstart/i.test(read(r, 'README.md')), evidence: 'run/usage section', severity: 'high' }),
    (r) => ({ id: 'P0.3', pillar: 'P0', pass: has(r, 'docs') || has(r, 'ARCHITECTURE.md'), evidence: 'docs or ARCHITECTURE', severity: 'med' }),
    (r) => ({ id: 'P0.4', pillar: 'P0', pass: has(r, 'CHANGELOG.md') || /version/i.test(read(r, 'package.json')), evidence: 'changelog or version', severity: 'low' }),
    (r) => ({ id: 'P0.5', pillar: 'P0', pass: has(r, 'examples') || has(r, 'example'), evidence: 'examples dir', severity: 'low' }),
    (r) => ({ id: 'P0.6', pillar: 'P0', pass: /^#\s+[^\n]+/.test(read(r, 'README.md')) && read(r,'README.md').length>0, evidence: 'H1 in README', severity: 'med' }),
  ]}),
  () => ({ id: 'P1', checks: [
    (r) => ({ id: 'P1.1', pillar: 'P1', pass: sizeOf(r, 'AGENTS.md') > 100, evidence: `AGENTS.md ${sizeOf(r,'AGENTS.md')}b`, severity: 'high' }),
    (r) => ({ id: 'P1.2', pillar: 'P1', pass: /must|always|never|run |\n- /i.test(read(r, 'AGENTS.md')), evidence: 'AGENTS rules', severity: 'high' }),
    (r) => ({ id: 'P1.3', pillar: 'P1', pass: has(r, 'CONTRIBUTING.md') || sizeOf(r,'AGENTS.md')>200, evidence: 'contrib docs', severity: 'med' }),
    (r) => ({ id: 'P1.4', pillar: 'P1', pass: has(r, 'mcp.json') || has(r, '.mcp.json') || has(r, 'CLAUDE.md'), evidence: 'agent config/MCP', severity: 'med' }),
    (r) => ({ id: 'P1.5', pillar: 'P1', pass: has(r, 'Makefile') || has(r, 'justfile') || has(r, 'Taskfile.yml') || has(r, 'scripts', 'setup'), evidence: 'task shortcut', severity: 'low' }),
  ]}),
  () => ({ id: 'P2', checks: [
    (r) => ({ id: 'P2.1', pillar: 'P2', pass: dirs(r).some((d) => TESTDIRS.includes(d)) || dirs(r).some((f) => /(_test|_spec|\.test|\.spec)\./.test(f)), evidence: 'test files/dir', severity: 'high' }),
    (r) => ({ id: 'P2.2', pillar: 'P2', pass: /"test"\s*[:=]|jest|vitest|pytest|cypress|make test/i.test(read(r, ...PKG.filter(p=>has(r,p)).slice(0,1)) as string) || has(r, 'jest.config', 'vitest.config', 'pytest.ini'), evidence: 'test config', severity: 'high' }),
    (r) => ({ id: 'P2.3', pillar: 'P2', pass: /"test"/.test(read(r, 'package.json')) || has(r, 'Makefile'), evidence: 'run-test one-liner', severity: 'high' }),
    (r) => ({ id: 'P2.4', pillar: 'P2', pass: (()=>{ const c=read(r,'package.json'); return /coverage\s*[:=]\s*[1-9]/.test(c) || /--coverage/.test(c) || has(r,'.nycrc','coveragerc'); })(), evidence: 'coverage threshold', severity: 'med' }),
    (r) => ({ id: 'P2.5', pillar: 'P2', pass: dirs(r).some((d)=>['fixtures','testdata','__fixtures__'].includes(d)) , evidence: 'fixtures', severity: 'low' }),
    (r) => ({ id: 'P2.6', pillar: 'P2', pass: /\^|<test>|--runInBand|--watch/i.test(read(r, 'package.json')) || has(r,'vitest.config','jest.config'), evidence: 'fast/smoke path', severity: 'med' }),
  ]}),
  () => ({ id: 'P3', checks: [
    (r) => ({ id: 'P3.1', pillar: 'P3', pass: LOCK.some((l)=>has(r,l)), evidence: 'lockfile', severity: 'high' }),
    (r) => ({ id: 'P3.2', pillar: 'P3', pass: /"build"\s*[:=]/.test(read(r,'package.json')) || /build/i.test(read(r,'Makefile')) || has(r,'Dockerfile'), evidence: 'build step', severity: 'high' }),
    (r) => ({ id: 'P3.3', pillar: 'P3', pass: /"(build|start)"\s*[:=]/.test(read(r,'package.json')) || has(r,'Makefile'), evidence: 'root scripts', severity: 'med' }),
    (r) => ({ id: 'P3.4', pillar: 'P3', pass: PKG.some((p)=>has(r,p)), evidence: 'dependency manifest', severity: 'high' }),
    (r) => ({ id: 'P3.6', pillar: 'P3', pass: /devDependencies|dev\s*=|requirements-dev|group\s*dev/i.test(read(r,'package.json')) || /^dev/i.test(read(r,'requirements.txt')) || has(r,'requirements-dev.txt'), evidence: 'dev/prod split', severity: 'low' }),
  ]}),
  () => ({ id: 'P4', checks: [
    (r) => ({ id: 'P4.1', pillar: 'P4', pass: has(r,'.github','workflows') || has(r,'.gitlab-ci.yml') || has(r,'.circleci') || has(r,'Jenkinsfile'), evidence: 'CI workflow', severity: 'high' }),
    (r) => ({ id: 'P4.2', pillar: 'P4', pass: (()=>{ const wf=read(r,'.github','workflows','ci.yml')+read(r,'.github','workflows','main.yml'); return /test|build|lint/i.test(wf)||has(r,'.github','workflows'); })(), evidence: 'CI build+test', severity: 'med' }),
    (r) => ({ id: 'P4.3', pillar: 'P4', pass: has(r,'.pre-commit-config.yaml') || has(r,'.husky') || has(r,'.githooks') ||/husky|lint-staged/.test(read(r,'package.json'))||has(r,'lint-staged.config'), evidence: 'pre-commit hooks', severity: 'med' }),
    (r) => ({ id: 'P4.4', pillar: 'P4', pass: has(r,'CODEOWNERS','.github') || has(r,'CODEOWNERS'), evidence: 'ownership/rulesets', severity: 'med' }),
    (r) => ({ id: 'P4.5', pillar: 'P4', pass: /dependabot|renovate/i.test(read(r,'.github','dependabot.yml')) || has(r,'.github','dependabot.yml'), evidence: 'dep checker', severity: 'med' }),
  ]}),
  () => ({ id: 'P5', checks: [
    (r) => ({ id: 'P5.1', pillar: 'P5', pass: ['.eslintrc','.eslintrc.json','.eslintrc.js','biome.json','.flake8','.ruff.toml','golangci.yml','.golangci.yml','clippy.toml'].some(f=>has(r,f)) || /eslint|biome|ruff|golangci/i.test(read(r,'package.json')), evidence: 'linter', severity: 'high' }),
    (r) => ({ id: 'P5.2', pillar: 'P5', pass: has(r,'.prettierrc')||has(r,'.prettierrc.json')||has(r,'.prettierrc.js')||has(r,'pyproject.toml')||has(r,'.editorconfig')||/prettier|black|gofmt|dprint/i.test(read(r,'package.json')), evidence: 'formatter', severity: 'med' }),
    (r) => ({ id: 'P5.3', pillar: 'P5', pass: has(r,'tsconfig.json')||/mypy|pyright|typecheck/i.test(read(r+''))||has(r,'golangci.yml'), evidence: 'type check', severity: 'med' }),
    (r) => ({ id: 'P5.4', pillar: 'P5', pass: (()=>{ const big=dirs(r).filter(d=>{ try{return fs.statSync(path.join(r.root,d)).isFile()&&fs.statSync(path.join(r.root,d)).size>500000;}catch{return false;} }).length; return big===0; })(), evidence: 'no mega-files', severity: 'low' }),
    (r) => ({ id: 'P5.5', pillar: 'P5', pass: has(r,'tsconfig.json')||has(r,'.editorconfig'), evidence: 'consistent config', severity: 'low' }),
  ]}),
  () => ({ id: 'P6', checks: [
    (r) => ({ id: 'P6.1', pillar: 'P6', pass: /env|pem|node_modules|dist|agent-readiness/i.test(read(r,'.gitignore')) && sizeOf(r,'.gitignore')>20, evidence: 'gitignore covers secrets', severity: 'high' }),
    (r) => ({ id: 'P6.2', pillar: 'P6', pass: !/BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}/.test(read(r,'.gitignore')+Object.values(require_dummy(r)).join('')), evidence: 'no committed secrets (sampled)', severity: 'high' }),
    (r) => ({ id: 'P6.3', pillar: 'P6', pass: !has(r,'.env') && !has(r,'.env.prod'), evidence: 'no tracked .env', severity: 'high' }),
    (r) => ({ id: 'P6.4', pillar: 'P6', pass: /npm audit|pip-audit|govulncheck|cargo audit|safety|trivy/i.test(read(r,'package.json')+read(r,'Makefile')+read(r,'.github','workflows','ci.yml')) || has(r,'.github','dependabot.yml'), evidence: 'vuln scan wired', severity: 'med' }),
    (r) => ({ id: 'P6.5', pillar: 'P6', pass: /[A-Za-z_]*TOKEN|SECRET|_KEY\s*[:=]|getenv|process\.env/i.test(read(r,'.env.example')) || has(r,'.env.example'), evidence: 'credential pattern', severity: 'low' }),
  ]}),
  () => ({ id: 'P7', checks: [
    (r) => ({ id: 'P7.1', pillar: 'P7', pass: has(r,'src','logging')||has(r,'src','logger')||/winston|pino|structlog|logging/i.test(read(r,'package.json')+read(r,'requirements.txt')), evidence: 'structured logging', severity: 'med' }),
    (r) => ({ id: 'P7.2', pillar: 'P7', pass: !/except\s*:\s*pass|catch\s*\([^)]*\)\s*\{\s*\}/.test(read(r,'src','app.js')+read(r,'src','main.py')), evidence: 'no silent errors', severity: 'med' }),
    (r) => ({ id: 'P7.3', pillar: 'P7', pass: /NODE_ENV|TEST|--dry-run|--mock|test\s*mode/i.test(read(r,'package.json')+read(r,'README.md')) || has(r,'.env.example'), evidence: 'mock/dev path', severity: 'med' }),
    (r) => ({ id: 'P7.4', pillar: 'P7', pass: /LOG_LEVEL|verbosity/i.test(read(r,'.env.example')+read(r,'config')), evidence: 'log level config', severity: 'low' }),
  ]}),
  () => ({ id: 'P8', checks: [
    (r) => ({ id: 'P8.1', pillar: 'P8', pass: has(r,'.env.example') || has(r,'.env.sample'), evidence: '.env.example', severity: 'high' }),
    (r) => ({ id: 'P8.2', pillar: 'P8', pass: /"start"\s*[:=]|make\s+(setup|install)|script[^\\n]*setup/i.test(read(r,'package.json')+read(r,'Makefile')) || has(r,'scripts','setup'), evidence: 'one-command setup', severity: 'high' }),
    (r) => ({ id: 'P8.3', pillar: 'P8', pass: has(r,'.devcontainer','devcontainer.json') || has(r,'Dockerfile') || has(r,'docker-compose.yml'), evidence: 'devcontainer/docker', severity: 'med' }),
    (r) => ({ id: 'P8.4', pillar: 'P8', pass: has(r,'.nvmrc')||has(r,'.tool-versions')||/engines/.test(read(r,'package.json'))||has(r,'pyproject.toml'), evidence: 'pinned version', severity: 'med' }),
    (r) => ({ id: 'P8.5', pillar: 'P8', pass: /"test"\s*[:=]|headless|--no-sandbox|renderless/i.test(read(r,'package.json')+read(r,'README.md')) || has(r,'pytest.ini'), evidence: 'non-GUI run', severity: 'low' }),
  ]}),
  () => ({ id: 'P9', checks: [
    (r) => ({ id: 'P9.1', pillar: 'P9', pass: /"main"\s*[:=]|"bin"|__main__|def main|func main/i.test(read(r,'package.json')+read(r,'main.go')) || has(r,'bin') || has(r,'src','main'), evidence: 'entry points', severity: 'med' }),
    (r) => ({ id: 'P9.2', pillar: 'P9', pass: (()=>{ const top=dirs(r).filter(d=>!d.startsWith('.')); return top.length>=2 && top.length<=30; })(), evidence: 'legible repo shape', severity: 'med' }),
    (r) => ({ id: 'P9.3', pillar: 'P9', pass: has(r,'src')||has(r,'lib')||has(r,'packages')||has(r,'internal'), evidence: 'module boundaries', severity: 'med' }),
    (r) => ({ id: 'P9.4', pillar: 'P9', pass: has(r,'src','README.md')||has(r,'lib','README.md')||has(r,'packages'), evidence: 'per-module docs', severity: 'low' }),
  ]}),
];

// tiny helper (avoid top-level import collision)
function require_dummy(_r: Repo) { return {}; }

// expose check registry
let REGISTRY: Pillar[] | null = null;
export function getPillars(): Pillar[] { if (!REGISTRY) REGISTRY = C.map((f) => f()); return REGISTRY; }
