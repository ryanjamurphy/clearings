/* ------------------------------------------------------------------ *
 * locations.js — the six dark-sky spots, plus the Corner Brook anchor
 * used for "how far from home" sorting and distance display. [core]
 *
 * Adding a spot is one line here. lat/lng drive the astronomy;
 * `note` is human copy; distance is derived, not stored.
 * Pure: no network, no filesystem, no globals.
 * ------------------------------------------------------------------ */

/* Corner Brook — the home base and reference point for drive distance. */
export const CB = { lat: 48.9517, lng: -57.9344 };

/* `slug` is a stable identifier the JSON contract exposes — consumers
 * bind to it, so treat it as public API and don't rename casually. */
export const LOCATIONS = [
  { slug: "blow-me-down",          name: "Blow Me Down Prov. Park",  lat: 49.10, lng: -58.40, note: "~40 min · Bay of Islands" },
  { slug: "sir-richard-squires",   name: "Sir Richard Squires Park", lat: 49.33, lng: -57.38, note: "~50 min · Humber valley" },
  { slug: "barachois-pond",        name: "Barachois Pond Prov. Park", lat: 48.50, lng: -58.27, note: "~45 min · off the TCH" },
  { slug: "gros-morne-berry-hill", name: "Gros Morne — Berry Hill",  lat: 49.62, lng: -57.85, note: "~1 hr · near Rocky Harbour" },
  { slug: "gros-morne-trout-river", name: "Gros Morne — Trout River", lat: 49.48, lng: -58.11, note: "~1 hr 15 · Tablelands" },
  { slug: "terra-nova",            name: "Terra Nova Nat. Park",     lat: 48.55, lng: -53.98, note: "~4½ hr · dark-sky preserve" }
];

/* Great-circle distance in km between two lat/lng points. */
export function haversine(la1, lo1, la2, lo2) {
  var R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180,
      a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
          Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ------------------------------------------------------------------ *
 * Helpers for user-added spots. Pure: string/number in, value out.
 * Persistence (localStorage) is a consumer concern and lives in the
 * dashboard — the core never touches globals.
 * ------------------------------------------------------------------ */

/* A URL/JSON-safe slug from a display name: lowercased, non-alphanumerics
 * collapsed to single hyphens, ends trimmed. "" if nothing usable. */
export function slugify(name) {
  return String(name == null ? "" : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Make `base` unique against a set of taken slugs by appending -2, -3, …
 * `taken` may be an array or a Set. Falls back to "spot" for an empty base. */
export function uniqueSlug(base, taken) {
  var has = (typeof taken.has === "function") ? function (s) { return taken.has(s); }
                                              : function (s) { return taken.indexOf(s) >= 0; };
  var root = base || "spot", slug = root, i = 2;
  while (has(slug)) { slug = root + "-" + i; i++; }
  return slug;
}

/* Validate a proposed spot. Returns { ok, errors: [msg,…], value }.
 * `value` (present only when ok) is a normalized {name,lat,lng,note} with
 * numeric coords. Coords drive the astronomy, so this is the real gate. */
export function validateLocation(input) {
  var errors = [];
  var name = String((input && input.name != null ? input.name : "")).trim();
  if (!name) errors.push("Name can't be empty.");

  var lat = Number(input && input.lat);
  var lng = Number(input && input.lng);
  if (!Number.isFinite(lat)) errors.push("Latitude must be a number.");
  else if (lat < -90 || lat > 90) errors.push("Latitude must be between -90 and 90.");
  if (!Number.isFinite(lng)) errors.push("Longitude must be a number.");
  else if (lng < -180 || lng > 180) errors.push("Longitude must be between -180 and 180.");

  if (errors.length) return { ok: false, errors: errors };
  var note = String((input && input.note != null ? input.note : "")).trim();
  return { ok: true, errors: [], value: { name: name, lat: lat, lng: lng, note: note } };
}
