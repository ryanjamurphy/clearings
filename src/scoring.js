/* ------------------------------------------------------------------ *
 * scoring.js — thresholds → verdict. The single source of truth for
 * what counts as GO. PURE: no network, no filesystem, no process, no
 * window. If the dashboard and the CLI ever disagree, the tool is dead
 * to us — so the logic lives here and here only. [core]
 *
 * A night must clear THREE gates, never one: cloud, visibility (the fog
 * gate — non-negotiable), and precip. Cloud-only checks miss coastal
 * fog, the Newfoundland-specific killer. See CLAUDE.md note #5.
 * ------------------------------------------------------------------ */
import { nightAstro } from "./astro.js";

export const THRESHOLDS = {
  strict:  { cloudGo: 12, visGo: 15000, precipGo: 10, cloudMaybe: 30, visMaybe: 8000, precipMaybe: 25 },
  relaxed: { cloudGo: 20, visGo: 12000, precipGo: 15, cloudMaybe: 45, visMaybe: 6000, precipMaybe: 35 }
};

/* The verdict vocabulary — the SAME words in the dashboard, the JSON,
 * and the code. Never invent synonyms. `tier` is the refined verdict
 * ("prime"/"go-moon" collapse to the spoken words below). */
export function verdictLabel(tier) {
  return tier === "prime" ? "PRIME" :
         tier === "go-moon" ? "GO" :
         tier === "go" ? "GO" :
         tier === "maybe" ? "MAYBE" :
         tier === "nodata" ? "—" : "NO";
}

/* Compute the full verdict for one night at one location.
 *
 *  d         a fetched-forecast record from forecast.js { loc, off, ep[], cloud[], ... }
 *  nightIdx  0 = tonight, 1 = tomorrow, ...
 *  mode      "strict" | "relaxed"
 *  nowEpoch  the instant treated as "now" (injectable for --date sims)
 *
 * Returns a flat record consumed identically by every consumer. */
export function computeNight(d, nightIdx, mode, nowEpoch) {
  var a = nightAstro(d.loc, d.off, nightIdx, nowEpoch);
  var ws = a.ws, we = a.we;

  // weather over the viewing window
  var hrs = [], maxCloud = 0, maxLow = 0, minVis = null, maxPrecip = 0, tSum = 0, wSum = 0, wMax = 0;
  for (var i = 0; i < d.ep.length; i++) {
    if (d.ep[i] >= ws && d.ep[i] <= we) {
      var c = d.cloud[i] || 0, lo = d.low[i] || 0, v = d.vis[i], pr = d.precip[i] || 0, tp = d.temp[i], wd_ = d.wind[i] || 0;
      maxCloud = Math.max(maxCloud, c); maxLow = Math.max(maxLow, lo);
      if (v != null) { minVis = (minVis == null) ? v : Math.min(minVis, v); }
      maxPrecip = Math.max(maxPrecip, pr); tSum += (tp || 0); wSum += wd_; wMax = Math.max(wMax, wd_);
      hrs.push({ ep: d.ep[i], cloud: c, low: lo, vis: v, precip: pr, temp: tp, wind: wd_ });
    }
  }
  var noData = hrs.length === 0;

  // verdict — all three gates must pass
  var t = THRESHOLDS[mode];
  var visGo = (minVis == null) || (minVis >= t.visGo);
  var visMb = (minVis == null) || (minVis >= t.visMaybe);
  var go    = !noData && maxCloud <= t.cloudGo    && visGo && maxPrecip <= t.precipGo;
  var maybe = !noData && !go && maxCloud <= t.cloudMaybe && visMb && maxPrecip <= t.precipMaybe;
  var verdict = noData ? "nodata" : (go ? "go" : (maybe ? "maybe" : "no"));
  var tier = verdict;
  if (go && !a.brightMoon && a.darkLevel === "astronomical") tier = "prime";
  else if (go && a.brightMoon) tier = "go-moon";

  return {
    locName: d.loc.name, off: a.off, nightIdx: nightIdx, date: a.date,
    dayLabel: a.dayLabel, dateLabel: a.dateLabel,
    verdict: verdict, tier: tier, reliable: a.reliable, isPerseid: a.isPerseid, noData: noData,
    maxCloud: Math.round(maxCloud), maxLow: Math.round(maxLow),
    minVis: minVis, maxPrecip: Math.round(maxPrecip),
    avgTemp: hrs.length ? Math.round(tSum / hrs.length) : null,
    avgWind: hrs.length ? Math.round(wSum / hrs.length) : null, maxWind: Math.round(wMax),
    moonFrac: a.moonFrac, moonUp: a.moonUp, brightMoon: a.brightMoon,
    moonrise: a.moonrise, moonset: a.moonset,
    darkLevel: a.darkLevel, ws: a.ws, we: a.we, hours: hrs
  };
}

/* Build the full location × night matrix. `data` is an array of
 * fetched-forecast records; returns rows[location][night]. */
export function buildGrid(data, mode, nowEpoch, horizon) {
  if (horizon == null) horizon = 7;
  return data.map(function (d) {
    var arr = [];
    for (var n = 0; n < horizon; n++) arr.push(computeNight(d, n, mode, nowEpoch));
    return arr;
  });
}
