/* ------------------------------------------------------------------ *
 * forecast.js — the ONLY module that touches the network. One seam,
 * easy to stub or cache. Fetches Open-Meteo and normalizes its
 * offset-less local timestamps into true epoch milliseconds. [core]
 * ------------------------------------------------------------------ */

/* Open-Meteo with timezone=auto returns "2026-08-12T22:00" — no Z, no
 * offset — plus a separate utc_offset_seconds. Date.parse() on that is
 * ambiguous; this is the only correct conversion. See CLAUDE.md note #4. */
export function omEpoch(iso, offSec) { return Date.parse(iso + "Z") - offSec * 1000; }

/* Fetch one location's hourly forecast and return it in epoch form.
 * Resolves to { loc, off, ep[], cloud[], low[], vis[], precip[], temp[], wind[] }. */
export function fetchLoc(loc) {
  var u = "https://api.open-meteo.com/v1/forecast?latitude=" + loc.lat + "&longitude=" + loc.lng +
    "&hourly=cloud_cover,cloud_cover_low,visibility,precipitation_probability,temperature_2m,wind_speed_10m" +
    "&timezone=auto&forecast_days=8";
  return fetch(u).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) {
    var off = j.utc_offset_seconds, h = j.hourly, n = h.time.length, ep = new Array(n);
    for (var i = 0; i < n; i++) ep[i] = omEpoch(h.time[i], off);
    return {
      loc: loc, off: off, ep: ep, cloud: h.cloud_cover, low: h.cloud_cover_low, vis: h.visibility,
      precip: h.precipitation_probability, temp: h.temperature_2m, wind: h.wind_speed_10m
    };
  });
}
