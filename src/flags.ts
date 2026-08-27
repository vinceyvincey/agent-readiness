// Feature-flag infrastructure (P4.14): repo-local flags evaluated through GrowthBook,
// with explicit file-level overrides and environment-variable overrides.
//
// Flag definitions live in .agent-readiness-flags.json at the target repo root:
//   {
//     "features":   { "remediation.agent-apply": { "defaultValue": true } },
//     "overrides":  { "remediation.agent-apply": false }
//   }
// Environment overrides win over the file, using
// AGENT_READINESS_FLAG_<KEY> (non-alphanumerics collapse to _), e.g.
// AGENT_READINESS_FLAG_REMEDIATION_AGENT_APPLY=false
import fs from 'node:fs';
import path from 'node:path';
import { GrowthBook } from '@growthbook/growthbook';

export const FLAG_FILE = '.agent-readiness-flags.json';

export interface FlagFeatureDefinition {
  defaultValue?: unknown;
  rules?: unknown[];
}

interface FlagFileConfig {
  features?: Record<string, FlagFeatureDefinition>;
  overrides?: Record<string, unknown>;
}

export interface ResolveFlagsOptions {
  repoRoot: string;
  attributes?: Record<string, unknown>;
  /** Test seam: replaces process.env lookups when provided. */
  envOverrides?: Record<string, unknown>;
}

/** Read and parse the repo-local flag definition file (missing file == empty config). */
export function loadFlagConfig(repoRoot: string): FlagFileConfig {
  const p = path.join(repoRoot, FLAG_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as FlagFileConfig) : {};
  } catch {
    return {};
  }
}

/** AGENT_READINESS_FLAG_<KEY>: dotted key parts joined by single underscores, uppercase. */
function envKeyFor(key: string): string {
  return 'AGENT_READINESS_FLAG_' + key.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/**
 * Effective flag resolution.
 * Precedence (lowest -> highest): GrowthBook defaultValue/rules, file "overrides",
 * AGENT_READINESS_FLAG_* env vars.
 */
export function resolveFlags(opts: ResolveFlagsOptions) {
  const cfg = loadFlagConfig(opts.repoRoot);
  const gb = new GrowthBook({ attributes: opts.attributes ?? {} });
  gb.setFeatures((cfg.features ?? {}) as Parameters<typeof gb.setFeatures>[0]);

  const sources: Record<string, string> = {};

  // File-level overrides fold into the GrowthBook context so rules keep applying.
  for (const [key, value] of Object.entries(cfg.overrides ?? {})) {
    const def = cfg.features?.[key] ?? {};
    def.defaultValue = value;
    cfg.features![key] = def;
    sources[key] = 'file-override';
  }

  const requested = new Set(Object.keys(cfg.features ?? {}));

  const envRaw: Record<string, unknown> = opts.envOverrides ?? (process.env as unknown as Record<string, unknown>);

  function parseEnvValue(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  function peek(key: string, fallback: unknown): unknown {
    let raw: unknown;
    if (requested.has(key)) {
      raw = gb.getFeatureValue(key, undefined);
      sources[key] ||= 'feature-definition';
    }
    const envOverride = envRaw[envKeyFor(key)] ?? envRaw[envKeyFor(key).toLowerCase()];
    if (envOverride !== undefined) {
      sources[key] = 'env-override';
      return parseEnvValue(envOverride);
    }
    return raw !== undefined ? raw : fallback;
  }

  return {
    /** Where each resolved value came from (diagnostics/testing). */
    sources,
    /** All keys known from the flag file. */
    keys(): string[] {
      return [...requested];
    },
    /** Typed lookup with an explicit fallback; also registers the key as known. */
    get<T>(key: string, fallback: T): T {
      requested.add(key);
      return peek(key, fallback) as T;
    },
    /** Boolean convenience wrapper (default off unless the definition says otherwise). */
    isOn(key: string): boolean {
      return this.get<boolean>(key, false) === true;
    },
  };
}
