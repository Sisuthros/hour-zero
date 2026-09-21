/**
 * Hour Zero — core.js
 * Pure, dependency-free deadline engine for EU CRA (Regulation (EU) 2024/2847)
 * Article 14 reporting. No network, no DOM, no storage. Runs identically in a
 * browser (ES module) and in Node (for the test suite).
 *
 * Legal basis (quotations are verbatim from the OJ text of Regulation (EU)
 * 2024/2847, CELEX 32024R2847 — see EVIDENCE.md):
 *   Art. 14(2)(a) early warning, "within 24 hours of the manufacturer becoming aware"
 *   Art. 14(2)(b) vulnerability notification, "within 72 hours of ... becoming aware"
 *   Art. 14(2)(c) final report, "no later than 14 days after a corrective or
 *                 mitigating measure is available"
 *   Art. 14(4)(a) incident early warning, within 24 hours of becoming aware
 *   Art. 14(4)(b) incident notification, within 72 hours of becoming aware
 *   Art. 14(4)(c) incident final report, "within one month after the submission of
 *                 the incident notification under point (b)"
 *   Art. 71(2)    Article 14 applies from 11 September 2026
 *
 * The two clocks that naive tools get wrong are 14(2)(c) and 14(4)(c): neither
 * runs from the moment of awareness.
 */

export const VERSION = '1.0.0';
export const PRODUCT = 'Hour Zero';

export const LEGAL = Object.freeze({
  regulation: 'Regulation (EU) 2024/2847 (Cyber Resilience Act)',
  celex: '32024R2847',
  eurlex: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R2847',
  srp: 'https://portal.cra-srp.enisa.europa.eu',
  commissionReporting: 'https://digital-strategy.ec.europa.eu/en/policies/cra-reporting',
  enisaSrp: 'https://www.enisa.europa.eu/topics/product-security/single-reporting-platform-srp',
});

/** Article 14 applies from this date (Art. 71(2), verbatim). */
export const ART14_APPLIES_FROM = Object.freeze({
  iso: '2026-09-11',
  label: '11 September 2026',
});

/** Reporting duties for open-source software stewards (Art. 24(3)) apply later. */
export const STEWARD_APPLIES_FROM = Object.freeze({
  iso: '2027-12-11',
  label: '11 December 2027',
});

/** Character ceilings published by ENISA for the platform's fields. */
export const FIELD_LIMITS = Object.freeze({
  title: 255,
  product: 255,
  component: 255,
  attackVector: 255,
  rootCause: 255,
  maliciousActor: 100,
  narrative: 4000,
  measures: 2000,
  pecJustification: 800,
});

export const EVENT_TYPES = Object.freeze({
  vulnerability: 'vulnerability',
  incident: 'incident',
});

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ *
 * Timezone maths (dependency-free, via Intl)
 * ------------------------------------------------------------------ */

const offsetCache = new Map();

function zoneFormatter(tz) {
  let f = offsetCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset in minutes east of UTC that `tz` is at the given instant. */
export function offsetMinutesAt(instantMs, tz) {
  const p = {};
  for (const part of zoneFormatter(tz).formatToParts(new Date(instantMs))) {
    p[part.type] = part.value;
  }
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - instantMs) / MIN);
}

/**
 * Convert a wall-clock reading ("2026-09-21 22:30" in `tz`) to a UTC instant.
 * Handles the two DST edge cases honestly:
 *   - gaps (spring forward): the reading does not exist -> `nonexistent`, and we
 *     resolve to an instant no later than the reading, which is the stricter
 *     direction for a deadline.
 *   - overlaps (fall back): the reading exists twice -> `ambiguous`, we return
 *     the EARLIER instant, which is the stricter (earlier) deadline.
 */
