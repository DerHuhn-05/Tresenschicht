import { useEffect, useState } from 'react';
import { api, type CheckIn, type Pub, type PubCategory, type PubFeature, type PubType, type ReportItem } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { Confirm, Field, Notice, Page, PhotoPicker, Spinner } from '../components/ui';
import { formatDate, formatDistance, PUB_TYPE_LABEL, relativeTime } from '../lib/format';
import { distanceM, type LatLon } from '../lib/geo';
import { GPS_ALLOWANCE_M, MAX_ACCURACY_M, RADIUS_M, REFUSAL_TEXT } from '../lib/rules';
import { PubMap } from '../map/LazyMap';
import markerLight from '../assets/pub-marker.svg';
import { useApp } from '../state/app';
import { t } from '../lib/i18n';

export const typeIcon = (ty: PubType): IconName => (ty === 'bar' ? 'bar' : ty === 'biergarten' ? 'biergarten' : 'pub');

export const FEATURE_LABEL: Record<PubFeature, string> = {
  outdoor: t('Außenbereich'),
  darts: t('Dart'),
  cards: t('Kartenzahlung'),
  wheelchair: t('Rollstuhlgerecht'),
  smoking: t('Rauchen erlaubt'),
};
/** Ausstattung als Zusatzfilter in der Suche (Rauchen steckt in der Kategorie Raucherkneipe) */
const FEATURES: PubFeature[] = ['outdoor', 'darts', 'cards', 'wheelchair'];
/** Angaben auf der Kneipenseite */
const SHOWN_FEATURES: PubFeature[] = [...FEATURES, 'smoking'];

const CATEGORIES: { id: PubCategory; label: string; icon: IconName }[] = [
  { id: 'kneipe', label: t('Kneipe'), icon: 'pub' },
  { id: 'raucherkneipe', label: t('Raucherkneipe'), icon: 'smoking' },
  { id: 'bar', label: t('Bar'), icon: 'bar' },
  { id: 'biergarten', label: t('Biergarten'), icon: 'biergarten' },
];

