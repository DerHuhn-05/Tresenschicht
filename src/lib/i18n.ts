import { EN } from './i18n-en';
import { load, save } from './storage';

// Sprache der Oberfläche: Deutsch oder Englisch. Kneipennamen, Adressen und Nutzereingaben bleiben, wie sie sind.
// Texte stehen im Code auf Deutsch; t() schlägt die englische Fassung nach (fehlt sie, bleibt es Deutsch).
export type Lang = 'de' | 'en';
const KEY = 'tresen-lang';

function initial(): Lang {
  const saved = load<Lang | null>(KEY, null);
  if (saved === 'de' || saved === 'en') return saved;
  return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const LANG: Lang = initial();
/** Für Zahlen und Datum */
export const LOCALE = LANG === 'de' ? 'de-DE' : 'en-GB';
document.documentElement.lang = LANG;

/** Sprache wechseln. Die App lädt danach neu, damit alle Texte (auch feste Listen) die neue Sprache haben. */
export function setLang(l: Lang) {
  save(KEY, l);
  location.reload();
}

/** Text in der gewählten Sprache. Platzhalter wie {name} werden ersetzt. */
export function t(de: string, vars?: Record<string, string | number>): string {
  let s = LANG === 'en' ? EN[de] ?? de : de;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(typeof v === 'number' ? v.toLocaleString(LOCALE) : v);
  return s;
}

/** Zahl mit passendem Wort: n(3, 'Kneipe', 'Kneipen') → „3 Kneipen“ bzw. „3 pubs“ */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString(LOCALE)} ${t(n === 1 ? one : many)}`;
}
