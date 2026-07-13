# Clearings

A go/no-go engine for stargazing in Newfoundland.

## Privacy — this repo is public

Everything committed here can be read by anyone. Before you commit, push, or
publish (dashboard copy, JSON output, logs, commit messages, screenshots):

- **Disclosing that this is for stargazing around Corner Brook, NL is fine.** So
  are the dark-sky spots, coordinates, drive times, and all astronomy/scoring.
- **Never disclose** anything more personal: the kids' exact ages or names, a
  home address more precise than "Corner Brook", emails, phone numbers, social
  handles, or any other individual/personal detail. Generalize when a public
  file needs the gist (e.g. "young kids", not exact ages).
- **Personal context for domain calibration lives in `PRIVATE.local.md`**, which
  is `.gitignore`d. Read it when you need that context; never copy its specifics
  into a committed or published file.
- **Scan the diff** for names, ages, addresses, emails, handles, or precise
  coordinates before every commit.

## The job

Ryan lives in Corner Brook with two young kids. Newfoundland weather is unpredictable
more than ~3 days out, so a stargazing trip can't be planned far ahead — it has to be *caught*.
Clearings watches six dark-sky spots and answers one question:

> **Is there a night in the next few days worth driving to, and where?**

The bar is high on purpose. A marginal night means two small kids in a car for 40+ minutes and
nothing to show for it. **False positives are the failure mode we care about**, not false negatives.
When in doubt, don't call it a GO.

## Shape of the project

There is **one core** and there are **consumers of it**. The core is the whole value; consumers are
cheap and interchangeable.

- **Core** — locations, forecast fetch, astronomy, scoring. Pure and portable.
- **Consumers** — the dashboard (`index.html`, on GitHub Pages) and a CLI (`scripts/clearings.mjs`)
  that prints the same verdicts as JSON.

Delivery beyond that is **deliberately unbuilt** (see below). Don't add it unprompted.

```
index.html              dashboard; imports ./src/*.js as ES modules
src/
  suncalc.js            SunCalc (Vladimir Agafonkin, BSD-2-Clause). Keep the attribution.
  locations.js          the six spots + coords + drive time      [core]
  forecast.js           Open-Meteo fetch + epoch normalization   [core]
  astro.js              darkness window + moon state per night   [core]
  scoring.js            thresholds → verdict                     [core]
scripts/
  clearings.mjs         CLI: fetch, score, print (human or --json)
```

### Rules the core must obey

These exist so that *any* future consumer is cheap. Don't break them for convenience.

1. **No dependencies. Anywhere.** Node 20+ has global `fetch`; the astronomy is inlined. No
   `npm install`, nothing to rot, no supply chain. This is a deliberate durability choice.
2. **`scoring.js` and `astro.js` are pure.** No network, no filesystem, no `process`, no `window`.
   Data in, verdict out. They must run unmodified in a browser, in Node, in a Cloudflare Worker,
   or be readable enough to port to Swift.
3. **`forecast.js` is the only thing that touches the network.** One seam, easy to stub or cache.
4. **Scoring lives in exactly one place.** If the dashboard says GO and the CLI says nothing, the
   tool is dead to us. Never copy-paste the logic into a consumer.

**Decision, recorded so it doesn't get undone:** ES modules mean `index.html` no longer opens by
double-clicking over `file://`. For local dev, serve it: `python3 -m http.server 8000`. That trade
was made deliberately in favour of a single source of truth. Don't "fix" it by re-inlining.

## Commands

```bash
python3 -m http.server 8000               # dashboard at localhost:8000
node scripts/clearings.mjs                # human-readable table
node scripts/clearings.mjs --json         # structured output (the interface)
node scripts/clearings.mjs --horizon=3    # only nights +1..+3 (default 7)
node scripts/clearings.mjs --date=2026-08-12   # simulate a given day
```

## The JSON contract

`--json` is the interface every future consumer binds to — a Shortcut, an app, a cron job, whatever.
**Treat it as a public API**: keep it stable, and make it serve a dumb consumer well.

Critically, a Shortcut doesn't want to walk a 6×7 matrix. It wants to ask "is there anything?" and
get an answer. So the payload leads with the answer and keeps the detail underneath:

```json
{
  "generated": "2026-08-10T09:30:00Z",
  "headline": "GO — Blow Me Down, Wednesday night. Clear, moon down.",
  "best": [ { "night": "2026-08-12", "location": "blow-me-down", "verdict": "PRIME", ... } ],
  "nights": [ { "date": "...", "reliable": true, "locations": [ ... ] } ]
}
```

- `headline` is a single speakable/notifiable sentence. If nothing qualifies, it says so plainly.
- `best` is pre-flattened and pre-sorted — PRIME before GO, sooner before later, closer before farther.
- `nights` is the full matrix for anything that wants it (the dashboard).

## Delivery — deliberately undecided

Do **not** build any of this without being asked. It's recorded so the core stays compatible with it:

- **Shortcuts + SSH** — Ryan already runs Tailscale + SSH to his Mac. A Shortcut can "Run Script
  over SSH" → `node scripts/clearings.mjs --json --horizon=3` → parse → notify. Zero infrastructure,
  no secrets, no cloud. This is the closest fit to his existing setup.
- **A queryable URL** — a Cloudflare Worker or similar wrapping the same core, giving a real endpoint
  for a Shortcut or an app to hit. Possible precisely because the core is pure and dependency-free.
- **A scheduled push** — cron, launchd, or a GitHub Action. Note this is the only option that needs
  extra state: a ledger keyed `location:date` so one GO doesn't re-notify every morning, and a
  stand-down message if an alerted night degrades. Pull-based delivery needs none of that.
