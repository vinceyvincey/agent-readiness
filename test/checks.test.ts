// M6: tests for the fixed check-correctness bugs (P6.2 real secret scan, P5.3 type-check, P6.3 git-aware .env).
import { runReadiness } from '../src/engine.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log('FAIL', label, 'got', got, 'want', want);
  } else console.log('ok', label);
};

const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });

// Create a temp dir, optionally init as a git repo.
function mkRepo(opts: { git?: boolean } = {}): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-c-'));
  if (opts.git) {
    git(d, 'init');
    git(d, 'config', 'user.email', 't@t.test');
    git(d, 'config', 'user.name', 'test');
  }
  return d;
}
function write(d: string, rel: string, content: string) {
  const p = path.join(d, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---- P6.2: planted secret in a git-tracked file must FAIL ----
{
  const d = mkRepo({ git: true });
  write(d, 'README.md', '# Test\n\nA test project with a run section.\n');
  write(d, 'src/app.ts', `const key = "ghp_${'a'.repeat(36)}";\n`);
  git(d, 'add', '.');
  git(d, 'commit', '-m', 'init');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.2')!;
  eq('P6.2 fails on planted GitHub PAT', c.pass, false);
  eq('P6.2 evidence names the file', c.evidence.includes('src/app.ts'), true);
}

// ---- P6.2: clean repo must PASS ----
{
  const d = mkRepo({ git: true });
  write(d, 'README.md', '# Test\n\nA clean project.\n');
  write(d, 'src/app.ts', `export const handler = () => 42;\n`);
  git(d, 'add', '.');
  git(d, 'commit', '-m', 'init');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.2')!;
  eq('P6.2 passes on clean repo', c.pass, true);
}

// ---- P6.2: AWS key in tracked file must FAIL ----
{
  const d = mkRepo({ git: true });
  write(d, 'README.md', '# Test\n');
  write(d, 'config/aws.ts', `const accessKey = "${'AKIAIOSFODNN7' + 'EXAMPLE'}";\n`);
  git(d, 'add', '.');
  git(d, 'commit', '-m', 'init');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.2')!;
  eq('P6.2 fails on AWS access key', c.pass, false);
}

// ---- P5.3: pyproject with mypy passes (no tsconfig needed) ----
{
  const d = mkRepo();
  write(d, 'pyproject.toml', `[tool.mypy]\nstrict = true\n`);
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.3')!;
  eq('P5.3 passes on pyproject+mypy', c.pass, true);
}

// ---- P5.3: Go repo passes (go vet implied) ----
{
  const d = mkRepo();
  write(d, 'go.mod', `module test\n\ngo 1.21\n`);
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.3')!;
  eq('P5.3 passes on go.mod', c.pass, true);
}

// ---- P5.3: repo with no type-check config fails ----
{
  const d = mkRepo();
  write(d, 'README.md', '# Test\n');
  write(d, 'src/app.js', `console.log('hi');\n`);
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.3')!;
  eq('P5.3 fails without type-check config', c.pass, false);
}

// ---- P6.3: git-ignored .env passes ----
{
  const d = mkRepo({ git: true });
  write(d, '.env', `SECRET=abc\n`);
  write(d, '.gitignore', `.env\nnode_modules\ndist\n`);
  git(d, 'add', '.');
  git(d, 'commit', '-m', 'init');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.3')!;
  eq('P6.3 passes when .env is git-ignored', c.pass, true);
}

// ---- P6.3: tracked .env fails ----
{
  const d = mkRepo({ git: true });
  write(d, '.env', `SECRET=abc\n`);
  git(d, 'add', '.env');
  git(d, 'commit', '-m', 'init');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.3')!;
  eq('P6.3 fails when .env is tracked', c.pass, false);
}

// ---- M10: P5.6 strict TypeScript — tsconfig with strict:true passes ----
{
  const d = mkRepo();
  write(d, 'tsconfig.json', `{ "compilerOptions": { "strict": true } }`);
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.6')!;
  eq('P5.6 passes on strict tsconfig', c.pass, true);
}

// ---- M10: P5.6 strict TypeScript — tsconfig without strict fails ----
{
  const d = mkRepo();
  write(d, 'tsconfig.json', `{ "compilerOptions": {} }`);
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.6')!;
  eq('P5.6 fails on non-strict tsconfig', c.pass, false);
}

// ---- M10: P5.6 strict Python — pyproject with mypy strict passes ----
{
  const d = mkRepo();
  write(d, 'pyproject.toml', `[tool.mypy]\nstrict = true\n`);
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.6')!;
  eq('P5.6 passes on mypy strict', c.pass, true);
}

// ---- M10: P4.6 issue templates ----
{
  const d = mkRepo();
  write(d, '.github/ISSUE_TEMPLATE/bug.md', '# Bug report\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.6')!;
  eq('P4.6 passes on ISSUE_TEMPLATE dir', c.pass, true);
}

// ---- M10: P4.6 no issue templates ----
{
  const d = mkRepo();
  write(d, 'README.md', '# Test\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.6')!;
  eq('P4.6 fails without issue templates', c.pass, false);
}

// ---- M10: P4.7 PR template ----
{
  const d = mkRepo();
  write(d, '.github/PULL_REQUEST_TEMPLATE.md', '## Checklist\n- [ ] Tests pass\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.7')!;
  eq('P4.7 passes on PR template', c.pass, true);
}

// ---- M11: P2.7 integration tests ----
{
  const d = mkRepo();
  write(d, 'playwright.config.ts', 'export default { testDir: "./e2e" };\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P2.7')!;
  eq('P2.7 passes on playwright config', c.pass, true);
}

// ---- M11: P5.8 dead code detection (config + tool in deps) ----
{
  const d = mkRepo();
  write(d, 'knip.json', '{"ignore": []}');
  write(d, 'package.json', JSON.stringify({ name: 'test', devDependencies: { knip: '^5.0' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.8')!;
  eq('P5.8 passes on knip config + dep', c.pass, true);
}

// ---- M11: P5.9 duplicate code detection (config + tool in deps) ----
{
  const d = mkRepo();
  write(d, '.jscpd.json', '{"threshold": 0}');
  write(d, 'package.json', JSON.stringify({ name: 'test', devDependencies: { jscpd: '^4.0' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.9')!;
  eq('P5.9 passes on jscpd config + dep', c.pass, true);
}

// ---- M11: P7.7 error tracking ----
{
  const d = mkRepo();
  write(d, 'package.json', '{"dependencies": {"@sentry/node": "^7.0.0"}}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P7.7')!;
  eq('P7.7 passes on Sentry dep', c.pass, true);
}

// ---- M11: P8.6 local services setup ----
{
  const d = mkRepo();
  write(d, 'docker-compose.yml', 'services:\n  db:\n    image: postgres\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P8.6')!;
  eq('P8.6 passes on docker-compose', c.pass, true);
}

// ---- M11: P0.9 API schema docs ----
{
  const d = mkRepo();
  write(d, 'openapi.json', '{"openapi": "3.0.0"}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P0.9')!;
  eq('P0.9 passes on openapi.json', c.pass, true);
}

// ---- Skip gating: plain CLI repo skips service-only checks (criteria-level skips) ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'cli', devDependencies: { typescript: '^5.4' } }));
  const r = runReadiness(d);
  for (const id of ['P0.9', 'P7.12', 'P8.6', 'P8.8']) {
    const c = r.findings.find((f) => f.id === id)!;
    eq(`${id} skips on plain CLI repo`, c.skipped, true);
    eq(`${id} skipped evidence explains why`, c.evidence.startsWith('skipped:'), true);
  }
}

// ---- Skip gating: express service without health endpoint FAILS P7.12 (not skipped) ----
{
  const d = mkRepo();
  write(d, 'package.json', '{"dependencies": {"express": "^4.19"}}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P7.12')!;
  eq('P7.12 fails (not skipped) on web service without health checks', c.pass === false && !c.skipped, true);
}

// ---- Skip gating: API-schema-less web service FAILS P0.9 (not skipped) ----
{
  const d = mkRepo();
  write(d, 'package.json', '{"dependencies": {"fastify": "^4.0"}}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P0.9')!;
  eq('P0.9 fails (not skipped) on HTTP API without schema', c.pass === false && !c.skipped, true);
}

// ---- Skip gating: DB driver without schema files FAILS P8.8 (not skipped) ----
{
  const d = mkRepo();
  write(d, 'package.json', '{"dependencies": {"pg": "^8.11"}}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P8.8')!;
  eq('P8.8 fails (not skipped) when a DB driver is used', c.pass === false && !c.skipped, true);
}

// ---- Skip gating: external-service dependency without compose FAILS P8.6 (not skipped) ----
{
  const d = mkRepo();
  write(d, 'package.json', '{"dependencies": {"redis": "^4.6"}}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P8.6')!;
  eq('P8.6 fails (not skipped) with a redis dependency', c.pass === false && !c.skipped, true);
}

// ---- M11: P4.8 issue labeling system ----
{
  const d = mkRepo();
  write(d, '.github/labels.yml', '- name: bug\n  color: red\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.8')!;
  eq('P4.8 passes on labels.yml', c.pass, true);
}

// ---- P1.2: npm ci recognized as built-in command ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { test: 'vitest' } }));
  write(d, 'AGENTS.md', '# Agent Guide\n\nAlways run `npm ci` to install.\n\n- `npm test` runs tests.\n');
  write(d, 'test/foo.test.ts', 'test("x", () => {});');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.2')!;
  eq('P1.2 passes with npm ci (built-in)', c.pass, true);
}

// ---- P1.2: npm ci + npm run build both recognized ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', scripts: { build: 'tsc', test: 'vitest' } }));
  write(d, 'AGENTS.md', '# Agent Guide\n\nAlways run `npm ci` then `npm run build`.\n\n- `npm test` runs tests.\n');
  write(d, 'test/foo.test.ts', 'test("x", () => {});');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.2')!;
  eq('P1.2 passes with npm ci + npm run build', c.pass, true);
}

// ---- P1.4: invalid mcp.json fails (not valid MCP config) ----
{
  const d = mkRepo();
  write(d, 'mcp.json', JSON.stringify({ command: 'node', args: ['src/cli.ts'] }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.4')!;
  eq('P1.4 fails on mcp.json without mcpServers', c.pass, false);
}

// ---- P1.4: valid mcp.json passes ----
{
  const d = mkRepo();
  write(
    d,
    'mcp.json',
    JSON.stringify({ mcpServers: { fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } } }),
  );
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.4')!;
  eq('P1.4 passes on valid mcp.json with mcpServers', c.pass, true);
}

// ---- P1.4: skills dir with SKILL.md passes ----
{
  const d = mkRepo();
  write(d, 'skills/my-skill/SKILL.md', '# My Skill\n\nA test skill.\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.4')!;
  eq('P1.4 passes on skills dir with SKILL.md', c.pass, true);
}

// ---- P1.4: CLAUDE.md passes (simple presence) ----
{
  const d = mkRepo();
  write(d, 'CLAUDE.md', '# Agent instructions\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P1.4')!;
  eq('P1.4 passes on CLAUDE.md', c.pass, true);
}

// ---- P4.3: hooks not activated fails ----
{
  const d = mkRepo({ git: true });
  write(d, '.githooks/pre-commit', '#!/bin/sh\nnpm run lint\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.3')!;
  eq('P4.3 fails when hooks not activated', c.pass, false);
}

// ---- P4.3: hooks activated via core.hooksPath passes ----
{
  const d = mkRepo({ git: true });
  write(d, '.githooks/pre-commit', '#!/bin/sh\nnpm run lint\n');
  git(d, 'config', 'core.hooksPath', '.githooks');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P4.3')!;
  eq('P4.3 passes when core.hooksPath is set', c.pass, true);
}

// ---- P5.8: config file without tool in deps fails ----
{
  const d = mkRepo();
  write(d, 'knip.json', '{"ignore": []}');
  // No knip in package.json deps and not on PATH (in test env)
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.8')!;
  eq('P5.8 fails on config without tool installed', c.pass, false);
}

// ---- P5.8: tool in deps passes ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', devDependencies: { knip: '^5.0' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.8')!;
  eq('P5.8 passes on knip in devDependencies', c.pass, true);
}

// ---- P5.9: config file without tool in deps fails ----
{
  const d = mkRepo();
  write(d, '.jscpd.json', '{"threshold": 0}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.9')!;
  eq('P5.9 fails on config without tool installed', c.pass, false);
}

// ---- P5.9: tool in deps passes ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', devDependencies: { jscpd: '^4.0' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P5.9')!;
  eq('P5.9 passes on jscpd in devDependencies', c.pass, true);
}

// ---- P6.9: DAST skipped for non-web CLI repo ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test-cli', bin: { cli: 'src/cli.ts' } }));
  write(d, 'src/cli.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.9')!;
  eq('P6.9 skipped for non-web repo', c.skipped, true);
}

// ---- P6.9: DAST not skipped for web service repo ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'web-app', dependencies: { express: '^4.0' } }));
  write(d, 'src/app.ts', 'import express from "express";\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P6.9')!;
  eq('P6.9 not skipped for web service repo', !c.skipped, true);
}

// ---- P7.1: logging dir exists but not imported fails ----
{
  const d = mkRepo();
  write(d, 'src/logging/index.ts', 'export const log = (msg: string) => console.log(msg);\n');
  write(d, 'src/main.ts', 'export const handler = () => 42;\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P7.1')!;
  eq('P7.1 fails when logger not imported by production code', c.pass, false);
}

// ---- P7.1: logging dir exists and imported passes ----
{
  const d = mkRepo();
  write(d, 'src/logging/index.ts', 'export const log = (msg: string) => console.log(msg);\n');
  write(d, 'src/main.ts', "import { log } from './logging/index.js';\nexport const handler = () => log('hi');\n");
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P7.1')!;
  eq('P7.1 passes when logger imported by production code', c.pass, true);
}

// ---- P7.1: logging dep in package.json passes ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', dependencies: { winston: '^3.0' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P7.1')!;
  eq('P7.1 passes on winston dep', c.pass, true);
}

// ---- P9.1: bin pointing to .ts without shebang fails ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', bin: { cli: 'src/cli.ts' } }));
  write(d, 'src/cli.ts', 'export const x = 1;\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P9.1')!;
  eq('P9.1 fails on .ts bin without shebang', c.pass, false);
}

// ---- P9.1: bin pointing to non-existent file fails ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', bin: { cli: 'src/missing.js' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P9.1')!;
  eq('P9.1 fails on non-existent bin file', c.pass, false);
}

// ---- P9.1: bin with shebang passes ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', bin: { cli: 'src/cli.js' } }));
  write(d, 'src/cli.js', '#!/usr/bin/env node\nconsole.log("hi");\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P9.1')!;
  eq('P9.1 passes on bin with shebang', c.pass, true);
}

// ---- P9.1: main pointing to existing file passes ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', main: 'src/index.js' }));
  write(d, 'src/index.js', 'module.exports = {};\n');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P9.1')!;
  eq('P9.1 passes on main pointing to existing file', c.pass, true);
}

// ---- P0.8: typedoc config without tool in deps fails ----
{
  const d = mkRepo();
  write(d, 'typedoc.json', '{"out": "docs"}');
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P0.8')!;
  eq('P0.8 fails on typedoc config without tool installed', c.pass, false);
}

// ---- P0.8: typedoc in deps passes ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'test', devDependencies: { typedoc: '^0.25' } }));
  const r = runReadiness(d);
  const c = r.findings.find((f) => f.id === 'P0.8')!;
  eq('P0.8 passes on typedoc in devDependencies', c.pass, true);
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
