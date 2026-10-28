// D1: Kneipen aus einem OpenStreetMap-Auszug in die eigene Datenbank laden.
// Vorbereitung (einmalig, siehe README):
//   osmium tags-filter europe-auswahl.osm.pbf nwr/amenity=pub,bar,biergarten -o pubs.osm.pbf
//   osmium export pubs.osm.pbf -f geojsonseq -o pubs.geojsonseq
// Aufruf:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-osm.mjs pubs.geojsonseq
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const file = process.argv[2];
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!file || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Aufruf: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-osm.mjs pubs.geojsonseq');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TYPES = { pub: 'kneipe', bar: 'bar', biergarten: 'biergarten' };

function centroid(g) {
  if (g.type === 'Point') return g.coordinates;
  const pts = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
  if (!pts) return null;
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

function toRow(f) {
  const t = f.properties ?? {};
  const type = TYPES[t.amenity];
  // C2: keine Clubs. Zweifelsfälle (Bar und Club zugleich) lassen wir weg.
  if (!type || !t.name || t.club || t.amenity === 'nightclub' || /nightclub/.test(t['amenity:secondary'] ?? '')) return null;
  if (t.disused || t['disused:amenity'] || t.opening_hours === 'closed') return null;
  const c = centroid(f.geometry);
  if (!c) return null;
  const id = f.id ?? t['@id'] ?? `${f.geometry.type}/${c.join(',')}`;
  return {
    osm_id: String(id),
    name: t.name,
    type,
    lon: c[0],
    lat: c[1],
    address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
    city: t['addr:city'] ?? '',
    opening_hours: t.opening_hours ?? null,
    source: 'osm',
  };
}

let batch = [];
let total = 0;
async function flush() {
  if (!batch.length) return;
  const { error } = await sb.from('pubs').upsert(batch, { onConflict: 'osm_id' });
  if (error) throw error;
  total += batch.length;
  process.stdout.write(`\r${total} Kneipen importiert`);
  batch = [];
}

const rl = createInterface({ input: createReadStream(file) });
for await (const line of rl) {
  const clean = line.replace(/^\x1e/, '').trim();
  if (!clean) continue;
  const row = toRow(JSON.parse(clean));
  if (row) batch.push(row);
  if (batch.length >= 1000) await flush();
}
await flush();
console.log('\nFertig. Jetzt im SQL-Editor das Land setzen:');
console.log("  update pubs set country = country_at(lat, lon) where country is null;");
console.log("  delete from pubs where country is null and source = 'osm';  -- außerhalb des Arbeitsbereichs");
