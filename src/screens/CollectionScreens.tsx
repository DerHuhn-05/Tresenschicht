import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type CheckIn, type CollectionEntry, type Pub } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { StatsPanel } from '../components/Stats';
import { Confirm, Empty, Field, Page, PhotoPicker, Spinner } from '../components/ui';
import { formatDate, plural, relativeTime } from '../lib/format';
import { PubMap, type PubMapHandle } from '../map/LazyMap';
import { useApp } from '../state/app';
import { typeIcon } from './PubScreens';
import { t } from '../lib/i18n';

/** Getränke mit Icon aus dem Set; alkoholfrei gleichwertig in der Auswahl. */
export const DRINKS: { label: string; icon: IconName }[] = [
  { label: 'Bier', icon: 'beer' },
  { label: 'Wein', icon: 'wine' },
  { label: 'Cocktail', icon: 'cocktail' },
  { label: 'Spirituose', icon: 'whisky' },
  { label: 'Alkoholfrei', icon: 'softdrink' },
];

export function drinkIcon(drink?: string): IconName {
  return DRINKS.find((d) => d.label === drink)?.icon ?? 'note';
}

/** Sammlung als Liste oder Karte; auch für Freunde (B2). */
export function CollectionView({ entries, userId, own }: { entries: CollectionEntry[]; userId?: string; own: boolean }) {
  const app = useApp();
  const [view, setView] = useState<'list' | 'map'>('list');
  const mapRef = useRef<PubMapHandle>(null);
  const pubs = useMemo(() => entries.map((e) => e.pub), [entries]);
  const ids = useMemo(() => new Set(pubs.map((p) => p.id)), [pubs]);
  useEffect(() => {
    if (view === 'map') setTimeout(() => mapRef.current?.fit(pubs), 50);
  }, [view, pubs]);

  return (
    <>
      <div className="segmented" role="tablist" aria-label={t('Ansicht')} style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>{t('Liste')}</button>
        <button role="tab" aria-selected={view === 'map'} onClick={() => setView('map')}>{t('Karte')}</button>
      </div>
      {view === 'map' ? (
        <div style={{ height: 360, position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
          <PubMap ref={mapRef} pubs={pubs} collected={ids} initialCenter={pubs[0]} initialZoom={12} onSelect={(p) => p && app.push({ kind: 'visits', pubId: p.id, userId })} label={t('Karte der gesammelten Kneipen')} />
        </div>
      ) : (
        <ul className="list">
          {entries.map((e) => (
            <li key={e.pub.id}>
              <button className="list-row" onClick={() => app.push(own ? { kind: 'pub', id: e.pub.id } : { kind: 'visits', pubId: e.pub.id, userId })}>
                <Icon name={typeIcon(e.pub.type)} />
                <div className="grow">
                  <div className="title">{e.pub.name}</div>
                  <div className="sub">
                    {e.pub.city} · {plural(e.visits, 'Check-in', 'Check-ins')} · {relativeTime(e.lastAt)}{e.pub.status === 'zu_pruefen' ? ` · ${t('wird geprüft')}` : ''}
                  </div>
                </div>
                <span className="chev"><Icon name="chevron-right" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function CollectionScreen() {
  const app = useApp();
  const [entries, setEntries] = useState<CollectionEntry[] | null>(null);
  const [saved, setSaved] = useState<Pub[] | null>(null);
  const [tab, setTab] = useState<'visited' | 'saved'>('visited');
  useEffect(() => {
    api.collection().then(setEntries).catch((e) => app.notify(e.message, 'error'));
    api.bookmarks().then(setSaved).catch(() => setSaved([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.version]);
  const visited = new Set(entries?.map((e) => e.pub.id));

  return (
    <div className="screen">
      <h1 className="t-display page-title">{t('Meine Kneipen')}</h1>
      <div className="segmented" role="tablist" aria-label={t('Liste')} style={{ marginBottom: 20 }}>
        <button role="tab" aria-selected={tab === 'visited'} onClick={() => setTab('visited')}>{t('Besucht')}</button>
        <button role="tab" aria-selected={tab === 'saved'} onClick={() => setTab('saved')}>{t('Merkliste')}{saved?.length ? ` (${saved.length})` : ''}</button>
      </div>
      {tab === 'saved' ? (
        !saved ? <Spinner /> : saved.length === 0 ? (
          <Empty icon="bookmark" title={t('Merkliste ist leer')} text={t('Tippe bei einer Kneipe auf „Will ich hin“, dann steht sie hier.')} action={<button className="btn btn-secondary" onClick={() => app.push({ kind: 'search' })}>{t('Kneipe suchen')}</button>} />
        ) : (
          <ul className="list">
            {saved.map((p) => (
              <li key={p.id}>
                <button className="list-row" onClick={() => app.push({ kind: 'pub', id: p.id })}>
                  <Icon name="bookmark" />
                  <div className="grow">
                    <div className="title">{p.name}</div>
                    <div className="sub">{[p.city, visited.has(p.id) ? t('schon besucht') : null].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className="chev"><Icon name="chevron-right" /></span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : !entries ? <Spinner /> : entries.length === 0 ? (
        <Empty
          icon="collection"
          title={t('Noch keine Kneipe gesammelt')}
          text={t('Öffne die App, wenn du in einer Kneipe bist. Sie fragt dich dann nur: Bist du hier?')}
          action={<button className="btn btn-primary" onClick={() => app.setTab('map')}>{t('Zur Karte')}</button>}
        />
      ) : (
        <>
          <div style={{ marginBottom: 24 }}><StatsPanel entries={entries} /></div>
          <CollectionView entries={entries} own />
        </>
      )}
    </div>
  );
}

/** Besuche einer Kneipe, eigene oder die eines Freundes. */
export function VisitsScreen({ pubId, userId }: { pubId: string; userId?: string }) {
  const app = useApp();
  const [list, setList] = useState<CheckIn[] | null>(null);
  useEffect(() => {
    api.checkIns(userId, pubId).then(setList);
  }, [pubId, userId, app.version]);
  const own = !userId || userId === app.user?.id;
  return (
    <Page onBack={app.pop} title={list?.[0]?.pub.name ?? t('Check-ins')} subtle>
      {!list ? <Spinner /> : (
        <>
          <h1 className="t-h2" style={{ marginBottom: 16 }}>{plural(list.length, 'Check-in', 'Check-ins')}</h1>
          {list.map((c) => <VisitCard key={c.id} c={c} own={own} />)}
          {own && list[0] && (
            <button className="btn btn-secondary btn-block" style={{ marginTop: 20 }} onClick={() => app.push({ kind: 'pub', id: pubId })}>
              {t('Zur Kneipe')}
            </button>
          )}
        </>
      )}
    </Page>
  );
}

export function VisitCard({ c, own, by }: { c: CheckIn; own: boolean; by?: string }) {
  const app = useApp();
  const [report, setReport] = useState(false);
  const d = c.details;
  return (
    <article className="feed-item">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="t-body-strong">{by ? t('@{name} war im {pub}', { name: by, pub: c.pub.name }) : c.pub.name}</p>
          <p className="t-secondary muted">{formatDate(c.at)}</p>
        </div>
        {own ? (
          <button className="icon-btn" aria-label={t('Check-in bearbeiten')} onClick={() => app.push({ kind: 'details', checkinId: c.id })}>
            <Icon name="edit" />
          </button>
        ) : (
          <button className="icon-btn" aria-label={t('Beitrag melden')} onClick={() => setReport(true)}>
            <Icon name="flag" />
          </button>
        )}
      </div>
      {(d?.drink || d?.bartender) && (
        <div className="meta">
          {d.drink && <span><Icon name={drinkIcon(d.drink)} size={20} />{t(d.drink)}</span>}
          {d.bartender && <span><Icon name="bartender" size={20} />{d.bartender}</span>}
        </div>
      )}
      {d?.note && <p style={{ marginTop: 8 }}>{d.note}</p>}
      {d?.photoUrl && <img className="feed-photo" src={d.photoUrl} alt={d.photoAlt || (by ? t('Foto von {name} in {pub}', { name: by, pub: c.pub.name }) : t('Dein Foto in {pub}', { pub: c.pub.name }))} loading="lazy" />}
      {report && (
        <Confirm
          title={t('Beitrag melden?')}
          text={t('Melde Fotos oder Texte, die beleidigen, fremde Personen bloßstellen oder anstößig sind. Wir sehen uns den Beitrag an.')}
          confirm={t('Melden')}
          danger
          onCancel={() => setReport(false)}
          onConfirm={async () => {
            setReport(false);
            await api.reportContent(c.id, 'Nutzer-Meldung');
            app.notify(t('Danke. Wir sehen uns den Beitrag an.'), 'success');
          }}
        />
      )}
    </article>
  );
}

/** E3: Nachträglich und freiwillig: Zusatztext, Barkeeper, Getränk, Foto. */
export function DetailsScreen({ checkinId }: { checkinId: string }) {
  const app = useApp();
  const [c, setC] = useState<CheckIn | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [bartender, setBartender] = useState('');
  const [drink, setDrink] = useState('');
  const [alt, setAlt] = useState('');
  const [photo, setPhoto] = useState<{ blob: Blob | null; url: string | null } | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(false);

  useEffect(() => {
    api.checkIns().then((all) => {
      const found = all.find((x) => x.id === checkinId) ?? null;
      setC(found);
      if (found?.details) {
        setNote(found.details.note ?? '');
        setBartender(found.details.bartender ?? '');
        setDrink(found.details.drink ?? '');
        setAlt(found.details.photoAlt ?? '');
      }
    });
  }, [checkinId]);

  if (c === undefined) return <Page onBack={app.pop} title={t('Details')}><Spinner /></Page>;
  if (c === null) return <Page onBack={app.pop} title={t('Details')}><p>{t('Diesen Check-in gibt es nicht mehr.')}</p></Page>;

  const photoUrl = photo === undefined ? c.details?.photoUrl : photo.url ?? undefined;

  return (
    <Page onBack={app.pop} title={t('Details hinzufügen')}>
      <h1 className="t-h2">{c.pub.name}</h1>
      <p className="t-secondary muted" style={{ marginBottom: 24 }}>{formatDate(c.at)}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await api.saveDetails(c.id, { note: note.trim(), bartender: bartender.trim(), drink, photoAlt: alt.trim() }, photo === undefined ? undefined : photo.blob);
            app.bump();
            app.notify(t('Gespeichert.'), 'success');
            app.pop();
          } catch (err) {
            app.notify((err as Error).message, 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="field">
          <span className="field-label" id="drink-label">{t('Getränk')}</span>
          <div className="chips" role="group" aria-labelledby="drink-label">
            {DRINKS.map((d) => (
              <button type="button" key={d.label} className="chip" aria-pressed={drink === d.label} onClick={() => setDrink(drink === d.label ? '' : d.label)}>
                <Icon name={d.icon} size={20} />
                {t(d.label)}
              </button>
            ))}
          </div>
        </div>
        <Field label={t('Name des Barkeepers')}>{(id) => <input id={id} className="input" value={bartender} onChange={(e) => setBartender(e.target.value)} maxLength={60} autoComplete="off" />}</Field>
        <Field label={t('Zusatztext')} hint={t('Nur für Freunde sichtbar')}>
          {(id, d) => <textarea id={id} aria-describedby={d} className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
        </Field>
        <div className="field">
          <span className="field-label">{t('Foto')}</span>
          <PhotoPicker value={photoUrl} onChange={(blob, url) => setPhoto({ blob, url })} />
          <p className="field-hint">{t('Nur für Freunde sichtbar. Wir verkleinern das Foto und entfernen den Aufnahmeort.')}</p>
        </div>
        {photoUrl && (
          <Field label={t('Bildbeschreibung (optional)')} hint={t('Wird für Menschen vorgelesen, die das Foto nicht sehen.')}>
            {(id, d) => <input id={id} aria-describedby={d} className="input" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} />}
          </Field>
        )}
        <button className="btn btn-primary btn-block" style={{ marginTop: 32 }} disabled={saving}>
          {saving ? t('Wird gespeichert …') : t('Speichern')}
        </button>
      </form>
      <button className="btn btn-text btn-block danger-text" style={{ marginTop: 12 }} onClick={() => setDel(true)}>
        <Icon name="delete" />
        {t('Check-in löschen')}
      </button>
      {del && (
        <Confirm
          title={t('Check-in löschen?')}
          text={t('Der Check-in, das Foto und alle Angaben werden endgültig gelöscht.')}
          confirm={t('Endgültig löschen')}
          danger
          onCancel={() => setDel(false)}
          onConfirm={async () => {
            await api.deleteCheckIn(c.id);
            app.bump();
            app.notify(t('Check-in gelöscht.'), 'success');
            app.pop();
          }}
        />
      )}
    </Page>
  );
}
