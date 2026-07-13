/* ------------------------------------------------------------------ *
 * SunCalc — (c) 2011-2015 Vladimir Agafonkin, BSD 2-Clause license.
 * https://github.com/mourner/suncalc
 * Inlined verbatim (algorithm unchanged) so the core has zero
 * dependencies and runs identically in the browser and in Node.
 * The only edit is the module boundary: instead of assigning to
 * `window.SunCalc`, the object is returned and exported.
 * ------------------------------------------------------------------ */
const SunCalc = (function () {
  var PI = Math.PI, sin = Math.sin, cos = Math.cos, tan = Math.tan,
      asin = Math.asin, atan = Math.atan2, acos = Math.acos, rad = PI / 180;
  var dayMs = 864e5, J1970 = 2440588, J2000 = 2451545;
  function toJulian(d) { return d.valueOf() / dayMs - 0.5 + J1970; }
  function fromJulian(j) { return new Date((j + 0.5 - J1970) * dayMs); }
  function toDays(d) { return toJulian(d) - J2000; }
  var e = rad * 23.4397;
  function ra(l, b) { return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l)); }
  function dec(l, b) { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)); }
  function az(H, phi, d) { return atan(sin(H), cos(H) * sin(phi) - tan(d) * cos(phi)); }
  function alt(H, phi, d) { return asin(sin(phi) * sin(d) + cos(phi) * cos(d) * cos(H)); }
  function sidereal(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }
  function refr(h) { if (h < 0) h = 0; return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179)); }
  function sma(d) { return rad * (357.5291 + 0.98560028 * d); }
  function ecl(M) { var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), P = rad * 102.9372; return M + C + P + PI; }
  function sunCoords(d) { var M = sma(d), L = ecl(M); return { dec: dec(L, 0), ra: ra(L, 0) }; }
  var S = {};
  S.getPosition = function (date, lat, lng) { var lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = sidereal(d, lw) - c.ra; return { azimuth: az(H, phi, c.dec), altitude: alt(H, phi, c.dec) }; };
  var times = [[-0.833, 'sunrise', 'sunset'], [-6, 'dawn', 'dusk'], [-12, 'nauticalDawn', 'nauticalDusk'], [-18, 'nightEnd', 'night']];
  var J0 = 9e-4;
  function jc(d, lw) { return Math.round(d - J0 - lw / (2 * PI)); }
  function at(Ht, lw, n) { return J0 + (Ht + lw) / (2 * PI) + n; }
  function stj(ds, M, L) { return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L); }
  function ha(h, phi, d) { return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d))); }
  function setJ(h, lw, phi, d, n, M, L) { var w = ha(h, phi, d), a = at(w, lw, n); return stj(a, M, L); }
  S.getTimes = function (date, lat, lng) {
    var lw = rad * -lng, phi = rad * lat, d = toDays(date), n = jc(d, lw), ds = at(0, lw, n),
        M = sma(ds), L = ecl(M), dc = dec(L, 0), Jn = stj(ds, M, L),
        r = { solarNoon: fromJulian(Jn), nadir: fromJulian(Jn - 0.5) };
    for (var i = 0; i < times.length; i++) {
      var t = times[i], h0 = t[0] * rad, Js = setJ(h0, lw, phi, dc, n, M, L), Jr = Jn - (Js - Jn);
      r[t[1]] = fromJulian(Jr); r[t[2]] = fromJulian(Js);
    }
    return r;
  };
  function moonCoords(d) { var L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d), l = L + rad * 6.289 * sin(M), b = rad * 5.128 * sin(F), dt = 385001 - 20905 * cos(M); return { ra: ra(l, b), dec: dec(l, b), dist: dt }; }
  S.getMoonPosition = function (date, lat, lng) { var lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = sidereal(d, lw) - c.ra, h = alt(H, phi, c.dec); h = h + refr(h); return { azimuth: az(H, phi, c.dec), altitude: h, distance: c.dist }; };
  S.getMoonIllumination = function (date) { var d = toDays(date || new Date()), s = sunCoords(d), m = moonCoords(d), sd = 149598000, phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)), inc = atan(sd * sin(phi), m.dist - sd * cos(phi)), ang = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra)); return { fraction: (1 + cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / PI, angle: ang }; };
  function hl(d, h) { return new Date(d.valueOf() + h * dayMs / 24); }
  S.getMoonTimes = function (date, lat, lng, utc) {
    var t = new Date(date); if (utc) t.setUTCHours(0, 0, 0, 0); else t.setHours(0, 0, 0, 0);
    var hc = 0.133 * rad, h0 = S.getMoonPosition(t, lat, lng).altitude - hc, rise, set, ye, d, x1, x2, dx;
    for (var i = 1; i <= 24; i += 2) {
      var h1 = S.getMoonPosition(hl(t, i), lat, lng).altitude - hc, h2 = S.getMoonPosition(hl(t, i + 1), lat, lng).altitude - hc,
          a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a);
      ye = (a * xe + b) * xe + h1; d = b * b - 4 * a * h1; var roots = 0;
      if (d >= 0) { dx = Math.sqrt(d) / (Math.abs(a) * 2); x1 = xe - dx; x2 = xe + dx; if (Math.abs(x1) <= 1) roots++; if (Math.abs(x2) <= 1) roots++; if (x1 < -1) x1 = x2; }
      if (roots === 1) { if (h0 < 0) rise = i + x1; else set = i + x1; }
      else if (roots === 2) { rise = i + (ye < 0 ? x2 : x1); set = i + (ye < 0 ? x1 : x2); }
      if (rise && set) break; h0 = h2;
    }
    var r = {}; if (rise) r.rise = hl(t, rise); if (set) r.set = hl(t, set); if (!rise && !set) r[ye > 0 ? 'alwaysUp' : 'alwaysDown'] = true; return r;
  };
  return S;
})();

export { SunCalc };
