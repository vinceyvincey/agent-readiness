# Examples

Minimal runnable examples of the agent-readiness engine.

## Run the CLI against the repo
```bash
node --experimental-strip-types src/cli.ts .
```

## Programmatic use
```ts
import { runReadiness } from '../src/engine.ts';
const report = runReadiness('./path/to/repo');
console.log(`Level: ${report.level} — Overall: ${report.overall}/100`);
```
