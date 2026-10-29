import type { CollectionEntry } from '../api';
import { Icon, type IconName } from './Icon';
import { LOCALE, t } from '../lib/i18n';

/** Eine Kachel: Icon, Zahl, Bezeichnung. Alle Kacheln einer Reihe sind gleich groß. */
export function StatTile({ icon, n, label }: { icon: IconName; n: number; label: string }) {
  return (
    <div className="stat">
      <Icon name={icon} size={20} />
      <div className="n">{n.toLocaleString(LOCALE)}</div>
      <div className="muted t-secondary">{label}</div>
    </div>
  );
}

/**
 * Kennzahlen einer Sammlung. Hervorgehoben: wie viele verschiedene Kneipen gesammelt sind.
 * Darunter gleich große Kacheln: Check-ins (jeder Besuch zählt, auch dieselbe Kneipe mehrmals), Städte, Länder.
 */
export function StatsPanel({ entries }: { entries: CollectionEntry[] }) {
  const pubs = entries.length;
  const checkins = entries.reduce((n, e) => n + e.visits, 0);
  const cities = new Set(entries.map((e) => e.pub.city).filter(Boolean)).size;
  const countries = new Set(entries.map((e) => e.pub.country).filter(Boolean)).size;
  return (
    <div className="stats-panel">
      <div className="stat-hero">
        <span className="stat-hero-icon" aria-hidden="true"><Icon name="pub" size={28} /></span>
        <div>
          <div className="n">{pubs.toLocaleString(LOCALE)}</div>
          <div className="t-secondary">{t(pubs === 1 ? 'Kneipe gesammelt' : 'Kneipen gesammelt')}</div>
        </div>
      </div>
      <div className="stats stats-3">
        <StatTile icon="checkin" n={checkins} label={t(checkins === 1 ? 'Check-in' : 'Check-ins')} />
        <StatTile icon="city" n={cities} label={t(cities === 1 ? 'Stadt' : 'Städte')} />
        <StatTile icon="countries" n={countries} label={t(countries === 1 ? 'Land' : 'Länder')} />
      </div>
    </div>
  );
}
