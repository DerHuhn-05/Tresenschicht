import { useEffect, useState } from 'react';
import { api, type CheckIn, type Pub, type PubType } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { Confirm, Field, Notice, Page, PhotoPicker, Spinner } from '../components/ui';
import { formatDate, formatDistance, PUB_TYPE_LABEL, relativeTime } from '../lib/format';
import { distanceM, type LatLon } from '../lib/geo';
import { RADIUS_M } from '../lib/rules';
import { PubMap } from '../map/LazyMap';
import markerLight from '../assets/pub-marker.svg';
import { useApp } from '../state/app';

export const typeIcon = (t: PubType): IconName => (t === 'bar' ? 'bar' : t === 'biergarten' ? 'biergarten' : 'pub');

export function PubDetail({ id }: { id: string }) {
  const app = useApp();
  const [pub, setPub] = useState<Pub | null | undefined>(undefined);
  const [visits, setVisits] = useState<CheckIn[]>([]);
  const [edit, setEdit] = useState(false);
  const [closedAsk, setClosedAsk] = useState(false);

  useEffect(() => {
    api.getPub(id).then(setPub);
    api.checkIns(undefined, id).then(setVisits);
  }, [id, app.version]);

  if (pub === undefined) return <Page onBack={app.pop} title="Kneipe"><Spinner /></Page>;
  if (pub === null) return <Page onBack={app.pop} title="Kneipe"><p>Diese Kneipe gibt es nicht mehr.</p></Page>;

  const dist = app.location.pos ? distanceM(app.location.pos, pub) : null;
  const near = dist !== null && dist <= RADIUS_M + Math.min(app.location.accuracy ?? 0, 50);

  return (
    <Page onBack={app.pop} title={PUB_TYPE_LABEL[pub.type]}>
      <div className="row-gap" style={{ marginBottom: 8 }}>
        <Icon name={typeIcon(pub.type)} size={32} />
      </div>
      <h1 className="t-h1">{pub.name}</h1>
      <div className="meta">
        <span>
          <Icon name="pin" size={20} />
          {[pub.address, pub.city].filter(Boolean).join(', ')}
        </span>
        {dist !== null && <span>{formatDistance(dist)} entfernt</span>}
      </div>
      {pub.openingHours && <p className="t-secondary muted" style={{ marginTop: 8 }}>Öffnungszeiten: {pub.openingHours}</p>}
      {pub.status === 'geschlossen' && (
        <div style={{ marginTop: 16 }}>
          <Notice icon="warning">Diese Kneipe ist als geschlossen gemeldet.</Notice>
        </div>
      )}

      <div style={{ height: 180, position: 'relative', marginTop: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
        <PubMap pubs={[pub]} selectedId={pub.id} initialCenter={pub} initialZoom={16} userPos={app.location.pos} label={`Karte: ${pub.name}`} />
      </div>

      <div className="btn-stack" style={{ marginTop: 20 }}>
        {near && !app.lockedUntil && (
          <button className="btn btn-primary btn-block" onClick={() => app.offerCheckIn([{ ...pub, distance: dist! }])}>
            <Icon name="checkin" />
            Hier einchecken
          </button>
        )}
        {!near && <p className="t-caption muted">Einchecken geht vor Ort, wenn du höchstens {RADIUS_M} m entfernt bist.</p>}
      </div>

      <section className="section">
        <h2 className="t-h3 section-title">Deine Besuche</h2>
        {visits.length === 0 ? (
          <p className="muted">Du warst noch nicht hier.</p>
        ) : (
          <ul className="list">
            {visits.map((v) => (
              <li key={v.id}>
                <button className="list-row" onClick={() => app.push({ kind: 'details', checkinId: v.id })}>
                  <Icon name="calendar" />
                  <div className="grow">
                    <div className="title">{formatDate(v.at)}</div>
                    <div className="sub">{[v.details?.drink, v.details?.bartender && `Barkeeper: ${v.details.bartender}`].filter(Boolean).join(' · ') || 'Details hinzufügen'}</div>
                  </div>
                  <span className="chev"><Icon name="chevron-right" /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="t-h3 section-title">Stimmt etwas nicht?</h2>
        <ul className="list">
          <li>
            <button className="list-row" onClick={() => setEdit(true)}>
              <Icon name="edit" />
              <div className="grow"><div className="title">Änderung vorschlagen</div><div className="sub">Name oder Öffnungszeiten</div></div>
              <span className="chev"><Icon name="chevron-right" /></span>
            </button>
          </li>
          <li>
            <button className="list-row" onClick={() => setClosedAsk(true)}>
              <Icon name="flag" />
              <div className="grow"><div className="title">Geschlossen melden</div></div>
            </button>
          </li>
        </ul>
        <p className="t-caption muted" style={{ marginTop: 8 }}>Vorschläge werden geprüft, bevor alle sie sehen.</p>
      </section>
      <p className="t-legal muted" style={{ marginTop: 32 }}>
        Quelle: {pub.source === 'osm' ? '© OpenStreetMap contributors' : 'von Nutzern eingetragen'}
      </p>

      {edit && <EditPub pub={pub} onClose={() => setEdit(false)} />}
      {closedAsk && (
        <Confirm
          title="Geschlossen melden?"
          text={`Wir prüfen die Meldung. Ist ${pub.name} wirklich zu, verschwindet die Kneipe von der Karte. Deine Besuche bleiben in deiner Sammlung.`}
          confirm="Geschlossen melden"
          onCancel={() => setClosedAsk(false)}
          onConfirm={async () => {
            setClosedAsk(false);
            await api.reportClosed(pub.id);
            app.notify('Danke. Wir prüfen die Meldung.', 'success');
          }}
        />
      )}
    </Page>
  );
}

function EditPub({ pub, onClose }: { pub: Pub; onClose: () => void }) {
  const app = useApp();
  const [name, setName] = useState(pub.name);
  const [hours, setHours] = useState(pub.openingHours ?? '');
  const changed = name.trim() !== pub.name || hours.trim() !== (pub.openingHours ?? '');
  return (
    <Page onBack={onClose} title="Änderung vorschlagen">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const patch: Partial<Pub> = {};
          if (name.trim() !== pub.name) patch.name = name.trim();
          if (hours.trim() !== (pub.openingHours ?? '')) patch.openingHours = hours.trim();
          await api.proposeEdit(pub.id, patch);
          app.notify('Danke. Dein Vorschlag wird geprüft.', 'success');
          onClose();
        }}
      >
        <Field label="Name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />}</Field>
        <Field label="Öffnungszeiten" hint="Zum Beispiel: Mo–Sa 18–2 Uhr">
          {(id, d) => <input id={id} aria-describedby={d} className="input" value={hours} onChange={(e) => setHours(e.target.value)} maxLength={120} />}
        </Field>
        <button className="btn btn-primary btn-block" style={{ marginTop: 32 }} disabled={!changed || !name.trim()}>
          Vorschlag senden
        </button>
      </form>
    </Page>
  );
}

export function SearchScreen() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Pub[] | null>(null);
  useEffect(() => {
    if (!q.trim()) return setResults(null);
    const t = setTimeout(() => api.searchPubs(q).then(setResults).catch(() => setResults([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Page onBack={app.pop} title="Suchen">
      <div className="input-icon">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          placeholder="Name oder Stadt, z. B. Anker Hamburg"
          aria-label="Kneipe oder Stadt suchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          enterKeyHint="search"
        />
      </div>
      <div style={{ marginTop: 20 }}>
        {results === null ? (
          <p className="muted">Suche nach Name und Stadt. Mehrere Wörter grenzen ein.</p>
        ) : results.length === 0 ? (
          <div className="stack">
            <p>Keine Kneipe gefunden.</p>
            <button className="btn btn-secondary" onClick={() => app.push({ kind: 'addPub', pos: app.location.pos })}>
              <Icon name="pin-add" />
              Kneipe fehlt?
            </button>
          </div>
        ) : (
          <ul className="list" aria-label={`${results.length} Treffer`}>
            {results.map((p) => (
              <li key={p.id}>
                <button className="list-row" onClick={() => app.push({ kind: 'pub', id: p.id })}>
                  <Icon name={typeIcon(p.type)} />
                  <div className="grow">
                    <div className="title">{p.name}</div>
                    <div className="sub">
                      {PUB_TYPE_LABEL[p.type]} · {[p.address, p.city].filter(Boolean).join(', ')}
                      {app.location.pos ? ` · ${formatDistance(distanceM(app.location.pos, p))}` : ''}
                    </div>
                  </div>
                  <span className="chev"><Icon name="chevron-right" /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}

/** D2: Fehlende Kneipe eintragen. Landet zuerst in der Prüfliste; vorher „Meinst du …?“. */
export function AddPub({ pos }: { pos?: LatLon }) {
  const app = useApp();
  const [name, setName] = useState('');
  const [type, setType] = useState<PubType>('kneipe');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(app.user?.city ?? '');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [where, setWhere] = useState<LatLon | undefined>(pos);
  const [similar, setSimilar] = useState<Pub[] | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(force = false) {
    if (!where) return;
    if (!force) {
      const nearby = (await api.pubsInBounds({ west: where.lon - 0.003, east: where.lon + 0.003, south: where.lat - 0.002, north: where.lat + 0.002 }))
        .filter((p) => distanceM(where, p) < 120);
      const n = name.trim().toLowerCase();
      const hits = nearby.filter((p) => distanceM(where, p) < 40 || p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()));
      if (hits.length) return setSimilar(hits);
    }
    setSending(true);
    try {
      await api.proposePub({ name: name.trim(), type, lat: where.lat, lon: where.lon, address: address.trim(), city: city.trim(), photo: photo?.blob });
      app.notify('Danke. Wir prüfen die Kneipe, dann erscheint sie auf der Karte.', 'success');
      app.pop();
    } catch (e) {
      app.notify((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  if (similar) {
    return (
      <Page onBack={() => setSimilar(null)} title="Kneipe eintragen">
        <h1 className="t-h2">Meinst du eine davon?</h1>
        <p className="muted" style={{ margin: '8px 0 20px' }}>Diese Kneipen sind schon ganz in der Nähe eingetragen.</p>
        <ul className="list">
          {similar.map((p) => (
            <li key={p.id}>
              <button className="list-row" onClick={() => { app.pop(); app.push({ kind: 'pub', id: p.id }); }}>
                <Icon name={typeIcon(p.type)} />
                <div className="grow">
                  <div className="title">{p.name}</div>
                  <div className="sub">{p.address}{where ? ` · ${formatDistance(distanceM(where, p))}` : ''}</div>
                </div>
                <span className="chev"><Icon name="chevron-right" /></span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 20 }} disabled={sending} onClick={() => submit(true)}>
          Nein, {name.trim()} ist neu
        </button>
      </Page>
    );
  }

  return (
    <Page onBack={app.pop} title="Kneipe eintragen">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="muted" style={{ marginBottom: 20 }}>Neue Kneipen prüfen wir, bevor sie auf der Karte erscheinen.</p>
        <Field label="Name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="off" />}</Field>
        <div className="field">
          <span className="field-label">Art</span>
          <div className="segmented" role="group" aria-label="Art">
            {(['kneipe', 'bar', 'biergarten'] as PubType[]).map((t) => (
              <button type="button" key={t} aria-pressed={type === t} onClick={() => setType(t)}>
                {PUB_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="field-hint">Clubs kommen erst in einer späteren Version.</p>
        </div>
        <div className="field">
          <span className="field-label">Standort</span>
          <p className="t-secondary muted" style={{ marginBottom: 8 }}>Schieb die Karte, bis der Pin auf dem Eingang liegt.</p>
          <div style={{ height: 200, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '2px solid var(--border)' }}>
            <PubMap pubs={[]} initialCenter={where ?? app.location.pos} initialZoom={17} userPos={app.location.pos} onMove={(_, c) => setWhere(c)} label="Standort der neuen Kneipe wählen" />
            <img src={markerLight} alt="" width={40} height={48} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', pointerEvents: 'none' }} />
          </div>
        </div>
        <Field label="Adresse" hint="Straße und Hausnummer">
          {(id, d) => <input id={id} aria-describedby={d} className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} autoComplete="street-address" />}
        </Field>
        <Field label="Stadt">{(id) => <input id={id} className="input" value={city} onChange={(e) => setCity(e.target.value)} required maxLength={60} autoComplete="address-level2" />}</Field>
        <div className="field">
          <span className="field-label">Foto von außen (optional)</span>
          <PhotoPicker value={photo?.url} onChange={(blob, url) => setPhoto(blob && url ? { blob, url } : null)} />
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 32 }} disabled={!name.trim() || !city.trim() || !where || sending}>
          {sending ? 'Wird gesendet …' : 'Zur Prüfung senden'}
        </button>
      </form>
    </Page>
  );
}

export function ReviewQueue() {
  const app = useApp();
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.reviewQueue>> | null>(null);
  const reload = () => api.reviewQueue().then(setItems).catch((e) => app.notify(e.message, 'error'));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const kindLabel = { neu: 'Neue Kneipe', aenderung: 'Änderung', geschlossen: 'Geschlossen gemeldet' };
  return (
    <Page onBack={app.pop} title="Prüfliste" subtle>
      {!items ? <Spinner /> : items.length === 0 ? (
        <p className="muted">Nichts zu prüfen.</p>
      ) : (
        items.map((e) => (
          <div className="feed-item" key={e.id}>
            <p className="t-caption muted">{kindLabel[e.kind]} · von @{e.username} · {relativeTime(e.at)}</p>
            <h2 className="t-h3" style={{ marginTop: 4 }}>{e.kind === 'neu' ? e.proposal.name : e.pub?.name}</h2>
            {e.kind === 'neu' && <p className="t-secondary muted">{PUB_TYPE_LABEL[e.proposal.type ?? 'kneipe']} · {[e.proposal.address, e.proposal.city].filter(Boolean).join(', ')}</p>}
            {e.kind === 'aenderung' && (
              <p className="t-secondary">
                {e.proposal.name && <>Name: {e.pub?.name} → <strong>{e.proposal.name}</strong><br /></>}
                {e.proposal.openingHours && <>Öffnungszeiten: <strong>{e.proposal.openingHours}</strong></>}
              </p>
            )}
            {e.proposal.photoUrl && <img className="feed-photo" src={e.proposal.photoUrl} alt={`Foto von ${e.proposal.name}`} />}
            <div className="row-gap" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={async () => { await api.review(e.id, true); app.bump(); reload(); }}>Annehmen</button>
              <button className="btn btn-secondary" onClick={async () => { await api.review(e.id, false); reload(); }}>Ablehnen</button>
            </div>
          </div>
        ))
      )}
    </Page>
  );
}
