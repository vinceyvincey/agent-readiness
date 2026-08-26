// M8: tests for monorepo app discovery and per-app scoring.
import { runReadiness } from '../src/engine.ts';
import { discoverApps } from '../src/discover.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;
const eq = (label: string, got: any, want: any) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log('FAIL', label, 'got', got, 'want', want);
  } else console.log('ok', label);
};

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ar-m-'));
}
function write(d: string, rel: string, content: string) {
  const p = path.join(d, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// ---- discoverApps: single-app repo returns 1 app ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'single', scripts: { test: 'vitest' } }));
  const apps = discoverApps(d);
  eq('single-app discovery returns 1', apps.length, 1);
  eq('single-app path is .', apps[0].path, '.');
  eq('single-app type is single', apps[0].type, 'single');
}

// ---- discoverApps: package.json workspaces → multiple apps ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write(d, 'packages/web/package.json', JSON.stringify({ name: 'web', description: 'Frontend app' }));
  write(d, 'packages/api/package.json', JSON.stringify({ name: 'api', description: 'Backend API' }));
  write(d, 'packages/cli/package.json', JSON.stringify({ name: 'cli' }));
  const apps = discoverApps(d);
  eq('workspaces discovery finds 3 apps', apps.length, 3);
  eq('web app has description', apps.find((a) => a.name === 'web')?.description, 'Frontend app');
}

// ---- discoverApps: apps/ and packages/ globs without workspaces field ----
{
  const d = mkRepo();
  write(d, 'turbo.json', '{}');
  write(d, 'apps/web/package.json', JSON.stringify({ name: 'web' }));
  write(d, 'apps/api/package.json', JSON.stringify({ name: 'api' }));
  const apps = discoverApps(d);
  eq('turbo monorepo finds 2 apps', apps.length, 2);
  eq(
    'apps are type app',
    apps.every((a) => a.type === 'app'),
    true,
  );
}

// ---- runReadiness: monorepo report has apps map ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write(d, 'packages/web/package.json', JSON.stringify({ name: 'web', scripts: { test: 'vitest' } }));
  write(d, 'packages/web/test/app.test.ts', "import { it } from 'vitest'; it('works', () => {});");
  write(d, 'packages/api/package.json', JSON.stringify({ name: 'api' }));
  write(d, 'README.md', '# Monorepo\n\nA test monorepo with web and api packages.\n');
  write(d, '.gitignore', '.env\nnode_modules\ndist\n');

  const r = runReadiness(d);
  eq('monorepo report has 2 apps', Object.keys(r.apps).length, 2);
  eq('apps map has packages/web', r.apps['packages/web'] !== undefined, true);
  eq('apps map has packages/api', r.apps['packages/api'] !== undefined, true);

  // App-scoped pillars (P2) should have perApp breakdown
  eq('P2 has perApp', r.pillars.P2.perApp !== undefined, true);
  eq('P2 perApp has 2 entries', Object.keys(r.pillars.P2.perApp!).length, 2);
  // web has tests, api doesn't — web should have more passed
  const webP2 = r.pillars.P2.perApp!['packages/web'];
  const apiP2 = r.pillars.P2.perApp!['packages/api'];
  eq('web P2 passes >= api P2', webP2.passed >= apiP2.passed, true);

  // Repo-scoped pillars (P0) should NOT have perApp
  eq('P0 has no perApp (repo-scoped)', r.pillars.P0.perApp, undefined);
}

// ---- runReadiness: single-app repo has no perApp (no regression) ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ name: 'single', scripts: { test: 'vitest' } }));
  write(d, 'test/app.test.ts', "import { it } from 'vitest'; it('works', () => {});");
  const r = runReadiness(d);
  eq('single-app P2 has no perApp', r.pillars.P2.perApp, undefined);
  eq('single-app apps map has 1 entry', Object.keys(r.apps).length, 1);
}

// ---- runReadiness: app-scoped findings carry app field ----
{
  const d = mkRepo();
  write(d, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write(d, 'packages/web/package.json', JSON.stringify({ name: 'web' }));
  write(d, 'packages/api/package.json', JSON.stringify({ name: 'api' }));
  write(d, 'README.md', '# Monorepo\n\nA test monorepo with packages.\n');
  write(d, '.gitignore', '.env\nnode_modules\ndist\n');

  const r = runReadiness(d);
  const p2Findings = r.findings.filter((f) => f.pillar === 'P2');
  eq(
    'P2 findings have app field',
    p2Findings.every((f) => f.app !== undefined),
    true,
  );
  const appPaths = new Set(p2Findings.map((f) => f.app));
  eq('P2 findings span 2 apps', appPaths.size, 2);
}

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURES'));
process.exit(failures === 0 ? 0 : 1);