export function wallTimeToInstant(parts, tz) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  if (!isValidTimeZone(tz)) throw new Error(`Unknown time zone: ${tz}`);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const guess = (candidate) => naive - offsetMinutesAt(candidate, tz) * MIN;
  let instant = guess(naive);
  instant = guess(instant);
  instant = guess(instant);
  const roundTrip = utcPartsInZone(instant, tz);
  const exact =
    roundTrip.year === year &&
    roundTrip.month === month &&
    roundTrip.day === day &&
    roundTrip.hour === hour &&
    roundTrip.minute === minute;
  const alternatives = new Set([
    instant,
    instant - HOUR,
    instant + HOUR,
    instant - 2 * HOUR,
    instant + 2 * HOUR,
  ]);
  const matches = [...alternatives]
    .filter((candidate) => {
      const t = utcPartsInZone(candidate, tz);
      return (
        t.year === year && t.month === month && t.day === day && t.hour === hour && t.minute === minute
      );
    })
    .sort((a, b) => a - b);
  return {
    instantMs: matches.length ? matches[0] : instant,
    offsetMinutes: offsetMinutesAt(matches.length ? matches[0] : instant, tz),
    ambiguous: matches.length > 1,
    nonexistent: matches.length === 0 && !exact,
    matches,
  };
}

export function utcPartsInZone(instantMs, tz) {
  const p = {};
  for (const part of zoneFormatter(tz).formatToParts(new Date(instantMs))) {
    p[part.type] = part.value;
  }
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour % 24,
    minute: +p.minute,
    second: +p.second,
  };
}

