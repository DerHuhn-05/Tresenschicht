// Import in Supabase über den Service-Role-Key (Funktionen aus supabase/import-functions.sql).
//   node scripts/import-supabase.mjs check
//   node scripts/import-supabase.mjs countries ne_10m_admin_0_countries.geojson
//   node scripts/import-supabase.mjs pubs pubs.geojsonseq
// Umgebung: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { readPubs } from './osm-lib.mjs';

const ALLOWED = ['DE', 'DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL', 'IT', 'ES'];
const BATCH = 1000;
const [cmd, file] = process.argv.slice(2);
const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

function fail(msg) {
  console.log(`::error::${msg}`);
  process.exit(1);
}

if (!url) fail('Das Secret VITE_SUPABASE_URL fehlt oder ist leer.');
if (!/^https:\/\/[^/]+\.supabase\.(co|in)$/.test(url)) fail(`VITE_SUPABASE_URL sieht nicht wie eine Supabase-Adresse aus (erwartet: https://xxxx.supabase.co, ohne Zusatz). Gefunden wurde eine Adresse mit ${url.length} Zeichen.`);
if (!key) fail('Das Secret SUPABASE_SERVICE_ROLE_KEY fehlt oder ist leer.');
if (key.startsWith('sb_publishable_')) fail('In SUPABASE_SERVICE_ROLE_KEY steht der Publishable-Key. Nötig ist der Secret-Key (sb_secret_…) bzw. service_role.');

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function rpc(name, args, tries = 3) {
  for (let i = 1; ; i++) {
    const { data, error } = await sb.rpc(name, args);
    if (!error) return data;
    if (/Could not find the function|does not exist/i.test(error.message)) {
      fail(`Die Import-Funktion ${name} fehlt in der Datenbank. Führe einmal supabase/import-functions.sql im SQL-Editor von Supabase aus.`);
    }
    if (/permission denied/i.test(error.message)) fail(`Keine Berechtigung für ${name}. Ist in SUPABASE_SERVICE_ROLE_KEY wirklich der Secret-/service_role-Key eingetragen?`);
    if (/Invalid API key|JWT/i.test(error.message)) fail('Supabase lehnt den Schlüssel ab. Prüfe SUPABASE_SERVICE_ROLE_KEY (Secret-Key aus Project Settings → API Keys).');
    if (i >= tries) fail(`${name}: ${error.message}`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

if (cmd === 'check') {
  const now = await rpc('import_now', {});
  const { count, error } = await sb.from('pubs').select('id', { count: 'exact', head: true });
  if (error) fail(`Tabelle pubs nicht erreichbar: ${error.message}. Wurde supabase/schema.sql ausgeführt?`);
  console.log(`Verbindung ok (Serverzeit ${now}), ${count} Kneipen in der Datenbank.`);
} else if (cmd === 'countries') {
  const fc = JSON.parse(readFileSync(file, 'utf8'));
  // Ein Land kann mehrere Einträge haben (Frankreich und Clipperton-Insel heißen beide FR): zusammenfügen statt überschreiben
  const parts = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    const code = [p.ISO_A2_EH, p.ISO_A2, p.iso_a2].find((x) => x && x !== '-99');
    if (!ALLOWED.includes(code) || !f.geometry) continue;
    const entry = parts.get(code) ?? { name: null, polygons: [] };
    if (!entry.name || p.ADMIN === p.NAME) entry.name = p.NAME_DE ?? p.NAME ?? code;
    const g = f.geometry;
    if (g.type === 'Polygon') entry.polygons.push(g.coordinates);
    else if (g.type === 'MultiPolygon') entry.polygons.push(...g.coordinates);
    parts.set(code, entry);
  }
  let n = 0;
  for (const [code, { name, polygons }] of parts) {
    const geometry = { type: 'MultiPolygon', coordinates: polygons };
    const { error } = await sb.rpc('import_country', { p_code: code, p_name: name, p_geom: geometry });
    if (error && /Arbeitsbereich/.test(error.message)) {
      console.log(`::warning::Land ${code} übersprungen: Die Datenbank kennt es noch nicht. Führe supabase/import-functions.sql im SQL-Editor erneut aus und starte den Import noch einmal.`);
      continue;
    }
    if (error) await rpc('import_country', { p_code: code, p_name: name, p_geom: geometry });
    console.log(`Land ${code} gespeichert (${polygons.length} Flächen)`);
    n++;
  }
  if (n !== ALLOWED.length) console.log(`::warning::Nur ${n} von ${ALLOWED.length} Ländern gefunden.`);
} else if (cmd === 'pubs') {
  const started = await rpc('import_now', {});
  let batch = [];
  let read = 0;
  let skipped = 0;
  let saved = 0;
  const flush = async () => {
    if (!batch.length) return;
    saved += await rpc('import_pubs', { p_rows: batch });
    batch = [];
    process.stdout.write(`\r${read} gelesen, ${saved} gespeichert`);
  };
  for await (const row of readPubs(file)) {
    if (!row) {
      skipped++;
      continue;
    }
    read++;
    batch.push(row);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  console.log(`\n${read} Kneipen gelesen, ${skipped} übersprungen (ohne Namen, Club, geschlossen), ${saved} gespeichert (Rest außerhalb der zehn Länder).`);
  const summary = await rpc('finish_pub_import', { p_started: started });
  console.log(`In OSM nicht mehr vorhanden, jetzt ausgeblendet: ${summary.geschlossen}`);
  console.log('Aktive Orte je Land:', JSON.stringify(summary.aktiv));
  console.log('Aktive Orte je Art:', JSON.stringify(summary.nach_art));
  const sumLine = Object.entries(summary.aktiv ?? {}).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Kneipen-Import\n\n${read} gelesen, ${saved} gespeichert, ${summary.geschlossen} ausgeblendet.\n\n| Land | Aktive Orte |\n| --- | --- |\n${sumLine}\n\nNach Art: ${Object.entries(summary.nach_art ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
  }
} else {
  fail('Aufruf: node scripts/import-supabase.mjs check | countries <datei> | pubs <datei>');
}