- **A native app** — `scoring.js` is small and readable enough to port; or it calls a hosted endpoint.

Whichever gets chosen, the core shouldn't need to change. That's the point.

---

## Domain knowledge — read this before touching the astronomy

These are the things that have already bitten us. They are not obvious and they are not guessable.

### 1. Newfoundland is UTC−2:30 in summer. The half hour is real.

NDT = UTC−02:30 (summer), NST = UTC−03:30 (winter). It is one of the very few half-hour offsets in
the world, and it breaks naive assumptions constantly. Anything that schedules, converts, or
displays a time must handle it explicitly — e.g. 7:00 AM NDT is 09:30 UTC, not 10:00 or 11:00. Most
schedulers (cron, Workers) are fixed UTC and don't follow DST, so a fixed UTC time also drifts by an
hour in winter.

### 2. Above ~48.56°N there is NO astronomical darkness near the solstice.

The sun never gets 18° below the horizon. The threshold is latitude 90° − 18° − 23.44° ≈ **48.56°N**,
and our locations *straddle it*:

| Location | Lat | Astronomical dark on Jun 21? |
|---|---|---|
| Corner Brook | 48.95°N | **No.** Deep twilight all night. |
| Gros Morne | 49.6°N | **No.** |
| Terra Nova | 48.55°N | Barely — a sliver around 1:03 AM. |

So on the same night, the same code must report "no true darkness" for one spot and "dark at 1 AM"
for another. This is correct behaviour, not a bug. **Full darkness returns island-wide by mid-August.**

### 3. SunCalc returns `Invalid Date`, not `null`, and `if (date)` is TRUE for it.

Direct consequence of #2. When the sun never reaches −18°, `getTimes()` does `acos()` on an
out-of-range value → `NaN` → an `Invalid Date` **object**. It is truthy. Every check must be:

```js
function validDate(d) { return d && !isNaN(d.getTime()); }
```

Same class of trap in `getMoonTimes()`, which can return `{alwaysUp: true}`, `{alwaysDown: true}`,
or a rise with no set (or vice versa) on a given day. Handle all four shapes.

### 4. Open-Meteo timestamps are local-without-offset. Parsing them naively is wrong.

With `timezone=auto` the API returns `"2026-08-12T22:00"` — no `Z`, no offset — plus a separate
`utc_offset_seconds` field. `Date.parse()` on that is ambiguous and will silently be off by hours.
The only correct conversion:

```js
const epoch = Date.parse(iso + "Z") - utc_offset_seconds * 1000;
```

Do all internal math in true epoch ms. Convert to local only for display.

### 5. Fog is the Newfoundland-specific killer, and cloud cover won't catch it.

The forecast can say 0% cloud while a coastal spot sits in 200 m of fog. This is *the* local failure
mode and it's why we gate on three fields, not one:

- `cloud_cover` — the obvious one
- `visibility` — the fog gate. Non-negotiable.
- `cloud_cover_low` — low cloud / fog proxy; high values are a strong warning even if total cloud is modest

A night is only GO if it clears **all three**. Never simplify this to a cloud-only check.

### 6. Terra Nova is not a spontaneous trip.

It's a designated dark-sky preserve and the best sky on the island — but it's **~4.5 hours** from
Corner Brook. It's an overnight, planned days ahead. The nearby spots (Blow Me Down ~40 min,
Gros Morne ~1 hr, Barachois Pond ~45 min) are what short-notice viewing is actually *for*.

Output should distinguish the two. A GO at Blow Me Down means "go tonight." A GO at Terra Nova means
"you'd have needed to book this already."

### 7. Aug 12–13, 2026 is the night of the summer. Flag it.

The Perseid peak lands on a **new moon** — the darkest Perseids since 2021, next comparable year 2029.
Roughly 90–100 meteors/hour under clear dark skies, and by mid-August Newfoundland has genuine
astronomical darkness again.

### 8. The kids are young, and full darkness is late.

In July, astronomical dark doesn't arrive until ~midnight. That's a real constraint on what's
"worth it." The viewing window we score runs from nautical dusk for ~3 hours. A bright moon isn't
automatically a NO — it's a bad night for the Milky Way but a *great* night for the Moon and planets
with small kids, so we score it GO and say so rather than hiding it.

---

## Design

Palette (gold/forest/navy over warm black — this is the house style, match it):

```
gold      #AA9972 → #CCC07E → #DCCC78 → #EDE68A → #E2C546
forest    #245840 / #6FA15A
navy      #445878 / #3F627C / #26383D / #31353D
bronze    #C57453 → #7F2A39   (warnings only)
warm white #F2EDED   warm black #231F20   neutral black #121112
```

Verdict colours are load-bearing, not decorative: forest = go, gold = maybe, bronze = no.

Type is currently a system serif stack (Iowan/Palatino) to preserve the zero-dependency rule.
Fraunces + Hanken Grotesk is the house pairing and would be an improvement — but it means a webfont
fetch. Fine on Pages, so it's a reasonable change to propose; just make it a deliberate one.

## Conventions

- Plain, literal interface language. No ceremonial metaphor, no "celestial journey" copy.
- Verdicts are the vocabulary: **PRIME / GO / MAYBE / NO**. Same words in the dashboard, the JSON,
  and the code. Don't invent synonyms.
- Locations, thresholds, and window length are configuration, not code. Adding a spot should be one
  line in `locations.js`.
- Empty states and errors say what happened and what to do — the tool has been wrong before
  (an offline sandbox reported as a weather outage), and a vague error cost real debugging time.
