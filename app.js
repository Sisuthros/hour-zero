/**
 * Hour Zero — interface. Wires the pure core in core.js to the page.
 * No network calls, no analytics, no storage of anything you type.
 */
import {
  VERSION,
  FIELD_LIMITS,
  EVENT_TYPES,
  LEGAL,
  ART14_APPLIES_FROM,
  buildIcs,
  checkDraft,
  computeSchedule,
  formatInstant,
  humanRemaining,
  incidentSeverity,
  reconcileWithPlatform,
  renderDraft as renderDraftDocument,
  scopeCheck,
  stageDraftFields,
  stageStatus,
  STAGE_STATE,
  wallTimeToInstant,
} from './core.js';

const $ = (selector) => document.querySelector(selector);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
};

const TZ_LIST = [
  'UTC', 'Europe/Helsinki', 'Europe/Stockholm', 'Europe/Tallinn', 'Europe/Riga', 'Europe/Vilnius',
  'Europe/Warsaw', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam', 'Europe/Brussels',
  'Europe/Madrid', 'Europe/Lisbon', 'Europe/Rome', 'Europe/Vienna', 'Europe/Prague', 'Europe/Bratislava',
  'Europe/Budapest', 'Europe/Ljubljana', 'Europe/Zagreb', 'Europe/Bucharest', 'Europe/Sofia',
  'Europe/Athens', 'Europe/Dublin', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Zurich',
  'Europe/London', 'Europe/Kyiv', 'Europe/Istanbul', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney',
];

const state = {
  eventType: EVENT_TYPES.vulnerability,
  awareness: localInputValue(new Date()),
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  fixAvailable: '',
  submitted: '',
  role: 'manufacturer',
  inEuMarket: 'yes',
  severity: { affectsProtection: null, maliciousCode: null },
  draftStage: 'early_warning',
  draftValues: {},
  results: null,
};

function localInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseInput(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return null;
  return {
    year: +m[1], month: +m[2], day: +m[3],
    hour: +m[4], minute: +m[5], second: +(m[6] || 0),
  };
}

/** Resolve an input value + zone into an instant, with the DST caveats surfaced. */
function resolve(value, tz) {
  const parts = parseInput(value);
  if (!parts) return null;
  try {
    return wallTimeToInstant(parts, tz);
  } catch (error) {
    return { error: error.message };
  }
}

/** The application date, read in the planner's own zone (conservative reading). */
function applicationStartMs(tz) {
  const r = resolve(`${ART14_APPLIES_FROM.iso}T00:00`, tz);
  return r && Number.isFinite(r.instantMs) ? r.instantMs : Date.UTC(2026, 8, 11);
}

function currentSchedule() {
  const awareness = resolve(state.awareness, state.tz);
  if (!awareness || !Number.isFinite(awareness.instantMs)) return null;
  const fix = resolve(state.fixAvailable, state.tz);
  const submitted = resolve(state.submitted, state.tz);
  try {
    return computeSchedule({
      eventType: state.eventType,
      awarenessMs: awareness.instantMs,
      tz: state.tz,
      fixAvailableMs: fix && Number.isFinite(fix.instantMs) ? fix.instantMs : undefined,
      incidentSubmittedMs: submitted && Number.isFinite(submitted.instantMs) ? submitted.instantMs : undefined,
    });
  } catch (error) {
    return { error: error.message };
  }
}

/* ---------------- rendering ---------------- */

