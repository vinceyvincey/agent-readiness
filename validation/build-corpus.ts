// M4.5: build a calibrated smoke corpus at 3 readiness levels for H1/H2/E2 + H5 verification.
// Produces deterministic synthetic repos under validation/corpus-low|med|high/ so we can
// measure the engine's separation and run controlled E2 tasks. Real repos can be added later.
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = path.join('validation', 'corpus');
const WRITE = (dir: string, file: string, content: string) => {
  const p = path.join(dir, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content);
};

const readme_rich = `# Acme Service\n\nA fast, well-documented service for the Acme platform. It ingests events, transforms them,\nand exposes a clean HTTP API. This README covers setup, usage, verification, and structure.\n\n## Usage\nrun npm start, then verify with npm test. The service listens on :8080.\n\n## Architecture\nmodules under src/: api (http), domain (core logic), infra (db/queue).\n\n## Examples\nsee examples/ for request/response samples.\n\n## Contributing\nsee CONTRIBUTING.md.\n\n## Reproducibility\ncommit the lockfile and use a devcontainer for deterministic builds.\n`;
const readme_thin = '# Acme\n';
const readme_none = '';

const agents_rich = `# Agent instructions\n\nWorking here you must:\n- run \`npm test\` and \`npm run lint\` before finishing\n- never commit secrets\n- extend modules under src/: api, domain, infra\n`;
const agents_thin = 'be nice\n';

const pkg_rich = () => `{
  "name": "acme", "version": "1.0.0", "main": "src/api/index.ts",
  "scripts": { "test": "vitest", "build": "tsc", "lint": "eslint src", "start": "node dist" },
  "engines": { "node": ">=20" }
}`;
const pkg_thin = () => `{ "name": "acme" }`;

const ci = `name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n`;

const gi_rich = `# secrets\n.env\n*.pem\n# caches\ndist\nnode_modules\n.agent-readiness\n`;
const gi_thin = `node_modules`;

const env_example = `DATABASE_URL=x\nAPI_KEY=\nLOG_LEVEL=info\n`;

const src_api = `export const handler = (x: number) => x * 2;\n`;
const bugHigh = `// BUG: this returns n-1 instead of n (off-by-one). Fix so it returns n.\nexport const count = (n: number) => n - 1;\n`;
const bugLow = `const count = (n) => n - 1; // bug: should return n\n`;

function clear(p: string) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }

// ---- HIGH readiness: rich docs, AGENTS, tests+config, lockfile, CI, gitignore, env, src modules
export function buildHigh(): string {
  const d = path.join(BASE, 'high'); clear(d);
  WRITE(d, 'README.md', readme_rich);
  WRITE(d, 'AGENTS.md', agents_rich);
  WRITE(d, 'package.json', pkg_rich());
  WRITE(d, 'package-lock.json', '{}');
  WRITE(d, 'tsconfig.json', '{ "compilerOptions": {} }');
  WRITE(d, '.github/workflows/ci.yml', ci);
  WRITE(d, '.gitignore', gi_rich);
  WRITE(d, '.env.example', env_example);
  WRITE(d, 'ARCHITECTURE.md', '# Architecture\nmodules: api, domain, infra.\n');
  WRITE(d, 'CONTRIBUTING.md', '# Contributing\nrun tests, lint, follow conventions.\n');
  WRITE(d, 'Makefile', 'test:\n\tnpx vitest --run\n\nlint:\n\tnpx eslint src\n');
  WRITE(d, 'mcp.json', '{ "servers": {} }');
  WRITE(d, 'examples/demo.ts', src_api);
  WRITE(d, 'src/api/index.ts', src_api);
  WRITE(d, 'src/domain/model.ts', src_api);
  WRITE(d, 'src/infra/db.ts', src_api);
  WRITE(d, 'test/api.test.ts', "import { describe,it,expect } from 'vitest'; describe('api',()=>{ it('works',()=>expect(true).toBe(true)); });");
  WRITE(d, 'fixtures/sample.json', '{"ok":true}');
  WRITE(d, 'test/fixtures/sample.json', '{"ok":true}');
  WRITE(d, 'vitest.config.ts', 'export default { test: { coverage: { include: ["src"] } } }');
  WRITE(d, 'package.json', "{\n  \"name\": \"acme\", \"version\": \"1.0.0\", \"main\": \"src/api/index.ts\",\n  \"scripts\": { \"test\": \"vitest --run --coverage\", \"build\": \"tsc\", \"lint\": \"eslint src\", \"start\": \"node dist\" },\n  \"engines\": { \"node\": \">=20\" }\n}");
  WRITE(d, '.github/workflows/audit.yml', 'name: audit\non: push\njobs:\n  audit:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm audit\n');
  WRITE(d, 'src/bug.ts', bugHigh);
  // M7: droid harness surface files for P1.6/P1.7/P1.8
  WRITE(d, '.factory/hooks.json', '{\n  "PostToolUse": []\n}\n');
  WRITE(d, '.factory/droids/reviewer.md', '# Reviewer droid\nReviews code changes.\n');
  WRITE(d, '.factory/connectors.json', '{ "github": {} }\n');
  return d;
}

// ---- MEDIUM: thin docs, minimal tests, some CI
function buildMedium(): string {
  const d = path.join(BASE, 'med'); clear(d);
  WRITE(d, 'README.md', readme_thin);
  WRITE(d, 'package.json', pkg_thin());
  WRITE(d, 'src/index.ts', 'export const x = 1;');
  WRITE(d, '.gitignore', gi_thin);
  return d;
}

// ---- LOW: bare, no docs/tests/CI/env
function buildLow(): string {
  const d = path.join(BASE, 'low'); clear(d);
  WRITE(d, 'src/index.ts', 'export const x = 1;');
  return d;
}

function main() {
  fs.mkdirSync(BASE, { recursive: true });
  buildHigh(); buildMedium(); buildLow();
  console.log('corpus built at ' + BASE + ' (high/med/low)');
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
