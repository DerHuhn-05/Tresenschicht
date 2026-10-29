import type { Badge } from '../lib/badges';
import { Icon } from './Icon';

/** Abzeichen als Kacheln: erreichte in Bernstein, offene gedämpft mit Fortschritt (nicht nur über Farbe). */
export function BadgeGrid({ badges, onlyEarned = false }: { badges: Badge[]; onlyEarned?: boolean }) {
  const list = onlyEarned ? badges.filter((b) => b.earned) : badges;
  if (!list.length) return <p className="muted">Noch keine Abzeichen.</p>;
  return (
    <ul className="badges" aria-label="Abzeichen">
      {list.map((b) => (
        <li key={b.id} className={`badge-tile${b.earned ? ' is-earned' : ''}`} aria-label={`${b.title}: ${b.text}. ${b.earned ? 'Erreicht' : `${b.value} von ${b.goal}`}`}>
          <span className="badge-icon" aria-hidden="true">
            <Icon name={b.icon} size={24} muted={!b.earned} />
          </span>
          <span className="badge-title">{b.title}</span>
          <span className="badge-text">{b.earned ? b.text : `${b.value} / ${b.goal}`}</span>
          {b.earned && (
            <span className="badge-check" aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