function renderStage(stage, schedule, now) {
  const status = stageStatus(stage, now);
  const card = el('article', { class: `stage ${status.state}`, id: `stage-${stage.id}` });
  const top = el('div', { class: 'top' }, [
    el('div', {}, [
      el('h3', { text: `${stage.order}. ${stage.name}` }),
      el('div', { class: 'clock', text: stage.clockLabel }),
    ]),
    el('div', {}, [el('span', { class: 'basis', text: stage.legalBasis })]),
  ]);
  card.appendChild(top);
  card.appendChild(el('span', { class: `state ${status.state}`, text: stateLabel(status.state) }));

  if (stage.awaitingInput) {
    card.appendChild(el('p', { class: 'due', text: 'Clock not started' }));
    card.appendChild(el('p', { class: 'rule', text: stage.awaitingInputPrompt }));
  } else {
    card.appendChild(el('p', { class: 'due', text: formatInstant(stage.dueMs, state.tz) }));
    const count = el('div', { class: 'count', text: humanRemaining(status.remainingMs) });
    count.setAttribute('data-count', stage.id);
    count.setAttribute('aria-live', 'off');
    card.appendChild(count);
  }
  card.appendChild(el('p', { class: 'rule', text: stage.rule }));
  const list = el('ul', { class: 'fields' });
  for (const field of stage.requiredFields) list.appendChild(el('li', { text: field }));
  card.appendChild(el('div', {}, [
    el('div', { class: 'clock', text: 'Mandatory at this stage:' }),
    list,
  ]));
  return card;
}

function stateLabel(state) {
  return {
    upcoming: 'upcoming',
    due_soon: 'due soon',
    overdue: 'overdue',
    awaiting_input: 'clock not started',
    not_applicable: 'n/a',
  }[state] || state;
}

function renderClock() {
  const schedule = currentSchedule();
  const host = $('#stages');
  host.replaceChildren();
  const banners = $('#clock-banners');
  banners.replaceChildren();
  if (!schedule) {
    banners.appendChild(el('div', { class: 'banner bad', text: 'Enter a valid date and time.' }));
    return;
  }
  if (schedule.error) {
    banners.appendChild(el('div', { class: 'banner bad', text: schedule.error }));
    return;
  }

  const awareness = resolve(state.awareness, state.tz);
  const awareLabel = formatInstant(schedule.awarenessMs, state.tz);
  const summary = el('div', { class: 'banner info' });
  summary.appendChild(el('strong', { text: 'Awareness instant: ' }));
  summary.appendChild(document.createTextNode(`${awareLabel} — the clock below runs from this instant, not from when the report is filed.`));
  banners.appendChild(summary);

  if (awareness.ambiguous) {
    banners.appendChild(el('div', {
      class: 'banner warn',
      text: `That wall-clock reading happens twice in ${state.tz} (clocks went back). Hour Zero uses the earlier of the two, which is the stricter deadline. Record the offset you meant.`,
    }));
  }
  if (awareness.nonexistent) {
    banners.appendChild(el('div', {
      class: 'banner warn',
      text: `That wall-clock reading does not exist in ${state.tz} (clocks jumped forward). Hour Zero resolved it to ${formatInstant(awareness.instantMs, state.tz)} so the deadline cannot be missed.`,
    }));
  }
  for (const warning of schedule.warnings) {
    banners.appendChild(el('div', { class: 'banner warn', text: warning }));
  }

  const now = Date.now();
  for (const stage of schedule.stages) host.appendChild(renderStage(stage, schedule, now));

  // The platform-vs-law reconciliation, when an early warning has been filed.
  const filed = resolve(state.earlyWarningSubmitted, state.tz);
  if (state.eventType === EVENT_TYPES.vulnerability && filed && Number.isFinite(filed.instantMs)) {
    const rec = reconcileWithPlatform(schedule, filed.instantMs);
    if (rec && rec.legalDueMs) {
      banners.appendChild(el('div', {
        class: 'banner warn',
        html: `<strong>Reported platform counter:</strong> the ENISA platform has been reported to show the 72-hour due date as 48 hours after you submit the early warning (${formatInstant(rec.platformShownDueMs, state.tz)}), not 72 hours from awareness (${formatInstant(rec.legalDueMs, state.tz)}). ${rec.note}`,
      }));
    }
  }

  const obligations = el('div', { class: 'card', html: '<h3>Also on you after awareness</h3>' });
  const olist = el('ul', { class: 'reasons' });
  for (const o of schedule.obligations) {
    olist.appendChild(el('li', {}, [
      el('span', { class: 'basis', text: o.legalBasis }),
      document.createTextNode(' ' + o.text),
    ]));
  }
  obligations.appendChild(olist);
  banners.appendChild(obligations);
}

