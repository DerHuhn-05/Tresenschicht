import { useEffect, useRef, useState } from 'react';
import { api, type CheckIn, type CheckInRefusal, type NearbyPub } from '../api';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/ui';
import { BadgeGrid } from '../components/Badges';
import { badgesOf, gained, type Badge } from '../lib/badges';
import { countdown, formatDistance, relativeTime } from '../lib/format';
import { distanceM, type LatLon } from '../lib/geo';
import { DECLINE_MINUTES, LEAVE_DISTANCE_M, MAX_ACCURACY_M, REFUSAL_TEXT, SAME_PUB_HOURS } from '../lib/rules';
import { load, save } from '../lib/storage';
import { useApp, useNow } from '../state/app';
import { LOCALE, t } from '../lib/i18n';

type Phase =
  | { k: 'idle' }
  | { k: 'ask'; pub: NearbyPub; others: NearbyPub[] }
  | { k: 'choose'; pubs: NearbyPub[]; selected: string | null }
  | { k: 'saving'; pub: NearbyPub }
  | { k: 'success'; checkin: CheckIn; lockedUntil: string; nth: number; visits: number; alternatives: NearbyPub[]; badges: Badge[] }
  | { k: 'refused'; reason: CheckInRefusal; retryAt?: string };

const DECLINED_KEY = 'kneipen-declined';
type Declined = Record<string, { at: number; lat: number; lon: number }>;

/** „Nein“ gilt, bis du die Kneipe verlassen hast (100 m) oder 30 Minuten vergangen sind. */
function activeDeclines(pos: LatLon): Declined {
  const all = load<Declined>(DECLINED_KEY, {});
  const now = Date.now();
  const keep: Declined = {};
  for (const [id, d] of Object.entries(all)) {
    if (now - d.at < DECLINE_MINUTES * 60_000 && distanceM(pos, d) < LEAVE_DISTANCE_M) keep[id] = d;
  }
  save(DECLINED_KEY, keep);
  return keep;
}

function decline(pubs: NearbyPub[]) {
  const all = load<Declined>(DECLINED_KEY, {});
  for (const p of pubs) all[p.id] = { at: Date.now(), lat: p.lat, lon: p.lon };
  save(DECLINED_KEY, all);
}


