/* ------------------------------------------------------------------ *
 * scoring.js — verdict for one night at one spot. The single source of
 * truth for what's worth camping for. PURE: no network, no filesystem,
 * no process, no window. If the dashboard and the CLI ever disagree,
 * the tool is dead to us — so the logic lives here and here only. [core]
 *
 * Two axes decide it:
 *   1. Weather over the 30-min viewing block — THREE gates, never one:
 *      cloud, visibility (the fog gate, non-negotiable), and precip.
 *      Cloud-only checks miss coastal fog, the NL killer (CLAUDE.md #5).
 *   2. How dark the sky actually gets at the peak. Since every trip now
 *      means waking sleeping kids, a merely-clear but moon-washed or
 *      twilight-only night isn't worth it — GO requires a real dark sky.
 * ------------------------------------------------------------------ */
import { nightAstro, skyAt } from "./astro.js";

/* One strict bar (the old "forgiving" mode is gone).
 *   *Go/*Maybe    — cloud/vis/precip gates over the 30-min viewing block.
 *   settle*       — the "is the night settled enough to camp?" gates,
 *                   scanned over the camp span (evening setup → dawn).
 *                   A clear hole in an otherwise cloudy/rainy night is a
 *                   fragile bet and a rough camp, so it can't be GO/PRIME. */
export const THRESHOLDS = {
  cloudGo: 12, visGo: 15000, precipGo: 10, cloudMaybe: 30, visMaybe: 8000, precipMaybe: 25,
  settleCloud: 50, settlePrecip: 15, settleVis: 5000
};

/* The verdict vocabulary — the SAME words in the dashboard, the JSON,
 * and the code. Never invent synonyms. */
export function verdictLabel(tier) {
  return tier === "prime" ? "PRIME" :
         tier === "go" ? "GO" :
         tier === "maybe" ? "MAYBE" :
         tier === "nodata" ? "—" : "NO";
}

/* Compute the full verdict for one night at one location.
 *
 *  d         a fetched-forecast record from forecast.js { loc, off, ep[], cloud[], ... }
 *  nightIdx  0 = tonight, 1 = tomorrow, ...
 *  nowEpoch  the instant treated as "now" (injectable for --date sims)
 *
 * Returns a flat record consumed identically by every consumer. */
