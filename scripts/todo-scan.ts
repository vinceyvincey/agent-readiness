// Tech-debt scanner: list TODO/FIXME/HACK markers with optional ticket links.
// Usage: node --experimental-strip-types scripts/todo-scan.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['src', 'test', 'scripts'];
const pattern = /\b(TODO|FIXME|HACK)\b[\s-]*\(?([A-Z]+-[0-9]+)\)?.*$/gi;
let total = 0;
for (const d of dirs) {
  if (!fs.existsSync(path.join(root, d))) continue;
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && /\.ts$/.test(e.name)) {
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        lines.forEach((ln, i) => {
          const m = pattern.exec(ln);
          if (m) {
            total++;
            console.log(`${path.relative(root, p)}:${i + 1}  ${m[0].trim()}`);
          }
        });
      }
    }
  };
  walk(path.join(root, d));
}
console.log(`\n${total} tech-debt marker(s) found. Link each with a ticket ref (TODO(TICKET-123)).`);
if (total > 0) process.exit(1);
else process.exit(0);
