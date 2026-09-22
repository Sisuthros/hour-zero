# Hour Zero

**Keep your own CRA Article 14 clock.**

EU manufacturers of products with digital elements have had live incident- and vulnerability-reporting
duties since **11 September 2026** (Regulation (EU) 2024/2847, Article 14; Art. 71(2)). The windows are
24 hours, 72 hours and a final report — and the clock starts when you *become aware*, which is exactly the
timestamp the ENISA Single Reporting Platform has been reported not to record for vulnerabilities.

Hour Zero is a static, offline, zero-dependency web tool that:

- turns your awareness moment (wall time + time zone) into one exact instant;
- computes the three Art. 14 stages with the two mechanics most summaries get wrong:
  - **Art. 14(2)(c)** — the vulnerability final report runs **14 days after a corrective or mitigating
    measure is available**, not from awareness;
  - **Art. 14(4)(c)** — the incident final report runs **one month after you submit** the 72-hour incident
    notification, not from awareness;
- flags when a clock has **not started** instead of inventing a deadline;
- exports the deadlines as an `.ics` calendar (UTC stamps, alarms);
- drafts each filing stage with the published character ceilings (4000 / 2000 / 800 / 255 / 100);
- labels every scoping answer by evidence kind — `regulation-text`, `commission-guidance`,
  `reported-by-authority`, `our-interpretation`;
- ships its own **36-check test suite** that runs in-browser from the page, and in Node from the CLI.

No server, no accounts, no analytics, no cookies, no network requests after page load. Vulnerability data
is the last thing you want to paste into someone's backend.

## Run it

```bash
node tests/run.mjs          # 36 checks, exit 0 = all green
python -m http.server 8787  # then open http://127.0.0.1:8787/
node scripts/gate.mjs       # full gate: static checks + tests + live URL 200
```

Live: <https://sisuthros.github.io/hour-zero/>

## What is in here

| Path | Role |
|---|---|
| `core.js` | The whole legal clock as pure functions: schedule, time zones, status, ICS, drafts, scoping. No DOM, no network. |
| `app.js` | Browser wiring only. |
| `index.html`, `styles.css`, `favicon.svg` | The product page and the brand. |
| `tests/suite.mjs` | 36 checks, shared by the browser self-test and the CLI. |
| `tests/run.mjs` | Node runner. |
| `scripts/gate.mjs` | The gate command: static hygiene + suite + live URL. |
| `EVIDENCE.md` | Claim → basis → how to verify, with verbatim regulation quotes. |
| `BRAND.md` | Name, positioning, palette, wordmark rules. |

## Paid help, if you want it

The tool is free under MIT and always will be. What costs money is a person doing the
setup with you: configuring the evidence log for your product line, running a timed
dry-run of a fictional case with your team, and reviewing your real notification drafts
before you submit them. Details and prices are on the
[project page](https://sisuthros.github.io/cra24/).

Business customers only.

## Limits, stated plainly

Hour Zero is a clock and a drafting surface, **not legal advice**. It does not know who your coordinating
CSIRT is (Art. 14(7) turns on where the cybersecurity decisions for your product are predominantly taken),
whether your product falls under Art. 2, or what your advisers will conclude about the day awareness
began. It encodes the regulation where the text is unambiguous and says so where it is not.

## Licence

MIT — see `LICENSE`.
