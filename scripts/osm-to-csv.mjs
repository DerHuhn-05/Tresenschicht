// D1: Kneipen aus einem OSM-Export (GeoJSON-Sequenz von `osmium export`) in eine CSV-Datei für den Import.
// Aufruf: node scripts/osm-to-csv.mjs pubs.geojsonseq > pubs.csv
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = process.argv[2];
if (!file) {
  console.error('Aufruf: node scripts/osm-to-csv.mjs pubs.geojsonseq > pubs.csv');
  process.exit(1);
}

const TYPES = { pub: 'kneipe', bar: 'bar', biergarten: 'biergarten' };
const COLUMNS = ['osm_id', 'name', 'type', 'lat', 'lon', 'address', 'city', 'opening_hours'];

function centroid(g) {
  if (g.type === 'Point') return g.coordinates;
  let ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
  if (!ring?.length) return null;
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring = ring.slice(0, -1); // geschlossener Ring
  const s = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / ring.length, s[1] / ring.length];
}

function toRow(f) {
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
  };
}

const csv = (v) => `"${String(v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
const out = process.stdout;
out.write(COLUMNS.join(',') + '\n');

let kept = 0;
let skipped = 0;
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
  if (!row?.osm_id) {
    skipped++;
    continue;
  }
  kept++;
  out.write(COLUMNS.map((k) => csv(row[k])).join(',') + '\n');
}
console.error(`${kept} Kneipen übernommen, ${skipped} übersprungen (ohne Namen, Club, geschlossen).`);
