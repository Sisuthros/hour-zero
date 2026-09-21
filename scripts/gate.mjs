#!/usr/bin/env node
/**
 * Hour Zero gate. Exit 0 only when:
 *   1. static hygiene holds (no network calls, no external resources, brand present);
 *   2. the shared 35-check suite is green;
 *   3. the live URL answers 200 with the expected product markers (skipped with --offline).
 *
 * Usage:  node scripts/gate.mjs [--offline] [url]
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

console.log(`Hour Zero gate — v${VERSION}, ${offline ? 'offline' : LIVE_URL}\n`);

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

/* ---------- 2. the suite ---------- */
const suite = runSuite();
check(`test suite green (${suite.passed}/${suite.total})`, suite.failed === 0,
  suite.failed ? suite.results.filter((r) => !r.ok).map((r) => r.name).join('; ') : 'all passed');

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
