// M6: tests for the fixed check-correctness bugs (P6.2 real secret scan, P5.3 type-check, P6.3 git-aware .env).
import { runReadiness } from '../src/engine.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log('FAIL', label, 'got', got, 'want', want); }
  else console.log('ok', label);
};

const git = (cwd: string, ...args: string[]) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });

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
  write(d, 'config/aws.ts', `const accessKey = "AKIAIOSFODNN7EXAMPLE";\n`);
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

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
