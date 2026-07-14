#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 * clearings.mjs — CLI consumer of the core. Fetches, scores, prints.
 *
 * It reimplements NOTHING: locations, forecast fetch, astronomy, and
 * scoring all come from ../src/*.js — the SAME modules the dashboard
 * imports. This file only fetches, shapes the JSON contract, and draws
 * a terminal table.
 *
 *   node scripts/clearings.mjs                  human-readable table
 *   node scripts/clearings.mjs --json           the JSON contract
 *   node scripts/clearings.mjs --horizon=3      only the next 3 nights
 *   node scripts/clearings.mjs --date=2026-08-12  simulate a given day
 *
 * Node 20+ built-ins only. No npm, no dependencies.
 * ------------------------------------------------------------------ */
import { LOCATIONS, CB, haversine } from "../src/locations.js";
import { fetchLoc } from "../src/forecast.js";
import { buildGrid, verdictLabel } from "../src/scoring.js";
import { fmtTime } from "../src/astro.js";

const FULL_WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------- args ---------- */
function parseArgs(argv) {
  const o = { json: false, horizon: 7, date: null };
  for (const a of argv) {
    if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a.startsWith("--horizon=")) {
      const n = parseInt(a.slice(10), 10);
      if (!Number.isFinite(n) || n < 1) fail(`--horizon needs a number ≥ 1 (got "${a.slice(10)}")`);
      o.horizon = Math.min(n, 8); // Open-Meteo gives 8 forecast days
    } else if (a.startsWith("--date=")) {
      o.date = a.slice(7);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) fail(`--date needs YYYY-MM-DD (got "${o.date}")`);
    } else {
      fail(`unknown option "${a}". Try --help.`);
    }
  }
  return o;
}

function fail(msg) {
  process.stderr.write(`clearings: ${msg}\n`);
  process.exit(2);
}

const HELP = `clearings — which night is worth camping for, and when to wake the kids?

usage: node scripts/clearings.mjs [options]

  --json            emit the JSON contract (headline, best, nights)
  --horizon=N       score the next N nights (tonight = 1). default 7, max 8
  --date=YYYY-MM-DD treat this date as "today" (simulate a given day)
  -h, --help        this message

Default output is a readable table. --json is the stable interface a
Shortcut or app binds to: it leads with a one-line headline and a
pre-sorted "best" list so a dumb consumer can ask "is there anything?".
`;

/* The instant treated as "now". For --date, use noon UTC on that day:
 * for every Newfoundland offset (NDT -02:30 … NST -03:30) that still
 * lands on the intended calendar date locally. Live runs use Date.now(). */
