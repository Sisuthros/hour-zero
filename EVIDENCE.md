# Hour Zero — evidence ledger

Every rule the tool implements, with its basis and how to check it. Research date: **2026-09-21**.
Evidence kinds follow the family board's discipline:

- **STATIC-PROVEN** — read directly from the Official Journal text of Regulation (EU) 2024/2847 (CELEX
  32024R2847) and quoted verbatim below.
- **REPORTED** — stated by an authority or a named third party, not verified against a primary legal text
  by this product. Shown to the user as reported.
- **INTERPRETATION** — this tool's own reading, labelled as such in the interface.

Primary source used: full OJ text of Regulation (EU) 2024/2847,
<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R2847>
(local cache copy of the fetched page: `E:\Lumen\.hermes\profiles\photon\cache\web\eur-lex.europa.eu-47ba714625.md`).

## 1. The three deadline mechanics — STATIC-PROVEN

| Stage | Verbatim OJ text | Implemented as |
|---|---|---|
| Art. 14(2)(a) | “an early warning notification of an actively exploited vulnerability, without undue delay and in any event within 24 hours of the manufacturer becoming aware of it” | `awareness + 24 h` |
| Art. 14(2)(b) | “…a vulnerability notification, without undue delay and in any event within 72 hours of the manufacturer becoming aware of the actively exploited vulnerability” | `awareness + 72 h` |
| Art. 14(2)(c) | “…a final report, no later than 14 days after a corrective or mitigating measure is available” | `fix available + 14 d` (**not** awareness + 14 d) |
| Art. 14(4)(a) | “…an early warning notification of a severe incident …, without undue delay and in any event within 24 hours of the manufacturer becoming aware of it, including at least whether the incident is suspected of being caused by unlawful or malicious acts” | `awareness + 24 h` |
| Art. 14(4)(b) | “…an incident notification, without undue delay and in any event within 72 hours of the manufacturer becoming aware of the incident” | `awareness + 72 h` |
| Art. 14(4)(c) | “…a final report, within one month after the submission of the incident notification under point (b)” | `72 h submission + 1 month` |

Tests that pin these: suite cases 1–7 (`tests/run.mjs`). Cases 3 and 6 additionally assert that the
final-report deadlines are *not* the naive awareness-based values.

## 2. Scope, application and installed base

| Claim | Kind | Basis |
|---|---|---|
| Article 14 applies from 11 September 2026; the rest of the Regulation from 11 December 2027 | STATIC-PROVEN | Art. 71(2), verbatim: “This Regulation shall apply from 11 December 2027. However, Article 14 shall apply from 11 September 2026 and Chapter IV (Articles 35 to 51) shall apply from 11 June 2026.” |
| Awareness before 11 September 2026 is not reportable | REPORTED | Commission CRA implementation guidance; the duty attaches at awareness, so it does not reach back past application. Labelled `reported-by-authority` in the UI. |
| Products placed on the market before 11 December 2027 remain in scope for Article 14 reporting whether or not substantially modified | REPORTED | Art. 69(2)–(3) read with the Commission's CRA FAQ §5.3. Labelled `reported-by-authority`. |
| Article 14 duties sit on manufacturers; importers and distributors do not file under it; voluntary reporting exists for others | STATIC-PROVEN (Art. 14(1),(3); Art. 15(1)) | Verbatim text quoted in `core.js` scope reasons. |
| Open-source software stewards carry the same duties from 11 December 2027 | REPORTED | Art. 24(3) plus ENISA's SRP launch notice of 11 September 2026. |
| Severity is the gate for incident reporting, on the two Art. 14(5) limbs | STATIC-PROVEN | Art. 14(5)(a)–(b), reproduced in the UI questions. |

## 3. Platform facts (all REPORTED, none of them load-bearing for the clock)

- The Single Reporting Platform opened on 11 September 2026 at `portal.cra-srp.enisa.europa.eu`
  (ENISA press release).
- ENISA has been reported not to record the awareness moment for an actively exploited vulnerability at
  launch, and to count the 72-hour due date as 48 hours after the early warning is *submitted* rather than
  72 hours from awareness. Hour Zero therefore keeps the clock itself and displays both numbers
  (`reconcileWithPlatform`).
- Published character ceilings used by the draft panel: 4000 narrative, 2000 measures, 800 PEC
  justification, 255 title/product/component/attack vector/root cause, 100 malicious actor
  (ENISA SRP glossary / interface guidance).
- Art. 16(2) restrictions apply to the 72-hour notification of an actively exploited vulnerability only —
  there is no equivalent control on a severe incident notification, and invoking one never pauses the
  filing clock.

These are reported facts about a platform that is changing; the regulation text is the part that does not
move, which is why the tool's clock is derived only from the text.

## 4. What Hour Zero deliberately does not claim

1. It does not say you are compliant, filed, or safe. There is no “closed” state in the module — suite
   case 33 asserts that no closure or verification state exists.
2. It does not invent impact. The drafts carry no time-saved, adoption or revenue figure (suite case 25).
3. It does not guess an unstarted clock. A vulnerability with no fix yet reports `awaiting_input`, not an
   estimated deadline (suite cases 4, 14, 27).
4. It does not decide your coordinating CSIRT. Art. 14(7) turns on where decisions about the cybersecurity
   of your products are predominantly taken; the page says so and sends you to the CSIRT helpdesk.
5. It does not send, store or transmit anything. Suite case 25 checks the generated draft carries only the
   user's own text; the static hygiene check in `scripts/gate.mjs` asserts there is no `fetch`,
   `XMLHttpRequest` or external resource reference in the shipped files.

## 5. How to re-verify in five minutes

```bash
node tests/run.mjs                       # 35 checks
node scripts/gate.mjs                    # + static hygiene + live URL 200
curl -sI https://sisuthros.github.io/hour-zero/ | head -1
```

For the legal text itself, search the cached OJ page for `Article 14` and compare against the quotes above;
the deadline wording lives in Art. 14(2)(a)–(c) and Art. 14(4)(a)–(c) of that page.
