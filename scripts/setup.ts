// One-command setup for this repo: install pinned dependencies from the lockfile.
// Usage: npm run setup   (i.e. node --experimental-strip-types scripts/setup.ts)
import { spawnSync } from 'node:child_process';
const res = spawnSync('npm', process.env.CI ? ['ci'] : ['install'], { stdio: 'inherit' });
process.exit(res.status ?? 1);
