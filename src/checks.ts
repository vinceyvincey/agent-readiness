// Deterministic readiness check batteries for the 10 pillars (D-checks only).
// Numeric score uses only these; the narrative judgment is separate (see engine).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export type Repo = { root: string };

export type Difficulty = 'basic' | 'intermediate' | 'advanced';
export type CheckResult = {
  id: string;
  pillar: string;
  pass: boolean;
  evidence: string;
  severity: 'high' | 'med' | 'low';
  difficulty?: Difficulty;
  app?: string;
  skipped?: boolean;
  verified?: boolean;
  runtimeEvidence?: string;
};

export interface Pillar {
  id: string;
  scope: 'repo' | 'app';
  checks: Array<(r: Repo) => CheckResult>;
}

// ---- filesystem helpers ----
const has = (r: Repo, ...parts: string[]) => fs.existsSync(path.join(r.root, ...parts));
const read = (r: Repo, ...parts: string[]) => {
  try {
    return fs.readFileSync(path.join(r.root, ...parts), 'utf8');
  } catch {
    return '';
  }
};
const sizeOf = (r: Repo, ...parts: string[]) => {
  try {
    return fs.statSync(path.join(r.root, ...parts)).size;
  } catch {
    return 0;
  }
};
const dirs = (r: Repo) => {
  try {
    return fs.readdirSync(r.root);
  } catch {
    return [];
  }
};

// ---- git-aware helpers ----
// Enumerate files tracked by git (falls back to empty array if not a git repo).
const gitTracked = (r: Repo): string[] => {
  try {
    const res = spawnSync('git', ['ls-files'], { cwd: r.root, encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) return res.stdout.split('\n').filter(Boolean);
  } catch {
    /* not git or git missing */
  }
  return [];
};

// Read a file by relative path from repo root.
const readRel = (r: Repo, rel: string): string => {
  try {
    return fs.readFileSync(path.join(r.root, rel), 'utf8');
  } catch {
    return '';
  }
};

// Check whether a CLI tool is available on PATH.
function toolOnPath(name: string): boolean {
  try {
    const res = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 3000 });
    return res.status === 0 || (!!res.stderr && res.stderr.length > 0); // some tools print to stderr
  } catch {
    return false;
  }
}

// Check if any of the named tools are in package.json devDependencies or on PATH.
// Used to verify that a config file corresponds to an actually-installed tool.
function toolInDepsOrPath(r: Repo, toolNames: string[]): boolean {
  const pkg = read(r, 'package.json');
  const pyproject = read(r, 'pyproject.toml');
  const reqs = read(r, 'requirements.txt');
  const reqsDev = read(r, 'requirements-dev.txt');
  const allText = pkg + pyproject + reqs + reqsDev;
  for (const name of toolNames) {
    if (new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i').test(allText)) return true;
    if (toolOnPath(name)) return true;
  }
  return false;
}

// Detect whether the repo is a web service (has an HTTP framework or server entry point).
// Used to determine if DAST and other web-only checks are applicable.
function isWebService(r: Repo): boolean {
  const pkg = read(r, 'package.json');
  const pyproject = read(r, 'pyproject.toml');
  const reqs = read(r, 'requirements.txt');
  const goMod = read(r, 'go.mod');
  const cargo = read(r, 'Cargo.toml');
  const deps = pkg + pyproject + reqs + goMod + cargo;
  // Common web frameworks / HTTP servers
  const webFrameworks =
    /\b(express|fastify|koa|hapi|next|nuxt|remix|astro|sveltekit|nestjs|@nestjs|axios|got|superagent)\b/i;
  const pyWeb = /\b(django|flask|fastapi|tornado|aiohttp|starlette|uvicorn|gunicorn)\b/i;
  const goWeb = /\b(net\/http|gin|echo|fiber|chi|gorilla)\b/i;
  const rustWeb = /\b(actix|axum|warp|rocket|tower)\b/i;
  // Also check for server entry points
  const serverFiles =
    has(r, 'src', 'server.ts') ||
    has(r, 'src', 'server.js') ||
    has(r, 'src', 'app.ts') ||
    has(r, 'src', 'app.js') ||
    has(r, 'main.go');
  // Check for Dockerfile with EXPOSE (indicates a service)
  const dockerfile = read(r, 'Dockerfile');
  const hasExpose = /EXPOSE/i.test(dockerfile);
  return webFrameworks.test(deps) || pyWeb.test(deps) || goWeb.test(deps) || rustWeb.test(deps) || hasExpose;
}

// Detect whether the app connects to a database (driver/ORM dependencies).
// Used to honor the "Skip for apps without databases" clauses (P8.8).
function usesDatabase(r: Repo): boolean {
  const deps =
    read(r, 'package.json') +
    read(r, 'requirements.txt') +
    read(r, 'pyproject.toml') +
    read(r, 'go.mod') +
    read(r, 'Cargo.toml');
  return /\b(prisma|typeorm|sequelize|knex|mikro-orm|mongoose|mongodb|mongo|pg|postgres(ql)?|mysql2?|mariadb|sqlite3?|better-sqlite3|redis|ioredis|couchdb|dynamodb|sqlalchemy|alembic|psycopg2?|pymysql|mysql-connector-python|gorm|sqlx|diesel|sea-orm)\b/i.test(
    deps,
  );
}

// Detect whether the app depends on external runtime services (queues, caches, brokers, DBs).
// Used to honor the "Skip for apps without external service dependencies" clause (P8.6).
function usesExternalService(r: Repo): boolean {
  if (usesDatabase(r)) return true;
  const deps =
    read(r, 'package.json') +
    read(r, 'requirements.txt') +
    read(r, 'pyproject.toml') +
    read(r, 'go.mod') +
    read(r, 'Cargo.toml');
  return /\b(kafka|kafkajs|rabbitmq|amqplib|nats|memcached|elasticsearch|opensearch|kinesis|bullmq|bull|celery|sidekiq|mqtt|grpc)\b/i.test(
    deps,
  );
}

// Detect whether the app is a deployed service (web framework, Dockerfile, or deploy workflow).
// Used to skip service-only checks (P7.5-P7.14, P4.16-P4.17) for CLI tools and libraries.
function isDeployedService(r: Repo): boolean {
  if (isWebService(r)) return true;
  if (has(r, 'Dockerfile') || has(r, 'docker-compose.yml') || has(r, 'compose.yml') || has(r, 'compose.yaml'))
    return true;
  // Check for deploy/release workflows in CI
  return /deploy|release/i.test(readWorkflows(r));
}

// Check if a logging module in src/logging/ or src/logger/ is actually imported
// by at least one non-test production source file.
function loggerImportedByProduction(r: Repo): boolean {
  const loggingDirs = ['src/logging', 'src/logger'];
  const hasLoggingDir = loggingDirs.some((d) => has(r, ...d.split('/')));
  if (!hasLoggingDir) return false; // no logging module dir to check
  // Scan production source files for imports of the logging module
  const sourceFiles = readDirRecursive(r, 'src').filter(
    (f) => !/\.test\./.test(f) && !/\.spec\./.test(f) && !/\.test\./.test(f),
  );
  for (const f of sourceFiles) {
    const content = readRel(r, 'src/' + f);
    // Check for import/require of logging module
    if (
      /(?:import|require|from)\s+['"][^'"]*(?:logging|logger)['"]/i.test(content) ||
      /(?:import|require|from)\s+['"]\.\.\/(?:logging|logger)/i.test(content) ||
      /(?:import|require|from)\s+['"]\.\/(?:logging|logger)/i.test(content)
    ) {
      return true;
    }
  }
  return false;
}

// Check if git hooks are actually activated (not just present on disk).
function gitHooksActivated(r: Repo): boolean {
  // Husky activation: .husky/_/ directory exists (husky v9+)
  if (has(r, '.husky', '_')) return true;
  // Husky v8: .husky/.gitignore exists and husky is in deps
  if (has(r, '.husky', 'pre-commit') && /husky/i.test(read(r, 'package.json'))) return true;
  // pre-commit framework: .pre-commit-config.yaml exists and pre-commit is on PATH
  if (has(r, '.pre-commit-config.yaml') && toolOnPath('pre-commit')) return true;
  // Git core.hooksPath is set
  try {
    const res = spawnSync('git', ['config', 'core.hooksPath'], { cwd: r.root, encoding: 'utf8', timeout: 3000 });
    if (res.status === 0 && res.stdout.trim().length > 0) return true;
  } catch {
    /* not git */
  }
  // lint-staged in deps (usually combined with husky, but also validates on its own)
  if (/lint-staged/i.test(read(r, 'package.json')) && has(r, '.husky')) return true;
  return false;
}

// Check if gh CLI is authenticated (returns org/repo slug or empty string).
function ghRepoSlug(r: Repo): string {
  try {
    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: r.root, encoding: 'utf8', timeout: 5000 });
    if (remote.status !== 0 || !remote.stdout) return '';
    const url = remote.stdout.trim();
    // Extract owner/repo from https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const match = url.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    return match ? `${match[1]}/${match[2]}` : '';
  } catch {
    return '';
  }
}

// Check if gh CLI is available and authenticated.
// Memoized per-process to avoid repeated `gh auth status` network probes
// (which can be slow in flaky/sandboxed environments when called from many checks).
let _ghAvailable: boolean | undefined;
function ghAvailable(): boolean {
  if (_ghAvailable !== undefined) return _ghAvailable;
  try {
    const res = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 5000 });
    _ghAvailable = res.status === 0;
  } catch {
    _ghAvailable = false;
  }
  return _ghAvailable;
}

// Run a gh API command and return the JSON response (or null).
const _ghApiCache = new Map<string, string>();
function ghApi(r: Repo, endpoint: string): string {
  if (_ghApiCache.has(endpoint)) return _ghApiCache.get(endpoint)!;
  let out = '';
  try {
    const res = spawnSync('gh', ['api', endpoint], { encoding: 'utf8', timeout: 10000 });
    out = res.status === 0 ? res.stdout || '' : '';
  } catch {
    out = '';
  }
  _ghApiCache.set(endpoint, out);
  return out;
}

// Create a skipped check result (for gh-CLI checks when prerequisites aren't met).
function skip(id: string, pillar: string, reason: string, severity: 'high' | 'med' | 'low' = 'low'): CheckResult {
  return { id, pillar, pass: true, evidence: `skipped: ${reason}`, severity, difficulty: 'advanced', skipped: true };
}

// Read all files in a directory (recursive, returns relative paths).
function readDirRecursive(r: Repo, ...parts: string[]): string[] {
  const dir = path.join(r.root, ...parts);
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...readDirRecursive(r, ...parts, entry.name));
      } else {
        results.push(entry.name);
      }
    }
    return results;
  } catch {
    return [];
  }
}

// Read all workflow files from .github/workflows/
function readWorkflows(r: Repo): string {
  const wfDir = path.join(r.root, '.github', 'workflows');
  try {
    const files = fs.readdirSync(wfDir);
    return files
      .map((f) => {
        try {
          return fs.readFileSync(path.join(wfDir, f), 'utf8');
        } catch {
          return '';
        }
      })
      .join('\n');
  } catch {
    return '';
  }
}