export function computeNight(d, nightIdx, nowEpoch) {
  var a = nightAstro(d.loc, d.off, nightIdx, nowEpoch);
  var ws = a.ws, we = a.we, T = THRESHOLDS;

  // --- weather over the 30-minute viewing block ---
  // Forecast is hourly, so use the hours inside the block; if none fall
  // inside (a 30-min block can land between :00 marks), fall back to the
  // nearest hour to the peak, within 60 min.
  var block = [];
  for (var i = 0; i < d.ep.length; i++) if (d.ep[i] >= ws && d.ep[i] <= we) block.push(i);
  if (!block.length) {
    var bi = -1, bd = Infinity;
    for (var j = 0; j < d.ep.length; j++) { var dd = Math.abs(d.ep[j] - a.wm); if (dd < bd) { bd = dd; bi = j; } }
    if (bi >= 0 && bd <= 60 * 60 * 1000) block.push(bi);
  }
  var noData = block.length === 0;

  var maxCloud = 0, maxLow = 0, minVis = null, maxPrecip = 0, tSum = 0, wSum = 0, wMax = 0;
  block.forEach(function (i) {
    var c = d.cloud[i] || 0, lo = d.low[i] || 0, v = d.vis[i], pr = d.precip[i] || 0, tp = d.temp[i], wd_ = d.wind[i] || 0;
    maxCloud = Math.max(maxCloud, c); maxLow = Math.max(maxLow, lo);
    if (v != null) minVis = (minVis == null) ? v : Math.min(minVis, v);
    maxPrecip = Math.max(maxPrecip, pr); tSum += (tp || 0); wSum += wd_; wMax = Math.max(wMax, wd_);
  });

  // --- verdict: weather gate × how dark the sky actually gets ---
  var visGo = (minVis == null) || (minVis >= T.visGo);
  var visMb = (minVis == null) || (minVis >= T.visMaybe);
  var weatherGo = !noData && maxCloud <= T.cloudGo && visGo && maxPrecip <= T.precipGo;
  var weatherMaybe = !noData && maxCloud <= T.cloudMaybe && visMb && maxPrecip <= T.precipMaybe;
  var mw = a.sky.tier === "milky-way", faintMw = a.sky.tier === "milky-way-faint";

  var tier;
  if (noData) tier = "nodata";
  else if (weatherGo && mw) tier = "prime";            // clear + Milky Way → wake them
  else if (weatherGo && faintMw) tier = "go";          // clear + faint Milky Way → worth the camp
  else if (weatherGo || weatherMaybe) tier = "maybe";  // clear but washed/twilight, or borderline weather
  else tier = "no";                                    // clouded / fogged / wet
  // --- camp settledness: is the surrounding night stable enough to commit? ---
  // A clear 30-min hole in an otherwise rainy/cloudy night is a fragile bet
  // AND a rough camp (wet setup, wet teardown). Scan the camp span — an
  // evening setup shoulder through dawn — and demote an otherwise-worthy
  // night to MAYBE if cloud, rain risk, or fog moves through it.
  var campStart = a.nightStart - 3 * 36e5;
  var campMaxCloud = 0, campMaxPrecip = 0, campMinVis = null, campHrs = 0;
  for (var m = 0; m < d.ep.length; m++) {
    if (d.ep[m] >= campStart && d.ep[m] <= a.nightEnd) {
      campHrs++;
      campMaxCloud = Math.max(campMaxCloud, d.cloud[m] || 0);
      campMaxPrecip = Math.max(campMaxPrecip, d.precip[m] || 0);
      var cv = d.vis[m]; if (cv != null) campMinVis = (campMinVis == null) ? cv : Math.min(campMinVis, cv);
    }
  }
  var settled = campHrs === 0 ? true :
    !(campMaxCloud > T.settleCloud || campMaxPrecip > T.settlePrecip || (campMinVis != null && campMinVis < T.settleVis));
  var demoted = false;
  if (!settled && (tier === "prime" || tier === "go")) { tier = "maybe"; demoted = true; }

  // `verdict` groups prime+go as "worth camping" for consumers.
  var verdict = (tier === "prime" || tier === "go") ? "go" : tier;

  // --- hour-by-hour across the whole night, for the detail view ---
  // Flag the hour(s) that actually drove the verdict (the block hours,
  // or the nearest-hour fallback) so the detail can highlight them.
  var hours = [];
  for (var k = 0; k < d.ep.length; k++) {
    if (d.ep[k] >= a.nightStart && d.ep[k] <= a.nightEnd) {
      hours.push({
        ep: d.ep[k], cloud: d.cloud[k] || 0, low: d.low[k] || 0, vis: d.vis[k],
        precip: d.precip[k] || 0, temp: d.temp[k], wind: d.wind[k] || 0,
        sky: skyAt(d.loc, d.ep[k]), inBlock: block.indexOf(k) >= 0
      });
    }
  }
  var n = block.length;

  return {
    locName: d.loc.name, off: a.off, nightIdx: nightIdx, date: a.date,
    dayLabel: a.dayLabel, dateLabel: a.dateLabel,
    verdict: verdict, tier: tier, reliable: a.reliable, isPerseid: a.isPerseid, noData: noData,
    maxCloud: Math.round(maxCloud), maxLow: Math.round(maxLow),
    minVis: minVis, maxPrecip: Math.round(maxPrecip),
    avgTemp: n ? Math.round(tSum / n) : null,
    avgWind: n ? Math.round(wSum / n) : null, maxWind: Math.round(wMax),
    moonFrac: a.moonFrac, moonUp: a.moonUp, brightMoon: a.brightMoon,
    moonrise: a.moonrise, moonset: a.moonset,
    darkLevel: a.darkLevel, sky: a.sky,
    settled: settled, demoted: demoted,
    campMaxCloud: Math.round(campMaxCloud), campMaxPrecip: Math.round(campMaxPrecip),
    alarm: a.alarm, ws: a.ws, we: a.we, peak: a.peak,
    nightStart: a.nightStart, nightEnd: a.nightEnd,
    hours: hours
  };
}

/* Build the full location × night matrix. `data` is an array of
 * fetched-forecast records; returns rows[location][night]. */
export function buildGrid(data, nowEpoch, horizon) {
  if (horizon == null) horizon = 7;
  return data.map(function (d) {
    var arr = [];
    for (var n = 0; n < horizon; n++) arr.push(computeNight(d, n, nowEpoch));
    return arr;
  });
}
