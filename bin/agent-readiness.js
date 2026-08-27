#!/usr/bin/env node
// Wrapper for the TypeScript CLI entry point (src/cli.ts).
// Node >=20.19 runs TS sources via --experimental-strip-types; newer versions
// (>=22.18) strip types by default but tolerate the explicit flag.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts');
const run = spawnSync(process.execPath, ['--experimental-strip-types', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exitCode = run.status ?? 1;