function tick() {
  const schedule = currentSchedule();
  if (!schedule || schedule.error) return;
  const now = Date.now();
  for (const stage of schedule.stages) {
    const node = document.querySelector(`[data-count="${stage.id}"]`);
    if (!node) continue;
    const status = stageStatus(stage, now);
    node.textContent = humanRemaining(status.remainingMs);
    const card = node.closest('.stage');
    if (card && !card.classList.contains(status.state)) {
      card.className = `stage ${status.state}`;
      const badge = card.querySelector('.state');
      badge.className = `state ${status.state}`;
      badge.textContent = stateLabel(status.state);
    }
  }
}

function renderScope() {
  const awareness = resolve(state.awareness, state.tz);
  const verdict = scopeCheck({
    role: state.role,
    inEuMarket: state.inEuMarket,
    eventType: state.eventType,
    awarenessMs: awareness && awareness.instantMs,
    applicationMs: applicationStartMs(state.tz),
    severe: state.eventType === EVENT_TYPES.incident
      ? incidentSeverity(state.severity).severe
      : undefined,
  });
  const host = $('#scope-verdict');
  host.replaceChildren();
  const label = verdict.reportable === true ? 'Article 14 reporting duty indicated'
    : verdict.reportable === false ? 'No Article 14 duty indicated on these facts'
      : 'Not settled by these facts';
  host.appendChild(el('div', { class: 'verdict' }, [
    el('span', { class: `dot ${verdict.reportable === true ? 'yes' : verdict.reportable === false ? 'no' : 'maybe'}` }),
    el('span', { text: label }),
  ]));
  const list = el('ul', { class: 'reasons' });
  for (const reason of verdict.reasons) {
    const item = el('li', {});
    item.appendChild(el('span', { class: `kind ${reason.kind}`, text: reason.kind.replace(/-/g, ' ') }));
    item.appendChild(el('strong', { text: reason.legalBasis + '. ' }));
    item.appendChild(document.createTextNode(reason.text));
    if (reason.source) item.appendChild(el('div', { class: 'smallprint', text: `Source: ${reason.source}` }));
    list.appendChild(item);
  }
  host.appendChild(list);
  host.appendChild(el('p', {
    class: 'smallprint',
    text: 'These checks are labelled by evidence kind on purpose: regulation text, Commission guidance, an authority statement, or this tool\'s own interpretation. Only the first is binding text.',
  }));
}

function renderDraft() {
  const schedule = currentSchedule();
  const host = $('#draft-fields');
  host.replaceChildren();
  if (!schedule || schedule.error) {
    host.appendChild(el('div', { class: 'banner warn', text: 'Fix the awareness moment first.' }));
    return;
  }
  const stageId = state.draftStage;
  const stage = schedule.stages.find((s) => s.id === stageId);
  const fields = stageDraftFields(stageId);
  const values = state.draftValues;
  const draft = { fields, values };
  const report = checkDraft(draft);

  for (const check of report.checks) {
    const field = el('div', { class: 'field' });
    field.appendChild(el('label', { class: 'f', for: `f-${check.key}` }, [
      document.createTextNode(check.label),
      check.required ? el('span', { class: 'req', text: ' *' }) : document.createTextNode(' (if available)'),
    ]));
    const input = el(check.limit > 1000 ? 'textarea' : 'input', {
      id: `f-${check.key}`,
      type: 'text',
      value: values[check.key] ?? '',
      placeholder: check.required ? 'Required — write it in your own words' : 'Optional',
    });
    input.addEventListener('input', () => {
      values[check.key] = input.value;
      const meta = field.querySelector('.meta');
      const len = input.value.length;
      meta.replaceChildren(
        el('span', { text: `${len} / ${check.limit} characters` }),
        len > check.limit ? el('span', { class: 'over', text: 'over the ceiling' }) : el('span', { text: '' }),
      );
      refreshDraftGate();
      renderPreview();
    });
    field.appendChild(input);
    const len = (values[check.key] ?? '').length;
    field.appendChild(el('div', { class: 'meta' }, [
      el('span', { text: `${len} / ${check.limit} characters` }),
      len > check.limit ? el('span', { class: 'over', text: 'over the ceiling' }) : el('span', { text: '' }),
    ]));
    host.appendChild(field);
  }

  const gate = el('div', { class: 'banner ' + (report.ok ? 'good' : 'warn'), id: 'draft-gate' });
  gate.textContent = report.ok
    ? 'Every required field for this stage is present and within the published character ceilings.'
    : 'Not ready to file: ' + report.checks.filter((c) => !c.ok).map((c) => `${c.label} (${c.reason})`).join('; ');
  host.appendChild(gate);

  $('#draft-actions').dataset.stage = stageId;
  renderPreview();
}