/** "Sun 2026-09-13 09:00 (UTC+03:00)" — stable, locale-independent shape. */
export function formatInstant(instantMs, tz) {
  const p = utcPartsInZone(instantMs, tz);
  const off = offsetMinutesAt(instantMs, tz);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  const offLabel = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(instantMs).getUTCDay()];
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${weekday} ${p.year}-${pad(p.month)}-${pad(p.day)} ` +
    `${pad(p.hour)}:${pad(p.minute)} (${offLabel}, ${tz})`
  );
}

/* ------------------------------------------------------------------ *
 * Duration maths
 * ------------------------------------------------------------------ */

export function addHours(instantMs, hours) {
  return instantMs + hours * HOUR;
}

export function addDays(instantMs, days) {
  return instantMs + days * DAY;
}

/**
 * Calendar-month addition in UTC, day-of-month clamped to the target month's
 * length (31 Jan + 1 month = 28/29 Feb). "One month" in Art. 14(4)(c) is read as
 * a calendar month; the clamp keeps the result inside the month.
 */
export function addMonths(instantMs, months) {
  const d = new Date(instantMs);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

/* ------------------------------------------------------------------ *
 * The schedule
 * ------------------------------------------------------------------ */

export const STAGE_META = Object.freeze({
  early_warning: { id: 'early_warning', name: 'Early warning', order: 1 },
  notification: { id: 'notification', name: 'Notification', order: 2 },
  final_report: { id: 'final_report', name: 'Final report', order: 3 },
});

/**
 * Build the three-stage Article 14 schedule.
 *
 * input = {
 *   eventType: 'vulnerability' | 'incident',
 *   awarenessMs: number,              // when you became aware (UTC ms)
 *   tz: string,                       // the zone the user is planning in
 *   fixAvailableMs?: number,          // vulnerability: when a corrective or
 *                                     // mitigating measure became available
 *   incidentSubmittedMs?: number,     // incident: when the 72 h notification
 *                                     // was actually submitted
 * }
 */
export function computeSchedule(input) {
  const { eventType, awarenessMs, tz } = input;
  if (eventType !== EVENT_TYPES.vulnerability && eventType !== EVENT_TYPES.incident) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  if (!Number.isFinite(awarenessMs)) throw new Error('awarenessMs required');
  if (tz && !isValidTimeZone(tz)) throw new Error(`Unknown time zone: ${tz}`);

  const isVuln = eventType === EVENT_TYPES.vulnerability;
  const warnings = [];
  const stages = [];

  stages.push({
    ...STAGE_META.early_warning,
    legalBasis: isVuln ? 'Art. 14(2)(a)' : 'Art. 14(4)(a)',
    rule: isVuln
      ? 'Early warning of an actively exploited vulnerability: without undue delay and in any event within 24 hours of becoming aware.'
      : 'Early warning of a severe incident: without undue delay and in any event within 24 hours of becoming aware, including whether it is suspected of being caused by unlawful or malicious acts.',
    clockKind: 'awareness',
    clockLabel: 'awareness + 24 h',
    windowMs: 24 * HOUR,
    dueMs: addHours(awarenessMs, 24),
    awaitingInput: false,
    requiredFields: [
      'notification type and level',
      'manufacturer (or steward) name',
      'product',
      'title (≤ 255 characters)',
      isVuln ? 'Member States where the product is available (where known)' : 'suspected unlawful or malicious act (yes/no)',
      isVuln ? null : 'Member States where the product is available (where known)',
    ].filter(Boolean),
  });

  stages.push({
    ...STAGE_META.notification,
    legalBasis: isVuln ? 'Art. 14(2)(b)' : 'Art. 14(4)(b)',
    rule: isVuln
      ? 'Vulnerability notification: within 72 hours of becoming aware — general nature of the exploit and of the vulnerability, corrective or mitigating measures taken, and measures users can take.'
      : 'Incident notification: within 72 hours of becoming aware — nature of the incident, initial assessment, corrective or mitigating measures taken, and measures users can take.',
    clockKind: 'awareness',
    clockLabel: 'awareness + 72 h',
    windowMs: 72 * HOUR,
    dueMs: addHours(awarenessMs, 72),
    awaitingInput: false,
    requiredFields: isVuln
      ? ['general nature of the exploit', 'general nature of the vulnerability', 'corrective or mitigating measures taken', 'measures users can take', 'sensitivity assessment']
      : ['nature of the incident', 'initial assessment', 'when it was detected and when it occurred', 'corrective or mitigating measures taken', 'measures users can take', 'sensitivity assessment'],
  });

  if (isVuln) {
    const fixMs = Number.isFinite(input.fixAvailableMs) ? input.fixAvailableMs : null;
    const awaiting = fixMs === null;
    if (awaiting) {
      warnings.push(
        'The final-report clock for an actively exploited vulnerability has NOT started: Art. 14(2)(c) runs it from the moment a corrective or mitigating measure is available, not from awareness.',
      );
    }
    stages.push({
      ...STAGE_META.final_report,
      legalBasis: 'Art. 14(2)(c)',
      rule: 'Final report: no later than 14 days after a corrective or mitigating measure is available — vulnerability description with severity and impact, malicious actor where available, and details of the security update or other corrective measures.',
      clockKind: 'fix_available',
      clockLabel: 'fix available + 14 d',
      windowMs: 14 * DAY,
      dueMs: awaiting ? null : addDays(fixMs, 14),
      awaitingInput: awaiting,
      awaitingInputPrompt: 'When did (or will) a corrective or mitigating measure become available?',
      requiredFields: ['description of the vulnerability, severity and impact', 'malicious actor, where available', 'details of the security update or other corrective measures'],
    });
  } else {
    const submittedMs = Number.isFinite(input.incidentSubmittedMs) ? input.incidentSubmittedMs : null;
    const awaiting = submittedMs === null;
    if (awaiting) {
      warnings.push(
        'The incident final-report clock under Art. 14(4)(c) starts when you actually submit the 72-hour incident notification — it is not awareness + 1 month. Record the submission timestamp.',
      );
    }
    stages.push({
      ...STAGE_META.final_report,
      legalBasis: 'Art. 14(4)(c)',
      rule: 'Final report: within one month after the submission of the 72-hour incident notification — detailed description of the incident with severity and impact, likely threat type or root cause, and applied and ongoing mitigation measures.',
      clockKind: 'notification_submitted',
      clockLabel: '72 h notification submitted + 1 month',
      windowMs: 31 * DAY,
      dueMs: awaiting ? null : addMonths(submittedMs, 1),
      awaitingInput: awaiting,
      awaitingInputPrompt: 'When did you submit the 72-hour incident notification?',
      requiredFields: ['detailed description of the incident, severity and impact', 'likely threat type or root cause', 'applied and ongoing mitigation measures'],
    });
  }

  return {
    eventType,
    awarenessMs,
    tz: tz || 'UTC',
    stages,
    warnings,
    obligations: followOnObligations(eventType),
  };
}

function followOnObligations(eventType) {
  return [
    {
      id: 'user_notification',
      legalBasis: 'Art. 14(8)',
      text:
        eventType === EVENT_TYPES.vulnerability
          ? 'Inform impacted users (and where appropriate all users) of the vulnerability and of the risk-mitigation and corrective measures they can deploy, where appropriate in a structured, machine-readable format.'
          : 'Inform impacted users (and where appropriate all users) of the incident and of the risk-mitigation and corrective measures they can deploy, where appropriate in a structured, machine-readable format.',
    },
    {
      id: 'intermediate_report',
      legalBasis: 'Art. 14(6)',
      text: 'A coordinating CSIRT may request an intermediate report on status updates. This is a request, not a scheduled stage — keep your record current.',
    },
    {
      id: 'dissemination_delay',
      legalBasis: 'Art. 16(2)',
      text:
        eventType === EVENT_TYPES.vulnerability
          ? 'Particularly exceptional circumstances can be flagged on the 72-hour vulnerability notification to limit what ENISA sees until the coordinating CSIRT decides. It requests a restriction; it does not pause your clock.'
          : 'Article 16(2) restrictions are available on the 72-hour notification of an actively exploited vulnerability only — not on a severe incident notification. Your clock is not paused either way.',
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export const STAGE_STATE = Object.freeze({
  AWAITING_INPUT: 'awaiting_input',
  UPCOMING: 'upcoming',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  NOT_APPLICABLE: 'not_applicable',
});

/** `due_soon` = inside the last quarter of the legal window (min 1 hour). */
export function stageStatus(stage, nowMs) {
  if (stage.awaitingInput || !Number.isFinite(stage.dueMs)) {
    return { state: STAGE_STATE.AWAITING_INPUT, remainingMs: null, shareUsed: null };
  }
  const remainingMs = stage.dueMs - nowMs;
  const windowMs = stage.windowMs;
  const shareUsed = windowMs ? Math.min(1, Math.max(0, 1 - remainingMs / windowMs)) : null;
  const threshold = Math.max(HOUR, windowMs * 0.25);
  let state = STAGE_STATE.UPCOMING;
  if (remainingMs <= 0) state = STAGE_STATE.OVERDUE;
  else if (remainingMs <= threshold) state = STAGE_STATE.DUE_SOON;
  return { state, remainingMs, shareUsed };
}

export function humanRemaining(ms) {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const past = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts = [];
  if (d) parts.push(`${d} d`);
  if (h || d) parts.push(`${h} h`);
  parts.push(`${m} min`);
  if (!d) parts.push(`${s} s`);
  return `${past ? 'overdue by ' : ''}${parts.join(' ')}`;
}

/* ------------------------------------------------------------------ *
 * Calendar export
 * ------------------------------------------------------------------ */

function icsEscape(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * RFC 5545 §3.1 folding: no content line longer than 75 octets; continuations
 * start with a single space. Counted in UTF-8 octets, not characters, so the
 * em dash and curly quotes in our text fold correctly.
 */
function foldLine(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

const ALARM_BEFORE_MS = {
  early_warning: 2 * HOUR,
  notification: 6 * HOUR,
  final_report: 24 * HOUR,
};

/** RFC 5545 calendar with one VEVENT per scheduled deadline. */
export function buildIcs(schedule, meta = {}) {
  const now = Number.isFinite(meta.nowMs) ? meta.nowMs : Date.now();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hour Zero//CRA Article 14 clock//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Hour Zero — CRA Art. 14 deadlines',
  ];
  for (const stage of schedule.stages) {
    if (!Number.isFinite(stage.dueMs)) continue;
    const alarm = ALARM_BEFORE_MS[stage.id] || 2 * HOUR;
    lines.push(
      'BEGIN:VEVENT',
      `UID:hourzero-${stage.id}-${schedule.awarenessMs}@hour-zero`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART:${icsStamp(stage.dueMs)}`,
      `DTEND:${icsStamp(stage.dueMs + 15 * MIN)}`,
      `SUMMARY:${icsEscape(`Hour Zero — ${stage.name} deadline (CRA ${stage.legalBasis})`)}`,
      `DESCRIPTION:${icsEscape(
        `${stage.rule}\nClock: ${stage.clockLabel}.\nEvent: ${schedule.eventType}.\nSource: ${LEGAL.eurlex}\nNot legal advice.`,
      )}`,
      'BEGIN:VALARM',
      `TRIGGER:-PT${Math.round(alarm / MIN)}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(`Hour Zero — ${stage.name} due in ${Math.round(alarm / MIN)} minutes`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ *
 * Report drafting
 * ------------------------------------------------------------------ */

export const DRAFT_FIELDS = Object.freeze({
  early_warning: [
    { key: 'title', label: 'Title', limit: FIELD_LIMITS.title, required: true },
    { key: 'product', label: 'Product (and version / affected component)', limit: FIELD_LIMITS.product, required: true },
    { key: 'memberStates', label: 'Member States where the product is available', limit: FIELD_LIMITS.narrative, required: false },
    { key: 'summary', label: 'What you know so far', limit: FIELD_LIMITS.narrative, required: true },
  ],
  notification: [
    { key: 'title', label: 'Title (same notification, carried forward)', limit: FIELD_LIMITS.title, required: true },
    { key: 'product', label: 'Product and affected versions', limit: FIELD_LIMITS.product, required: true },
    { key: 'vulnerability', label: 'General nature of the vulnerability and of the exploit', limit: FIELD_LIMITS.narrative, required: true },
    { key: 'measuredTaken', label: 'Corrective or mitigating measures taken', limit: FIELD_LIMITS.measures, required: true },
    { key: 'measuresForUsers', label: 'Measures users can take', limit: FIELD_LIMITS.measures, required: true },
    { key: 'sensitivity', label: 'How sensitive you consider this information', limit: FIELD_LIMITS.narrative, required: true },
  ],
  final_report: [
    { key: 'description', label: 'Description of the vulnerability or incident, severity and impact', limit: FIELD_LIMITS.narrative, required: true },
    { key: 'actor', label: 'Malicious actor information (where available)', limit: FIELD_LIMITS.maliciousActor, required: false },
    { key: 'rootCause', label: 'Likely threat type or root cause (incidents)', limit: FIELD_LIMITS.rootCause, required: false },
    { key: 'attackVector', label: 'Attack vector / affected component', limit: FIELD_LIMITS.attackVector, required: false },
    { key: 'measures', label: 'Security update or other corrective measures made available, and ongoing mitigation', limit: FIELD_LIMITS.measures, required: true },
  ],
});

export function checkDraft(draft) {
  const checks = [];
  const limits = FIELD_LIMITS;
  for (const field of draft.fields) {
    const value = String(draft.values[field.key] ?? '');
    const limit = limits[field.limitKey || field.key] ?? field.limit ?? limits.narrative;
    const ok = value.length <= limit && (!field.required || value.trim().length > 0);
    checks.push({
      key: field.key,
      label: field.label,
      length: value.length,
      limit,
      required: !!field.required,
      ok,
      reason: value.length > limit ? `over the ${limit}-character ceiling` : value.trim().length === 0 && field.required ? 'required field is empty' : '',
    });
  }
  return { checks, ok: checks.every((c) => c.ok) };
}

/** Per-stage field list with limits resolved (used by UI and by tests). */
export function stageDraftFields(stageId) {
  return DRAFT_FIELDS[stageId].map((f) => ({
    ...f,
    limitKey: f.key === 'description' ? 'narrative' : f.key,
  }));
}

/**
 * Draft a report body for one stage in two shapes: a markdown skeleton a human
 * can complete, and the structured object the fields map onto. Values are the
 * caller's own text; nothing is invented and every empty field stays empty.
 */
export function renderDraft(stageId, values = {}, meta = {}) {
  const fields = stageDraftFields(stageId);
  const stageLabel = STAGE_META[stageId]?.name || stageId;
  const legalBasis = meta.legalBasis || '';
  const lines = [
    `# ${PRODUCT} draft — CRA ${legalBasis} ${stageLabel}`,
    '',
    `- Hazard/event type: ${meta.eventType || ''}`,
    `- Awareness moment: ${meta.awarenessLabel || ''}`,
    `- Deadline: ${meta.dueLabel || 'not scheduled yet'}`,
    `- Drafted with: ${PRODUCT} v${VERSION} — a clock and a skeleton, not legal advice. Verify against ${LEGAL.eurlex}`,
    '',
  ];
  const json = {
    product: PRODUCT,
    version: VERSION,
    stage: stageId,
    legalBasis,
    eventType: meta.eventType || '',
    awareness: meta.awarenessIso || null,
    dueAt: meta.dueIso || null,
    fields: {},
  };
  for (const field of fields) {
    const value = String(values[field.key] ?? '').trim();
    json.fields[field.key] = value;
    lines.push(`## ${field.label}${field.required ? ' (required)' : ' (if available)'} — ${value.length}/${field.limit}`);
    lines.push('');
    lines.push(value || '_to be completed_');
    lines.push('');
  }
  return { markdown: lines.join('\n'), json };
}

