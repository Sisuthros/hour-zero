/**
 * Hour Zero — test suite (browser- and Node-runnable, no dependencies).
 * Every claim the product makes about the clock is pinned to a case here.
 * `runSuite()` is pure: no DOM, no network, no filesystem.
 */
import {
  VERSION,
  FIELD_LIMITS,
  EVENT_TYPES,
  ART14_APPLIES_FROM,
  addMonths,
  addHours,
  buildIcs,
  canInvokePec,
  checkDraft,
  computeSchedule,
  formatInstant,
  humanRemaining,
  incidentSeverity,
  reconcileWithPlatform,
  renderDraft,
  scopeCheck,
  stageStatus,
  wallTimeToInstant,
  utcPartsInZone,
} from '../core.js';

const UTC = (y, m, d, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min, 0);

export function runSuite() {
  const results = [];
  const test = (name, fn) => {
    try {
      const detail = fn();
      results.push({ name, ok: true, detail: detail === undefined ? '' : String(detail) });
    } catch (error) {
      results.push({ name, ok: false, detail: error && error.message ? error.message : String(error) });
    }
  };
  const eq = (actual, expected, what = 'value') => {
    if (actual !== expected) {
      throw new Error(`${what}: expected ${formatValue(expected)}, got ${formatValue(actual)}`);
    }
    return `${what} = ${formatValue(actual)}`;
  };
  const ok = (condition, message) => {
    if (!condition) throw new Error(message);
    return message;
  };

  const awareness = UTC(2026, 9, 11, 9, 0); // 2026-09-11T09:00Z
  const fixAvailable = UTC(2026, 9, 20, 12, 0);
  const submitted = UTC(2026, 9, 22, 15, 0);

  /* ---- Art. 14(2): the vulnerability clock ---- */

  test('Art. 14(2)(a): early warning is awareness + 24 h', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const ew = s.stages.find((x) => x.id === 'early_warning');
    eq(ew.dueMs, UTC(2026, 9, 12, 9, 0), 'due');
    eq(ew.legalBasis, 'Art. 14(2)(a)');
    return formatInstant(ew.dueMs, 'UTC');
  });

  test('Art. 14(2)(b): vulnerability notification is awareness + 72 h', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const n = s.stages.find((x) => x.id === 'notification');
    eq(n.dueMs, UTC(2026, 9, 14, 9, 0), 'due');
    return formatInstant(n.dueMs, 'UTC');
  });

  test('Art. 14(2)(c): final report runs 14 days from the FIX, not from awareness', () => {
    const s = computeSchedule({
      eventType: EVENT_TYPES.vulnerability,
      awarenessMs: awareness,
      fixAvailableMs: fixAvailable,
      tz: 'UTC',
    });
    const fr = s.stages.find((x) => x.id === 'final_report');
    eq(fr.dueMs, UTC(2026, 10, 4, 12, 0), 'due');
    ok(fr.dueMs !== awareness + 14 * 86400000, 'final report must not sit at awareness + 14 d');
    eq(fr.clockKind, 'fix_available');
    return formatInstant(fr.dueMs, 'UTC');
  });

  test('Art. 14(2)(c): without a fix the final-report clock has not started', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const fr = s.stages.find((x) => x.id === 'final_report');
    eq(fr.dueMs, null, 'due');
    eq(fr.awaitingInput, true, 'awaitingInput');
    ok(s.warnings.some((w) => w.includes('Art. 14(2)(c)')), 'a warning explains the unstarted clock');
    return s.warnings[0].slice(0, 60);
  });

  /* ---- Art. 14(4): the severe-incident clock ---- */

  test('Art. 14(4)(a)-(b): incident early warning 24 h, notification 72 h', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.incident, awarenessMs: awareness, tz: 'UTC' });
    eq(s.stages.find((x) => x.id === 'early_warning').dueMs, UTC(2026, 9, 12, 9, 0), 'early warning');
    eq(s.stages.find((x) => x.id === 'notification').dueMs, UTC(2026, 9, 14, 9, 0), 'notification');
    return '24 h / 72 h confirmed';
  });

  test('Art. 14(4)(c): incident final report is one month after the 72 h submission', () => {
    const s = computeSchedule({
      eventType: EVENT_TYPES.incident,
      awarenessMs: awareness,
      incidentSubmittedMs: submitted,
      tz: 'UTC',
    });
    const fr = s.stages.find((x) => x.id === 'final_report');
    eq(fr.dueMs, UTC(2026, 10, 22, 15, 0), 'due');
    eq(fr.clockKind, 'notification_submitted');
    ok(fr.dueMs !== addMonths(awareness, 1), 'must not be awareness + 1 month');
    return formatInstant(fr.dueMs, 'UTC');
  });

  test('month arithmetic clamps at month end (31 Aug + 1 month)', () => {
    eq(addMonths(UTC(2026, 8, 31, 10, 0), 1), UTC(2026, 9, 30, 10, 0), '30-day month');
    eq(addMonths(UTC(2026, 1, 31, 10, 0), 1), UTC(2026, 2, 28, 10, 0), 'February');
    eq(addMonths(UTC(2028, 1, 31, 10, 0), 1), UTC(2028, 2, 29, 10, 0), 'leap February');
    return '31 Aug→30 Sep, 31 Jan→28 Feb, leap→29 Feb';
  });

  /* ---- time zones ---- */

  test('wall clock converts to the right instant (Europe/Helsinki, EEST)', () => {
    const r = wallTimeToInstant({ year: 2026, month: 9, day: 21, hour: 22, minute: 30 }, 'Europe/Helsinki');
    eq(r.instantMs, UTC(2026, 9, 21, 19, 30), 'instant');
    eq(r.ambiguous, false, 'ambiguous');
    return new Date(r.instantMs).toISOString();
  });

  test('DST overlap is resolved to the EARLIER instant and flagged', () => {
    const r = wallTimeToInstant({ year: 2026, month: 10, day: 25, hour: 3, minute: 30 }, 'Europe/Helsinki');
    eq(r.ambiguous, true, 'ambiguous');
    eq(r.instantMs, UTC(2026, 10, 25, 0, 30), 'earliest of the two occurrences');
    return `ambiguous, earliest ${new Date(r.instantMs).toISOString()}`;
  });

  test('DST gap is flagged and resolves no later than the reading', () => {
    const r = wallTimeToInstant({ year: 2026, month: 3, day: 29, hour: 3, minute: 30 }, 'Europe/Helsinki');
    eq(r.nonexistent, true, 'nonexistent');
    ok(r.instantMs <= UTC(2026, 3, 29, 1, 30), 'no later than the intended instant');
    return `nonexistent, resolved to ${new Date(r.instantMs).toISOString()}`;
  });

  test('UTC and fixed-offset zones behave', () => {
    eq(wallTimeToInstant({ year: 2026, month: 9, day: 11, hour: 12 }, 'UTC').instantMs, UTC(2026, 9, 11, 12));
    eq(wallTimeToInstant({ year: 2026, month: 9, day: 11, hour: 12 }, 'Asia/Tokyo').instantMs, UTC(2026, 9, 11, 3));
    let threw = false;
    try {
      wallTimeToInstant({ year: 2026, month: 9, day: 11 }, 'Not/AZone');
    } catch {
      threw = true;
    }
    ok(threw, 'an unknown zone throws instead of silently using UTC');
    return 'UTC, Asia/Tokyo, invalid zone rejected';
  });

  test('round-trip: formatted instant carries the zone offset', () => {
    const label = formatInstant(UTC(2026, 9, 12, 9, 0), 'Europe/Helsinki');
    ok(label.includes('2026-09-12'), 'has the date');
    ok(label.includes('12:00'), 'has the local hour');
    ok(label.includes('UTC+03:00'), 'has the offset');
    return label;
  });

  /* ---- status ---- */

  test('status: upcoming → due_soon (last quarter) → overdue', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const ew = s.stages.find((x) => x.id === 'early_warning');
    eq(stageStatus(ew, ew.dueMs - 10 * 3600 * 1000).state, 'upcoming', 'ten hours out');
    eq(stageStatus(ew, ew.dueMs - 6 * 3600 * 1000).state, 'due_soon', 'six hours out');
    eq(stageStatus(ew, ew.dueMs - 1).state, 'due_soon', 'one ms out');
    eq(stageStatus(ew, ew.dueMs).state, 'overdue', 'exactly at the deadline');
    eq(stageStatus(ew, ew.dueMs + 1000).state, 'overdue', 'one second late');
    return 'upcoming / due_soon / overdue boundaries held';
  });

  test('status: an unstarted clock reports awaiting_input, not overdue', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const fr = s.stages.find((x) => x.id === 'final_report');
    eq(stageStatus(fr, awareness + 30 * 86400000).state, 'awaiting_input', 'state');
    return 'no false overdue';
  });

  test('remaining time renders in days/hours/minutes', () => {
    eq(humanRemaining(25 * 3600000 + 30 * 60000), '1 d 1 h 30 min', 'forward');
    ok(humanRemaining(-3600000).startsWith('overdue by'), 'past');
    eq(humanRemaining(null), '—', 'unknown');
    return '25 h 30 min → "1 d 1 h 30 min"';
  });

  /* ---- scoping ---- */

  test('awareness before 11 Sep 2026 is not reportable', () => {
    const r = scopeCheck({
      role: 'manufacturer',
      inEuMarket: 'yes',
      eventType: EVENT_TYPES.vulnerability,
      awarenessMs: UTC(2026, 9, 10, 22, 0),
      applicationMs: UTC(2026, 9, 11, 0, 0),
    });
    eq(r.reportable, false, 'reportable');
    ok(r.reasons.some((x) => x.text.includes(ART14_APPLIES_FROM.label)), 'cites the application date');
    return r.reasons.map((x) => x.kind).join(', ');
  });

  test('awareness on/after 11 Sep 2026 is reportable (manufacturer, exploited vulnerability)', () => {
    const r = scopeCheck({
      role: 'manufacturer',
      inEuMarket: 'yes',
      eventType: EVENT_TYPES.vulnerability,
      awarenessMs: UTC(2026, 9, 11, 0, 0),
      applicationMs: UTC(2026, 9, 11, 0, 0),
    });
    eq(r.reportable, true, 'reportable');
    ok(r.reasons.some((x) => x.legalBasis === 'Art. 69(2)–(3)'), 'carries the installed-base rule');
    return r.reasons.length + ' reasons';
  });

  test('importers and distributors do not file under Article 14', () => {
    const r = scopeCheck({ role: 'distributor', inEuMarket: 'yes', eventType: EVENT_TYPES.vulnerability });
    eq(r.reportable, false, 'reportable');
    ok(r.reasons.some((x) => x.legalBasis.startsWith('Art. 15')), 'points at voluntary reporting');
    return 'Art. 14 is a manufacturer duty';
  });

  test('open-source stewards: duty exists but from 11 Dec 2027', () => {
    const r = scopeCheck({ role: 'steward', inEuMarket: 'yes', eventType: EVENT_TYPES.vulnerability });
    eq(r.reportable, null, 'reportable');
    ok(r.reasons.some((x) => x.legalBasis === 'Art. 24(3)'), 'cites Art. 24(3)');
    ok(r.reasons.some((x) => x.text.includes('11 December 2027')), 'cites the steward date');
    return 'deferred to 2027';
  });

  test('a product not made available in the Union is out of scope', () => {
    const r = scopeCheck({ role: 'manufacturer', inEuMarket: 'no', eventType: EVENT_TYPES.vulnerability });
    eq(r.reportable, false, 'reportable');
    return 'Art. 2(1)';
  });

  test('incident severity follows the Art. 14(5) test', () => {
    eq(incidentSeverity({ affectsProtection: false, maliciousCode: false }).severe, false, 'neither limb');
    eq(incidentSeverity({ affectsProtection: true, maliciousCode: false }).severe, true, 'limb (a)');
    eq(incidentSeverity({ affectsProtection: false, maliciousCode: true }).severe, true, 'limb (b)');
    const r = scopeCheck({ role: 'manufacturer', inEuMarket: 'yes', eventType: EVENT_TYPES.incident, severe: false });
    eq(r.reportable, false, 'non-severe incident');
    const r2 = scopeCheck({ role: 'manufacturer', inEuMarket: 'yes', eventType: EVENT_TYPES.incident, severe: true });
    eq(r2.reportable, true, 'severe incident');
    return 'severity is the gate, not the fact of an incident';
  });

  test('Art. 16(2) restrictions belong to the 72 h vulnerability notice only', () => {
    eq(canInvokePec(EVENT_TYPES.vulnerability, 'notification'), true, 'vulnerability notice');
    eq(canInvokePec(EVENT_TYPES.vulnerability, 'early_warning'), false, 'early warning');
    eq(canInvokePec(EVENT_TYPES.incident, 'notification'), false, 'incident notice');
    return 'no PEC route on incidents';
  });

  /* ---- drafting ---- */

  test('draft field limits match the published ceilings', () => {
    eq(FIELD_LIMITS.title, 255, 'title');
    eq(FIELD_LIMITS.narrative, 4000, 'narrative');
    eq(FIELD_LIMITS.measures, 2000, 'measures');
    eq(FIELD_LIMITS.pecJustification, 800, 'PEC justification');
    eq(FIELD_LIMITS.maliciousActor, 100, 'malicious actor');
    return '255 / 4000 / 2000 / 800 / 100';
  });

  test('an over-length or empty-required draft fails closed', () => {
    const draft = {
      fields: [
        { key: 'title', label: 'Title', limit: FIELD_LIMITS.title, required: true },
        { key: 'summary', label: 'Summary', limit: FIELD_LIMITS.narrative, required: true },
      ],
      values: { title: 'x'.repeat(256), summary: '' },
    };
    const r = checkDraft(draft);
    eq(r.ok, false, 'ok');
    eq(r.checks.filter((c) => !c.ok).length, 2, 'failures');
    ok(r.checks[0].reason.includes('256') === false && r.checks[0].reason.includes('255'), 'explains the ceiling');
    return r.checks.map((c) => `${c.key}:${c.length}/${c.limit}`).join(' ');
  });

  test('draft rendering invents nothing and marks empty fields', () => {
    const { markdown, json } = renderDraft(
      'early_warning',
      { title: 'ThermoSmart X — exploited auth bypass', summary: '' },
      { eventType: 'vulnerability', legalBasis: 'Art. 14(2)(a)', awarenessLabel: 'Fri 2026-09-11 12:00 (UTC+03:00, Europe/Helsinki)' },
    );
    ok(markdown.includes('ThermoSmart X — exploited auth bypass'), 'carries the user text');
    ok(markdown.includes('_to be completed_'), 'marks the empty field');
    ok(markdown.includes('Art. 14(2)(a)'), 'names the legal basis');
    eq(json.fields.summary, '', 'empty field stays empty');
    ok(!/\b\d+ ?(minutes|hours) saved\b/i.test(markdown), 'no invented impact');
    return `${markdown.split('\n').length} lines`;
  });

  /* ---- calendar ---- */

  test('calendar export uses CRLF, UTC stamps and one alarm per deadline', () => {
    const s = computeSchedule({
      eventType: EVENT_TYPES.vulnerability,
      awarenessMs: awareness,
      fixAvailableMs: fixAvailable,
      tz: 'UTC',
    });
    const ics = buildIcs(s, { nowMs: awareness });
    ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'starts the calendar');
    ok(ics.endsWith('END:VCALENDAR\r\n'), 'ends the calendar');
    ok(!/[^\r]\n/.test(ics), 'every line ends CRLF');
    ok(ics.includes('DTSTART:20260912T090000Z'), 'early warning in UTC basic format');
    ok(ics.includes('DTSTART:20261004T120000Z'), 'final report in UTC basic format');
    eq((ics.match(/BEGIN:VEVENT/g) || []).length, 3, 'events');
    eq((ics.match(/BEGIN:VALARM/g) || []).length, 3, 'alarms');
    return '3 events, 3 alarms, CRLF throughout';
  });

  test('an unstarted clock produces no calendar event for that stage', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const ics = buildIcs(s, { nowMs: awareness });
    eq((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'events');
    ok(!ics.includes('final_report'), 'no final-report event');
    return '2 events instead of 3';
  });

  test('calendar text escapes separators and stays single-line per field', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.incident, awarenessMs: awareness, tz: 'UTC' });
    const ics = buildIcs(s, { nowMs: awareness });
    ok(ics.includes('SUMMARY:Hour Zero — Early warning deadline (CRA Art. 14(4)(a))'), 'summary shape');
    ok(ics.includes('\\n'), 'newlines escaped in DESCRIPTION');
    return 'escaping verified';
  });

  test('calendar lines are folded to 75 octets and unfold cleanly', () => {
    const s = computeSchedule({
      eventType: EVENT_TYPES.vulnerability,
      awarenessMs: awareness,
      fixAvailableMs: fixAvailable,
      tz: 'UTC',
    });
    const ics = buildIcs(s, { nowMs: awareness });
    const encoder = new TextEncoder();
    const lines = ics.split('\r\n');
    const tooLong = lines.filter((line) => encoder.encode(line).length > 75);
    ok(tooLong.length === 0, `lines over 75 octets: ${tooLong.length}`);
    const unfolded = ics.replace(/\r\n /g, '');
    ok(unfolded.includes('a corrective or mitigating measure is available'), 'unfolding restores the full description');
    ok(unfolded.includes('Source: https://eur-lex.europa.eu'), 'unfolding restores the source URL');
    return `${lines.length} folded lines, none over 75 octets`;
  });

  /* ---- platform reconciliation ---- */
  test('platform counter is reconciled without overriding the legal clock', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const r = reconcileWithPlatform(s, addHours(awareness, 5));
    eq(r.legalDueMs, UTC(2026, 9, 14, 9, 0), 'legal due');
    eq(r.platformShownDueMs, UTC(2026, 9, 13, 14, 0), 'platform-shown due');
    ok(r.note.includes('72 hours from awareness'), 'explains the difference');
    return 'legal 14 Sep 09:00Z vs platform 13 Sep 14:00Z';
  });

  /* ---- honesty and hygiene ---- */

  test('follow-on obligations include user notification and intermediate reports', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.incident, awarenessMs: awareness, tz: 'UTC' });
    const ids = s.obligations.map((o) => o.id);
    ok(ids.includes('user_notification'), 'Art. 14(8)');
    ok(ids.includes('intermediate_report'), 'Art. 14(6)');
    ok(ids.includes('dissemination_delay'), 'Art. 16(2)');
    return ids.join(', ');
  });

  test('the schedule is pure: inputs are not mutated and results are deterministic', () => {
    const input = { eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, fixAvailableMs: fixAvailable, tz: 'Europe/Helsinki' };
    const snapshot = JSON.stringify(input);
    const a = JSON.stringify(computeSchedule(input));
    const b = JSON.stringify(computeSchedule(input));
    eq(JSON.stringify(input), snapshot, 'input untouched');
    eq(a, b, 'identical output');
    return 'no mutation, stable output';
  });

  test('every reason carries its basis and its evidence kind', () => {
    const allowed = new Set(['regulation-text', 'commission-guidance', 'reported-by-authority', 'our-interpretation']);
    const reasons = [
      ...scopeCheck({ role: 'manufacturer', inEuMarket: 'yes', eventType: EVENT_TYPES.vulnerability }).reasons,
      ...scopeCheck({ role: 'steward', inEuMarket: 'yes', eventType: EVENT_TYPES.vulnerability }).reasons,
      ...scopeCheck({ role: 'manufacturer', inEuMarket: 'no', eventType: EVENT_TYPES.incident, severe: false }).reasons,
    ];
    for (const reason of reasons) {
      ok(reason.legalBasis && reason.legalBasis.length > 0, `basis missing: ${reason.text}`);
      ok(allowed.has(reason.kind), `unknown evidence kind: ${reason.kind}`);
    }
    return `${reasons.length} reasons labelled`;
  });

  test('no automated stage is ever called closed by this module', () => {
    const s = computeSchedule({ eventType: EVENT_TYPES.vulnerability, awarenessMs: awareness, tz: 'UTC' });
    const flat = JSON.stringify(s).toLowerCase();
    ok(!flat.includes('"closed"') && !flat.includes('"verified"') && !flat.includes('auto_'), 'no closure or verification state exists');
    return 'the tool schedules; it never declares compliance';
  });

  test('version is stamped on drafts so a filing can cite its source', () => {
    ok(/^\d+\.\d+\.\d+$/.test(VERSION), `version format: ${VERSION}`);
    const { markdown } = renderDraft('final_report', { description: 'x' }, {});
    ok(markdown.includes(`v${VERSION}`), 'version appears in the draft');
    return `v${VERSION}`;
  });

  test('utcPartsInZone agrees with the wall clock we produced', () => {
    const r = wallTimeToInstant({ year: 2026, month: 12, day: 31, hour: 23, minute: 45 }, 'Europe/Helsinki');
    const p = utcPartsInZone(r.instantMs, 'Europe/Helsinki');
    eq(`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`, '2026-12-31 23:45', 'round trip');
    return 'round trip holds';
  });

  const passed = results.filter((r) => r.ok).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

function formatValue(v) {
  if (typeof v === 'string') return `"${v}"`;
  if (v === null) return 'null';
  return String(v);
}