/** Re-evaluate the filing gate as the user types, without rebuilding the fields. */
function refreshDraftGate() {
  const gate = document.querySelector('#draft-gate');
  if (!gate) return;
  const report = checkDraft({ fields: stageDraftFields(state.draftStage), values: state.draftValues });
  gate.className = 'banner ' + (report.ok ? 'good' : 'warn');
  gate.textContent = report.ok
    ? 'Every required field for this stage is present and within the published character ceilings.'
    : 'Not ready to file: ' + report.checks.filter((c) => !c.ok).map((c) => `${c.label} (${c.reason})`).join('; ');
}

function currentDoc() {
  const schedule = currentSchedule();
  if (!schedule || schedule.error) return null;
  const stageId = state.draftStage;
  const stage = schedule.stages.find((s) => s.id === stageId);
  return renderDraftDocument(stageId, state.draftValues, {
    eventType: schedule.eventType,
    legalBasis: stage ? stage.legalBasis : '',
    awarenessLabel: formatInstant(schedule.awarenessMs, state.tz),
    awarenessIso: new Date(schedule.awarenessMs).toISOString(),
    dueLabel: stage && Number.isFinite(stage.dueMs) ? formatInstant(stage.dueMs, state.tz) : 'not scheduled yet',
    dueIso: stage && Number.isFinite(stage.dueMs) ? new Date(stage.dueMs).toISOString() : null,
  });
}

function renderPreview() {
  const doc = currentDoc();
  const host = $('#draft-preview');
  if (!doc) {
    host.textContent = '';
    return;
  }
  host.textContent = doc.markdown;
}

function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = old; }, 1500);
  } catch {
    button.textContent = 'Select and copy manually';
  }
}

function statusSummary() {
  const schedule = currentSchedule();
  if (!schedule || schedule.error) return '';
  const lines = [
    `Hour Zero v${VERSION} — CRA Article 14 status`,
    `Event type: ${schedule.eventType}`,
    `Awareness: ${formatInstant(schedule.awarenessMs, state.tz)} (${new Date(schedule.awarenessMs).toISOString()})`,
    '',
  ];
  for (const stage of schedule.stages) {
    const status = stageStatus(stage, Date.now());
    lines.push(
      `${stage.name} (${stage.legalBasis}, ${stage.clockLabel}): ` +
      (Number.isFinite(stage.dueMs)
        ? `${formatInstant(stage.dueMs, state.tz)} — ${status.state} — ${humanRemaining(status.remainingMs)}`
        : `clock not started (${stage.awaitingInputPrompt})`),
    );
  }
  lines.push('', `Not legal advice. Text: ${LEGAL.eurlex}`);
  return lines.join('\n');
}

/* ---------------- self-test ---------------- */

async function runSelfTest() {
  const host = $('#selftest-output');
  host.replaceChildren(el('li', { text: 'running…' }));
  try {
    const { runSuite } = await import('./tests/suite.mjs');
    const { total, passed, failed, results } = runSuite();
    host.replaceChildren();
    for (const [i, r] of results.entries()) {
      host.appendChild(el('li', {
        class: r.ok ? '' : 'fail',
        text: `${r.ok ? 'PASS' : 'FAIL'} ${i + 1}/${total} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`,
      }));
    }
    $('#selftest-summary').textContent = `${passed}/${total} passed${failed ? `, ${failed} FAILED` : ''}`;
    $('#selftest-summary').className = 'banner ' + (failed ? 'bad' : 'good');
  } catch (error) {
    host.replaceChildren(el('li', { class: 'fail', text: String(error && error.message ? error.message : error) }));
  }
}

