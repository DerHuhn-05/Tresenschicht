import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type NearbyPub, type Pub } from '../api';
import { DEMO_MULTI, DEMO_START } from '../api/demoData';
import { Icon } from '../components/Icon';
import { Notice, Sheet } from '../components/ui';
import { PubMap, type PubMapHandle } from '../map/LazyMap';
import { countdown, formatDistance, PUB_TYPE_LABEL } from '../lib/format';
import { distanceM } from '../lib/geo';
import { isDemo, useApp, useNow } from '../state/app';

export function MapScreen() {
  const app = useApp();
  const { location, lockedUntil, lastCheckIn, hint } = app;
  const mapRef = useRef<PubMapHandle>(null);
  const [list, setList] = useState<NearbyPub[] | null>(null);
  const [collected, setCollected] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Pub | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [placing, setPlacing] = useState(false);
  const [lockSheet, setLockSheet] = useState(false);
  const [center, setCenter] = useState(location.pos);
  const now = useNow(!!lockedUntil);

  useEffect(() => {
    api.collection().then((c) => setCollected(new Set(c.map((e) => e.pub.id)))).catch(() => {});
  }, [app.version]);

  // Listenansicht: die nächsten 100 Kneipen um deinen Standort oder die Kartenmitte
  const listRef = location.pos ?? center;
  useEffect(() => {
    if (view !== 'list' || !listRef) return;
    api.nearestPubs(listRef, 100).then(setList).catch((e) => app.notify((e as Error).message, 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, listRef?.lat, listRef?.lon, app.version]);

  useEffect(() => {
    if (lockedUntil && Date.parse(lockedUntil) <= now) app.bump(); // Sperre abgelaufen: neu prüfen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const sortedList = useMemo(() => (list ?? []).map((p) => ({ p, d: p.distance })), [list]);

  function locate() {
    if (location.status === 'denied') return app.push({ kind: 'locationHelp' });
    app.requestLocation();
    if (location.pos) mapRef.current?.flyTo(location.pos, 16);
  }

  const firstFix = useRef(false);
  useEffect(() => {
    if (location.pos && !firstFix.current) {
      firstFix.current = true;
      mapRef.current?.flyTo(location.pos, 16);
    }
  }, [location.pos]);

  const lockRemaining = lockedUntil ? countdown(lockedUntil, now) : null;

  return (
    <div className="map-wrap">
      {view === 'map' ? (
        <PubMap
          ref={mapRef}
          loadTile={(z, x, y) => api.pubTile(z, x, y)}
          dataVersion={app.version}
          collected={collected}
          selectedId={selected?.id}
          onSelect={setSelected}
          userPos={location.pos}
          initialCenter={location.pos}
          onMove={(_, c) => setCenter(c)}
          onMapClick={
            placing
              ? (pos) => {
                  app.simulate(pos);
                  setPlacing(false);
                  app.notify('Standort gesetzt. Die App prüft jetzt, ob du in einer Kneipe bist.');
                }
              : undefined
          }
        />
      ) : (
        <div className="screen subtle" style={{ position: 'absolute', inset: 0, paddingTop: 'calc(env(safe-area-inset-top) + 120px)' }}>
          <h1 className="t-h1" style={{ marginBottom: 16 }}>
            In der Nähe
          </h1>
          {sortedList.length === 0 ? (
            <p className="muted">Hier sind noch keine Kneipen eingetragen.</p>
          ) : (
            <ul className="list">
              {sortedList.map(({ p, d }) => (
                <li key={p.id}>
                  <button className="list-row" onClick={() => app.push({ kind: 'pub', id: p.id })}>
                    <Icon name={p.type === 'bar' ? 'bar' : p.type === 'biergarten' ? 'biergarten' : 'pub'} />
                    <div className="grow">
                      <div className="title">{p.name}</div>
                      <div className="sub">
                        {PUB_TYPE_LABEL[p.type]} · {formatDistance(d)}
                        {collected.has(p.id) ? ' · gesammelt' : ''}
                      </div>
                    </div>
                    <span className="chev">
                      <Icon name="chevron-right" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="map-top">
        <div className="row-gap" style={{ flexWrap: 'nowrap' }}>
          <button className="map-search" onClick={() => app.push({ kind: 'search' })}>
            <Icon name="search" />
            <span>Kneipe oder Stadt suchen</span>
          </button>
          <button
            className="fab"
            aria-label={view === 'map' ? 'Als Liste zeigen' : 'Als Karte zeigen'}
            onClick={() => {
              setSelected(null);
              setView(view === 'map' ? 'list' : 'map');
            }}
          >
            <Icon name={view === 'map' ? 'feed' : 'map'} />
          </button>
        </div>
        {lockRemaining && (
          <button className="pill" onClick={() => setLockSheet(true)}>
            <Icon name="clock" size={20} />
            Nächster Check-in in {lockRemaining}
          </button>
        )}
        {hint === 'accuracy' && (
          <Notice icon="warning">
            Standort zu ungenau (± {Math.round(location.accuracy ?? 0)} m).{' '}
            <button className="btn btn-text" style={{ minWidth: 0, padding: '0 4px' }} onClick={() => app.requestLocation()}>
              Noch einmal versuchen
            </button>
          </Notice>
        )}
        {hint === 'area' && <Notice>Check-ins gehen nur in Deutschland, seinen Nachbarländern und Italien. Die Karte kannst du überall ansehen.</Notice>}
        {(location.status === 'denied' || location.status === 'unavailable') && !location.simulated && (
          <Notice icon="location-off">
            Kein Standort. Öffne die Einstellungen und erlaube den Zugriff, während die App geöffnet ist.{' '}
            <button className="btn btn-text" style={{ minWidth: 0, padding: '0 4px' }} onClick={() => app.push({ kind: 'locationHelp' })}>
              So geht’s
            </button>
          </Notice>
        )}
        {location.status === 'asking' && !location.simulated && (
          <Notice icon="location">Standort wird bestimmt … Erlaube den Zugriff, wenn dein iPhone fragt.</Notice>
        )}
        {location.status === 'off' && !location.simulated && (
          <Notice icon="location">
            Für den Check-in braucht die App deinen Standort, nur solange sie offen ist.{' '}
            <button className="btn btn-text" style={{ minWidth: 0, padding: '0 4px' }} onClick={() => app.requestLocation()}>
              Standort erlauben
            </button>
          </Notice>
        )}
        {isDemo && location.simulated && view === 'map' && (
          <div className="demo-bar">
            <span>{placing ? 'Tippe auf die Karte, wo du stehst.' : 'Demo: Standort ist simuliert.'}</span>
            <button onClick={() => setPlacing(!placing)}>{placing ? 'Abbrechen' : 'Standort setzen'}</button>
            {!placing && (
              <button
                onClick={() => {
                  const multi = distanceM(location.pos ?? DEMO_START, DEMO_MULTI) > 200;
                  const pos = multi ? DEMO_MULTI : DEMO_START;
                  app.simulate(pos);
                  mapRef.current?.flyTo(pos, 17);
                }}
              >
                Andere Kneipe
              </button>
            )}
          </div>
        )}
      </div>

      {selected && view === 'map' && (
        <div className="preview-card" role="region" aria-label={`Kneipe ${selected.name}`}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <h2 className="t-h3">{selected.name}</h2>
              <p className="t-secondary muted">
                {PUB_TYPE_LABEL[selected.type]}
                {location.pos ? ` · ${formatDistance(distanceM(location.pos, selected))}` : ''}
                {collected.has(selected.id) ? ' · gesammelt' : ''}
              </p>
              <p className="t-secondary muted">{selected.address}</p>
            </div>
            <button className="icon-btn" aria-label="Schließen" onClick={() => setSelected(null)}>
              <Icon name="close" />
            </button>
          </div>
          <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => app.push({ kind: 'pub', id: selected.id })}>
            Zur Kneipe
          </button>
        </div>
      )}

      {view === 'map' && (
        <div className="map-bottom" style={{ bottom: 24 }}>
          <button className="fab" onClick={() => app.push({ kind: 'addPub', pos: location.pos ?? center })}>
            <Icon name="pin-add" />
            Kneipe fehlt?
          </button>
          <button className="fab" aria-label="Meinen Standort zeigen" onClick={locate}>
            <Icon name="location" />
          </button>
        </div>
      )}

      {lockSheet && lastCheckIn && (
        <Sheet label="Letzter Check-in" onClose={() => setLockSheet(false)}>
          <h2 className="t-h2" tabIndex={-1}>
            Eingecheckt im {lastCheckIn.pub.name}
          </h2>
          <p className="muted" style={{ margin: '8px 0 20px' }}>
            {lockRemaining ? `Der nächste Check-in ist in ${lockRemaining} möglich. ` : ''}
            Die Pause verhindert doppelte Einträge.
          </p>
          <div className="btn-stack">
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                setLockSheet(false);
                app.push({ kind: 'details', checkinId: lastCheckIn.id });
              }}
            >
              Details hinzufügen
            </button>
            {lockRemaining && (
              <button
                className="btn btn-danger btn-block"
                onClick={async () => {
                  try {
                    await api.undoCheckIn(lastCheckIn.id);
                    app.setLastCheckIn(null);
                    app.bump();
                    setLockSheet(false);
                    app.notify('Check-in zurückgenommen. Du kannst jetzt die richtige Kneipe wählen.', 'success');
                  } catch (e) {
                    app.notify((e as Error).message, 'error');
                  }
                }}
              >
                Falsche Kneipe? Zurücknehmen
              </button>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
