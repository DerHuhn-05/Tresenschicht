import type { CheckIn, CollectionEntry } from '../api';
import type { IconName } from '../components/Icon';
import { t } from './i18n';

// Abzeichen für Meilensteine. Bewusst keine Abzeichen für getrunkene Menge (Anforderungsblatt, Problemfelder).
export interface Badge {
  id: string;
  title: string;
  text: string;
  icon: IconName;
  goal: number;
  value: number;
  earned: boolean;
}

interface Stats {
  pubs: number;
  cities: number;
  countries: number;
  maxVisits: number;
  beergardens: number;
  bars: number;
  softdrinks: number;
}

export function statsOf(entries: CollectionEntry[], checkins: CheckIn[] = []): Stats {
  return {
    pubs: entries.length,
    cities: new Set(entries.map((e) => e.pub.city).filter(Boolean)).size,
    countries: new Set(entries.map((e) => e.pub.country).filter(Boolean)).size,
    maxVisits: Math.max(0, ...entries.map((e) => e.visits)),
    beergardens: entries.filter((e) => e.pub.type === 'biergarten').length,
    bars: entries.filter((e) => e.pub.type === 'bar').length,
    softdrinks: checkins.filter((c) => c.details?.drink === 'Alkoholfrei').length,
  };
}

const DEFS: { id: string; title: string; text: string; icon: IconName; goal: number; key: keyof Stats }[] = [
  { id: 'first', title: 'Erste Runde', text: 'Deine erste Kneipe', icon: 'checkin', goal: 1, key: 'pubs' },
  { id: 'pubs10', title: 'Stammtischreif', text: '10 Kneipen gesammelt', icon: 'collection', goal: 10, key: 'pubs' },
  { id: 'pubs25', title: 'Tresenkenner', text: '25 Kneipen gesammelt', icon: 'collection', goal: 25, key: 'pubs' },
  { id: 'pubs50', title: 'Kneipenkarte', text: '50 Kneipen gesammelt', icon: 'map', goal: 50, key: 'pubs' },
  { id: 'pubs100', title: 'Tresenschicht', text: '100 Kneipen gesammelt', icon: 'badge', goal: 100, key: 'pubs' },
  { id: 'cities5', title: 'Städtetour', text: 'Kneipen in 5 Städten', icon: 'city', goal: 5, key: 'cities' },
  { id: 'countries3', title: 'Grenzgänger', text: 'Kneipen in 3 Ländern', icon: 'countries', goal: 3, key: 'countries' },
  { id: 'regular', title: 'Stammgast', text: '5 Besuche in derselben Kneipe', icon: 'pub', goal: 5, key: 'maxVisits' },
  { id: 'garden', title: 'Biergartenfreund', text: '5 Biergärten gesammelt', icon: 'biergarten', goal: 5, key: 'beergardens' },
  { id: 'bars', title: 'Barhopper', text: '10 Bars gesammelt', icon: 'bar', goal: 10, key: 'bars' },
  { id: 'clear', title: 'Klarer Kopf', text: '5 Besuche mit alkoholfreiem Getränk', icon: 'softdrink', goal: 5, key: 'softdrinks' },
];

export function badgesOf(entries: CollectionEntry[], checkins: CheckIn[] = []): Badge[] {
  const s = statsOf(entries, checkins);
  return DEFS.map((d) => ({ id: d.id, title: t(d.title), text: t(d.text), icon: d.icon, goal: d.goal, value: Math.min(s[d.key], d.goal), earned: s[d.key] >= d.goal }));
}

/** Abzeichen, die zwischen zwei Ständen neu erreicht wurden (Meldung nach dem Check-in). */
export function gained(before: Badge[], after: Badge[]): Badge[] {
  const had = new Set(before.filter((b) => b.earned).map((b) => b.id));
  return after.filter((b) => b.earned && !had.has(b.id));
}