/* ------------------------------------------------------------------ *
 * Scoping checks (advisory — labelled, never a verdict of law)
 * ------------------------------------------------------------------ */

export const REASON_KIND = Object.freeze({
  TEXT: 'regulation-text',
  FAQ: 'commission-guidance',
  REPORTED: 'reported-by-authority',
  INTERPRETATION: 'our-interpretation',
});

/**
 * Pre-flight checks before someone spends the 24-hour window worrying about
 * the wrong question. Every answer carries its basis and its kind, and
 * "reportable" stays null when the facts are unknown.
 */
export function scopeCheck(input) {
  const reasons = [];
  const add = (kind, legalBasis, text, source = '') => reasons.push({ kind, legalBasis, source, text });

  const role = input.role || 'manufacturer';
  if (role === 'importer' || role === 'distributor') {
    add(REASON_KIND.TEXT, 'Art. 14(1),(3)', 'Article 14 reporting duties are placed on manufacturers; importers and distributors do not file under it.');
    add(REASON_KIND.TEXT, 'Art. 15(1)', 'Anyone may report voluntarily to a coordinating CSIRT or ENISA — a route worth taking when you are not the manufacturer.');
    return { reportable: false, reasons };
  }
  if (role === 'steward') {
    add(REASON_KIND.TEXT, 'Art. 24(3)', 'Open-source software stewards carry reporting obligations to the extent they are involved with products with digital elements.');
    add(REASON_KIND.REPORTED, 'Art. 24(3)', `For stewards those obligations apply from ${STEWARD_APPLIES_FROM.label}, not ${ART14_APPLIES_FROM.label}.`, 'ENISA, SRP launch notice 11 September 2026');
    return { reportable: null, reasons };
  }

  if (input.inEuMarket === 'no') {
    add(REASON_KIND.TEXT, 'Art. 2(1)', 'The Regulation covers products with digital elements made available on the Union market. If the product is not made available in the Union, Article 14 does not attach.');
    return { reportable: false, reasons };
  }
  if (input.inEuMarket === 'unsure') {
    add(REASON_KIND.INTERPRETATION, 'Art. 2(1)', 'Whether the product is "made available on the market" in the Union decides this, and that is a fact you must establish — it is not something this tool can settle.');
  }

  if (Number.isFinite(input.awarenessMs) && Number.isFinite(input.applicationMs) && input.awarenessMs < input.applicationMs) {
    add(REASON_KIND.REPORTED, 'Art. 71(2)', `You became aware before Article 14 applied (${ART14_APPLIES_FROM.label}). The duty attaches to what you learn from that date on, so this event is not reportable.`, 'Commission CRA reporting guidance; Art. 71(2) text');
    return { reportable: false, reasons };
  }

  if (input.eventType === EVENT_TYPES.incident) {
    if (input.severe === false) {
      add(REASON_KIND.TEXT, 'Art. 14(5)', 'Incident reporting needs a SEVERE incident: one that negatively affects — or is capable of negatively affecting — the ability of the product to protect availability, authenticity, integrity or confidentiality of sensitive or important data or functions, or that has led — or is capable of leading — to the introduction or execution of malicious code.');
      add(REASON_KIND.TEXT, 'Art. 15(2)', 'A non-severe incident can still be reported voluntarily, including near misses.');
      return { reportable: false, reasons };
    }
    if (input.severe === true) {
      add(REASON_KIND.TEXT, 'Art. 14(3),(5)', 'Severe incident on the Art. 14(5) test: notify the coordinating CSIRT and ENISA through the single reporting platform.');
      return { reportable: true, reasons };
    }
    add(REASON_KIND.TEXT, 'Art. 14(5)', 'Severity has not been assessed yet; apply the Art. 14(5) test before deciding whether to file.');
    return { reportable: null, reasons };
  }

  add(REASON_KIND.TEXT, 'Art. 14(1),(2)', 'Actively exploited vulnerability in your product: notify the coordinating CSIRT and ENISA through the single reporting platform. A vulnerability you found and fixed before exploitation follows your ordinary vulnerability-handling process instead.');
  add(REASON_KIND.REPORTED, 'Art. 69(2)–(3)', 'Products placed on the market before 11 December 2027 stay in scope for Article 14 reporting whether or not they are substantially modified — your installed base is reportable even where it never needs CE marking.', 'Commission CRA FAQ, section 5.3');
  return { reportable: true, reasons };
}

