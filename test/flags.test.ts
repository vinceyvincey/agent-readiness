import { resolveFlags, loadFlagConfig, FLAG_FILE } from '../src/flags.ts';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log('FAIL', label, 'got', got, 'want', want);
  } else console.log('ok', label);
};

function tmpRepo(cfg?: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-flags-'));
  if (cfg) fs.writeFileSync(path.join(dir, FLAG_FILE), JSON.stringify(cfg));
  return dir;
}

// Missing flag file -> empty config, fallback wins.
{
  const dir = tmpRepo();
  eq('loadFlagConfig missing file -> {}', loadFlagConfig(dir), {});
  const f = resolveFlags({ repoRoot: dir, envOverrides: {} });
  eq('missing definition -> fallback', f.get('anything', 'dflt'), 'dflt');
  eq('isOn default false', f.isOn('anything'), false);
}

// defaultValue honored through GrowthBook evaluation.
{
  const dir = tmpRepo({ features: { 'remediation.agent-apply': { defaultValue: true } } });
  const f = resolveFlags({ repoRoot: dir, envOverrides: {} });
  eq('defaultValue on', f.get('remediation.agent-apply', false), true);
  eq('source feature-definition', f.sources['remediation.agent-apply'], 'feature-definition');
  eq('keys() lists defined flags', f.keys().includes('remediation.agent-apply'), true);
}

// File override beats defaultValue.
{
  const dir = tmpRepo({
    features: { 'remediation.agent-apply': { defaultValue: true } },
    overrides: { 'remediation.agent-apply': false },
  });
  const f = resolveFlags({ repoRoot: dir, envOverrides: {} });
  eq('file override beats defaultValue', f.get('remediation.agent-apply', true), false);
  eq('source file-override', f.sources['remediation.agent-apply'], 'file-override');
}

// Env override beats everything (JSON-coerced).
{
  const dir = tmpRepo({
    features: { 'remediation.agent-apply': { defaultValue: true } },
    overrides: { 'remediation.agent-apply': true },
  });
  const f1 = resolveFlags({ repoRoot: dir, envOverrides: { AGENT_READINESS_FLAG_REMEDIATION_AGENT_APPLY: 'false' } });
  eq('env JSON false wins', f1.get('remediation.agent-apply', true), false);
  eq('source env-override', f1.sources['remediation.agent-apply'], 'env-override');

  const f2 = resolveFlags({ repoRoot: tmpRepo({}), envOverrides: { AGENT_READINESS_FLAG_UI_TIMEOUT_SECONDS: '30' } });
  eq('non-alnum key collapses to _', f2.get('ui.timeout.seconds', 10), 30);
}

process.exit(failures ? 1 : 0);
