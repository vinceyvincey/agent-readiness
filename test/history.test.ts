import { appendHistory, readHistory, trend, historyPath } from '../src/history.ts';
import { runReadiness } from '../src/engine.ts';
import * as fs from 'node:fs'; import * as os from 'node:os'; import * as path from 'node:path';
let failures = 0;
const eq = (label:string, got:any, want:any)=>{ const ok=JSON.stringify(got)===JSON.stringify(want); if(!ok){failures++; console.log('FAIL',label,'got',got,'want',want);} else console.log('ok',label); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'ar-h-'));
const rep1 = runReadiness('/home/vicente/Developer/agent-readiness');
const h1 = appendHistory(rep1, tmp);
eq('append creates 1 entry', h1.length, 1);
eq('history file exists', fs.existsSync(historyPath(tmp)), true);
// second run with slightly changed date
const rep2 = { ...rep1, run: { ...rep1.run, date: new Date(Date.now()+5000).toISOString() } };
eq('history shape 1', h1[0].overall, rep1.overall);
const h2 = appendHistory({ ...rep1, run: { ...rep1.run, date: new Date().toISOString() } }, tmp);
eq('append grows to 2', h2.length, 2);
const h3 = appendHistory(rep2, tmp);
eq('append grows to 3', h3.length, 3);
// readHistory round-trip
const back = readHistory(tmp);
eq('readHistory returns 3', back.length, 3);
// trend: most recent vs previous
const last = readHistory(tmp);
const prev = last[last.length-2];
const dt = trend(readHistory(tmp), { report: rep2 });
eq('trend count 3', dt.count, 3);
eq('trend overallDelta computed', dt.overallDelta !== null, true);
// perPillar delta for a pillar
  
console.log('\n' + (failures===0 ? 'ALL PASS' : failures+' FAILURES'));
process.exit(failures===0?0:1);
