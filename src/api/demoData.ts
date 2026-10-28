import type { Pub, PubType } from './types';

// Erfundene Kneipen für den Demo-Modus (Hamburg). Im Betrieb kommen die Daten aus OpenStreetMap.
function at(lat: number, lon: number, eastM: number, northM: number): [number, number] {
  return [lat + northM / 111_320, lon + eastM / (111_320 * Math.cos((lat * Math.PI) / 180))];
}

const KIEZ: [number, number] = [53.5497, 9.9636];
const SCHANZE: [number, number] = [53.5626, 9.9622];
const OTTENSEN: [number, number] = [53.5527, 9.9259];

type Seed = [name: string, type: PubType, base: [number, number], east: number, north: number, street: string];

const SEEDS: Seed[] = [
  ['Zum Anker', 'kneipe', KIEZ, 0, 0, 'Hafenstraße 12'],
  ['Kajüte', 'kneipe', KIEZ, 140, 90, 'Bernhard-Nocht-Straße 31'],
  ['Bar Zwölf', 'bar', SCHANZE, 0, 0, 'Schulterblatt 12'],
  ['Schanzenstübchen', 'kneipe', SCHANZE, 28, 14, 'Schulterblatt 16'],
  ['Hopfenhof', 'biergarten', SCHANZE, -22, 30, 'Susannenstraße 4'],
  ['Zur Laterne', 'kneipe', SCHANZE, 160, -120, 'Bartelsstraße 9'],
  ['Blaue Stunde', 'bar', SCHANZE, -180, 110, 'Juliusstraße 21'],
  ['Elbblick', 'biergarten', OTTENSEN, 120, -260, 'Elbchaussee 3'],
  ['Fischerkate', 'kneipe', OTTENSEN, 0, 0, 'Bahrenfelder Straße 40'],
  ['Messing', 'bar', OTTENSEN, 90, 60, 'Ottenser Hauptstraße 8'],
  ['Tresen 7', 'kneipe', OTTENSEN, -140, 30, 'Große Rainstraße 7'],
  ['Kleiner Hafen', 'kneipe', KIEZ, -260, 160, 'Davidstraße 18'],
  ['Nachtwache', 'bar', KIEZ, 310, 220, 'Hein-Hoyer-Straße 2'],
  ['Kiezperle', 'kneipe', KIEZ, 420, 330, 'Talstraße 11'],
  ['Feierabend', 'kneipe', KIEZ, 520, 120, 'Friedrichstraße 5'],
  ['Deckel & Strich', 'kneipe', SCHANZE, 330, 260, 'Sternstraße 14'],
  ['Zapfhahn', 'bar', SCHANZE, -360, -60, 'Lippmannstraße 3'],
  ['Altes Fass', 'kneipe', SCHANZE, 240, 480, 'Weidenallee 22'],
  ['Biergarten am Park', 'biergarten', SCHANZE, -80, 620, 'Sternschanzenpark'],
  ['Kombüse', 'kneipe', KIEZ, 120, -170, 'St. Pauli Fischmarkt 4'],
  ['Leuchtturm', 'bar', KIEZ, 650, 420, 'Paul-Roosen-Straße 9'],
  ['Stammtisch', 'kneipe', OTTENSEN, 260, 220, 'Bei der Reitbahn 2'],
  ['Zum Lotsen', 'kneipe', OTTENSEN, 380, -80, 'Kleine Rainstraße 1'],
  ['Hafenkneipe', 'kneipe', KIEZ, -420, -60, 'Pinnasberg 6'],
  ['Mondschein', 'bar', SCHANZE, 520, 120, 'Neuer Kamp 30'],
  ['Wirtshaus Elbe', 'kneipe', OTTENSEN, -320, -200, 'Neumühlen 11'],
  ['Kupferkessel', 'kneipe', SCHANZE, 60, -340, 'Max-Brauer-Allee 50'],
];

export const DEMO_PUBS: Pub[] = SEEDS.map(([name, type, base, e, n, street], i) => {
  const [lat, lon] = at(base[0], base[1], e, n);
  return {
    id: `demo-${i + 1}`,
    name,
    type,
    lat,
    lon,
    address: street,
    city: 'Hamburg',
    country: 'DE',
    status: 'aktiv',
    source: 'osm',
  };
});

/** Startpunkt der Demo: direkt am „Zum Anker“, damit die Check-in-Frage sofort erscheint. */
export const DEMO_START = { lat: KIEZ[0] + 0.00008, lon: KIEZ[1] + 0.00005 };
/** Ort mit mehreren Treffern im Umkreis. */
export const DEMO_MULTI = { lat: SCHANZE[0] + 0.0001, lon: SCHANZE[1] + 0.0001 };

export const DEMO_FRIENDS = [
  { id: 'u-lena', username: 'lena_k', firstName: 'Lena', lastName: 'Kruse', city: 'Hamburg' },
  { id: 'u-jonas', username: 'jonas.b', firstName: 'Jonas', lastName: 'Brandt', city: 'Hamburg' },
  { id: 'u-mia', username: 'mia_w', firstName: 'Mia', lastName: 'Wolff', city: 'Lübeck' },
  { id: 'u-tom', username: 'tom.h', firstName: 'Tom', lastName: 'Hansen', city: 'Kiel' },
];
