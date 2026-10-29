// B4: Ländergrenzen für Deutschland, die neun Nachbarländer, Italien und Spanien als SQL erzeugen.
// Quelle: Natural Earth, ne_10m_admin_0_countries.geojson (gemeinfrei).
// Aufruf: node scripts/import-countries.mjs ne_10m_admin_0_countries.geojson > supabase/countries.sql
import { readFileSync } from 'node:fs';

const ALLOWED = ['DE', 'DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL', 'IT', 'ES'];
const file = process.argv[2];
if (!file) {
  console.error('Aufruf: node scripts/import-countries.mjs ne_10m_admin_0_countries.geojson > supabase/countries.sql');
  process.exit(1);
}
const fc = JSON.parse(readFileSync(file, 'utf8'));
const out = ['-- Erzeugt von scripts/import-countries.mjs', 'delete from public.countries;'];
for (const f of fc.features) {
  const p = f.properties;
  const code = [p.ISO_A2_EH, p.ISO_A2, p.iso_a2].find((x) => x && x !== '-99');
  if (!ALLOWED.includes(code)) continue;
  const geo = JSON.stringify(f.geometry).replace(/'/g, "''");
  out.push(
    `insert into public.countries (code, name, geom) values ('${code}', '${(p.NAME_DE ?? p.NAME ?? code).replace(/'/g, "''")}', ` +
      `st_multi(st_buffer(st_setsrid(st_geomfromgeojson('${geo}'), 4326)::geography, 200)::geometry));`
  );
}
console.log(out.join('\n'));
console.error(`${out.length - 2} von ${ALLOWED.length} Ländern geschrieben.`);
