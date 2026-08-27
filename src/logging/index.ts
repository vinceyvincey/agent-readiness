// Lightweight structured logger for agent-readiness.
// Level-controlled via LOG_LEVEL env (debug|info|warn|error). No runtime deps.
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const current: Level = (process.env.LOG_LEVEL as Level) || 'info';

function log(level: Level, msg: string, extra?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[current]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(extra ?? {}) });
  // Structured logs always go to stderr so stdout stays reserved for the
  // CLI's machine-readable payloads (--json report markdown/JSON).
  process.stderr.write(line + '\n');
}

export const logger = {
  debug: (m: string, x?: Record<string, unknown>) => log('debug', m, x),
  info: (m: string, x?: Record<string, unknown>) => log('info', m, x),
  warn: (m: string, x?: Record<string, unknown>) => log('warn', m, x),
  error: (m: string, x?: Record<string, unknown>) => log('error', m, x),
};
export type { Level };