function nowEpoch(dateStr) {
  if (!dateStr) return Date.now();
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

/* ---------- payload shaping (uses only core verdicts) ---------- */
function distanceKm(loc) { return Math.round(haversine(CB.lat, CB.lng, loc.lat, loc.lng)); }

/* The day you'd camp (the evening date), spoken. */
function campWhen(c) {
  if (c.dayLabel === "Tonight") return "tonight";
  if (c.dayLabel === "Tomorrow") return "tomorrow";
  const [y, m, d] = c.date.split("-").map(Number);
  return FULL_WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function moonPhrase(c) {
  const pct = Math.round(c.moonFrac * 100);
  if (!c.moonUp) return `moon down (${pct}% lit)`;
  if (c.brightMoon) return `bright moon up (${pct}%)`;
  return `thin moon up (${pct}%)`;
}

function whyFor(c) {
  const moon = c.moonUp ? (c.brightMoon ? "bright moon up" : "thin moon up") : "moon down";
  return `${c.sky.label}, ${moon}.`;
}

function bestEntry(c, loc) {
  return {
    night: c.date,
    location: loc.slug,
    locationName: c.locName,
    verdict: verdictLabel(c.tier),
    when: campWhen(c),
    alarm: fmtTime(c.alarm, c.off),
    viewing: { start: fmtTime(c.ws, c.off), end: fmtTime(c.we, c.off) },
    reliable: c.reliable,
    distanceKm: distanceKm(loc),
    drive: loc.note,
    cloud: c.maxCloud,
    visibilityKm: c.minVis == null ? null : Math.round(c.minVis / 1000),
    darkness: c.darkLevel,
    sky: { tier: c.sky.tier, label: c.sky.label, mag: c.sky.mag },
    moon: moonPhrase(c),
    isPerseid: c.isPerseid,
    why: whyFor(c),
    _rank: c.tier === "prime" ? 0 : 1,
    _idx: c.nightIdx
  };
}

function nightLocation(c, loc, off) {
  return {
    location: loc.slug,
    locationName: c.locName,
    verdict: verdictLabel(c.tier),
    tier: c.tier,
    reliable: c.reliable,
    distanceKm: distanceKm(loc),
    drive: loc.note,
    cloud: c.noData ? null : c.maxCloud,
    cloudLow: c.noData ? null : c.maxLow,
    visibilityKm: c.minVis == null ? null : Math.round(c.minVis / 1000),
    precipPct: c.noData ? null : c.maxPrecip,
    settled: c.settled,
    demoted: c.demoted,
    campMaxCloud: c.noData ? null : c.campMaxCloud,
    campMaxPrecip: c.noData ? null : c.campMaxPrecip,
    darkness: c.darkLevel,
    sky: { tier: c.sky.tier, label: c.sky.label, mag: c.sky.mag },
    moon: {
      up: c.moonUp, bright: c.brightMoon, illumPct: Math.round(c.moonFrac * 100),
      rise: c.moonrise == null ? null : fmtTime(c.moonrise, off),
      set: c.moonset == null ? null : fmtTime(c.moonset, off)
    },
    alarm: fmtTime(c.alarm, off),
    darkestAt: fmtTime(c.peak, off),
    viewing: { start: fmtTime(c.ws, off), end: fmtTime(c.we, off) },
    tempC: c.avgTemp, windKmh: c.avgWind,
    noData: c.noData
  };
}

function headlineFor(best, horizon) {
  if (!best.length) {
    return `Nothing worth camping for in the next ${horizon} night${horizon > 1 ? "s" : ""}. ` +
      `Newfoundland forecasts firm up 2–3 days out — check again tomorrow.`;
  }
  const b = best[0];
  let h = `${b.verdict} — camp ${b.locationName}, ${b.when}. Alarm ${b.alarm}, ${b.sky.label}.`;
  if (b.isPerseid) h += " ★ Perseid peak.";
  return h;
}

function buildPayload(grid, data, opts, generatedISO) {
  const off = data[0].off;
  const horizon = grid[0].length;

  const best = [];
  grid.forEach((row, i) => {
    row.forEach(c => { if (c.verdict === "go") best.push(bestEntry(c, data[i].loc)); });
  });
  // PRIME before GO, sooner before later, closer before farther
  best.sort((a, b) => (a._rank - b._rank) || (a._idx - b._idx) || (a.distanceKm - b.distanceKm));
  best.forEach(e => { delete e._rank; delete e._idx; });

  const nights = [];
  for (let n = 0; n < horizon; n++) {
    const first = grid[0][n];
    nights.push({
      date: first.date,
      label: first.dayLabel,
      reliable: first.reliable,
      isPerseid: first.isPerseid,
      locations: grid.map((row, i) => nightLocation(row[n], data[i].loc, off))
    });
  }

  return {
    generated: generatedISO,
    utcOffsetSeconds: off,
    headline: headlineFor(best, horizon),
    best,
    nights
  };
}

/* ---------- human table ---------- */
const TTY = process.stdout.isTTY;
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  green: "\x1b[32m", brightGreen: "\x1b[92m", yellow: "\x1b[33m", red: "\x1b[31m", gold: "\x1b[38;5;179m"
};
function paint(s, code) { return TTY ? code + s + C.reset : s; }
function verdictColor(tier) {
  return tier === "prime" ? C.brightGreen
       : tier === "go" ? C.green
       : tier === "maybe" ? C.yellow
       : tier === "nodata" ? C.dim : C.red;
}
function padEnd(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }
function padStart(s, n) { s = String(s); return s.length >= n ? s : " ".repeat(n - s.length) + s; }
function trunc(s, n) { s = String(s); return s.length <= n ? s : s.slice(0, n - 1) + "…"; }

function printHuman(payload, grid, data, unavailable) {
  const off = payload.utcOffsetSeconds;
  const out = [];

  const stamp = fmtTime(Date.parse(payload.generated), off);
  out.push(paint(`Clearings`, C.bold) + paint(`  ·  forecast as of ${stamp} NDT`, C.dim));
  out.push("");
  out.push("  " + paint(payload.headline, C.bold));
  out.push("");

  // best nights to camp
  out.push(paint("Best nights to camp", C.gold));
  if (!payload.best.length) {
    out.push(paint("  none — nothing clear with a genuinely dark sky in range.", C.dim));
  } else {
    for (const b of payload.best) {
      const v = paint(padEnd(b.verdict, 6), verdictColor(b.verdict === "PRIME" ? "prime" : "go"));
      const when = padEnd(b.night, 11);
      const where = padEnd(trunc(b.locationName, 22), 23);
      const info = `⏰ ${b.alarm} · ${b.sky.label} (mag ${b.sky.mag}) · ${b.cloud}% cloud · ${b.moon}`;
      const per = b.isPerseid ? paint("  ★ Perseid", C.gold) : "";
      out.push(`  ${v} ${when} ${where} ${paint(info, C.dim)}${per}`);
    }
  }
  out.push("");

  // matrix: locations × nights
  const horizon = grid[0].length;
  out.push(paint(`The next ${horizon} night${horizon > 1 ? "s" : ""}`, C.gold));
  const NAMEW = 24, COLW = 9;
  let header = padEnd("", NAMEW);
  for (let n = 0; n < horizon; n++) header += padStart(trunc(grid[0][n].dayLabel, COLW - 1), COLW);
  out.push("  " + paint(header, C.dim));
  grid.forEach((row, i) => {
    const loc = data[i].loc;
    let line = padEnd(trunc(`${loc.name} ${distanceKm(loc)}km`, NAMEW - 1), NAMEW);
    let cells = "";
    for (let n = 0; n < horizon; n++) {
      const c = row[n];
      const word = c.noData ? "·" : verdictLabel(c.tier);
      const badge = (!c.noData && c.moonUp) ? "☾" : "";
      // pad the visible text first, then colorize, so alignment holds in a TTY
      cells += paint(padStart(word + badge, COLW), verdictColor(c.tier));
    }
    out.push("  " + line + cells);
  });

  if (unavailable.length) {
    out.push("");
    out.push(paint(`  note: no forecast for ${unavailable.join(", ")} (fetch failed) — scored the rest.`, C.yellow));
  }

  process.stdout.write(out.join("\n") + "\n");
}

/* ---------- offline / failure ---------- */
function reportTotalFailure(failed, opts, generatedISO) {
  const firstErr = failed.length ? failed[0].err : "unknown";
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      generated: generatedISO,
      error: firstErr,
      headline: `No forecast — couldn't reach Open-Meteo (${firstErr}). This is usually a lost connection, not a weather outage. Try again shortly.`,
      best: [],
      nights: []
    }, null, 2) + "\n");
  } else {
    process.stderr.write(
      `clearings: no forecast loaded.\n\n` +
      `  All ${failed.length} locations failed to fetch. This is almost always a\n` +
      `  dropped internet connection or a sandbox with no network — not a\n` +
      `  weather outage (Open-Meteo caches server-side). Try again in a minute.\n\n` +
      `  reason: ${firstErr}\n`
    );
  }
  process.exit(1);
}

/* ---------- main ---------- */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); return; }

  const generatedISO = new Date().toISOString();
  const now = nowEpoch(opts.date);

  // sort a copy by distance from home (closest first), like the dashboard
  const locs = [...LOCATIONS].sort((a, b) =>
    haversine(CB.lat, CB.lng, a.lat, a.lng) - haversine(CB.lat, CB.lng, b.lat, b.lng));

  const settled = await Promise.all(locs.map(loc =>
    fetchLoc(loc).then(r => ({ ok: true, r })).catch(e => ({ ok: false, loc, err: e.message }))));

  const data = settled.filter(s => s.ok).map(s => s.r);
  const failed = settled.filter(s => !s.ok);

  if (!data.length) { reportTotalFailure(failed, opts, generatedISO); return; }

  const grid = buildGrid(data, now, opts.horizon);
  const payload = buildPayload(grid, data, opts, generatedISO);

  if (opts.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    const unavailable = failed.map(f => f.loc.slug);
    printHuman(payload, grid, data, unavailable);
  }
}

main().catch(e => { process.stderr.write(`clearings: ${e && e.stack || e}\n`); process.exit(1); });
