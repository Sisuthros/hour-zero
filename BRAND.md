# Hour Zero — brand sheet

## Name

**Hour Zero** — written as two words, capital H and Z, never `HourZero` or `HOURZERO`.

The name is the product's core concept: hour zero is the moment you become aware, and the two urgent
deadlines — 24 hours and 72 hours — are measured from there. It is also the differentiator, because the
platform's own counters start somewhere else and the two final-report clocks start somewhere else again.

## Positioning (one sentence)

*Hour Zero keeps the EU Cyber Resilience Act Article 14 reporting clocks yourself — 24 hours and 72 hours
from the moment you became aware, and each final report from the moment its own clock starts (a corrective
or mitigating measure available + 14 days; an incident notification submitted + one month) — offline in
your browser.*

Longer form for a landing page: the clock is a legal fact, and every tool between you and the filing is
somebody else's clock. Keep your own.

## Voice

- Regulatory precision over reassurance. Quote the article, then act.
- Never invent a number: if a clock has not started, say so; if something is third-party reported, label it.
- Plain sentences, no compliance theatre. The reader may be inside a 24-hour window while reading.

## Colour

| Token | Hex | Use |
|---|---|---|
| Signal amber | `#FFB020` | the mark's arc, active clock, due-soon state, the one accent that must survive greyscale |
| Ink | `#0E1116` | text, borders, the button fill |
| Paper | `#F7F4EE` | page background |
| Paper 2 | `#FFFDF8` | cards |
| Line | `#DED8CC` | hairlines |
| Amber wash | `#FFF4DD` | legal-basis chips, warnings |
| Stop red | `#B3261E` | overdue |
| Filed green | `#1E7A46` | within-limits confirmations |

Amber is a warning colour used for *time*, not for failure: overdue is red, and nothing else is red.

## Wordmark

The mark is a ring broken by an amber arc that starts at twelve o'clock and sweeps clockwise — a clock
with an unfinished hour. It appears as:

- `favicon.svg` — ink rounded square, paper ring, amber arc, on the browser tab;
- inline SVG in `index.html` header — same geometry, no box, next to the wordmark text.

Wordmark text: uppercase `HOUR ZERO`, letter-spacing 0.22em, weight 750, with the sub-line
`CRA ARTICLE 14 CLOCK` beneath in the same letterspacing at 10.5 px. Minimum clear space is the cap height
of the `H`. On dark backgrounds the ring switches to paper and the arc stays amber.

## Consistency rules

1. Everywhere the product appears — page title, `<h1>` area, header, footer, draft exports, the `.ics`
   calendar name and the README — the name is `Hour Zero`, in the same two-word form.
2. The `.ics` calendar is named `Hour Zero — CRA Art. 14 deadlines` and its `PRODID` is
   `-//Hour Zero//CRA Article 14 clock//EN`.
3. Generated drafts carry the product name and version on line 4 so a filing can cite what produced it.
4. No stock security imagery. The mark, the amber, and the honest labels are the identity.
