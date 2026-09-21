#!/usr/bin/env node
/**
 * Hour Zero gate. Exit 0 only when:
 *   1. static hygiene holds (no network calls, no external resources, brand present);
 *   1b. the copy states the final-report triggers, and no surface claims a final report from awareness;
 *   2. the shared 36-check suite is green;
 *   2b. every digest and the commit line in GATE-RECEIPT.md still describe this tree;
 *   3. the live URL answers 200 with the expected product markers (skipped with --offline).
 *
 * Usage:  node scripts/gate.mjs [--offline] [url]
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite } from '../tests/suite.mjs';
import { VERSION } from '../core.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const LIVE_URL = (args.find((a) => a.startsWith('http')) || 'https://sisuthros.github.io/hour-zero/').replace(/\/?$/, '/');

const failures = [];
const notes = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const sha256 = (rel) => createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');

let head = '';
try {
  head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
} catch {
  head = '';
}
console.log(`Hour Zero gate — v${VERSION}, ${offline ? 'offline' : LIVE_URL}${head ? `\nrepo HEAD ${head}` : ''}\n`);

/* ---------- 1. static hygiene ---------- */
const FILES = ['index.html', 'app.js', 'core.js', 'styles.css', 'tests/suite.mjs', 'favicon.svg'];
for (const file of FILES) check(`present: ${file}`, existsSync(join(ROOT, file)));

const html = read('index.html');
const core = read('core.js');
const app = read('app.js');
const all = [html, app, core, read('styles.css'), read('tests/suite.mjs')].join('\n');

const remoteRefs = [...html.matchAll(/(?:src|href)\s*=\s*"(https?:[^"]+)"/g)]
  .map((m) => m[1])
  .filter((url) => !url.startsWith('https://eur-lex') && !url.startsWith('https://github.com'));
check('no external resource is fetched by the page', remoteRefs.length === 0, remoteRefs.join(', ') || 'none');
check('no fetch/XHR/beacon in the shipped runtime', !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|navigator\.sendBeacon/.test(app + core), 'app.js + core.js');
check('no remote font or stylesheet import', !/@import|fonts\.googleapis/.test(all));
check('page declares a language and a title', /<html lang="en"/.test(html) && /<title>Hour Zero/.test(html));

const brandHits = ['index.html', 'README.md', 'BRAND.md', 'package.json'].filter((f) => read(f).includes('Hour Zero'));
check('the name "Hour Zero" is used in every surface', brandHits.length === 4, brandHits.join(', '));
check('brand colour #FFB020 is used in the interface', read('styles.css').includes('#ffb020'));

/* ---------- 1b. the copy states the final-report triggers correctly ---------- */
const proseFiles = ['index.html', 'README.md', 'BRAND.md', 'GATE-RECEIPT.md'].filter((f) => existsSync(join(ROOT, f)));
const prose = proseFiles.map((f) => read(f)).join('\n');
check('the page states the Art. 14(2)(c) final-report trigger',
  html.includes('no later than 14 days after a corrective or mitigating measure is available'),
  'fix available + 14 d');
check('the page states the Art. 14(4)(c) final-report trigger',
  html.includes('within one month after the submission of the incident notification'),
  'notification submitted + 1 month');
const awarenessFinal = prose.match(/final report[^<>]{0,120}(?<!not )from (?:the moment (?:you became|of) )?aware/i);
check('no surface claims a final report computed from awareness', awarenessFinal === null,
  awarenessFinal ? `matched: "${awarenessFinal[0].slice(0, 90)}"` : 'none');

/* ---------- 2. the suite ---------- */
const suite = runSuite();
check(`test suite green (${suite.passed}/${suite.total})`, suite.failed === 0,
  suite.failed ? suite.results.filter((r) => !r.ok).map((r) => r.name).join('; ') : 'all passed');