/** Art. 14(5) severity test as two questions. */
export function incidentSeverity(answers) {
  const a = answers.affectsProtection === true;
  const b = answers.maliciousCode === true;
  return {
    severe: a || b,
    basis: [
      { legalBasis: 'Art. 14(5)(a)', met: a, text: 'Negatively affects, or is capable of negatively affecting, the product\'s ability to protect the availability, authenticity, integrity or confidentiality of sensitive or important data or functions.' },
      { legalBasis: 'Art. 14(5)(b)', met: b, text: 'Has led, or is capable of leading, to the introduction or execution of malicious code in the product or in a user\'s network and information systems.' },
    ],
  };
}

/** Art. 16(2) restrictions are available on the 72-hour vulnerability notice only. */
export function canInvokePec(eventType, stageId) {
  return eventType === EVENT_TYPES.vulnerability && stageId === 'notification';
}

/* ------------------------------------------------------------------ *
 * Platform-vs-law reconciliation
 * ------------------------------------------------------------------ */

/**
 * Reported behaviour of the ENISA Single Reporting Platform at launch: its
 * 72-hour counter is shown 48 hours after the early warning is SUBMITTED, which
 * is not the legal measure (72 hours from awareness). Keeping your own clock is
 * the point of this tool.
 */
export function reconcileWithPlatform(schedule, earlyWarningSubmittedMs) {
  if (!Number.isFinite(earlyWarningSubmittedMs)) return null;
  const legal = schedule.stages.find((s) => s.id === 'notification');
  return {
    legalDueMs: legal ? legal.dueMs : null,
    platformShownDueMs: addHours(earlyWarningSubmittedMs, 48),
    note:
      'The platform has been reported to count 48 hours from the submitted early warning, not 72 hours from awareness. Use the earlier of the two, and keep the awareness timestamp in your own record.',
  };
}