export function CheckInFlow() {
  const app = useApp();
  const { user, location, lockedUntil, offered } = app;
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const busy = useRef(false);
  const now = useNow(phase.k === 'success');

  // C1: beim Öffnen (und bei neuem Standort) im Hintergrund prüfen, ob du in einer Kneipe bist
  useEffect(() => {
    if (!user || location.status !== 'ok' || !location.pos || phase.k !== 'idle' || busy.current) return;
    if (lockedUntil) return; // C4: während der Sperre keine Abfrage
    const pos = location.pos;
    const acc = location.accuracy ?? 999;
    if (acc > MAX_ACCURACY_M) {
      app.setHint('accuracy');
      return;
    }
    busy.current = true;
    (async () => {
      try {
        const res = await api.nearbyPubs(pos, acc);
        if (!res.inArea) return app.setHint('area');
        app.setHint(null);
        const recent = await api.checkIns();
        const blocked = new Set(recent.filter((c) => Date.now() - Date.parse(c.at) < SAME_PUB_HOURS * 3600_000).map((c) => c.pub.id));
        const declined = activeDeclines(pos);
        const pubs = res.pubs.filter((p) => !blocked.has(p.id) && !declined[p.id]);
        if (pubs.length === 1) setPhase({ k: 'ask', pub: pubs[0], others: [] });
        else if (pubs.length > 1) setPhase({ k: 'choose', pubs, selected: null });
      } catch {
        app.setHint('error');
      } finally {
        busy.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, location.fix, location.status, lockedUntil]);

  // Check-in von der Kneipen-Seite aus angeboten
  useEffect(() => {
    if (!offered?.length) return;
    setPhase(offered.length === 1 ? { k: 'ask', pub: offered[0], others: [] } : { k: 'choose', pubs: offered, selected: null });
    app.clearOffered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offered]);

  async function confirm(pub: NearbyPub, alternatives: NearbyPub[]) {
    if (!location.pos) return;
    setPhase({ k: 'saving', pub });
    try {
      // Stand vorher merken, um neu erreichte Abzeichen zu zeigen
      const before = await Promise.all([api.collection(), api.checkIns()]).then(([c, v]) => badgesOf(c, v)).catch(() => null);
      const r = await api.checkIn(pub.id, location.pos, location.accuracy ?? 999);
      if (!r.ok) return setPhase({ k: 'refused', reason: r.reason, retryAt: r.retryAt });
      const [col, all] = await Promise.all([api.collection(), api.checkIns()]);
      const visits = all.filter((c) => c.pub.id === pub.id);
      app.setLastCheckIn(r.checkin);
      app.bump();
      const badges = before ? gained(before, badgesOf(col, all)) : [];
      setPhase({ k: 'success', checkin: r.checkin, lockedUntil: r.lockedUntil, nth: col.length, visits: visits.length, alternatives, badges });
    } catch (e) {
      app.notify((e as Error).message || t('Check-in hat nicht geklappt. Versuch es noch einmal.'), 'error');
      setPhase({ k: 'idle' });
    }
  }

  function no(pubs: NearbyPub[]) {
    decline(pubs);
    setPhase({ k: 'idle' });
  }

  async function undo(p: Extract<Phase, { k: 'success' }>) {
    try {
      await api.undoCheckIn(p.checkin.id);
      decline([{ ...p.checkin.pub, distance: 0 }]);
      app.setLastCheckIn(null);
      app.bump();
      app.notify(t('Check-in zurückgenommen.'), 'success');
      const rest = p.alternatives.filter((x) => x.id !== p.checkin.pub.id);
      if (rest.length === 1) setPhase({ k: 'ask', pub: rest[0], others: [] });
      else if (rest.length > 1) setPhase({ k: 'choose', pubs: rest, selected: null });
      else setPhase({ k: 'idle' });
    } catch (e) {
      app.notify((e as Error).message, 'error');
    }
  }

  if (phase.k === 'idle') return null;

  if (phase.k === 'ask' || phase.k === 'saving') {
    const pub = phase.pub;
    const saving = phase.k === 'saving';
    return (
      <Sheet label={t('Check-in')} closable={!saving} onClose={() => no([pub])}>
        <h2 className="t-h2" tabIndex={-1}>
          {t('Bist du im {name}?', { name: pub.name })}
        </h2>
        <p className="t-secondary muted" style={{ margin: '4px 0 20px' }}>
          {pub.address ? `${pub.address}, ` : ''}
          {formatDistance(pub.distance)}
        </p>
        <button className="btn btn-primary btn-block" disabled={saving} onClick={() => confirm(pub, phase.k === 'ask' ? [pub, ...phase.others] : [pub])}>
          {saving ? t('Wird gespeichert …') : t('Ja, ich bin hier')}
        </button>
        <button className="btn btn-text btn-block" style={{ marginTop: 12 }} disabled={saving} onClick={() => no([pub])}>
          {t('Nein')}
        </button>
      </Sheet>
    );
  }

  if (phase.k === 'choose') {
    const sel = phase.pubs.find((p) => p.id === phase.selected);
    return (
      <Sheet label={t('Check-in: Kneipe wählen')} onClose={() => no(phase.pubs)}>
        <h2 className="t-h2" tabIndex={-1} style={{ marginBottom: 16 }}>
          {t('Wo bist du?')}
        </h2>
        <ul className="list" role="radiogroup" aria-label={t('Kneipen in der Nähe')} style={{ marginBottom: 16 }}>
          {phase.pubs.map((p) => {
            const on = p.id === phase.selected;
            return (
              <li key={p.id}>
                <button className={`list-row${on ? ' selected' : ''}`} role="radio" aria-checked={on} onClick={() => setPhase({ ...phase, selected: p.id })}>
                  <div className="grow">
                    <div className="title">{p.name}</div>
                    <div className="sub">{formatDistance(p.distance)}</div>
                  </div>
                  <span className="radio" aria-hidden="true">
                    {on && <Icon name="check" size={16} />}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button className="list-row" onClick={() => no(phase.pubs)}>
              <div className="grow">
                <div className="title">{t('Keine davon')}</div>
              </div>
              <span className="radio" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <button className="btn btn-primary btn-block" disabled={!sel} onClick={() => sel && confirm(sel, phase.pubs)}>
          {t('Hier einchecken')}
        </button>
        {!sel && <p className="t-caption muted" style={{ marginTop: 8 }}>{t('Wähle zuerst eine Kneipe.')}</p>}
      </Sheet>
    );
  }

  if (phase.k === 'refused') {
    return (
      <Sheet label={t('Check-in nicht möglich')} onClose={() => setPhase({ k: 'idle' })}>
        <div className="row-gap" style={{ marginBottom: 8 }}>
          <span className="danger-text">
            <Icon name={phase.reason === 'lock' || phase.reason === 'same_pub' ? 'clock' : 'warning'} />
          </span>
          <h2 className="t-h2" tabIndex={-1}>
            {t('Check-in nicht möglich')}
          </h2>
        </div>
        <p>{REFUSAL_TEXT[phase.reason]}</p>
        {phase.retryAt && <p className="muted t-secondary" style={{ marginTop: 8 }}>{t('Wieder möglich {time} Uhr.', { time: new Date(phase.retryAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) })}</p>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={() => setPhase({ k: 'idle' })}>
          {t('Verstanden')}
        </button>
      </Sheet>
    );
  }

  // Erfolg
  const p = phase;
  const canUndo = Date.parse(p.lockedUntil) > now;
  return (
    <Sheet label={t('Eingecheckt')} onClose={() => setPhase({ k: 'idle' })}>
      <div className="success-hero" aria-live="polite">
        <span className="success-mark">
          <Icon name="checkin" size={32} />
        </span>
        <h2 className="t-display" tabIndex={-1}>
          {t('Eingecheckt!')}
        </h2>
        <p className="t-h3">{p.checkin.pub.name}</p>
        <p className="muted">
          {p.visits > 1 ? t('Dein {n}. Check-in hier.', { n: p.visits }) : t('Neu in deiner Sammlung.')}{' '}
          {t(p.nth === 1 ? 'Du hast jetzt {n} Kneipe.' : 'Du hast jetzt {n} Kneipen.', { n: p.nth })}
        </p>
      </div>
      {p.badges.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="t-body-strong" style={{ marginBottom: 8 }}>{t(p.badges.length === 1 ? 'Neues Abzeichen' : 'Neue Abzeichen')}</p>
          <BadgeGrid badges={p.badges} />
        </div>
      )}
      <div className="btn-stack" style={{ marginTop: 20 }}>
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            setPhase({ k: 'idle' });
            app.push({ kind: 'details', checkinId: p.checkin.id });
          }}
        >
          {t('Details hinzufügen')}
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => setPhase({ k: 'idle' })}>
          {t('Fertig')}
        </button>
      </div>
      {canUndo && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row-gap muted t-secondary">
            <Icon name="clock" size={20} />
            <span>{t('Nächster Check-in in {time}', { time: countdown(p.lockedUntil, now) })}</span>
          </div>
          <button className="btn btn-text" style={{ paddingLeft: 0 }} onClick={() => undo(p)}>
            {t('Falsche Kneipe? Zurücknehmen')}
          </button>
        </div>
      )}
      <p className="sr-only">{t('Eingecheckt')} {relativeTime(p.checkin.at)}.</p>
    </Sheet>
  );
}
