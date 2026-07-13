/* ------------------------------------------------------------------ *
 * locations.js — the six dark-sky spots, plus the Corner Brook anchor
 * used for "how far from home" sorting and distance display. [core]
 *
 * Adding a spot is one line here. lat/lng drive the astronomy;
 * `note` is human copy; distance is derived, not stored.
 * Pure: no network, no filesystem, no globals.
 * ------------------------------------------------------------------ */

/* Corner Brook — Ryan's home; the reference point for drive distance. */
export const CB = { lat: 48.9517, lng: -57.9344 };

export const LOCATIONS = [
  { name: "Blow Me Down Prov. Park",    lat: 49.10, lng: -58.40, note: "~40 min · Bay of Islands" },
  { name: "Sir Richard Squires Park",   lat: 49.33, lng: -57.38, note: "~50 min · Humber valley" },
  { name: "Barachois Pond Prov. Park",  lat: 48.50, lng: -58.27, note: "~45 min · off the TCH" },
  { name: "Gros Morne — Berry Hill",    lat: 49.62, lng: -57.85, note: "~1 hr · near Rocky Harbour" },
  { name: "Gros Morne — Trout River",   lat: 49.48, lng: -58.11, note: "~1 hr 15 · Tablelands" },
  { name: "Terra Nova Nat. Park",       lat: 48.55, lng: -53.98, note: "~4½ hr · dark-sky preserve" }
];

/* Great-circle distance in km between two lat/lng points. */
export function haversine(la1, lo1, la2, lo2) {
  var R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180,
      a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
          Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
