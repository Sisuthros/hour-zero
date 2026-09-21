#!/usr/bin/env node
/** Node runner for the shared suite: `node tests/run.mjs` (exit 0 = all green). */
import { runSuite } from './suite.mjs';

const { total, passed, failed, results } = runSuite();
const pad = String(total).length;

for (const [i, r] of results.entries()) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${String(i + 1).padStart(pad)}/${total} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(`\n${passed}/${total} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
