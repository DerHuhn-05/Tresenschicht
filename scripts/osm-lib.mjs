// Gemeinsame Regeln für den OSM-Import: welche Orte zählen und wie sie umgewandelt werden.
export const TYPES = { pub: 'kneipe', bar: 'bar', biergarten: 'biergarten' };
export const COLUMNS = ['osm_id', 'name', 'type', 'lat', 'lon', 'address', 'city', 'opening_hours', 'features'];

const CARD_TAGS = ['payment:cards', 'payment:credit_cards', 'payment:debit_cards', 'payment:girocard', 'payment:maestro', 'payment:visa', 'payment:mastercard', 'payment:contactless'];

/** Ausstattung für die Suchfilter; nur zutreffende Merkmale werden gespeichert. */
export function features(t, type) {
  const f = {};
  if (t.outdoor_seating === 'yes' || t.beer_garden === 'yes' || type === 'biergarten') f.outdoor = true;
  if (t.darts === 'yes' || /(^|;)\s*darts\s*(;|$)/.test(t.sport ?? '')) f.darts = true;
  if (CARD_TAGS.some((k) => t[k] === 'yes')) f.cards = true;
  if (t.wheelchair === 'yes') f.wheelchair = true;
  return f;
}

export function centroid(g) {
  if (g.type === 'Point') return g.coordinates;
  let ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
  if (!ring?.length) return null;
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring = ring.slice(0, -1); // geschlossener Ring
  const s = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / ring.length, s[1] / ring.length];
}

export function toRow(f) {
  const t = f.properties ?? {};
  const type = TYPES[t.amenity];
  // C2: keine Clubs; Zweifelsfälle (Bar und Club zugleich) und Geschlossenes lassen wir weg.
  if (!type || !t.name) return null;
  if (t.club === 'nightclub' || /nightclub/.test(`${t['amenity:secondary'] ?? ''};${t.nightclub ?? ''}`) || t.nightclub === 'yes') return null;
  if (t.disused || t.abandoned || t['disused:amenity'] || t.opening_hours === 'closed' || t.opening_hours === 'off') return null;
  const c = centroid(f.geometry);
  if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  return {
    osm_id: String(f.id ?? t['@id'] ?? ''),
    name: t.name.trim(),
    type,
    lat: c[1].toFixed(7),
    lon: c[0].toFixed(7),
    address: [t['addr:street'] ?? t['addr:place'], t['addr:housenumber']].filter(Boolean).join(' '),
    city: t['addr:city'] ?? '',
    opening_hours: t.opening_hours ?? '',
    features: features(t, type),
  };
}


/** Liest eine GeoJSON-Sequenz (osmium export -f geojsonseq) Zeile für Zeile. */
export async function* readPubs(file) {
  const { createReadStream } = await import('node:fs');
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: createReadStream(file) });
  for await (const line of rl) {
    const clean = line.replace(/^\x1e/, '').trim();
    if (!clean) continue;
    let row = null;
    try {
      row = toRow(JSON.parse(clean));
    } catch {
      row = null;
    }
    yield row?.osm_id ? row : null;
  }
}