/* ---------- 2b. the gate receipt is true (digests + provenance) ---------- */
const receiptPath = join(ROOT, 'GATE-RECEIPT.md');
if (!existsSync(receiptPath)) {
  check('the gate receipt exists', false, 'GATE-RECEIPT.md');
} else {
  const receipt = read('GATE-RECEIPT.md');
  const rows = [];
  for (const line of receipt.split('\n')) {
    const m = line.match(/^\|\s*`([0-9a-f]{64})`\s*\|\s*(.+?)\s*\|\s*$/);
    if (m) rows.push({ hash: m[1], label: m[2] });
  }
  const bundleHash = createHash('sha256');
  for (const file of FILES) bundleHash.update(readFileSync(join(ROOT, file)));
  const expectedBundle = bundleHash.digest('hex');
  const mismatches = [];
  const labelled = new Set();
  for (const { hash, label } of rows) {
    const clean = label.replace(/`/g, '').trim();
    if (/BUNDLE/i.test(clean)) {
      labelled.add('BUNDLE');
      if (hash !== expectedBundle) mismatches.push(`BUNDLE (receipt ${hash.slice(0, 12)}… vs actual ${expectedBundle.slice(0, 12)}…)`);
      continue;
    }
    labelled.add(clean);
    if (!existsSync(join(ROOT, clean))) { mismatches.push(`${clean} (file missing)`); continue; }
    const actual = sha256(clean);
    if (actual !== hash) mismatches.push(`${clean} (receipt ${hash.slice(0, 12)}… vs actual ${actual.slice(0, 12)}…)`);
  }
  for (const file of FILES) if (!labelled.has(file)) mismatches.push(`${file} (no receipt row)`);
  if (!labelled.has('BUNDLE')) mismatches.push('BUNDLE (no receipt row)');
  check(`every digest in the gate receipt matches the tree (${rows.length} rows)`, mismatches.length === 0,
    mismatches.join('; ') || 'all match');

  const embedded = receipt.match(/Commit:\s*`([0-9a-f]{40})`/);
  check('the receipt records a full 40-hex commit', Boolean(embedded), embedded ? embedded[1] : 'no `Commit: <sha>` line');
  if (embedded) {
    if (!existsSync(join(ROOT, '.git'))) {
      notes.push('receipt commit provenance check skipped: no .git directory');
    } else {
      let same = false;
      let detail = '';
      try {
        execFileSync('git', ['diff', '--quiet', embedded[1], '--', ...FILES], { cwd: ROOT, stdio: 'pipe' });
        same = true;
        detail = `served files identical at ${embedded[1].slice(0, 7)} and in this tree`;
      } catch (error) {
        detail = error.status === 1
          ? `served files differ from ${embedded[1].slice(0, 7)}`
          : `git could not check ${embedded[1].slice(0, 7)}: ${String(error.stderr || error.message).trim().split('\n')[0]}`;
      }
      check('the receipt commit still describes the served files', same, detail);
    }
  }
}

/* ---------- 3. live URL ---------- */
if (offline) {
  notes.push('live check skipped (--offline)');
} else {
  const fetchText = async (path) => {
    const response = await fetch(LIVE_URL + path, { redirect: 'follow' });
    return { status: response.status, body: await response.text() };
  };
  try {
    const home = await fetchText('');
    check(`live URL answers 200 (${LIVE_URL})`, home.status === 200, `HTTP ${home.status}`);
    check('live page is Hour Zero', home.body.includes('<title>Hour Zero') && home.body.includes('Article 14'), 'title + Article 14 markers present');
    const coreLive = await fetchText('core.js');
    check('live core.js is served', coreLive.status === 200 && coreLive.body.includes('ART14_APPLIES_FROM'), `HTTP ${coreLive.status}`);
    const suiteLive = await fetchText('tests/suite.mjs');
    check('live self-test module is served', suiteLive.status === 200 && suiteLive.body.includes('runSuite'), `HTTP ${suiteLive.status}`);
    const ico = await fetch(LIVE_URL + 'favicon.svg');
    check('live favicon is served', ico.status === 200, `HTTP ${ico.status}`);
    const liveHash = createHash('sha256').update(coreLive.body).digest('hex');
    check('served core.js is byte-identical to the local artifact', liveHash === sha256('core.js'),
      liveHash === sha256('core.js') ? `${liveHash} both sides` : `live ${liveHash} vs local ${sha256('core.js')}`);
    for (const file of FILES) {
      const response = await fetch(LIVE_URL + file, { redirect: 'follow' });
      const body = await response.text();
      const live = createHash('sha256').update(body).digest('hex');
      const local = sha256(file);
      check(`served ${file} matches the local artifact byte for byte`, response.status === 200 && live === local,
        response.status !== 200 ? `HTTP ${response.status}` : live === local ? `${live} both sides` : `live ${live} vs local ${local}`);
    }
  } catch (error) {
    check(`live URL reachable (${LIVE_URL})`, false, error.message);
  }
}

/* ---------- digests ---------- */
console.log('\nsha256');
for (const file of FILES) if (existsSync(join(ROOT, file))) console.log(`  ${sha256(file)}  ${file}`);
const bundle = createHash('sha256');
for (const file of FILES) bundle.update(readFileSync(join(ROOT, file)));
console.log(`  ${bundle.digest('hex')}  BUNDLE(${FILES.length} files)`);

if (notes.length) console.log(`\nnotes: ${notes.join('; ')}`);
console.log(`\n${failures.length ? `GATE FAILED (${failures.length}): ${failures.join('; ')}` : 'GATE OK'}`);
process.exit(failures.length ? 1 : 0);
