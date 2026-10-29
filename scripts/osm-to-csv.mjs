// D1: Kneipen aus einem OSM-Export (GeoJSON-Sequenz von `osmium export`) in eine CSV-Datei.
// Aufruf: node scripts/osm-to-csv.mjs pubs.geojsonseq > pubs.csv
import { COLUMNS, readPubs } from './osm-lib.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Aufruf: node scripts/osm-to-csv.mjs pubs.geojsonseq > pubs.csv');
  process.exit(1);
}

const csv = (v) => `"${String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
process.stdout.write(COLUMNS.join(',') + '\n');
let kept = 0;
let skipped = 0;
for await (const row of readPubs(file)) {
  if (!row) {
    skipped++;
    continue;
  }
  kept++;
  process.stdout.write(COLUMNS.map((k) => csv(row[k])).join(',') + '\n');
}
console.error(`${kept} Kneipen übernommen, ${skipped} übersprungen (ohne Namen, Club, geschlossen).`);