export function PubDetail({ id }: { id: string }) {
  const app = useApp();
  const [pub, setPub] = useState<Pub | null | undefined>(undefined);
  const [visits, setVisits] = useState<CheckIn[]>([]);
  const [edit, setEdit] = useState(false);
  const [closedAsk, setClosedAsk] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getPub(id).then(setPub);
    api.checkIns(undefined, id).then(setVisits);
    api.bookmarks().then((b) => setSaved(b.some((p) => p.id === id))).catch(() => {});
  }, [id, app.version]);

  if (pub === undefined) return <Page onBack={app.pop} title={t('Kneipe')}><Spinner /></Page>;
  if (pub === null) return <Page onBack={app.pop} title={t('Kneipe')}><p>{t('Diese Kneipe gibt es nicht mehr.')}</p></Page>;

  const dist = app.location.pos ? distanceM(app.location.pos, pub) : null;
  const near = dist !== null && dist <= RADIUS_M + Math.min(app.location.accuracy ?? 0, GPS_ALLOWANCE_M);

  return (
    <Page onBack={app.pop} title={PUB_TYPE_LABEL[pub.type]}>
      <div className="row-gap" style={{ marginBottom: 8 }}>
        <Icon name={typeIcon(pub.type)} size={32} />
      </div>
      <h1 className="t-h1">{pub.name}</h1>
      <dl className="info-rows">
        <div className="info-row">
          <Icon name="pin" size={22} />
          <div>
            <dt>{t('Adresse')}:</dt>
            <dd>
              {[pub.address, pub.city].filter(Boolean).join(', ') || '–'}
              {dist !== null && <span className="info-extra"> · {t('{d} entfernt', { d: formatDistance(dist) })}</span>}
            </dd>
          </div>
        </div>
        {pub.openingHours && (
          <div className="info-row">
            <Icon name="calendar" size={22} />
            <div>
              <dt>{t('Öffnungszeiten')}:</dt>
              <dd>{pub.openingHours}</dd>
            </div>
          </div>
        )}
      </dl>
      {SHOWN_FEATURES.some((f) => pub.features?.[f]) && (
        <ul className="chips" style={{ marginTop: 12, padding: 0, listStyle: 'none' }} aria-label={t('Ausstattung')}>
          {SHOWN_FEATURES.filter((f) => pub.features?.[f]).map((f) => (
            <li key={f} className="tag">{FEATURE_LABEL[f]}</li>
          ))}
        </ul>
      )}
      {pub.status === 'geschlossen' && (
        <div style={{ marginTop: 16 }}>
          <Notice icon="warning">{t('Diese Kneipe ist als geschlossen gemeldet.')}</Notice>
        </div>
      )}
      {pub.status === 'zu_pruefen' && (
        <div style={{ marginTop: 16 }}>
          <Notice icon="clock">{t('Neu eingetragen: Wir prüfen die Kneipe noch. Danach sehen sie alle auf der Karte.')}</Notice>
        </div>
      )}

      <div style={{ height: 180, position: 'relative', marginTop: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
        <PubMap pubs={[pub]} selectedId={pub.id} initialCenter={pub} initialZoom={16} userPos={app.location.pos} label={t('Karte: {name}', { name: pub.name })} />
      </div>

      <div className="btn-stack" style={{ marginTop: 20 }}>
        {near && !app.lockedUntil && (
          <button className="btn btn-primary btn-block" onClick={() => app.offerCheckIn([{ ...pub, distance: dist! }])}>
            <Icon name="checkin" />
            {t('Hier einchecken')}
          </button>
        )}
        {!near && <p className="t-caption muted">{t('Einchecken geht vor Ort, wenn du höchstens {n} m entfernt bist.', { n: RADIUS_M })}</p>}
        <button
          className="btn btn-secondary btn-block"
          aria-pressed={saved}
          onClick={async () => {
            const on = !saved;
            setSaved(on);
            try {
              await api.setBookmark(pub.id, on);
              app.notify(on ? t('Auf deiner Merkliste.') : t('Von der Merkliste entfernt.'), 'success');
              app.bump();
            } catch (e) {
              setSaved(!on);
              app.notify((e as Error).message, 'error');
            }
          }}
        >
          <Icon name="bookmark" />
          {saved ? t('Gemerkt') : t('Will ich hin')}
        </button>
      </div>

      <section className="section">
        <h2 className="t-h3 section-title">{t('Deine Check-ins')}</h2>
        {visits.length === 0 ? (
          <p className="muted">{t('Du warst noch nicht hier.')}</p>
        ) : (
          <ul className="list">
            {visits.map((v) => (
              <li key={v.id}>
                <button className="list-row" onClick={() => app.push({ kind: 'details', checkinId: v.id })}>
                  <Icon name="calendar" />
                  <div className="grow">
                    <div className="title">{formatDate(v.at)}</div>
                    <div className="sub">{[v.details?.drink && t(v.details.drink), v.details?.bartender && `${t('Barkeeper')}: ${v.details.bartender}`].filter(Boolean).join(' · ') || t('Details hinzufügen')}</div>
                  </div>
                  <span className="chev"><Icon name="chevron-right" /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="t-h3 section-title">{t('Stimmt etwas nicht?')}</h2>
        <ul className="list">
          <li>
            <button className="list-row" onClick={() => setEdit(true)}>
              <Icon name="edit" />
              <div className="grow"><div className="title">{t('Änderung vorschlagen')}</div><div className="sub">{t('Name oder Öffnungszeiten')}</div></div>
              <span className="chev"><Icon name="chevron-right" /></span>
            </button>
          </li>
          <li>
            <button className="list-row" onClick={() => setClosedAsk(true)}>
              <Icon name="flag" />
              <div className="grow"><div className="title">{t('Geschlossen melden')}</div></div>
            </button>
          </li>
        </ul>
        <p className="t-caption muted" style={{ marginTop: 8 }}>{t('Vorschläge werden geprüft, bevor alle sie sehen.')}</p>
      </section>
      <p className="t-legal muted" style={{ marginTop: 32 }}>
        {t('Quelle')}: {pub.source === 'osm' ? '© OpenStreetMap contributors' : t('von Nutzern eingetragen')}
      </p>

      {edit && <EditPub pub={pub} onClose={() => setEdit(false)} />}
      {closedAsk && (
        <Confirm
          title={t('Geschlossen melden?')}
          text={t('Wir prüfen die Meldung. Ist {name} wirklich zu, verschwindet die Kneipe von der Karte. Deine Check-ins bleiben in deiner Sammlung.', { name: pub.name })}
          confirm={t('Geschlossen melden')}
          onCancel={() => setClosedAsk(false)}
          onConfirm={async () => {
            setClosedAsk(false);
            await api.reportClosed(pub.id);
            app.notify(t('Danke. Wir prüfen die Meldung.'), 'success');
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
    <Page onBack={onClose} title={t('Änderung vorschlagen')}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const patch: Partial<Pub> = {};
          if (name.trim() !== pub.name) patch.name = name.trim();
          if (hours.trim() !== (pub.openingHours ?? '')) patch.openingHours = hours.trim();
          await api.proposeEdit(pub.id, patch);
          app.notify(t('Danke. Dein Vorschlag wird geprüft.'), 'success');
          onClose();
        }}
      >
        <Field label={t('Name')}>{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />}</Field>
        <Field label={t('Öffnungszeiten')} hint={t('Zum Beispiel: Mo–Sa 18–2 Uhr')}>
          {(id, d) => <input id={id} aria-describedby={d} className="input" value={hours} onChange={(e) => setHours(e.target.value)} maxLength={120} />}
        </Field>
        <button className="btn btn-primary btn-block" style={{ marginTop: 32 }} disabled={!changed || !name.trim()}>
          {t('Vorschlag senden')}
        </button>
      </form>
    </Page>
  );
}

export function SearchScreen() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<PubFeature[]>([]);
  const [category, setCategory] = useState<PubCategory | null>(null);
  const [results, setResults] = useState<Pub[] | null>(null);
  const near = app.location.pos;
  // Ohne Suchtext, aber mit Kategorie: die nächsten Treffer um deinen Standort
  const nearby = !q.trim() && !!category && !!near;
  useEffect(() => {
    if (!q.trim() && !nearby) return setResults(null);
    const timer = setTimeout(() => api.searchPubs(q, { features: filters, category, near }).then(setResults).catch(() => setResults([])), 220);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filters, category, nearby]);
  return (
    <Page onBack={app.pop} title={t('Suchen')}>
      <div className="input-icon">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          placeholder={t('Name oder Stadt, z. B. Anker Hamburg')}
          aria-label={t('Kneipe oder Stadt suchen')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          enterKeyHint="search"
        />
      </div>
      <p className="filter-label" id="cat-label">{t('Kategorie')}</p>
      <div className="chips category-chips" role="group" aria-labelledby="cat-label">
        {CATEGORIES.map((c) => {
          const on = category === c.id;
          return (
            <button key={c.id} type="button" className="chip" aria-pressed={on} onClick={() => setCategory(on ? null : c.id)}>
              <Icon name={c.icon} size={20} muted={!on} />
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="filter-label" id="feat-label">{t('Ausstattung')}</p>
      <div className="chips chips-small" role="group" aria-labelledby="feat-label">
        {FEATURES.map((f) => {
          const on = filters.includes(f);
          return (
            <button key={f} type="button" className="chip" aria-pressed={on} onClick={() => setFilters(on ? filters.filter((x) => x !== f) : [...filters, f])}>
              {on && <Icon name="check" size={16} />}
              {FEATURE_LABEL[f]}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 20 }}>
        {results === null ? (
          <p className="muted">
            {category && !near
              ? t('Gib einen Namen oder eine Stadt ein. Ohne Suchtext zeigt die Kategorie die nächsten Treffer, sobald dein Standort bekannt ist.')
              : t('Suche nach Name und Stadt oder wähle eine Kategorie für Treffer in deiner Nähe. Kategorie und Ausstattung zeigen nur Kneipen, bei denen das in OpenStreetMap eingetragen ist.')}
          </p>
        ) : results.length === 0 ? (
          <div className="stack">
            <p>{t('Keine Kneipe gefunden.')}</p>
            <button className="btn btn-secondary" onClick={() => app.push({ kind: 'addPub', pos: app.location.pos })}>
              <Icon name="pin-add" />
              {t('Kneipe fehlt?')}
            </button>
          </div>
        ) : (
          <>
          {nearby && <p className="t-secondary muted" style={{ marginBottom: 8 }}>{t('In deiner Nähe')}</p>}
          <ul className="list" aria-label={t('{n} Treffer', { n: results.length })}>
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
          </>
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

  // Vor Ort? Dann zählt das Eintragen gleich als Check-in (gleiche Regeln wie beim normalen Check-in)
  const { pos: me, accuracy } = app.location;
  const onSite = !!(me && where && accuracy != null && accuracy <= MAX_ACCURACY_M && distanceM(me, where) <= RADIUS_M + Math.min(accuracy, GPS_ALLOWANCE_M));
  const [withCheckIn, setWithCheckIn] = useState(true);
  const checkInNow = onSite && withCheckIn && !app.lockedUntil;

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
      const r = await api.proposePub({
        name: name.trim(), type, lat: where.lat, lon: where.lon, address: address.trim(), city: city.trim(), photo: photo?.blob,
        checkIn: checkInNow && me ? { pos: me, accuracy: accuracy! } : undefined,
      });
      if (r?.ok) {
        app.setLastCheckIn(r.checkin);
        app.bump();
        app.notify(t('Eingetragen und eingecheckt: {name} zählt schon in deiner Sammlung. Für alle erscheint sie nach unserer Prüfung.', { name: name.trim() }), 'success');
      } else if (r) {
        app.notify(`${t('Eingetragen, aber nicht eingecheckt.')} ${REFUSAL_TEXT[r.reason]}`, 'info');
      } else {
        app.notify(t('Danke. Wir prüfen die Kneipe, dann erscheint sie auf der Karte.'), 'success');
      }
      app.pop();
    } catch (e) {
      app.notify((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  if (similar) {
    return (
      <Page onBack={() => setSimilar(null)} title={t('Kneipe eintragen')}>
        <h1 className="t-h2">{t('Meinst du eine davon?')}</h1>
        <p className="muted" style={{ margin: '8px 0 20px' }}>{t('Diese Kneipen sind schon ganz in der Nähe eingetragen.')}</p>
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
          {t('Nein, {name} ist neu', { name: name.trim() })}
        </button>
      </Page>
    );
  }

  return (
    <Page onBack={app.pop} title={t('Kneipe eintragen')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="muted" style={{ marginBottom: 20 }}>{t('Neue Kneipen prüfen wir, bevor sie für alle auf der Karte erscheinen.')}</p>
        <Field label={t('Name')}>{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="off" />}</Field>
        <div className="field">
          <span className="field-label">{t('Art')}</span>
          <div className="segmented" role="group" aria-label={t('Art')}>
            {(['kneipe', 'bar', 'biergarten'] as PubType[]).map((ty) => (
              <button type="button" key={ty} aria-pressed={type === ty} onClick={() => setType(ty)}>
                {PUB_TYPE_LABEL[ty]}
              </button>
            ))}
          </div>
          <p className="field-hint">{t('Clubs kommen erst in einer späteren Version.')}</p>
        </div>
        <div className="field">
          <span className="field-label">{t('Standort')}</span>
          <p className="t-secondary muted" style={{ marginBottom: 8 }}>{t('Schieb die Karte, bis der Pin auf dem Eingang liegt.')}</p>
          <div style={{ height: 200, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '2px solid var(--border)' }}>
            <PubMap pubs={[]} initialCenter={where ?? app.location.pos} initialZoom={17} userPos={app.location.pos} onMove={(_, c) => setWhere(c)} label={t('Standort der neuen Kneipe wählen')} />
            <img src={markerLight} alt="" width={40} height={48} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', pointerEvents: 'none' }} />
          </div>
        </div>
        <Field label={t('Adresse')} hint={t('Straße und Hausnummer')}>
          {(id, d) => <input id={id} aria-describedby={d} className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={120} autoComplete="street-address" />}
        </Field>
        <Field label={t('Stadt')}>{(id) => <input id={id} className="input" value={city} onChange={(e) => setCity(e.target.value)} required maxLength={60} autoComplete="address-level2" />}</Field>
        <div className="field">
          <span className="field-label">{t('Foto von außen (optional)')}</span>
          <PhotoPicker value={photo?.url} onChange={(blob, url) => setPhoto(blob && url ? { blob, url } : null)} />
        </div>
        <div className="field" style={{ marginTop: 24 }}>
          {onSite ? (
            <label className="check-row">
              <input type="checkbox" checked={withCheckIn} onChange={(e) => setWithCheckIn(e.target.checked)} disabled={!!app.lockedUntil} />
              <span>
                <strong>{t('Ich bin gerade hier: gleich einchecken')}</strong>
                <span className="t-secondary muted" style={{ display: 'block' }}>
                  {app.lockedUntil ? t('Du hast gerade erst eingecheckt. Die Kneipe wird nur eingetragen.') : t('Die Kneipe zählt sofort als Check-in in deiner Sammlung.')}
                </span>
              </span>
            </label>
          ) : (
            <Notice icon="location">{t('Einchecken geht nur vor Ort. Bist du in der Kneipe, wird das Eintragen gleich zum Check-in.')}</Notice>
          )}
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!name.trim() || !city.trim() || !where || sending}>
          {checkInNow && <Icon name="checkin" size={20} />}
          {sending ? t('Wird gesendet …') : checkInNow ? t('Eintragen und einchecken') : t('Zur Prüfung senden')}
        </button>
      </form>
    </Page>
  );
}

export function ReviewQueue() {
  const app = useApp();
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.reviewQueue>> | null>(null);
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const reload = () => {
    api.reviewQueue().then(setItems).catch((e) => app.notify(e.message, 'error'));
    api.reportQueue().then(setReports).catch(() => setReports([]));
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const kindLabel = { neu: t('Neue Kneipe'), aenderung: t('Änderung'), geschlossen: t('Geschlossen gemeldet') };
  return (
    <Page onBack={app.pop} title={t('Prüfliste')} subtle>
      <h2 className="t-h3 section-title">{t('Gemeldete Beiträge')}</h2>
      {!reports ? <Spinner /> : reports.length === 0 ? (
        <p className="muted" style={{ marginBottom: 24 }}>{t('Keine Meldungen.')}</p>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {reports.map((r) => (
            <div className="feed-item" key={r.id}>
              <p className="t-caption muted">{t('Gemeldet von @{name}', { name: r.reporter })} · {relativeTime(r.at)}</p>
              <h3 className="t-body-strong" style={{ marginTop: 4 }}>{t('@{name} im {pub}', { name: r.author, pub: r.pubName })}</h3>
              {(r.drink || r.bartender) && <p className="t-secondary muted">{[r.drink && t(r.drink), r.bartender && `${t('Barkeeper')}: ${r.bartender}`].filter(Boolean).join(' · ')}</p>}
              {r.note && <p style={{ marginTop: 4 }}>{r.note}</p>}
              {r.photoUrl && <img className="feed-photo" src={r.photoUrl} alt={t('Gemeldetes Foto von {name}', { name: r.author })} />}
              {!r.note && !r.photoUrl && !r.drink && !r.bartender && <p className="muted t-secondary">{t('Der Beitrag hat keinen Text und kein Foto mehr.')}</p>}
              <div className="row-gap" style={{ marginTop: 12 }}>
                <button className="btn btn-danger" onClick={async () => { await api.resolveReport(r, true); app.notify(t('Text und Foto entfernt.'), 'success'); reload(); }}>{t('Inhalt entfernen')}</button>
                <button className="btn btn-secondary" onClick={async () => { await api.resolveReport(r, false); reload(); }}>{t('Meldung verwerfen')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <h2 className="t-h3 section-title">{t('Kneipen')}</h2>
      {!items ? <Spinner /> : items.length === 0 ? (
        <p className="muted">{t('Nichts zu prüfen.')}</p>
      ) : (
        items.map((e) => (
          <div className="feed-item" key={e.id}>
            <p className="t-caption muted">{kindLabel[e.kind]} · {t('von @{name}', { name: e.username })} · {relativeTime(e.at)}</p>
            <h2 className="t-h3" style={{ marginTop: 4 }}>{e.kind === 'neu' ? e.proposal.name : e.pub?.name}</h2>
            {e.kind === 'neu' && <p className="t-secondary muted">{PUB_TYPE_LABEL[e.proposal.type ?? 'kneipe']} · {[e.proposal.address, e.proposal.city].filter(Boolean).join(', ')}</p>}
            {e.kind === 'aenderung' && (
              <p className="t-secondary">
                {e.proposal.name && <>{t('Name')}: {e.pub?.name} → <strong>{e.proposal.name}</strong><br /></>}
                {e.proposal.openingHours && <>{t('Öffnungszeiten')}: <strong>{e.proposal.openingHours}</strong></>}
              </p>
            )}
            {e.proposal.photoUrl && <img className="feed-photo" src={e.proposal.photoUrl} alt={t('Foto von {name}', { name: e.proposal.name ?? '' })} />}
            <div className="row-gap" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={async () => { await api.review(e.id, true); app.bump(); reload(); }}>{t('Annehmen')}</button>
              <button className="btn btn-secondary" onClick={async () => { await api.review(e.id, false); reload(); }}>{t('Ablehnen')}</button>
            </div>
          </div>
        ))
      )}
    </Page>
  );
}
