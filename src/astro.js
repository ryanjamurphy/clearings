/* ------------------------------------------------------------------ *
 * astro.js — darkness window + moon state for one night at one spot.
 * PURE: no network, no filesystem, no process, no window. Data in,
 * astronomy out. Runs unmodified in a browser, Node, or a Worker.
 *
 * Everything works in true epoch milliseconds; conversion to
 * Newfoundland local time is done only via the supplied UTC offset
 * (NDT = UTC-02:30 in summer — the half hour is real, see CLAUDE.md).
 * ------------------------------------------------------------------ */
import { SunCalc } from "./suncalc.js";

export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Broken-out local calendar/clock fields for an epoch, given NL's offset. */
export function parts(epoch, offSec) {
  var d = new Date(epoch + offSec * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), wd: d.getUTCDay() };
}
export function localNoonInstant(y, m, d, offSec) { return Date.UTC(y, m - 1, d, 12, 0, 0) - offSec * 1000; }
export function localMidnightInstant(y, m, d, offSec) { return Date.UTC(y, m - 1, d, 0, 0, 0) - offSec * 1000; }

/* SunCalc returns an Invalid Date object (truthy!) when the sun never
 * reaches a threshold — near the solstice above ~48.56°N. Guard on this
 * everywhere, never on `if (date)`. See CLAUDE.md domain note #3. */
export function validDate(x) { return x && !isNaN(x.getTime()); }

/* Format an epoch as NL local wall-clock, e.g. "9:37 PM". */
export function fmtTime(epoch, offSec) {
  if (epoch == null || isNaN(epoch)) return "—";
  var p = parts(epoch, offSec);
  var h = p.hh, ap = h < 12 ? "AM" : "PM"; h = h % 12; if (h === 0) h = 12;
  return h + ":" + String(p.mm).padStart(2, "0") + " " + ap;
}

/* ------------------------------------------------------------------ *
 * nightAstro — the viewing window, darkness level, and moon state for
 * the evening `nightIdx` days after `nowEpoch`, at one location.
 *
 *  loc       {lat,lng,name}
 *  off       UTC offset seconds for that location (from the forecast)
 *  nightIdx  0 = tonight, 1 = tomorrow, ...
 *  nowEpoch  the instant treated as "now" (injectable for --date sims)
 *
 * A window runs from nautical dusk for ~3 hours (capped at next
 * nautical dawn). darkLevel is the deepest darkness the window reaches:
 * "astronomical" | "nautical" | "twilight".
 * ------------------------------------------------------------------ */
export function nightAstro(loc, off, nightIdx, nowEpoch) {
  var today = parts(nowEpoch, off);
  // target evening date = today + nightIdx
  var base = new Date(localNoonInstant(today.y, today.m, today.d, off) + nightIdx * 864e5);
  var bp = parts(base.getTime(), off);
  var eveNoon = new Date(localNoonInstant(bp.y, bp.m, bp.d, off));
  var nextNoon = new Date(eveNoon.getTime() + 864e5);

  var te = SunCalc.getTimes(eveNoon, loc.lat, loc.lng);   // this evening
  var tm = SunCalc.getTimes(nextNoon, loc.lat, loc.lng);  // next morning

  var startD = validDate(te.nauticalDusk) ? te.nauticalDusk : (validDate(te.sunset) ? new Date(te.sunset.getTime() + 90 * 6e4) : null);
  var morningLimit = validDate(tm.nauticalDawn) ? tm.nauticalDawn : new Date(startD.getTime() + 3 * 36e5);
  var endD = new Date(Math.min(startD.getTime() + 3 * 36e5, morningLimit.getTime()));
  var ws = startD.getTime(), we = endD.getTime(), wm = (ws + we) / 2;

  // darkness level reached during window
  var astroExists = validDate(te.night) && validDate(tm.nightEnd);
  var darkLevel = (astroExists && we > te.night.getTime()) ? "astronomical" :
                  (validDate(te.nauticalDusk) ? "nautical" : "twilight");

  // moon
  var ill = SunCalc.getMoonIllumination(new Date(wm));
  var moonUp = SunCalc.getMoonPosition(new Date(ws), loc.lat, loc.lng).altitude > 0 ||
               SunCalc.getMoonPosition(new Date(wm), loc.lat, loc.lng).altitude > 0 ||
               SunCalc.getMoonPosition(new Date(we), loc.lat, loc.lng).altitude > 0;
  var brightMoon = moonUp && ill.fraction > 0.35;
  var mt = SunCalc.getMoonTimes(new Date(localMidnightInstant(bp.y, bp.m, bp.d, off)), loc.lat, loc.lng, false);

  var isPerseid = (bp.y === 2026 && bp.m === 8 && (bp.d === 12 || bp.d === 13));
  var ymd = bp.y + "-" + String(bp.m).padStart(2, "0") + "-" + String(bp.d).padStart(2, "0");

  return {
    off: off, nightIdx: nightIdx, bp: bp, date: ymd,
    dayLabel: nightIdx === 0 ? "Tonight" : (nightIdx === 1 ? "Tomorrow" : WD[bp.wd] + " " + bp.d),
    dateLabel: WD[bp.wd] + " " + MO[bp.m - 1] + " " + bp.d,
    reliable: nightIdx <= 2, isPerseid: isPerseid,
    moonFrac: ill.fraction, moonUp: moonUp, brightMoon: brightMoon,
    moonrise: validDate(mt.rise) ? mt.rise.getTime() : null,
    moonset: validDate(mt.set) ? mt.set.getTime() : null,
    darkLevel: darkLevel, ws: ws, we: we, wm: wm
  };
}
