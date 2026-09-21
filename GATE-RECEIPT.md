# Hour Zero — gate receipt

Card: **t_10b292be** (PERHEEN TUOTEKILPAILU) · Worker: Photon · Date: 2026-09-21
Commit: `b6927e8c3aeaad9c458d5e4f1e706c1245210321` (branch `master`)
Repo: <https://github.com/Sisuthros/hour-zero> (public) · Live: <https://sisuthros.github.io/hour-zero/>

## What it is

**Hour Zero** — *keep your own EU Cyber Resilience Act Article 14 reporting clock.*

A static, offline browser tool that turns the moment a manufacturer becomes aware of an actively
exploited vulnerability or a severe incident into the three Article 14 deadlines, in the user's own time
zone, and drafts the filing skeleton with the published character ceilings. It exists because the legal
clock starts at awareness — a timestamp the ENISA platform has been reported not to record, and which its
counter has been reported to displace for the 72-hour stage.

## Gate — command, exit code, output

```
$ cd E:/Lumen/family/hour-zero && node scripts/gate.mjs
...
GATE OK
GATE_EXIT=0
```

Raw output: `gate-live-output.txt` (this directory) and, in the repo, `scripts/gate.mjs`.

The gate fails closed on: a missing file, an external resource reference in the page, `fetch`/XHR/beacon in
the shipped runtime, a remote font import, the brand name missing from any surface, a failing check in the
36-case suite, a non-200 live URL, a missing live marker, or **any served file that is not byte-identical
to the local artifact**.

## Live evidence (measured 2026-09-21)

| Check | Result |
|---|---|
| `GET https://sisuthros.github.io/hour-zero/` | **HTTP 200** |
| Page markers | `<title>Hour Zero`, "Article 14" present |
| `GET /core.js`, `/tests/suite.mjs`, `/favicon.svg` | HTTP 200 |
| GitHub Pages | `status=built`, `build_type=legacy`, branch `master` |
| Browser run on the public URL | awareness `2026-09-20 08:15` Europe/Berlin → early warning **Mon 2026-09-21 08:15** (overdue), notification **Wed 2026-09-23 08:15** (upcoming), final report **Wed 2026-10-07 17:00** from a fix available `2026-09-23 17:00` — i.e. fix + 14 d, not awareness + 14 d |
| In-browser self-test on the live URL | **36/36 passed** |

## Artifact digests

| sha256 | File |
|---|---|
| `1de86f8ec35047ba15b001d89dccdbf8ec5dff8227cde403c9b3596251a4de4b` | `index.html` |
| `94f0d10506175485b01b4b97de90ab4078c20f1539224cdf81e614377f015c73` | `app.js` |
| `75452c2350acaa702f20a46556f592a0bc88f5a8132d54814540eb08690d09dd` | `core.js` |
| `2632cbfc1fdfb91c06dc76c11c8f7d1b40975026916cfbc2e0fd2c89cd6a194d` | `styles.css` |
| `387220e9b5c0725e929a9873ccd194003a8bf1f448486fbbccb29301222799cf` | `tests/suite.mjs` |
| `e3c7af9935dea9b912bceff6ed06e107844afad70b3286eda8e5ee5f16a49c62` | `favicon.svg` |
| `43e851dbfa078c8d5555d5ff057faacaa6b49a5c68aca6226dbac7abc5247a16` | **BUNDLE** — sha256 over the six files concatenated in the order above |
| `894be448eee83b47209c0fafda1c3b25436c9f43b8348e59c7a22b8dbeba0161` | `README.md` |
| `4c2fb72efd7db662593d064229b4faf5235449a43035a57e6b2dc8ad527ba264` | `BRAND.md` |
| `5bd2cf87228e53141482319f816dc632e149009aaec90d32ab70c9bf4c4f5681` | `EVIDENCE.md` |
| `b909e31b3bd2691de4ddf04858feee8112c7d165e9e0205ae64a22919fc6a8f3` | `LICENSE` |
| `4ed6fe18b4699764a385a79dbc85d1206fc77d41fa29719477d48cefac29a243` | `package.json` |

Every digest above is reproduced by `node scripts/gate.mjs` on the committed tree; the six served files are
additionally hashed from the live HTTP response and compared.

## Brand (competition rule 3)

- **Name:** Hour Zero (BRAND.md fixes the capitalisation and usage).
- **Positioning:** *Hour Zero keeps the EU Cyber Resilience Act Article 14 reporting clock yourself — 24
  hours, 72 hours and a final report computed from the moment you became aware, offline in your browser.*
- **Identity:** signal amber `#FFB020` + ink `#0E1116` on paper `#F7F4EE`; the mark is a ring broken by an
  amber arc starting at twelve. Used in the header wordmark, the favicon, the legal-basis chips, the ICS
  calendar name (`Hour Zero — CRA Art. 14 deadlines`, `PRODID:-//Hour Zero//CRA Article 14 clock//EN`) and
  on every generated draft, which carries the name and version on line 4.

## Law (competition rule: LAKI)

The entry contains **no outbound contact of any kind** — no email, DM, form, newsletter or cold approach,
and no server to receive anything. Target market is therefore documented but not contacted: EU
manufacturers of products with digital elements who are inside an Article 14 reporting window. The Cyprus
cold-email/DM prohibition (112(I)/2004 art. 106(1)) has no surface to bite on because no cold contact
channel exists in the product.

## Open item outside my reach (one line, non-blocking)

To actually take money for it I need one thing from Ville: a Stripe Payment Link or restricted key for the
family account **acct_1RlB1sEC8luXU0Of** — the product is free and functional without it.

## Known limitations handed to the reviewer

1. `windowMs` for the incident final report is a nominal 31 days used only for the "due soon" threshold; the
   deadline itself is true calendar-month arithmetic (`addMonths`, clamped).
2. The pre-application cut-off (awareness before 11 September 2026 not reportable) is applied at the start
   of that date in the planner's own zone and is labelled `reported-by-authority`, not `regulation-text`.
3. The coordinating CSIRT is deliberately not guessed — Art. 14(7) turns on where cybersecurity decisions
   are predominantly taken.
4. Platform behaviour (counter, missing awareness field, field ceilings) is third-party reported and
   labelled as such in the interface; the clock itself derives only from the OJ text.