/* ---------------- wiring ---------------- */

function initInputs() {
  const tzSelect = $('#tz');
  const zones = TZ_LIST.includes(state.tz) ? TZ_LIST : [state.tz, ...TZ_LIST];
  for (const zone of zones) {
    tzSelect.appendChild(el('option', { value: zone, text: zone }));
  }
  tzSelect.value = state.tz;

  $('#awareness').value = state.awareness;

  const bind = (selector, key) => $(selector).addEventListener('input', (event) => {
    state[key] = event.target.value;
    renderClock();
    renderScope();
    renderDraft();
  });
  bind('#awareness', 'awareness');
  bind('#fix-available', 'fixAvailable');
  bind('#submitted', 'submitted');
  bind('#early-warning-filed', 'earlyWarningSubmitted');

  tzSelect.addEventListener('change', () => {
    state.tz = tzSelect.value;
    renderClock();
    renderScope();
    renderDraft();
  });

  for (const input of document.querySelectorAll('input[name="event-type"]')) {
    input.addEventListener('change', () => {
      state.eventType = input.value;
      toggleEventType();
      renderClock();
      renderScope();
      renderDraft();
    });
  }
  for (const input of document.querySelectorAll('input[name="severity"]')) {
    input.addEventListener('change', () => {
      state.severity[input.dataset.limb] = input.value === 'yes';
      renderScope();
    });
  }
  $('#role').addEventListener('change', (event) => {
    state.role = event.target.value;
    renderScope();
  });
  $('#eu-market').addEventListener('change', (event) => {
    state.inEuMarket = event.target.value;
    renderScope();
  });

  $('#now-button').addEventListener('click', () => {
    state.awareness = localInputValue(new Date());
    $('#awareness').value = state.awareness;
    renderClock();
    renderScope();
    renderDraft();
  });

  for (const tab of document.querySelectorAll('.tabs button')) {
    tab.addEventListener('click', () => {
      state.draftStage = tab.dataset.stage;
      for (const other of document.querySelectorAll('.tabs button')) {
        other.setAttribute('aria-selected', String(other === tab));
      }
      renderDraft();
    });
  }

  $('#btn-ics').addEventListener('click', () => {
    const schedule = currentSchedule();
    if (!schedule || schedule.error) return;
    download('hour-zero-cra-art14-deadlines.ics', buildIcs(schedule, { nowMs: Date.now() }), 'text/calendar');
  });
  $('#btn-copy-summary').addEventListener('click', (event) => copy(statusSummary(), event.target));
  $('#btn-copy-md').addEventListener('click', (event) => {
    const doc = currentDoc();
    if (doc) copy(doc.markdown, event.target);
  });
  $('#btn-download-md').addEventListener('click', () => {
    const doc = currentDoc();
    if (doc) download(`hour-zero-${state.draftStage}-draft.md`, doc.markdown, 'text/markdown');
  });
  $('#btn-download-json').addEventListener('click', () => {
    const doc = currentDoc();
    if (doc) download(`hour-zero-${state.draftStage}-draft.json`, JSON.stringify(doc.json, null, 2), 'application/json');
  });
  $('#btn-print').addEventListener('click', () => window.print());
  $('#btn-selftest').addEventListener('click', runSelfTest);

  $('#version').textContent = VERSION;
  $('#limits-inline').textContent = `${FIELD_LIMITS.narrative}/${FIELD_LIMITS.measures}/${FIELD_LIMITS.title}/${FIELD_LIMITS.maliciousActor}`;
}

function toggleEventType() {
  const isVuln = state.eventType === EVENT_TYPES.vulnerability;
  $('#vuln-only').hidden = !isVuln;
  $('#incident-only').hidden = isVuln;
  $('#severity-block').hidden = isVuln;
  for (const label of document.querySelectorAll('.radio-row label')) {
    const input = label.querySelector('input');
    label.classList.toggle('sel', input && input.checked);
  }
}

function boot() {
  initInputs();
  toggleEventType();
  renderClock();
  renderScope();
  renderDraft();
  setInterval(tick, 1000);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