// ---- anti-gaming helpers ----
// Strip YAML frontmatter and HTML comments from markdown, return residual text.
function stripBoilerplate(text: string): string {
  let t = text.replace(/^---\n[\s\S]*?\n---\n?/, ''); // frontmatter
  t = t.replace(/<!--[\s\S]*?-->/g, ''); // HTML comments
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

// Built-in npm commands that don't require a package script entry.
const NPM_BUILTIN = new Set([
  'ci',
  'install',
  'i',
  'audit',
  'publish',
  'pack',
  'ls',
  'list',
  'outdated',
  'dedupe',
  'prune',
  'init',
  'link',
  'ln',
  'fund',
  'whoami',
  'view',
  'explain',
  'version',
  'run',
  'exec',
  'create',
  'search',
  'stars',
]);

// Check if any extracted command maps to a real script key, Makefile target, or pyproject entry.
function commandsMatchRealScript(r: Repo, commands: string[]): boolean {
  const pkg = read(r, 'package.json');
  const makefile = read(r, 'Makefile');
  const pyproject = read(r, 'pyproject.toml');
  const scriptKeys: string[] = [];
  try {
    const p = JSON.parse(pkg);
    if (p.scripts) scriptKeys.push(...Object.keys(p.scripts));
  } catch {
    /* not json */
  }
  const makeTargets = makefile
    .split('\n')
    .filter((l) => /^[a-zA-Z_-]+:/.test(l))
    .map((l) => l.split(':')[0].trim());
  const pyEntries = pyproject.match(/console_scripts[\s\S]*?=(.*)/g) || [];

  for (const cmd of commands) {
    // `npm test` / `npm run lint` → script key "test" / "lint"
    const npmRun = cmd.match(/npm\s+(?:run\s+)?(\S+)/);
    if (npmRun) {
      // Built-in npm commands (ci, install, audit, etc.) are always valid.
      if (NPM_BUILTIN.has(npmRun[1])) return true;
      // Otherwise, check if it's a real script key.
      if (scriptKeys.includes(npmRun[1])) return true;
    }
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
  let hasTest = false,
    hasLint = false;
  const files: string[] = [];
  try {
    for (const f of fs.readdirSync(wfDir)) if (/\.ya?ml$/i.test(f)) files.push(f);
  } catch {
    /* no workflows dir */
  }
  const testCmds =
    /\b(npm\s+(?:run\s+)?test|npx\s+vitest|npx\s+jest|pytest|make\s+test|go\s+test|cargo\s+test|deno\s+test)\b/;
  const lintCmds = /\b(npm\s+run\s+lint|npx\s+eslint|npx\s+biome|npx\s+tsc|ruff|flake8|golangci|cargo\s+clippy)\b/;
  for (const f of files) {
    const content = read(r, '.github', 'workflows', f);
    // Strip echo lines so `echo 'npm test'` doesn't count as a real invocation.
    const stripped = content
      .split('\n')
      .filter((l) => !/^\s*-?\s*echo\s/i.test(l))
      .join('\n');
    if (testCmds.test(stripped)) hasTest = true;
    if (lintCmds.test(stripped)) hasLint = true;
  }
  return { hasTest, hasLint, evidence: `${files.length} workflow(s), test=${hasTest}, lint=${hasLint}` };
}

// ---- secret-scanning helpers ----
const SECRET_PATTERNS: RegExp[] = [
  /BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY/,
  /-----BEGIN[\s\w]+PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/, // AWS access key
  /ghp_[A-Za-z0-9]{36}/, // GitHub PAT
  /github_pat_[A-Za-z0-9_]{40,}/, // GitHub fine-grained PAT
  /sk-[A-Za-z0-9]{20,}/, // OpenAI-style key
  /xox[baprs]-[0-9A-Za-z-]{10,}/, // Slack token
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
];
const BINARY_EXT =
  /\.(png|jpg|jpeg|gif|bmp|ico|woff2?|ttf|eot|otf|zip|tar|gz|bz2|jar|class|so|dylib|dll|exe|bin|pdf|mp[34]|mov|webp|wasm)$/i;

// Scan git-tracked files (or a best-effort recursive fallback) for secret patterns.
function scanTrackedSecrets(r: Repo): { hit: boolean; evidence: string } {
  let files = gitTracked(r);
  let source = 'tracked';
  if (!files.length) {
    // Not a git repo: best-effort recursive scan (top-level + src/, test/, lib/).
    files = ['src', 'test', 'lib', ''].flatMap((d) => {
      try {
        return fs
          .readdirSync(path.join(r.root, d), { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => (d ? d + '/' + e.name : e.name));
      } catch {
        return [];
      }
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
const PKG = [
  'package.json',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
  'requirements.txt',
  'composer.json',
  'pubspec.yaml',
  'Gemfile',
  'mix.exs',
  'pom.xml',
  'build.gradle',
];
const LOCK = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'Pipfile.lock',
  'requirements.lock',
  'Cargo.lock',
  'go.sum',
  'Gemfile.lock',
  'composer.lock',
  'mix.lock',
];
const TESTDIRS = ['test', 'tests', '__tests__', 'spec', 'specs'];

const C: Array<() => Pillar> = [
  () => ({
    id: 'P0',
    scope: 'repo',
    checks: [
      (r) => {
        const txt = read(r, 'README.md');
        const bytes = sizeOf(r, 'README.md');
        const lines = contentLineCount(txt);
        return {
          id: 'P0.1',
          pillar: 'P0',
          pass: bytes > 200 && lines >= 2,
          evidence: `README.md ${bytes}b, ${lines} content lines`,
          severity: 'high',
          difficulty: 'advanced',
        };
      },
      (r) => ({
        id: 'P0.2',
        pillar: 'P0',
        pass: /run|install|start|usage|quickstart/i.test(read(r, 'README.md')),
        evidence: 'run/usage section',
        severity: 'high',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P0.3',
        pillar: 'P0',
        pass: has(r, 'docs') || has(r, 'ARCHITECTURE.md'),
        evidence: 'docs or ARCHITECTURE',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P0.4',
        pillar: 'P0',
        pass: has(r, 'CHANGELOG.md') || /version/i.test(read(r, 'package.json')),
        evidence: 'changelog or version',
        severity: 'low',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P0.5',
        pillar: 'P0',
        pass: has(r, 'examples') || has(r, 'example'),
        evidence: 'examples dir',
        severity: 'low',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P0.6',
        pillar: 'P0',
        pass: /^#\s+[^\n]+/.test(read(r, 'README.md')) && read(r, 'README.md').length > 0,
        evidence: 'H1 in README',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      // M11: documentation_freshness — docs modified within 180 days.
      (r) => {
        try {
          const res = spawnSync(
            'git',
            [
              'log',
              '--since=180 days ago',
              '--name-only',
              '--pretty=format:',
              '--',
              'README.md',
              'AGENTS.md',
              'CONTRIBUTING.md',
              'docs/',
            ],
            { cwd: r.root, encoding: 'utf8', timeout: 5000 },
          );
          const fresh = res.status === 0 && res.stdout.trim().length > 0;
          return {
            id: 'P0.7',
            pillar: 'P0',
            pass: fresh,
            evidence: fresh ? 'docs modified within 180 days' : 'docs not modified in 180+ days',
            severity: 'med',
            difficulty: 'intermediate',
          };
        } catch {
          return {
            id: 'P0.7',
            pillar: 'P0',
            pass: false,
            evidence: 'git not available',
            severity: 'med',
            difficulty: 'intermediate',
          };
        }
      },
      // M11: automated_doc_generation — typedoc/jsdoc/sphinx config.
      // Verify tool is in deps or on PATH when a config file is the only evidence.
      (r) => {
        const hasConfig = has(r, 'typedoc.json') || has(r, 'typedoc.config.js');
        const hasDep = /typedoc|jsdoc|sphinx|mkdocs|docusaurus/i.test(
          read(r, 'package.json') + read(r, 'pyproject.toml'),
        );
        const hasInCI = /typedoc|jsdoc|sphinx|mkdocs|docusaurus/i.test(readWorkflows(r));
        const toolInstalled = toolInDepsOrPath(r, ['typedoc', 'jsdoc', 'sphinx-build', 'mkdocs', 'docusaurus']);
        const pass = hasDep || hasInCI || (hasConfig && toolInstalled);
        return {
          id: 'P0.8',
          pillar: 'P0',
          pass,
          evidence: pass
            ? hasDep || hasInCI
              ? 'automated doc generation in deps or CI'
              : 'doc generation tool installed + config present'
            : hasConfig
              ? 'doc generation config exists but tool not installed'
              : 'no automated doc generation',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M11: api_schema_docs — OpenAPI/Swagger/GraphQL schema files.
      // Criterion: "Skip for non-API apps (e.g., libraries, CLI tools without HTTP APIs)."
      (r) => {
        const hasApiSchema =
          [
            'openapi.json',
            'openapi.yaml',
            'openapi.yml',
            'swagger.json',
            'swagger.yaml',
            'swagger.yml',
            'schema.graphql',
          ].some((f) => {
            try {
              return fs.existsSync(path.join(r.root, f));
            } catch {
              return false;
            }
          }) ||
          (() => {
            try {
              for (const d of ['docs', 'api', 'openapi']) {
                const p = path.join(r.root, d);
                if (fs.existsSync(p))
                  for (const f of fs.readdirSync(p)) if (/openapi|swagger|\.graphql$|\.gql$/.test(f)) return true;
              }
            } catch {}
            return false;
          })();
        if (!hasApiSchema && !isWebService(r))
          return skip('P0.9', 'P0', 'non-API app (CLI/library, no HTTP service detected)', 'med');
        return {
          id: 'P0.9',
          pillar: 'P0',
          pass: hasApiSchema,
          evidence: 'API schema docs',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
    ],
  }),
  () => ({
    id: 'P1',
    scope: 'repo',
    checks: [
      (r) => {
        const bytes = sizeOf(r, 'AGENTS.md');
        const lines = contentLineCount(read(r, 'AGENTS.md'));
        return {
          id: 'P1.1',
          pillar: 'P1',
          pass: bytes > 100 && lines >= 2,
          evidence: `AGENTS.md ${bytes}b, ${lines} content lines`,
          severity: 'high',
          difficulty: 'advanced',
        };
      },
      (r) => {
        const txt = read(r, 'AGENTS.md');
        const cmds = extractCommands(txt);
        const hasRules = /must|always|never|run |\n- /i.test(txt);
        const cmdVerified = commandsMatchRealScript(r, cmds);
        return {
          id: 'P1.2',
          pillar: 'P1',
          pass: hasRules && cmdVerified,
          evidence: cmdVerified
            ? `AGENTS rules + ${cmds.length} command(s) verified`
            : 'AGENTS rules but no verified commands',
          severity: 'high',
          difficulty: 'advanced',
        };
      },
      (r) => ({
        id: 'P1.3',
        pillar: 'P1',
        pass: has(r, 'CONTRIBUTING.md') || sizeOf(r, 'AGENTS.md') > 200,
        evidence: 'contrib docs',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => {
        // P1.4: Validate MCP config content (not just file presence).
        // Also accept skills directories with actual SKILL.md files.
        let pass = false;
        let evidence = 'agent config/MCP';
        // Check CLAUDE.md (simple presence is fine — it's freeform agent context)
        if (has(r, 'CLAUDE.md')) {
          pass = true;
          evidence = 'CLAUDE.md agent context';
        }
        // Check mcp.json — validate it has MCP server structure
        if (!pass) {
          for (const f of ['mcp.json', '.mcp.json']) {
            if (has(r, f)) {
              try {
                const cfg = JSON.parse(read(r, f));
                // Valid MCP config has mcpServers key (or is an array of server configs)
                if (cfg && (cfg.mcpServers || Array.isArray(cfg))) {
                  pass = true;
                  evidence = `${f} with valid MCP server config`;
                } else {
                  evidence = `${f} exists but lacks mcpServers (not a valid MCP config)`;
                }
              } catch {
                evidence = `${f} exists but is not valid JSON`;
              }
              break;
            }
          }
        }
        // Check skills directories with actual SKILL.md files
        if (!pass) {
          const skillDirs = ['.factory/skills', 'skills', '.claude/skills', '.skills'];
          for (const sd of skillDirs) {
            const dirPath = path.join(r.root, ...sd.split('/'));
            try {
              const entries = fs.readdirSync(dirPath, { withFileTypes: true });
              const hasSkillMd = entries.some(
                (e) => e.isDirectory() && fs.existsSync(path.join(dirPath, e.name, 'SKILL.md')),
              );
              if (hasSkillMd) {
                pass = true;
                evidence = `skill found in ${sd}/`;
                break;
              }
            } catch {
              /* dir not found */
            }
          }
        }
        return {
          id: 'P1.4',
          pillar: 'P1',
          pass,
          evidence,
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      (r) => ({
        id: 'P1.5',
        pillar: 'P1',
        pass: has(r, 'Makefile') || has(r, 'justfile') || has(r, 'Taskfile.yml') || has(r, 'scripts', 'setup'),
        evidence: 'task shortcut',
        severity: 'low',
        difficulty: 'basic',
      }),
      (r) => {
        // P1.6: Validate lifecycle hook config is structurally valid, not just present.
        let pass = false;
        let evidence = 'droid/pi lifecycle hooks';
        // .factory/hooks.json — validate it's JSON with hook entries
        if (has(r, '.factory', 'hooks.json')) {
          try {
            const cfg = JSON.parse(read(r, '.factory', 'hooks.json'));
            if (cfg && typeof cfg === 'object' && Object.keys(cfg).length > 0) {
              pass = true;
              evidence = '.factory/hooks.json with valid hook entries';
            } else {
              evidence = '.factory/hooks.json exists but is empty or invalid';
            }
          } catch {
            evidence = '.factory/hooks.json exists but is not valid JSON';
          }
        }
        // .factory/settings.json with hooks key — validate hooks field has content
        if (!pass && has(r, '.factory', 'settings.json')) {
          try {
            const cfg = JSON.parse(read(r, '.factory', 'settings.json'));
            if (cfg?.hooks && typeof cfg.hooks === 'object' && Object.keys(cfg.hooks).length > 0) {
              pass = true;
              evidence = '.factory/settings.json with hooks config';
            }
          } catch {
            /* not json */
          }
        }
        // .pi/settings.json — validate hooks use recognized Pi schema fields.
        // Recognized hook types: preTool, postTool, preEdit, postEdit, preCommit, postCommit, etc.
        if (!pass && has(r, '.pi', 'settings.json')) {
          try {
            const cfg = JSON.parse(read(r, '.pi', 'settings.json'));
            // Pi settings hooks should be an object with recognized lifecycle event keys
            if (cfg?.hooks && typeof cfg.hooks === 'object' && Object.keys(cfg.hooks).length > 0) {
              // Check for at least one recognized hook lifecycle key
              const recognizedHooks = /^(pre|post)(Tool|Edit|Command|Commit|Merge|Push|Session)/i;
              const hasRecognized = Object.keys(cfg.hooks).some((k) => recognizedHooks.test(k));
              if (hasRecognized) {
                pass = true;
                evidence = '.pi/settings.json with recognized lifecycle hooks';
              } else {
                evidence = '.pi/settings.json has hooks but no recognized lifecycle event keys';
              }
            }
          } catch {
            /* not json */
          }
        }
        return {
          id: 'P1.6',
          pillar: 'P1',
          pass,
          evidence,
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      (r) => ({
        id: 'P1.7',
        pillar: 'P1',
        pass: has(r, '.factory', 'droids') || has(r, '.factory', 'subagents') || has(r, '.pi', 'fabric', 'droids'),
        evidence: 'custom droids/subagents',
        severity: 'low',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P1.8',
        pillar: 'P1',
        pass: has(r, '.factory', 'connectors.json') || /connectors/i.test(read(r, '.factory', 'settings.json')),
        evidence: 'connectors integration',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M14: agents_md_validation — CI job or hook that validates AGENTS.md accuracy.
      (r) => ({
        id: 'P1.9',
        pillar: 'P1',
        pass:
          /agents.*md|AGENTS\.md/i.test(readWorkflows(r)) ||
          /agents-md|agents.*validation/i.test(read(r, '.husky', 'pre-commit') + read(r, '.pre-commit-config.yaml')) ||
          /link-check|markdown-link/i.test(readWorkflows(r)),
        evidence: 'AGENTS.md validation automation',
        severity: 'low',
        difficulty: 'advanced',
      }),
    ],
  }),
  () => ({
    id: 'P2',
    scope: 'app',
    checks: [
      (r) => ({
        id: 'P2.1',
        pillar: 'P2',
        pass: dirs(r).some((d) => TESTDIRS.includes(d)) || dirs(r).some((f) => /(_test|_spec|\.test|\.spec)\./.test(f)),
        evidence: 'test files/dir',
        severity: 'high',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P2.2',
        pillar: 'P2',
        pass:
          /"test"\s*[:=]|jest|vitest|pytest|cypress|make test/i.test(
            read(r, ...PKG.filter((p) => has(r, p)).slice(0, 1)) as string,
          ) ||
          has(r, 'jest.config.ts') ||
          has(r, 'jest.config.js') ||
          has(r, 'vitest.config.ts') ||
          has(r, 'vitest.config.js') ||
          has(r, 'pytest.ini'),
        evidence: 'test config',
        severity: 'high',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P2.3',
        pillar: 'P2',
        pass:
          /"test"/.test(read(r, 'package.json')) ||
          has(r, 'Makefile') ||
          has(r, 'pytest.ini') ||
          /\[tool.pytest|pytest|coverage/.test(read(r, 'pyproject.toml')),
        evidence: 'run-test one-liner',
        severity: 'high',
        difficulty: 'intermediate',
      }),
      (r) => {
        const pkg = read(r, 'package.json');
        const py = read(r, 'pyproject.toml') + read(r, 'tox.ini') + read(r, '.coveragerc');
        const zeroThreshold = /coverage\s*[:=]\s*0\b/.test(pkg) || /fail_under\s*=\s*0\b/.test(py);
        if (zeroThreshold)
          return {
            id: 'P2.4',
            pillar: 'P2',
            pass: false,
            evidence: 'coverage threshold is 0 (decorative)',
            severity: 'med',
            difficulty: 'advanced',
          };
        const configured =
          /coverage\s*[:=]\s*[1-9]/.test(pkg) ||
          /--coverage/.test(pkg) ||
          has(r, '.nycrc') ||
          has(r, '.nycrc.json') ||
          has(r, '.coveragerc') ||
          has(r, 'coveragerc') ||
          /\[tool\.coverage|fail_under\s*=\s*[1-9]/.test(py);
        return {
          id: 'P2.4',
          pillar: 'P2',
          pass: configured,
          evidence: configured ? 'coverage threshold configured' : 'no coverage config',
          severity: 'med',
          difficulty: 'advanced',
        };
      },
      (r) => ({
        id: 'P2.5',
        pillar: 'P2',
        pass: dirs(r).some((d) => ['fixtures', 'testdata', '__fixtures__'].includes(d)),
        evidence: 'fixtures',
        severity: 'low',
        difficulty: 'basic',
      }),
      (r) => {
        const pkg = read(r, 'package.json');
        const makefile = read(r, 'Makefile');
        const pyproject = read(r, 'pyproject.toml');
        const hasFastScript = /"(test:fast|test:smoke|test-fast|test-smoke)"\s*[:=]/.test(pkg);
        const hasMakeFast = /^test-(fast|smoke):/m.test(makefile);
        const vitestCfg = has(r, 'vitest.config.ts')
          ? read(r, 'vitest.config.ts')
          : has(r, 'vitest.config.js')
            ? read(r, 'vitest.config.js')
            : '';
        const hasVitestIgnore = /testPathIgnorePatterns|exclude/i.test(vitestCfg);
        const jestCfg = has(r, 'jest.config.ts')
          ? read(r, 'jest.config.ts')
          : has(r, 'jest.config.js')
            ? read(r, 'jest.config.js')
            : '';
        const hasJestIgnore = /testPathIgnorePatterns/i.test(jestCfg);
        const fast = hasFastScript || hasMakeFast || hasVitestIgnore || hasJestIgnore;
        const hasRunner =
          has(r, 'vitest.config.ts') ||
          has(r, 'vitest.config.js') ||
          has(r, 'jest.config.ts') ||
          has(r, 'jest.config.js');
        return {
          id: 'P2.6',
          pillar: 'P2',
          pass: fast || /\^|<test>|--runInBand|--watch/i.test(pkg) || hasRunner,
          evidence: fast ? 'fast/smoke test path found' : 'test runner present',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M11: integration_tests_exist — cypress/playwright/e2e config.
      (r) => ({
        id: 'P2.7',
        pillar: 'P2',
        pass:
          has(r, 'cypress.config.ts') ||
          has(r, 'cypress.config.js') ||
          has(r, 'cypress.json') ||
          has(r, 'playwright.config.ts') ||
          has(r, 'playwright.config.js') ||
          dirs(r).some((d) => ['e2e', 'tests/e2e', '__e2e__'].includes(d)) ||
          has(r, 'tests', 'integration') ||
          has(r, 'test', 'integration'),
        evidence: 'integration/e2e test config',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      // M11: test_naming_conventions — testMatch/testRegex in jest/vitest config,
      // or documented naming conventions for custom test runners.
      (r) => {
        const vitest = read(r, 'vitest.config.ts') + read(r, 'vitest.config.js');
        const jest = read(r, 'jest.config.ts') + read(r, 'jest.config.js');
        const pyproject = read(r, 'pyproject.toml');
        const hasPattern =
          /testMatch|testRegex|testPathPattern/i.test(vitest + jest) ||
          (/\[tool\.pytest/.test(pyproject) && /python_files|testpaths/.test(pyproject)) ||
          // Also accept documented naming conventions for custom test runners
          /test.*naming|naming.*convention|\*\.test\.(ts|js|\*)|\*\.spec\.(ts|js|\*)/i.test(
            read(r, 'AGENTS.md') + read(r, 'README.md') + read(r, 'CONTRIBUTING.md'),
          );
        return {
          id: 'P2.8',
          pillar: 'P2',
          pass: hasPattern,
          evidence: hasPattern ? 'test naming conventions configured' : 'no test naming config',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M11: test_isolation — parallelization/sharding config,
      // or documented isolation for custom test runners.
      (r) => {
        const pkg = read(r, 'package.json');
        const vitest = read(r, 'vitest.config.ts') + read(r, 'vitest.config.js');
        const jest = read(r, 'jest.config.ts') + read(r, 'jest.config.js');
        const pyproject = read(r, 'pyproject.toml');
        const hasIsolation =
          /--parallel|shard|xdist|pytest-xdist|--runInBand/i.test(pkg + vitest + jest + pyproject) ||
          /threads|parallel/i.test(vitest + jest) ||
          // Also accept documented isolation/parallel execution for custom test runners
          /parallel|isolation|concurrent|worker/i.test(read(r, 'AGENTS.md') + read(r, 'README.md'));
        return {
          id: 'P2.9',
          pillar: 'P2',
          pass: hasIsolation,
          evidence: hasIsolation ? 'test isolation/parallelization configured' : 'no isolation config',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M14: flaky_test_detection — retry config or gh-CLI duplicate check detection.
      (r) => {
        const pkg = read(r, 'package.json');
        const pyproject = read(r, 'pyproject.toml');
        const hasRetry = /vitest-retry|pytest-rerunfailures|retry|i.?retry/i.test(pkg + pyproject);
        if (hasRetry)
          return {
            id: 'P2.10',
            pillar: 'P2',
            pass: true,
            evidence: 'test retry/flaky detection config',
            severity: 'low',
            difficulty: 'advanced',
          };
        if (!ghAvailable()) return skip('P2.10', 'P2', 'gh not authenticated');
        const slug = ghRepoSlug(r);
        if (!slug) return skip('P2.10', 'P2', 'no GitHub remote');
        return skip('P2.10', 'P2', 'gh-CLI flaky detection not available on this repo');
      },
      // M14: test_performance_tracking — test timing output or analytics platform.
      (r) => {
        const pkg = read(r, 'package.json');
        const pyproject = read(r, 'pyproject.toml');
        const wf = readWorkflows(r);
        const hasTiming = /--verbose|--durations|--reporter|test.?report|junit|xunit/i.test(pkg + pyproject + wf);
        const hasPlatform = /buildpulse|datadog.*ci|test.?report|allure/i.test(pkg + wf);
        return {
          id: 'P2.11',
          pillar: 'P2',
          pass: hasTiming || hasPlatform,
          evidence: hasTiming
            ? 'test timing output configured'
            : hasPlatform
              ? 'test analytics platform'
              : 'no test performance tracking',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M16: unit_tests_runnable — test runner configured AND test files exist (runtime verification via --verify).
      (r) => {
        const pkg = read(r, 'package.json');
        const pyproject = read(r, 'pyproject.toml');
        const hasTestScript =
          /"test"\s*[:=]/.test(pkg) ||
          /pytest/.test(pyproject) ||
          (has(r, 'Makefile') && /test/.test(read(r, 'Makefile')));
        const hasTestFiles =
          dirs(r).some((d) => TESTDIRS.includes(d)) || dirs(r).some((f) => /(_test|_spec|\.test|\.spec)\./.test(f));
        const hasRunner =
          has(r, 'vitest.config.ts') ||
          has(r, 'vitest.config.js') ||
          has(r, 'jest.config.ts') ||
          has(r, 'jest.config.js') ||
          has(r, 'pytest.ini') ||
          /pytest/.test(pyproject) ||
          has(r, 'go.mod');
        // For Go, test files are *_test.go
        const hasGoTests = has(r, 'go.mod') && readDirRecursive(r, '.').some((f) => /_test\.go$/.test(f));
        return {
          id: 'P2.12',
          pillar: 'P2',
          pass: (hasTestScript || hasRunner) && (hasTestFiles || hasGoTests),
          evidence: hasTestFiles || hasGoTests ? 'test runner + test files present' : 'test runner but no test files',
          severity: 'high',
          difficulty: 'intermediate',
        };
      },
    ],
  }),
  () => ({
    id: 'P3',
    scope: 'app',
    checks: [
      (r) => ({
        id: 'P3.1',
        pillar: 'P3',
        pass: LOCK.some((l) => has(r, l)),
        evidence: 'lockfile',
        severity: 'high',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P3.2',
        pillar: 'P3',
        pass:
          /"build"\s*[:=]/.test(read(r, 'package.json')) || /build/i.test(read(r, 'Makefile')) || has(r, 'Dockerfile'),
        evidence: 'build step',
        severity: 'high',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P3.3',
        pillar: 'P3',
        pass:
          /"(build|start)"\s*[:=]/.test(read(r, 'package.json')) ||
          has(r, 'Makefile') ||
          /\[project\.scripts|\[tool\.hatch|console_scripts|entry.?points/.test(read(r, 'pyproject.toml')),
        evidence: 'root scripts',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P3.4',
        pillar: 'P3',
        pass: PKG.some((p) => has(r, p)),
        evidence: 'dependency manifest',
        severity: 'high',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P3.6',
        pillar: 'P3',
        pass:
          /devDependencies|dev\s*=|requirements-dev|group\s*dev/i.test(read(r, 'package.json')) ||
          /^dev/i.test(read(r, 'requirements.txt')) ||
          has(r, 'requirements-dev.txt') ||
          /\[tool\.poetry\.group\.dev|dev\s*=\s*\[/.test(read(r, 'pyproject.toml')),
        evidence: 'dev/prod split',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M14: vcs_cli_tools — gh/glab CLI available and authenticated.
      (r) => ({
        id: 'P3.7',
        pillar: 'P3',
        pass: ghAvailable() || toolOnPath('glab'),
        evidence: ghAvailable() ? 'gh CLI authenticated' : toolOnPath('glab') ? 'glab CLI available' : 'no VCS CLI',
        severity: 'med',
        difficulty: 'advanced',
      }),
      // M14: monorepo_tooling — workspaces, turbo, nx, lerna, pnpm workspaces.
      (r) => {
        const pkg = read(r, 'package.json');
        const hasWorkspaces =
          /workspaces|workspace/i.test(pkg) ||
          has(r, 'pnpm-workspace.yaml') ||
          has(r, 'lerna.json') ||
          has(r, 'nx.json') ||
          has(r, 'turbo.json') ||
          (has(r, 'go.mod') && has(r, 'go.work')) ||
          (has(r, 'Cargo.toml') && /workspace/.test(read(r, 'Cargo.toml')));
        const isMonorepo = hasWorkspaces || dirs(r).includes('packages') || dirs(r).includes('apps');
        if (!isMonorepo) return skip('P3.8', 'P3', 'single-app repo', 'low');
        return {
          id: 'P3.8',
          pillar: 'P3',
          pass: hasWorkspaces,
          evidence: hasWorkspaces ? 'monorepo tooling configured' : 'monorepo without tooling',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M14: version_drift_detection — syncpack, manypkg, renovate grouping.
      (r) => {
        const hasSyncpack =
          has(r, '.syncpackrc') ||
          has(r, '.syncpackrc.json') ||
          has(r, 'syncpack.config.js') ||
          /syncpack/i.test(read(r, 'package.json'));
        const hasManypkg = has(r, '.manypkg') || has(r, 'manypkg.json');
        const hasRenovateGrouping = /group(?:ing|edRules)/i.test(
          read(r, 'renovate.json') + read(r, '.github', 'renovate.json'),
        );
        const isMonorepo = dirs(r).includes('packages') || /workspaces/i.test(read(r, 'package.json'));
        if (!isMonorepo) return skip('P3.9', 'P3', 'single-app repo', 'low');
        return {
          id: 'P3.9',
          pillar: 'P3',
          pass: hasSyncpack || hasManypkg || hasRenovateGrouping,
          evidence: hasSyncpack
            ? 'syncpack'
            : hasManypkg
              ? 'manypkg'
              : hasRenovateGrouping
                ? 'renovate grouping'
                : 'no version drift detection',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M14: min_release_age — renovate minimumReleaseAge/stabilityDays or documented policy.
      (r) => {
        const renovate = read(r, 'renovate.json') + read(r, '.github', 'renovate.json');
        const hasDelay = /minimumReleaseAge|stabilityDays|minimumReleaseAge/i.test(renovate);
        const hasPolicy = /dependency.?update.?policy|waiting.?period|release.?age/i.test(
          read(r, 'AGENTS.md') + read(r, 'CONTRIBUTING.md') + read(r, 'README.md'),
        );
        return {
          id: 'P3.10',
          pillar: 'P3',
          pass: hasDelay || hasPolicy,
          evidence: hasDelay
            ? 'renovate minimumReleaseAge configured'
            : hasPolicy
              ? 'documented dependency delay policy'
              : 'no min release age policy',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
    ],
  }),
  () => ({
    id: 'P4',
    scope: 'repo',
    checks: [
      (r) => ({
        id: 'P4.1',
        pillar: 'P4',
        pass:
          has(r, '.github', 'workflows') || has(r, '.gitlab-ci.yml') || has(r, '.circleci') || has(r, 'Jenkinsfile'),
        evidence: 'CI workflow',
        severity: 'high',
        difficulty: 'basic',
      }),
      (r) => {
        const wf = scanWorkflowForTestInvocation(r);
        return {
          id: 'P4.2',
          pillar: 'P4',
          pass: wf.hasTest,
          evidence: wf.evidence,
          severity: 'med',
          difficulty: 'advanced',
        };
      },
      (r) => {
        // P4.3: Verify pre-commit hooks are actually activated, not just present on disk.
        const hasHookFiles =
          has(r, '.pre-commit-config.yaml') ||
          has(r, '.husky') ||
          has(r, '.githooks') ||
          /husky|lint-staged/.test(read(r, 'package.json')) ||
          has(r, 'lint-staged.config');
        if (!hasHookFiles) {
          return {
            id: 'P4.3',
            pillar: 'P4',
            pass: false,
            evidence: 'no pre-commit hooks found',
            severity: 'med',
            difficulty: 'intermediate',
          };
        }
        const activated = gitHooksActivated(r);
        return {
          id: 'P4.3',
          pillar: 'P4',
          pass: activated,
          evidence: activated
            ? 'pre-commit hooks found and activated'
            : 'hook files exist but not activated (core.hooksPath unset, no .husky/_/, pre-commit not on PATH)',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      (r) => ({
        id: 'P4.4',
        pillar: 'P4',
        pass: has(r, 'CODEOWNERS', '.github') || has(r, 'CODEOWNERS'),
        evidence: 'ownership/rulesets',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P4.5',
        pillar: 'P4',
        pass: /dependabot|renovate/i.test(read(r, '.github', 'dependabot.yml')) || has(r, '.github', 'dependabot.yml'),
        evidence: 'dep checker',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P4.6',
        pillar: 'P4',
        pass: has(r, '.github', 'ISSUE_TEMPLATE') || has(r, '.github', 'issue_template'),
        evidence: 'issue templates',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P4.7',
        pillar: 'P4',
        pass:
          has(r, '.github', 'PULL_REQUEST_TEMPLATE.md') ||
          has(r, '.github', 'pull_request_template.md') ||
          has(r, '.github', 'PULL_REQUEST_TEMPLATE') ||
          has(r, '.github', 'pull_request_template'),
        evidence: 'PR templates',
        severity: 'low',
        difficulty: 'basic',
      }),
      // M11: issue_labeling_system — .github/labels.yml or label config.
      (r) => ({
        id: 'P4.8',
        pillar: 'P4',
        pass:
          has(r, '.github', 'labels.yml') ||
          has(r, '.github', 'labels.json') ||
          has(r, '.github', 'labeler.yml') ||
          has(r, '.github', 'labeler.yaml') ||
          /labels/i.test(read(r, '.github', 'workflows', 'ci.yml')),
        evidence: 'issue labeling system',
        severity: 'low',
        difficulty: 'basic',
      }),
      // M11: release_automation — CD workflow or semantic-release config.
      // Verify tool is in deps when a config file is the only evidence (not just a CI workflow).
      (r) => {
        const hasWorkflow =
          has(r, '.github', 'workflows', 'release.yml') || has(r, '.github', 'workflows', 'deploy.yml');
        const hasConfig = has(r, '.releaserc.json') || has(r, '.releaserc') || has(r, 'release.config.js');
        const hasDep = /semantic-release|changesets|release-please/i.test(read(r, 'package.json'));
        const hasChangesetDir = has(r, '.changeset') || has(r, '.changesets');
        const toolInstalled = toolInDepsOrPath(r, ['semantic-release', 'changeset']);
        // Pass if: CI workflow exists (workflow is sufficient evidence), OR tool is in deps, OR
        // config file exists AND tool is installed, OR changesets directory exists
        const pass = hasWorkflow || hasDep || (hasConfig && toolInstalled) || hasChangesetDir;
        return {
          id: 'P4.9',
          pillar: 'P4',
          pass,
          evidence: pass
            ? hasWorkflow
              ? 'release/deploy workflow in CI'
              : hasDep
                ? 'release automation tool in dependencies'
                : 'release automation config + tool installed'
            : hasConfig
              ? 'release config file exists but tool not installed'
              : 'no release automation',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M14: fast_ci_feedback — gh-CLI: CI duration under 10 min.
      (r) => {
        if (!ghAvailable()) return skip('P4.10', 'P4', 'gh not authenticated');
        const slug = ghRepoSlug(r);
        if (!slug) return skip('P4.10', 'P4', 'no GitHub remote');
        // Check for CI caching as a proxy (fast CI often has caching configured).
        const hasCache = /cache|turbo|nx.*cache|buildx.*cache/i.test(
          readWorkflows(r) + read(r, 'package.json') + read(r, 'turbo.json') + read(r, 'nx.json'),
        );
        return {
          id: 'P4.10',
          pillar: 'P4',
          pass: hasCache,
          evidence: hasCache ? 'CI caching configured (fast feedback likely)' : 'no CI caching detected',
          severity: 'med',
          difficulty: 'advanced',
        };
      },
      // M14: build_performance_tracking — build caching and metrics.
      (r) => {
        const hasCache = /cache|turbo.*cache|nx.*cache|webpack.*cache|buildx.*cache/i.test(
          read(r, 'package.json') + read(r, 'turbo.json') + read(r, 'nx.json') + readWorkflows(r),
        );
        const hasMetrics = /build.?metric|build.?timing|build.?performance/i.test(
          readWorkflows(r) + read(r, 'README.md') + read(r, 'AGENTS.md'),
        );
        return {
          id: 'P4.11',
          pillar: 'P4',
          pass: hasCache || hasMetrics,
          evidence: hasCache
            ? 'build caching configured'
            : hasMetrics
              ? 'build metrics tracked'
              : 'no build performance tracking',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M14: deployment_frequency — gh-CLI: releases or deploy workflows.
      (r) => {
        const hasDeployWf = /deploy/i.test(readWorkflows(r)) || has(r, '.github', 'workflows', 'deploy.yml');
        const hasReleases = has(r, '.github', 'workflows', 'release.yml') || has(r, '.releaserc.json');
        if (!ghAvailable())
          return {
            id: 'P4.12',
            pillar: 'P4',
            pass: hasDeployWf || hasReleases,
            evidence: hasDeployWf
              ? 'deploy workflow exists'
              : hasReleases
                ? 'release workflow exists'
                : 'no deployment automation',
            severity: 'low',
            difficulty: 'advanced',
          };
        const slug = ghRepoSlug(r);
        if (!slug) return skip('P4.12', 'P4', 'no GitHub remote');
        return {
          id: 'P4.12',
          pillar: 'P4',
          pass: hasDeployWf || hasReleases,
          evidence: hasDeployWf
            ? 'deploy workflow exists'
            : hasReleases
              ? 'release workflow exists'
              : 'no deployment automation',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M14: backlog_health — gh-CLI: issue title/label quality.
      (r) => {
        if (!ghAvailable()) return skip('P4.13', 'P4', 'gh not authenticated');
        const slug = ghRepoSlug(r);
        if (!slug) return skip('P4.13', 'P4', 'no GitHub remote');
        return skip('P4.13', 'P4', 'backlog health requires gh API access to issues');
      },
      // M14: feature_flag_infrastructure — LaunchDarkly/Statsig/Unleash/GrowthBook in deps.
      (r) => ({
        id: 'P4.14',
        pillar: 'P4',
        pass: /launchdarkly|statsig|unleash|growthbook|flipper|flop/i.test(
          read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'pyproject.toml') + read(r, 'go.mod'),
        ),
        evidence: 'feature flag infrastructure',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      // M14: release_notes_automation — semantic-release/changesets/standard-version.
      // Verify tool is in deps when a config file is the only evidence (changesets dir is sufficient).
      (r) => {
        const hasConfig = has(r, '.releaserc.json') || has(r, '.releaserc') || has(r, 'release.config.js');
        const hasChangesetDir = has(r, '.changeset') || has(r, '.changesets');
        const hasDep = /semantic-release|changesets|standard-version|release-please|conventional.?changelog/i.test(
          read(r, 'package.json'),
        );
        const toolInstalled = toolInDepsOrPath(r, [
          'semantic-release',
          'changeset',
          'standard-version',
          'release-please',
        ]);
        const pass = hasChangesetDir || hasDep || (hasConfig && toolInstalled);
        return {
          id: 'P4.15',
          pillar: 'P4',
          pass,
          evidence: pass
            ? hasDep
              ? 'release notes tool in dependencies'
              : hasChangesetDir
                ? 'changesets directory present'
                : 'release notes config + tool installed'
            : hasConfig
              ? 'release notes config exists but tool not installed'
              : 'no release notes automation',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M14: progressive_rollout — canary/percentage rollout configs.
      // Skip for repos without deployment artifacts (no Dockerfile, deploy workflow, or k8s).
      (r) => {
        if (!isDeployedService(r))
          return skip(
            'P4.16',
            'P4',
            'no deployment artifacts (no Dockerfile, deploy workflow, or k8s manifests)',
            'low',
          );
        return {
          id: 'P4.16',
          pillar: 'P4',
          pass: /canary|rollout|argorollout|flagger|percentage.?based/i.test(
            readWorkflows(r) + read(r, 'README.md') + read(r, 'AGENTS.md') + read(r, 'deploy.yaml') + read(r, 'k8s'),
          ),
          evidence: 'progressive rollout configured',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M14: rollback_automation — rollback workflow or documented procedure.
      // Skip for repos without deployment artifacts.
      (r) => {
        if (!isDeployedService(r))
          return skip(
            'P4.17',
            'P4',
            'no deployment artifacts (no Dockerfile, deploy workflow, or k8s manifests)',
            'low',
          );
        return {
          id: 'P4.17',
          pillar: 'P4',
          pass:
            /rollback|revert.?auto|argo.?sync.?rollback/i.test(
              readWorkflows(r) + read(r, 'README.md') + read(r, 'AGENTS.md'),
            ) || has(r, '.github', 'workflows', 'rollback.yml'),
          evidence: 'rollback automation',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
    ],
  }),
  () => ({
    id: 'P5',
    scope: 'app',
    checks: [
      (r) => ({
        id: 'P5.1',
        pillar: 'P5',
        pass:
          [
            '.eslintrc',
            '.eslintrc.json',
            '.eslintrc.js',
            'biome.json',
            '.flake8',
            '.ruff.toml',
            'golangci.yml',
            '.golangci.yml',
            'clippy.toml',
          ].some((f) => has(r, f)) || /eslint|biome|ruff|golangci/i.test(read(r, 'package.json')),
        evidence: 'linter',
        severity: 'high',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P5.2',
        pillar: 'P5',
        pass:
          has(r, '.prettierrc') ||
          has(r, '.prettierrc.json') ||
          has(r, '.prettierrc.js') ||
          has(r, 'pyproject.toml') ||
          has(r, '.editorconfig') ||
          /prettier|black|gofmt|dprint/i.test(read(r, 'package.json')),
        evidence: 'formatter',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P5.3',
        pillar: 'P5',
        pass:
          has(r, 'tsconfig.json') ||
          /mypy|pyright|typecheck/i.test(read(r, 'pyproject.toml') + read(r, 'setup.cfg')) ||
          has(r, 'go.mod') ||
          has(r, 'Cargo.toml'),
        evidence: 'type check config',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P5.4',
        pillar: 'P5',
        pass: (() => {
          const big = dirs(r).filter((d) => {
            try {
              return fs.statSync(path.join(r.root, d)).isFile() && fs.statSync(path.join(r.root, d)).size > 500000;
            } catch {
              return false;
            }
          }).length;
          return big === 0;
        })(),
        evidence: 'no mega-files',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P5.5',
        pillar: 'P5',
        pass: has(r, 'tsconfig.json') || has(r, '.editorconfig'),
        evidence: 'consistent config',
        severity: 'low',
        difficulty: 'basic',
      }),
      // M10: strict typing — not just tsconfig existence, but strict mode enabled (presence ≠ signal).
      (r) => {
        const tsconfig = read(r, 'tsconfig.json');
        const hasStrict = /"strict"\s*:\s*true/.test(tsconfig);
        const hasPyStrict =
          has(r, 'pyproject.toml') &&
          /strict\s*=\s*true|mypy.*strict|disallow_untyped/i.test(read(r, 'pyproject.toml'));
        return {
          id: 'P5.6',
          pillar: 'P5',
          pass: hasStrict || hasPyStrict,
          evidence: hasStrict
            ? 'strict TypeScript enabled'
            : hasPyStrict
              ? 'strict Python typing enabled'
              : 'no strict typing config',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M11: naming_consistency — naming convention docs or ESLint naming rules.
      (r) => ({
        id: 'P5.7',
        pillar: 'P5',
        pass:
          /naming-convention|naming.style|camelCase|snake_case|PascalCase/i.test(
            read(r, 'AGENTS.md') + read(r, 'CONTRIBUTING.md'),
          ) ||
          /naming-convention/i.test(
            read(r, '.eslintrc') + read(r, '.eslintrc.json') + read(r, '.eslintrc.js') + read(r, 'eslint.config.js'),
          ),
        evidence: 'naming consistency rules',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M11: dead_code_detection — knip/vulture/staticcheck config.
      // Verify tool is in deps or on PATH when a config file is the only evidence.
      (r) => {
        const hasConfig = has(r, 'knip.json') || has(r, 'knip.ts') || has(r, '.knip.json') || has(r, '.vulture');
        const hasDep = /knip|vulture|unimported/i.test(read(r, 'package.json') + read(r, 'pyproject.toml'));
        const toolInstalled = toolInDepsOrPath(r, ['knip', 'vulture', 'unimported']);
        const pass = hasDep || (hasConfig && toolInstalled) || toolInstalled;
        return {
          id: 'P5.8',
          pillar: 'P5',
          pass,
          evidence: pass
            ? hasDep
              ? 'dead code tool in dependencies'
              : 'dead code tool installed + config present'
            : hasConfig
              ? 'dead code config file exists but tool not installed (not in deps or PATH)'
              : 'no dead code detection tooling',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M11: duplicate_code_detection — jscpd/CPD config.
      // Verify tool is in deps or on PATH when a config file is the only evidence.
      (r) => {
        const hasConfig = has(r, '.jscpd.json') || has(r, 'jscpd.json');
        const hasDep = /jscpd/i.test(read(r, 'package.json') + read(r, 'pyproject.toml'));
        const toolInstalled = toolInDepsOrPath(r, ['jscpd']);
        const pass = hasDep || (hasConfig && toolInstalled) || toolInstalled;
        return {
          id: 'P5.9',
          pillar: 'P5',
          pass,
          evidence: pass
            ? hasDep
              ? 'jscpd in dependencies'
              : 'jscpd installed + config present'
            : hasConfig
              ? 'jscpd config file exists but tool not installed (not in deps or PATH)'
              : 'no duplicate code detection tooling',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M11: cyclomatic_complexity — complexity analysis config.
      (r) => ({
        id: 'P5.10',
        pillar: 'P5',
        pass:
          /complexity|max-complexity|cognitive/i.test(
            read(r, '.eslintrc') +
              read(r, '.eslintrc.json') +
              read(r, '.eslintrc.js') +
              read(r, 'eslint.config.js') +
              read(r, '.flake8') +
              read(r, '.ruff.toml') +
              read(r, 'pyproject.toml'),
          ) ||
          has(r, 'gocyclo') ||
          has(r, '.golangci.yml'),
        evidence: 'cyclomatic complexity analysis',
        severity: 'low',
        difficulty: 'advanced',
      }),
      // M11: unused_dependencies_detection — depcheck/knip/deptry config.
      // Verify tool is in deps or on PATH when a config file is the only evidence.
      (r) => {
        const hasConfig =
          has(r, '.depcheckrc') || has(r, '.depcheckrc.json') || has(r, 'knip.json') || has(r, 'knip.ts');
        const hasDep = /depcheck|deptry|knip/i.test(read(r, 'package.json') + read(r, 'pyproject.toml'));
        const toolInstalled = toolInDepsOrPath(r, ['depcheck', 'knip', 'deptry']);
        const pass = hasDep || (hasConfig && toolInstalled) || toolInstalled;
        return {
          id: 'P5.11',
          pillar: 'P5',
          pass,
          evidence: pass
            ? hasDep
              ? 'unused dep tool in dependencies'
              : 'unused dep tool installed + config present'
            : hasConfig
              ? 'unused dep config exists but tool not installed'
              : 'no unused dependencies detection',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M11: large_file_detection — .gitattributes LFS or linter max-lines rules.
      (r) => ({
        id: 'P5.12',
        pillar: 'P5',
        pass:
          /filter=lfs|lfs/i.test(read(r, '.gitattributes')) ||
          /max-lines|max-module-lines|max-file-lines/i.test(
            read(r, '.eslintrc') +
              read(r, '.eslintrc.json') +
              read(r, '.eslintrc.js') +
              read(r, 'eslint.config.js') +
              read(r, '.flake8') +
              read(r, '.ruff.toml') +
              read(r, 'pyproject.toml'),
          ),
        evidence: 'large file detection tooling',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M14: code_quality_metrics — coverage/complexity monitoring (gh-CLI or config).
      (r) => {
        const hasCodecov =
          has(r, 'codecov.yml') || /codecov|coveralls|sonar/i.test(readWorkflows(r) + read(r, 'package.json'));
        const hasSonar = has(r, 'sonar-project.properties') || has(r, '.sonarcloud.properties');
        if (hasCodecov || hasSonar)
          return {
            id: 'P5.13',
            pillar: 'P5',
            pass: true,
            evidence: 'code quality metrics tracked',
            severity: 'low',
            difficulty: 'advanced',
          };
        if (!ghAvailable()) return skip('P5.13', 'P5', 'gh not authenticated');
        const slug = ghRepoSlug(r);
        if (!slug) return skip('P5.13', 'P5', 'no GitHub remote');
        return skip('P5.13', 'P5', 'code quality metrics require gh API or config');
      },
      // M14: tech_debt_tracking — TODO/FIXME scanner, SonarQube SQALE.
      (r) => ({
        id: 'P5.14',
        pillar: 'P5',
        pass:
          /todo.?scanner|fixme.?scan|sqale|sonar/i.test(
            readWorkflows(r) +
              read(r, '.eslintrc') +
              read(r, '.eslintrc.json') +
              read(r, 'eslint.config.js') +
              read(r, 'package.json'),
          ) ||
          has(r, 'sonar-project.properties') ||
          /no-unsanitized.?todo|fixme/i.test(read(r, '.eslintrc') + read(r, 'eslint.config.js')),
        evidence: 'tech debt tracking tooling',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M14: dead_feature_flag_detection — flag cleanup tooling.
      (r) => {
        const hasFlagPlatform = /launchdarkly|statsig|unleash|growthbook/i.test(
          read(r, 'package.json') + read(r, 'requirements.txt'),
        );
        if (!hasFlagPlatform) return skip('P5.15', 'P5', 'no feature flag platform (prerequisite)');
        const hasCleanup = /stale.?flag|dead.?flag|flag.?cleanup|code.?reference/i.test(
          read(r, 'README.md') + read(r, 'AGENTS.md') + readWorkflows(r),
        );
        return {
          id: 'P5.15',
          pillar: 'P5',
          pass: hasCleanup,
          evidence: hasCleanup ? 'dead flag detection mechanism' : 'no dead flag detection',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M14: heavy_dependency_detection — bundle analyzer, size-limit.
      (r) => ({
        id: 'P5.16',
        pillar: 'P5',
        pass:
          /bundle.?analyz|size.?limit|bundlesize|bundlewatch|webpack.?bundle.?analyz|rollup.?plugin.?visualiz/i.test(
            read(r, 'package.json') + readWorkflows(r),
          ) ||
          has(r, '.bundlewatchrc') ||
          has(r, '.size-limit.json') ||
          has(r, 'size-limit.json'),
        evidence: 'heavy dependency / bundle size detection',
        severity: 'low',
        difficulty: 'intermediate',
      }),
    ],
  }),
  () => ({
    id: 'P6',
    scope: 'repo',
    checks: [
      (r) => {
        const gi = read(r, '.gitignore');
        const patterns = gitignorePatternCount(gi);
        return {
          id: 'P6.1',
          pillar: 'P6',
          pass: /env|pem|node_modules|dist|agent-readiness/i.test(gi) && patterns >= 3,
          evidence: `.gitignore ${patterns} patterns`,
          severity: 'high',
          difficulty: 'intermediate',
        };
      },
      (r) => {
        const scan = scanTrackedSecrets(r);
        return {
          id: 'P6.2',
          pillar: 'P6',
          pass: !scan.hit,
          evidence: scan.evidence,
          severity: 'high',
          difficulty: 'advanced',
        };
      },
      (r) => ({
        id: 'P6.3',
        pillar: 'P6',
        pass: (() => {
          const tracked = gitTracked(r);
          if (tracked.length) return !tracked.some((f) => /^\.env(\.(prod|local|development|staging))?$/i.test(f));
          return !has(r, '.env') && !has(r, '.env.prod');
        })(),
        evidence: 'no tracked .env (git-aware)',
        severity: 'high',
        difficulty: 'advanced',
      }),
      (r) => {
        const hasGitleaks = toolOnPath('gitleaks');
        const hasTrufflehog = toolOnPath('trufflehog');
        if (hasGitleaks || hasTrufflehog) {
          const tool = hasGitleaks ? 'gitleaks' : 'trufflehog';
          try {
            const res = spawnSync(tool, hasGitleaks ? ['detect', '--no-banner'] : ['filesystem', '--no-verify'], {
              cwd: r.root,
              encoding: 'utf8',
              timeout: 15000,
            });
            const clean = res.status === 0;
            return {
              id: 'P6.4',
              pillar: 'P6',
              pass: clean,
              evidence: `${tool} scan ${clean ? 'clean' : 'found findings'}`,
              severity: 'med',
              difficulty: 'advanced',
            };
          } catch {
            /* fall through */
          }
        }
        const auditRe = /npm audit|pip-audit|govulncheck|cargo audit|safety|trivy/i;
        const wired =
          auditRe.test(read(r, 'package.json') + read(r, 'Makefile') + read(r, '.github', 'workflows', 'ci.yml')) ||
          has(r, '.github', 'dependabot.yml');
        return {
          id: 'P6.4',
          pillar: 'P6',
          pass: wired,
          evidence: wired ? 'vuln scan wired' : 'no vuln scan',
          severity: 'med',
          difficulty: 'advanced',
        };
      },
      (r) => ({
        id: 'P6.5',
        pillar: 'P6',
        pass:
          /[A-Za-z_]*TOKEN|SECRET|_KEY\s*[:=]|getenv|process\.env/i.test(read(r, '.env.example')) ||
          has(r, '.env.example'),
        evidence: 'credential pattern',
        severity: 'low',
        difficulty: 'basic',
      }),
      // M14: branch_protection — gh-CLI: check branch protection rules.
      (r) => {
        if (!ghAvailable()) return skip('P6.6', 'P6', 'gh not authenticated');
        const slug = ghRepoSlug(r);
        if (!slug) return skip('P6.6', 'P6', 'no GitHub remote');
        const rulesets = ghApi(r, `repos/${slug}/rulesets`);
        const hasProtection = rulesets && rulesets.length > 0 && /require|enforce|review/i.test(rulesets);
        return {
          id: 'P6.6',
          pillar: 'P6',
          pass: !!hasProtection,
          evidence: hasProtection ? 'branch protection rulesets found' : 'no branch protection rulesets',
          severity: 'med',
          difficulty: 'advanced',
        };
      },
      // M14: automated_security_review — gh-CLI: code-scanning alerts or SAST config.
      (r) => {
        const hasSast =
          /semgrep|codeql|snyk|sonar/i.test(readWorkflows(r) + read(r, 'package.json')) ||
          has(r, '.github', 'workflows', 'codeql.yml');
        if (hasSast)
          return {
            id: 'P6.7',
            pillar: 'P6',
            pass: true,
            evidence: 'SAST tooling configured',
            severity: 'med',
            difficulty: 'advanced',
          };
        if (!ghAvailable()) return skip('P6.7', 'P6', 'gh not authenticated');
        const slug = ghRepoSlug(r);
        if (!slug) return skip('P6.7', 'P6', 'no GitHub remote');
        return skip('P6.7', 'P6', 'code-scanning requires gh API admin access');
      },
      // M14: privacy_compliance — consent SDK, GDPR/CCPA handling.
      (r) => ({
        id: 'P6.8',
        pillar: 'P6',
        pass: /onetrust|cookiebot|consent|gdpr|ccpa|data.?retention|privacy.?policy|right.?to.?be.?forgotten|data.?deletion/i.test(
          read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'README.md') + read(r, 'AGENTS.md'),
        ),
        evidence: 'privacy compliance infrastructure',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M14: dast_scanning — OWASP ZAP, Nuclei in CI.
      // Skip for non-web apps (DAST tests running HTTP endpoints, which don't exist for CLI/library repos).
      (r) => {
        if (!isWebService(r)) return skip('P6.9', 'P6', 'no web service detected (DAST not applicable)', 'low');
        const hasDast = /zap|owasp.?zap|nuclei|burp|stackhawk|acunetix/i.test(
          readWorkflows(r) + read(r, 'package.json'),
        );
        return {
          id: 'P6.9',
          pillar: 'P6',
          pass: hasDast,
          evidence: hasDast ? 'DAST scanning in CI' : 'web service detected but no DAST scanning',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M16: pii_handling — PII detection tools, data masking, PII documentation.
      (r) => {
        const deps = read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'pyproject.toml');
        const docs =
          read(r, 'AGENTS.md') +
          read(r, 'README.md') +
          read(r, 'docs', 'privacy.md') +
          read(r, 'docs', 'data-handling.md');
        const hasTools = /presidio|macie|dlp|detect-secrets|faker|masking|anonymiz/i.test(deps);
        const hasDocs = /pii|personal.*data|gdpr|ccpa|data.?retention|privacy.?by.?design/i.test(docs);
        // Skip if no user-facing code (no routes, no auth, no user model patterns)
        const hasUserFacing = /route|router|auth|login|user|session|cookie|jwt|passport/i.test(
          read(r, 'package.json') +
            read(r, 'src', 'app.ts') +
            read(r, 'src', 'app.js') +
            read(r, 'src', 'index.ts') +
            read(r, 'main.go'),
        );
        if (!hasUserFacing && !hasTools && !hasDocs) return skip('P6.10', 'P6', 'no user-facing code detected');
        return {
          id: 'P6.10',
          pillar: 'P6',
          pass: hasTools || hasDocs,
          evidence: hasTools ? 'PII detection tooling found' : hasDocs ? 'PII handling documented' : 'no PII handling',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
    ],
  }),
  () => ({
    id: 'P7',
    scope: 'app',
    checks: [
      (r) => {
        // P7.1: Verify structured logging is actually used, not just present.
        const hasLoggingDir = has(r, 'src', 'logging') || has(r, 'src', 'logger');
        const hasLoggingDep = /winston|pino|structlog|logging/i.test(
          read(r, 'package.json') + read(r, 'requirements.txt'),
        );
        // If a logging directory exists, verify it's imported by production code.
        if (hasLoggingDir) {
          const imported = loggerImportedByProduction(r);
          return {
            id: 'P7.1',
            pillar: 'P7',
            pass: imported,
            evidence: imported
              ? 'structured logging module imported by production code'
              : 'logging module exists but is not imported by any production code',
            severity: 'med',
            difficulty: 'intermediate',
          };
        }
        // If a logging library is in deps, that's sufficient (it's available for use).
        return {
          id: 'P7.1',
          pillar: 'P7',
          pass: hasLoggingDep,
          evidence: hasLoggingDep ? 'structured logging library in dependencies' : 'no structured logging',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      (r) => ({
        id: 'P7.2',
        pillar: 'P7',
        pass: !/except\s*:\s*pass|catch\s*\([^)]*\)\s*\{\s*\}/.test(
          read(r, 'src', 'app.js') + read(r, 'src', 'main.py'),
        ),
        evidence: 'no silent errors',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P7.3',
        pillar: 'P7',
        pass:
          /NODE_ENV|TEST|--dry-run|--mock|test\s*mode/i.test(read(r, 'package.json') + read(r, 'README.md')) ||
          has(r, '.env.example'),
        evidence: 'mock/dev path',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P7.4',
        pillar: 'P7',
        pass: /LOG_LEVEL|verbosity/i.test(read(r, '.env.example') + read(r, 'config')),
        evidence: 'log level config',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M11: distributed_tracing — OpenTelemetry/X-Request-ID in deps.
      // Skip for non-deployed services (CLI tools, libraries, scripts).
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.5', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'med');
        return {
          id: 'P7.5',
          pillar: 'P7',
          pass: /opentelemetry|otel|x-request-id|trace.id|jaeger|zipkin/i.test(
            read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'pyproject.toml') + read(r, 'go.mod'),
          ),
          evidence: 'distributed tracing',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M11: metrics_collection — Datadog/Prometheus/New Relic in deps.
      // Skip for non-deployed services.
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.6', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'med');
        return {
          id: 'P7.6',
          pillar: 'P7',
          pass: /datadog|prometheus|new.?relic|cloudwatch|statsd|grafana|axiom/i.test(
            read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'pyproject.toml') + read(r, 'go.mod'),
          ),
          evidence: 'metrics collection',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M11: error_tracking_contextualized — Sentry/Bugsnag/Rollbar in deps.
      // Skip for non-deployed services.
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.7', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'med');
        return {
          id: 'P7.7',
          pillar: 'P7',
          pass: /sentry|bugsnag|rollbar|catchpoint|airbrake/i.test(
            read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'pyproject.toml') + read(r, 'go.mod'),
          ),
          evidence: 'error tracking',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M11: product_analytics_instrumentation — Mixpanel/Amplitude/PostHog in deps.
      // Skip for non-deployed services.
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.8', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'low');
        return {
          id: 'P7.8',
          pillar: 'P7',
          pass: /mixpanel|amplitude|posthog|heap|ga4|google.?analytics|segment/i.test(
            read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'pyproject.toml'),
          ),
          evidence: 'product analytics',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M11: runbooks_documented — runbook dir or SRE docs.
      (r) => ({
        id: 'P7.9',
        pillar: 'P7',
        pass:
          has(r, 'runbooks') ||
          has(r, 'runbook') ||
          has(r, 'docs', 'runbooks') ||
          has(r, 'docs', 'runbook') ||
          /runbook|playbook|sre/i.test(read(r, 'README.md') + read(r, 'AGENTS.md') + read(r, 'CONTRIBUTING.md')),
        evidence: 'runbooks documented',
        severity: 'med',
        difficulty: 'basic',
      }),
      // M14: alerting_configured — PagerDuty/OpsGenie in deps or config.
      // Skip for non-deployed services.
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.10', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'med');
        return {
          id: 'P7.10',
          pillar: 'P7',
          pass: /pagerduty|opsgenie|alerting|alert.?rule|on.?call/i.test(
            read(r, 'package.json') +
              read(r, 'requirements.txt') +
              read(r, 'README.md') +
              read(r, 'AGENTS.md') +
              readWorkflows(r),
          ),
          evidence: 'alerting configured',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M14: deployment_observability — dashboard links, deploy notifications.
      // Skip for non-deployed services.
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.11', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'low');
        return {
          id: 'P7.11',
          pillar: 'P7',
          pass: /datadog|grafana|new.?relic|dashboard|deploy.?notification|slack.?webhook/i.test(
            read(r, 'README.md') + read(r, 'AGENTS.md') + readWorkflows(r) + read(r, 'package.json'),
          ),
          evidence: 'deployment observability',
          severity: 'low',
          difficulty: 'intermediate',
        };
      },
      // M14: health_checks — /health endpoints, K8s probes, Docker HEALTHCHECK.
      // Criterion: "Skip for non-deployed services (e.g., libraries, CLI tools, scripts, batch jobs)."
      (r) => {
        const hasHealthChecks =
          /\/health|\/healthz|\/ready|\/live|livenessProbe|readinessProbe|HEALTHCHECK/i.test(
            read(r, 'src', 'app.js') +
              read(r, 'src', 'app.ts') +
              read(r, 'src', 'index.ts') +
              read(r, 'main.go') +
              read(r, 'Dockerfile') +
              readWorkflows(r),
          ) ||
          has(r, 'src', 'health') ||
          has(r, 'src', 'healthcheck');
        // A repo without any HTTP framework and no deployment artifact is not a deployed service.
        if (!hasHealthChecks && !isWebService(r) && !has(r, 'Dockerfile'))
          return skip(
            'P7.12',
            'P7',
            'non-deployed service (CLI/library, no web service or Dockerfile detected)',
            'med',
          );
        return {
          id: 'P7.12',
          pillar: 'P7',
          pass: hasHealthChecks,
          evidence: 'health check endpoints/probes',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      // M14: profiling_instrumentation — APM, Pyroscope, clinic.js.
      // Skip for non-deployed services.
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.13', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'low');
        return {
          id: 'P7.13',
          pillar: 'P7',
          pass: /datadog.*apm|dynatrace|pyroscope|parca|cloud.?profiler|clinic\.js|\b0x\b|flame.?graph/i.test(
            read(r, 'package.json') +
              read(r, 'requirements.txt') +
              read(r, 'pyproject.toml') +
              read(r, 'go.mod') +
              readWorkflows(r),
          ),
          evidence: 'profiling instrumentation',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M14: error_to_insight_pipeline — Sentry-GitHub integration, error-to-issue automation.
      // Skip for non-deployed services.
      (r) => {
        if (!isDeployedService(r))
          return skip('P7.14', 'P7', 'non-deployed service (no web framework, Dockerfile, or deploy workflow)', 'low');
        return {
          id: 'P7.14',
          pillar: 'P7',
          pass:
            /sentry.*webhook|SENTRY_ORG|SENTRY_PROJECT|error.?to.?issue|pagerduty.*issue/i.test(
              readWorkflows(r) + read(r, '.env.example') + read(r, 'package.json'),
            ) || /sentry\.io/i.test(readWorkflows(r)),
          evidence: 'error-to-insight pipeline',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M16: circuit_breakers — circuit breaker libraries, service mesh, custom patterns.
      (r) => {
        const deps =
          read(r, 'package.json') +
          read(r, 'requirements.txt') +
          read(r, 'pyproject.toml') +
          read(r, 'go.mod') +
          read(r, 'Cargo.toml');
        const source = readDirRecursive(r, 'src')
          .map((f) => readRel(r, 'src/' + f))
          .join('\n');
        const config = readWorkflows(r) + read(r, 'docker-compose.yml') + read(r, 'k8s') + read(r, 'deploy');
        const hasLib = /opossum|cockatiel|resilience4j|polly|tenacity|circuit.?breaker/i.test(deps);
        const hasCustom = /circuit.*breaker|fallback|retry.*backoff|exponential.?backoff/i.test(source);
        const hasMesh = /istio|linkerd/i.test(config + deps);
        // Skip if no external service dependencies (no HTTP client, DB client, message queue)
        const hasExternalDeps =
          /axios|fetch|got|request|httpx|requests|redis|amqp|kafka|rabbitmq|grpc|postgres|mysql|mongo|prisma|typeorm|sqlalchemy|gorm/i.test(
            deps,
          );
        if (!hasExternalDeps && !hasLib && !hasCustom && !hasMesh)
          return skip('P7.15', 'P7', 'no external service dependencies');
        return {
          id: 'P7.15',
          pillar: 'P7',
          pass: hasLib || hasCustom || hasMesh,
          evidence: hasLib
            ? 'circuit breaker library'
            : hasCustom
              ? 'custom resilience pattern'
              : hasMesh
                ? 'service mesh circuit breaking'
                : 'no circuit breaker',
          severity: 'low',
          difficulty: 'advanced',
        };
      },
      // M16: log_scrubbing — log redaction, sanitization, masking in logging code.
      (r) => {
        const deps = read(r, 'package.json') + read(r, 'requirements.txt') + read(r, 'pyproject.toml');
        const source = readDirRecursive(r, 'src')
          .map((f) => readRel(r, 'src/' + f))
          .join('\n');
        const config =
          read(r, 'pino.config.js') +
          read(r, 'pino.config.ts') +
          read(r, 'vitest.config.ts') +
          read(r, 'vitest.config.js') +
          read(r, 'winston.config.js') +
          read(r, 'winston.config.ts');
        const docs = read(r, 'AGENTS.md') + read(r, 'README.md') + read(r, 'docs', 'logging.md');
        const hasRedactConfig = /redact/i.test(config);
        const hasRedactCode = /redact|sanitiz|mask/i.test(source);
        const hasLibRedact = /pino.*redact|winston.*format.*filter|structlog.*processor/i.test(deps + config);
        const hasDocs = /log.*scrub|log.*sanitiz|log.*redact|pii.*log/i.test(docs);
        return {
          id: 'P7.16',
          pillar: 'P7',
          pass: hasRedactConfig || hasRedactCode || hasLibRedact || hasDocs,
          evidence: hasRedactConfig
            ? 'log redaction config'
            : hasRedactCode
              ? 'log sanitization in code'
              : hasLibRedact
                ? 'logging library redaction'
                : hasDocs
                  ? 'log scrubbing documented'
                  : 'no log scrubbing',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
    ],
  }),
  () => ({
    id: 'P8',
    scope: 'repo',
    checks: [
      (r) => ({
        id: 'P8.1',
        pillar: 'P8',
        pass: has(r, '.env.example') || has(r, '.env.sample'),
        evidence: '.env.example',
        severity: 'high',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P8.2',
        pillar: 'P8',
        pass:
          /"start"\s*[:=]|make\s+(setup|install)|script[^\\n]*setup/i.test(
            read(r, 'package.json') + read(r, 'Makefile'),
          ) || has(r, 'scripts', 'setup'),
        evidence: 'one-command setup',
        severity: 'high',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P8.3',
        pillar: 'P8',
        pass: has(r, '.devcontainer', 'devcontainer.json') || has(r, 'Dockerfile') || has(r, 'docker-compose.yml'),
        evidence: 'devcontainer/docker',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P8.4',
        pillar: 'P8',
        pass:
          has(r, '.nvmrc') ||
          has(r, '.tool-versions') ||
          /engines/.test(read(r, 'package.json')) ||
          has(r, 'pyproject.toml'),
        evidence: 'pinned version',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P8.5',
        pillar: 'P8',
        pass:
          /"test"\s*[:=]|headless|--no-sandbox|renderless/i.test(read(r, 'package.json') + read(r, 'README.md')) ||
          has(r, 'pytest.ini'),
        evidence: 'non-GUI run',
        severity: 'low',
        difficulty: 'intermediate',
      }),
      // M11: local_services_setup — docker-compose.yml or tiltfile.
      // Criterion: "Skip for apps without external service dependencies."
      (r) => {
        const hasServicesSetup =
          has(r, 'docker-compose.yml') ||
          has(r, 'docker-compose.yaml') ||
          has(r, 'compose.yml') ||
          has(r, 'compose.yaml') ||
          has(r, 'Tiltfile') ||
          has(r, 'skaffold.yaml') ||
          /docker.?compose/i.test(read(r, 'README.md') + read(r, 'AGENTS.md'));
        if (!hasServicesSetup && !usesExternalService(r))
          return skip('P8.6', 'P8', 'no external service dependencies detected', 'med');
        return {
          id: 'P8.6',
          pillar: 'P8',
          pass: hasServicesSetup,
          evidence: 'local services setup',
          severity: 'med',
          difficulty: 'basic',
        };
      },
      // M14: interactive_qa_exists — documented QA/run path (documentation-only check).
      (r) => ({
        id: 'P8.7',
        pillar: 'P8',
        pass:
          /qa.?path|run.?locally|how.?to.?run|manual.?test|smoke.?test|e2e.?test|playwright|cypress|curl.*localhost/i.test(
            read(r, 'AGENTS.md') + read(r, 'README.md') + read(r, 'CONTRIBUTING.md'),
          ) ||
          has(r, 'cypress.config.ts') ||
          has(r, 'playwright.config.ts'),
        evidence: 'interactive QA path documented',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      // M14: database_schema — Prisma, TypeORM, SQLAlchemy, SQL migrations.
      // Criterion: "Skip for apps without databases."
      (r) => {
        const hasDbSchema =
          has(r, 'prisma', 'schema.prisma') ||
          has(r, 'schema.prisma') ||
          /typeorm|sqlalchemy|prisma|sequelize|gorm|sqlx|diesel/i.test(
            read(r, 'package.json') +
              read(r, 'requirements.txt') +
              read(r, 'pyproject.toml') +
              read(r, 'go.mod') +
              read(r, 'Cargo.toml'),
          ) ||
          has(r, 'migrations') ||
          has(r, 'db', 'migrations') ||
          has(r, 'db', 'schema.sql') ||
          has(r, 'schema.sql');
        if (!hasDbSchema && !usesDatabase(r)) return skip('P8.8', 'P8', 'no database detected', 'med');
        return {
          id: 'P8.8',
          pillar: 'P8',
          pass: hasDbSchema,
          evidence: 'database schema files',
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
    ],
  }),
  () => ({
    id: 'P9',
    scope: 'app',
    checks: [
      (r) => {
        // P9.1: Validate entry points are functional, not just present.
        // For TS/JS: check that main/bin target files exist and bin has a shebang.
        // For TS repos where bin points to a .ts file without a shebang, flag as broken.
        const pkg = read(r, 'package.json');
        let pass = false;
        let evidence = 'entry points';
        let pkgObj: any = {};
        try {
          pkgObj = JSON.parse(pkg);
        } catch {
          /* not json */
        }
        // Go main, Python __main__, etc. — simple presence is fine
        if (has(r, 'main.go') && /func main/.test(read(r, 'main.go'))) {
          pass = true;
          evidence = 'Go main entry point';
        }
        if (/__main__|def main/.test(read(r, 'pyproject.toml') + read(r, 'setup.py'))) {
          pass = true;
          evidence = 'Python main entry point';
        }
        // Check package.json main field
        if (pkgObj.main) {
          const mainPath = pkgObj.main.replace(/^\.\//, '');
          if (has(r, ...mainPath.split('/'))) {
            pass = true;
            evidence = `main: ${mainPath}`;
          } else {
            evidence = `main points to ${mainPath} but file does not exist`;
          }
        }
        // Check package.json bin field
        if (pkgObj.bin) {
          const binEntries = typeof pkgObj.bin === 'string' ? { default: pkgObj.bin } : pkgObj.bin;
          for (const [binName, binPathRaw] of Object.entries(binEntries)) {
            const binPath = (binPathRaw as string).replace(/^\.\//, '');
            const binExists = has(r, ...binPath.split('/'));
            if (!binExists) {
              // bin file doesn't exist — downgrade
              pass = false;
              evidence = `bin "${binName}" points to ${binPath} but file does not exist`;
              break;
            }
            // Check for shebang in bin file
            const binContent = read(r, ...binPath.split('/'));
            const hasShebang = /^#!/.test(binContent);
            // For .ts files, check if it can run without --experimental-strip-types
            const isTsFile = /\.ts$/.test(binPath);
            if (isTsFile && !hasShebang) {
              // .ts bin without shebang won't work when installed as a package
              pass = false;
              evidence = `bin "${binName}" is a .ts file without shebang (won't work as installed package)`;
              break;
            }
            if (!hasShebang) {
              // bin file exists but no shebang — still pass but note it
              evidence = `bin "${binName}" exists but lacks shebang`;
            } else {
              evidence = `bin "${binName}" with shebang`;
            }
            pass = true;
          }
        }
        // Fallback: bin/ directory (verify at least one file has a shebang) or src/main
        if (!pass && has(r, 'bin')) {
          try {
            const binDir = path.join(r.root, 'bin');
            const binFiles = fs.readdirSync(binDir).filter((f) => fs.statSync(path.join(binDir, f)).isFile());
            const hasShebangedBin = binFiles.some((f) => {
              try {
                return /^#!/.test(fs.readFileSync(path.join(binDir, f), 'utf8'));
              } catch {
                return false;
              }
            });
            if (hasShebangedBin) {
              pass = true;
              evidence = 'entry points (bin/ with shebanged executable)';
            } else {
              evidence = 'bin/ directory exists but no file has a shebang';
            }
          } catch {
            evidence = 'bin/ directory not readable';
          }
        }
        if (!pass && has(r, 'src', 'main')) {
          pass = true;
          evidence = 'entry points (src/main)';
        }
        return {
          id: 'P9.1',
          pillar: 'P9',
          pass,
          evidence,
          severity: 'med',
          difficulty: 'intermediate',
        };
      },
      (r) => ({
        id: 'P9.2',
        pillar: 'P9',
        pass: (() => {
          const top = dirs(r).filter((d) => !d.startsWith('.'));
          return top.length >= 2 && top.length <= 30;
        })(),
        evidence: 'legible repo shape',
        severity: 'med',
        difficulty: 'intermediate',
      }),
      (r) => ({
        id: 'P9.3',
        pillar: 'P9',
        pass: has(r, 'src') || has(r, 'lib') || has(r, 'packages') || has(r, 'internal'),
        evidence: 'module boundaries',
        severity: 'med',
        difficulty: 'basic',
      }),
      (r) => ({
        id: 'P9.4',
        pillar: 'P9',
        pass: has(r, 'src', 'README.md') || has(r, 'lib', 'README.md') || has(r, 'packages'),
        evidence: 'per-module docs',
        severity: 'low',
        difficulty: 'basic',
      }),
    ],
  }),
];

// Difficulty map: fallback for checks that don't stamp difficulty inline.
// basic = file-existence, intermediate = content-regex, advanced = git-aware/external-tool/anti-gaming.
export const DIFFICULTY: Record<string, Difficulty> = {};

// expose check registry
let REGISTRY: Pillar[] | null = null;
export function getPillars(): Pillar[] {
  if (!REGISTRY) REGISTRY = C.map((f) => f());
  return REGISTRY;
}
