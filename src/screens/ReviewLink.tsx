import { useEffect, useState } from 'react';
import { api, type ReviewLinkEdit } from '../api';
import { Icon } from '../components/Icon';
import { Notice, Spinner } from '../components/ui';
import { relativeTime } from '../lib/format';

const KIND = { neu: 'Neue Kneipe', aenderung: 'Änderung', geschlossen: 'Als geschlossen gemeldet' };

/**
 * Prüfseite aus der E-Mail an tresenschicht@gmx.net. Braucht keinen Login: der Link enthält eine Signatur
 * für genau diesen Vorschlag. Erst die Knöpfe hier entscheiden, das Öffnen des Links allein ändert nichts.
 */
export function ReviewLink({ id, token }: { id: string; token: string }) {
  const [edit, setEdit] = useState<ReviewLinkEdit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'angenommen' | 'abgelehnt' | null>(null);

  useEffect(() => {
    api.reviewByLink(id, token).then(setEdit).catch((e) => setError((e as Error).message));
  }, [id, token]);

  async function decide(accept: boolean) {
    setBusy(true);
    try {
      await api.decideByLink(id, token, accept);
      setDone(accept ? 'angenommen' : 'abgelehnt');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const status = done ?? (edit && edit.status !== 'offen' ? edit.status : null);
  const map = edit?.lat != null ? `https://www.openstreetmap.org/?mlat=${edit.lat}&mlon=${edit.lon}#map=19/${edit.lat}/${edit.lon}` : null;

  return (
    <div className="app">
      <div className="screen" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}>
        <p className="t-caption muted">Tresenschicht · Prüfung</p>
        {error ? (
          <div style={{ marginTop: 16 }}><Notice icon="warning">{error}</Notice></div>
        ) : !edit ? (
          <Spinner />
        ) : (
          <>
            <p className="muted" style={{ marginTop: 16 }}>{KIND[edit.kind]} · von @{edit.username} · {relativeTime(edit.at)}</p>
            <h1 className="t-h1" style={{ marginTop: 4 }}>{edit.name}</h1>
            <ul className="list" style={{ marginTop: 16 }}>
              {edit.rows.map(([k, v]) => (
                <li key={k} className="list-row" style={{ cursor: 'default' }}>
                  <div className="grow"><div className="sub">{k}</div><div className="title">{v}</div></div>
                </li>
              ))}
            </ul>
            {map && <a className="btn btn-secondary btn-block" style={{ marginTop: 16 }} href={map} target="_blank" rel="noreferrer"><Icon name="map" size={20} /> Auf der Karte ansehen</a>}
            {edit.photoUrl && <img className="feed-photo" style={{ marginTop: 16 }} src={edit.photoUrl} alt={`Foto von ${edit.name}`} />}
            {status ? (
              <div style={{ marginTop: 24 }}>
                <Notice icon={status === 'angenommen' ? 'success' : 'info'}>
                  {status === 'angenommen'
                    ? edit.kind === 'neu' ? 'Freigegeben. Die Kneipe ist jetzt für alle auf der Karte.' : 'Übernommen.'
                    : 'Abgelehnt.'}{' '}
                  {done && '@' + edit.username + ' bekommt beim nächsten Öffnen der App Bescheid.'}
                </Notice>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
                <button className="btn btn-primary btn-block" disabled={busy} onClick={() => decide(true)}>
                  <Icon name="check" size={20} /> {edit.kind === 'neu' ? 'Freigeben' : 'Übernehmen'}
                </button>
                <button className="btn btn-secondary btn-block" disabled={busy} onClick={() => decide(false)}>
                  <Icon name="close" size={20} /> Ablehnen
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
