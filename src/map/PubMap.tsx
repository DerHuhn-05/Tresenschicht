import maplibregl, { type GeoJSONSource, type LayerSpecification, type Map as MlMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Supercluster from 'supercluster';
import type { Bounds, CountryTotal, Pub, PubCell, PubTile } from '../api';
import type { LatLon } from '../lib/geo';
import { tokenColor } from '../lib/theme';
import { COUNTRY_ZOOM, DETAIL_ZOOM, PIN_ZOOM, tilesFor } from '../lib/tiles';
import { brandStyle, fallbackStyle } from './style';
import { LOCALE, t } from '../lib/i18n';

export interface PubMapHandle {
  flyTo(pos: LatLon, zoom?: number): void;
  fit(points: LatLon[]): void;
  center(): LatLon;
}

interface Props {
  /** Feste Liste, z. B. Sammlung oder eine einzelne Kneipe. */
  pubs?: Pub[];
  /** Hauptkarte: Kneipen kachelweise vom Server (Zählfelder unter Zoom 13, einzelne Kneipen ab Zoom 13). */
  loadTile?: (z: number, x: number, y: number) => Promise<PubTile>;
  /** Weit herausgezoomt: ein Kreis je Land */
  loadCountries?: () => Promise<CountryTotal[]>;
  /** Steigt, wenn sich Kneipendaten geändert haben (dann wird neu geladen). */
  dataVersion?: number;
  collected?: Set<string>;
  selectedId?: string | null;
  onSelect?: (pub: Pub | null) => void;
  userPos?: LatLon;
  initialCenter?: LatLon;
  initialZoom?: number;
  onMapClick?: (pos: LatLon) => void;
  onMove?: (b: Bounds, center: LatLon) => void;
  label?: string;
}

// Farben für Pins und Sammel-Marker: auf der Nachtblau-Karte immer Bernstein mit Nachtblau (Design System, dunkel)
const MARKER = tokenColor('marker', 'dark');
const GLYPH = tokenColor('marker-glyph', 'dark');
const DONE = tokenColor('white', 'dark');
const RATIO = Math.min(3, Math.max(2, Math.round(globalThis.devicePixelRatio || 2)));

/** Zoomen mit 75 % der normalen Geschwindigkeit: wirkt ruhiger und flüssiger. */
const ZOOM_SPEED = 0.75;

/** Fingergeste und Mausrad langsamer machen. Die Fingergeste hat in MapLibre keine Einstellung dafür;
 *  ihr Zoom-Schritt wird deshalb pro Bewegung mit ZOOM_SPEED multipliziert. Verschieben bleibt unverändert. */
function slowDownZoom(m: MlMap) {
  m.scrollZoom.setWheelZoomRate((1 / 450) * ZOOM_SPEED);
  m.scrollZoom.setZoomRate((1 / 100) * ZOOM_SPEED);
  const pinch = (m.touchZoomRotate as any)?._touchZoom;
  if (pinch && typeof pinch._move === 'function') {
    const move = pinch._move.bind(pinch);
    pinch._move = (...args: unknown[]) => {
      const r = move(...args);
      if (r && typeof r.zoomDelta === 'number') r.zoomDelta *= ZOOM_SPEED;
      return r;
    };
  }
}

const LAYERS = ['cells-cluster', 'cells-pin', 'pubs-cluster', 'pubs-pin', 'selected-pin'];
// cluster-s, -m, -l aus dem Design System; ab 1.000 Kneipen (Länder, große Regionen) etwas größer
const clusterSize = (n: number) => (n < 10 ? 44 : n < 100 ? 52 : n < 1000 ? 60 : 68);
const clusterLabel = (n: number) =>
  n < 1000 ? String(n) : n < 10000 ? `${(Math.floor(n / 100) / 10).toLocaleString(LOCALE)}k` : `${Math.round(n / 1000)}k`;
/** Abstand in Pixeln, ab dem Kreise verschmelzen. Weit draußen großzügig (ein Land bleibt ein, zwei Kreise
 *  statt Nord und Süd), nah dran knapp (Kreise verschmelzen erst, wenn sie sich überlappen). */
const mergeRadius = (z: number) => (z <= 5 ? 120 : z === 6 ? 110 : z === 7 ? 100 : z === 8 ? 84 : z === 9 ? 66 : z === 10 ? 52 : 44);

/** Sammel-Marker als Bild mit Zahl: Bernstein-Kreis, Nachtblau-Ring und -Zahl. Braucht keine Kartenschrift.
 *  Bild-Name: cl-<Größe>-<Zahl>, z. B. cl-68-28k. */
function clusterImage(id: string) {
  const [, size, ...rest] = id.split('-');
  const s = Number(size) || 44;
  const label = rest.join('-');
  const cv = document.createElement('canvas');
  cv.width = cv.height = s * RATIO;
  const g = cv.getContext('2d')!;
  g.scale(RATIO, RATIO);
  g.fillStyle = MARKER;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = GLYPH;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 4.5, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = GLYPH;
  g.font = `800 ${label.length > 3 ? 15 : s >= 68 ? 19 : 17}px -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, s / 2, s / 2 + 1);
  return g.getImageData(0, 0, cv.width, cv.height);
}

const PIN_PATH = 'M20 0C9 0 0 8.6 0 19.4 0 33 20 48 20 48S40 33 40 19.4C40 8.6 31 0 20 0Z';
const GLYPH_PATHS = [
  'M3.5 9.5 5 4.5h14l1.5 5a2.83 2.83 0 0 1-5.67 0 2.83 2.83 0 0 1-5.66 0 2.83 2.83 0 0 1-5.67 0Z',
  'M5 12.5v7h14v-7',
  'M10 19.5v-3.5a2 2 0 0 1 4 0v3.5',
];
/** Noch nicht besucht: gedämpftes Blaugrau, damit besuchte Kneipen (Bernstein) herausstechen */
const OPEN = tokenColor('navy-300', 'dark');
const EDGE = tokenColor('navy-950', 'dark');

/** Pin-Form aus dem Design System. Besucht: Bernstein mit Haken oben rechts (nicht nur Farbe),
 *  noch nicht besucht: Blaugrau ohne Haken. Dunkler Rand, damit sich überlappende Pins trennen lassen. */
function pinImage(done: boolean) {
  const w = 44;
  const h = 52;
  const cv = document.createElement('canvas');
  cv.width = w * RATIO;
  cv.height = h * RATIO;
  const g = cv.getContext('2d')!;
  g.scale(RATIO, RATIO);
  g.translate(1, 3);
  const pin = new Path2D(PIN_PATH);
  g.fillStyle = done ? MARKER : OPEN;
  g.fill(pin);
  g.strokeStyle = EDGE;
  g.lineWidth = 1.5;
  g.stroke(pin);
  g.save();
  g.translate(8, 7);
  g.strokeStyle = GLYPH;
  g.fillStyle = GLYPH;
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  GLYPH_PATHS.forEach((d, i) => {
    const path = new Path2D(d);
    if (i === 0) g.fill(path);
    g.stroke(path);
  });
  g.restore();
  if (done) {
    g.fillStyle = GLYPH;
    g.beginPath();
    g.arc(33, 6, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = DONE;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(33, 6, 8, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(29, 6.2);
    g.lineTo(31.8, 9);
    g.lineTo(37, 3.4);
    g.stroke();
  }
  return g.getImageData(0, 0, cv.width, cv.height);
}

type FC = GeoJSON.FeatureCollection<GeoJSON.Point>;
const EMPTY: FC = { type: 'FeatureCollection', features: [] };

function pubFeature(p: Pub, done: boolean): GeoJSON.Feature<GeoJSON.Point> {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id, done } };
}

/**
 * Karte mit MapLibre. Pins und Sammel-Marker sind Kartenebenen (WebGL), damit Verschieben und Zoomen flüssig
 * bleiben. Für VoiceOver gibt es die Listenansicht mit denselben Orten.
 */
export const PubMap = forwardRef<PubMapHandle, Props>(function PubMap(
  { pubs, loadTile, loadCountries, dataVersion = 0, collected, selectedId, onSelect, userPos, initialCenter, initialZoom = 15, onMapClick, onMove, label = t('Karte der Kneipen') },
  ref
) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const nameTag = useRef<maplibregl.Marker | null>(null);
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const tiled = !!loadTile;

  // Daten, die beim Stilwechsel (Ersatzkarte) erhalten bleiben
  const index = useRef(new Map<string, Pub>()); // alle bekannten Kneipen nach id
  const detailIds = useRef(new Set<string>()); // Kneipen aus Zoom-13-Kacheln (ab PIN_ZOOM einzeln gezeigt)
  const cache = useRef(new Map<string, PubTile | 'loading'>());
  const tries = useRef(new Map<string, number>());
  const countries = useRef<CountryTotal[] | 'loading' | null>(null);
  const props = useRef({ pubs, loadTile, loadCountries, collected, selectedId, onSelect, userPos, onMapClick, onMove });
  props.current = { pubs, loadTile, loadCountries, collected, selectedId, onSelect, userPos, onMapClick, onMove };

  useImperativeHandle(ref, () => ({
    flyTo(pos, zoom) {
      map.current?.easeTo({ center: [pos.lon, pos.lat], zoom: zoom ?? Math.max(map.current.getZoom(), 15), duration: 250 });
    },
    fit(points) {
      if (!map.current || !points.length) return;
      if (points.length === 1) return void map.current.easeTo({ center: [points[0].lon, points[0].lat], zoom: 15, duration: 0 });
      const b = new maplibregl.LngLatBounds();
      points.forEach((p) => b.extend([p.lon, p.lat]));
      map.current.fitBounds(b, { padding: 64, maxZoom: 16, duration: 0 });
    },
    center() {
      const c = map.current!.getCenter();
      return { lat: c.lat, lon: c.lng };
    },
  }));

  const isDone = (id: string) => !!props.current.collected?.has(id);

  function countFeature(count: number, lat: number, lon: number, extra: Record<string, unknown> = {}): GeoJSON.Feature<GeoJSON.Point> {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { kind: 'cell', count, img: `cl-${clusterSize(count)}-${clusterLabel(count)}`, ...extra },
    };
  }

  /**
   * Feine Zählfelder des Servers nach echtem Abstand zusammenfassen. Jeder Kreis sitzt im Schwerpunkt seiner
   * Kneipen (nach Anzahl gewichtet), nicht in einem Raster; Kreise verschmelzen erst bei Überlappung.
   */
  function clusterCells(cells: PubCell[], z: number): GeoJSON.Feature<GeoJSON.Point>[] {
    type P = { n: number; la: number; lo: number; pub?: string };
    const sc = new Supercluster<P, P>({
      radius: mergeRadius(z),
      minZoom: z,
      maxZoom: z,
      map: (p) => ({ n: p.n, la: p.la, lo: p.lo }),
      reduce: (a, b) => {
        a.n += b.n;
        a.la += b.la;
        a.lo += b.lo;
      },
    });
    sc.load(
      cells.map((c) => {
        if (c.pub) index.current.set(c.pub.id, c.pub);
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
          properties: { n: c.count, la: c.lat * c.count, lo: c.lon * c.count, pub: c.count === 1 ? c.pub?.id : undefined },
        };
      })
    );
    return sc.getClusters([-180, -85, 180, 85], z).map((f) => {
      const p = f.properties as P & { cluster?: boolean };
      if (!p.cluster && p.n === 1 && p.pub) {
        return { ...pubFeature(index.current.get(p.pub)!, isDone(p.pub)), properties: { kind: 'pub', id: p.pub, done: isDone(p.pub) } };
      }
      return countFeature(p.n, p.la / p.n, p.lo / p.n);
    });
  }

  function source(id: string) {
    return map.current?.getSource(id) as GeoJSONSource | undefined;
  }

  /** Daten in die Kartenquellen schreiben. Zählfelder erscheinen Kachel für Kachel, sobald sie geladen sind. */
  function push() {
    const m = map.current;
    if (!m || !m.getSource('pubs')) return;
    if (!tiled) {
      const list = props.current.pubs ?? [];
      list.forEach((p) => index.current.set(p.id, p));
      source('pubs')!.setData({ type: 'FeatureCollection', features: list.map((p) => pubFeature(p, isDone(p.id))) });
    } else {
      const ids = [...detailIds.current];
      source('pubs')!.setData({ type: 'FeatureCollection', features: ids.map((id) => pubFeature(index.current.get(id)!, isDone(id))) });
      const z = Math.floor(m.getZoom());
      if (z < COUNTRY_ZOOM) {
        // Letzte Stufe: ein Kreis je Land, in der Landesmitte
        const list = Array.isArray(countries.current) ? countries.current : [];
        source('cells')!.setData({ type: 'FeatureCollection', features: list.map((c) => countFeature(c.count, c.lat, c.lon, { country: c.code })) });
      } else if (z < PIN_ZOOM) {
        const b = m.getBounds();
        const tiles = tilesFor({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, z, 1);
        const parts = tiles.map(([tz, tx, ty]) => cache.current.get(`${tz}/${tx}/${ty}`)).filter((t): t is PubTile => !!t && t !== 'loading');
        source('cells')!.setData({ type: 'FeatureCollection', features: clusterCells(parts.flatMap((t) => t.cells ?? []), z) });
      }
    }
    const sel = props.current.selectedId ? index.current.get(props.current.selectedId) : undefined;
    source('selected')!.setData(sel ? { type: 'FeatureCollection', features: [pubFeature(sel, isDone(sel.id))] } : EMPTY);
  }

  function pushMe() {
    const u = props.current.userPos;
    source('me')?.setData(u ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [u.lon, u.lat] }, properties: {} }] } : EMPTY);
  }

  /** Fehlende Kacheln für den Ausschnitt nachladen; geladene bleiben im Speicher. */
  function loadVisible() {
    const m = map.current;
    const load = props.current.loadTile;
    if (!m || !load) return;
    if (Math.floor(m.getZoom()) < COUNTRY_ZOOM) {
      const lc = props.current.loadCountries;
      if (lc && countries.current === null) {
        countries.current = 'loading';
        lc()
          .then((list) => ((countries.current = list), push()))
          .catch(() => ((countries.current = null), setTimeout(loadVisible, 2000)));
      }
      push();
      return;
    }
    // Ab PIN_ZOOM die Kacheln mit einzelnen Kneipen (Zoom 13) laden
    const z = Math.floor(m.getZoom()) >= PIN_ZOOM ? DETAIL_ZOOM : Math.floor(m.getZoom());
    const b = m.getBounds();
    const tiles = tilesFor({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, z, 1);
    if (tiles.length > 80) return;
    let pending = 0;
    let frame = 0;
    const redraw = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), push()));
    };
    for (const [tz, tx, ty] of tiles) {
      const key = `${tz}/${tx}/${ty}`;
      if (cache.current.has(key)) continue;
      cache.current.set(key, 'loading');
      pending++;
      load(tz, tx, ty)
        .then((t) => {
          cache.current.set(key, t);
          tries.current.delete(key);
          for (const p of t.pubs ?? []) {
            index.current.set(p.id, p);
            detailIds.current.add(p.id);
          }
          redraw();
        })
        .catch(() => {
          // Fehlgeschlagene Kachel nach kurzer Pause erneut laden (höchstens dreimal)
          cache.current.delete(key);
          const n = (tries.current.get(key) ?? 0) + 1;
          tries.current.set(key, n);
          if (n <= 3) setTimeout(loadVisible, 1500 * n);
        })
        .finally(() => {
          pending--;
        });
    }
    if (!pending) push();
  }

  function addLayers(m: MlMap) {
    if (!m.hasImage('pin')) {
      m.addImage('pin', pinImage(false), { pixelRatio: RATIO });
      m.addImage('pin-done', pinImage(true), { pixelRatio: RATIO });
    }
    if (m.getSource('pubs')) return;
    m.addSource('cells', { type: 'geojson', data: EMPTY });
    // Hauptkarte: ab PIN_ZOOM (Stadt) alle Kneipen einzeln, auch wenn sie sich überlappen.
    // Feste Listen (z. B. Sammlung) fassen überlappende Pins bis Zoom 15 zusammen.
    m.addSource('pubs', tiled ? { type: 'geojson', data: EMPTY } : { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 40, clusterMaxZoom: 15 });
    m.addSource('selected', { type: 'geojson', data: EMPTY });
    m.addSource('me', { type: 'geojson', data: EMPTY });
    const pinLayout = {
      'icon-image': ['case', ['get', 'done'], 'pin-done', 'pin'],
      'icon-anchor': 'bottom',
      'icon-offset': [1, 3],
      // in der Stadtansicht etwas kleiner, damit dichte Viertel lesbar bleiben
      'icon-size': ['interpolate', ['linear'], ['zoom'], PIN_ZOOM, 0.72, 15, 1],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      // besuchte Kneipen liegen oben
      'symbol-sort-key': ['case', ['get', 'done'], 1, 0],
    } as const;
    const clusterLayout = { 'icon-allow-overlap': true, 'icon-ignore-placement': true } as const;
    const detailMin = tiled ? PIN_ZOOM : 0;
    const layers: LayerSpecification[] = [
      // eigener Standort zuerst, also unter allen Kneipen
      { id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-radius': 11, 'circle-color': '#FFFFFF', 'circle-opacity': 0.18 } },
      { id: 'me-dot', type: 'circle', source: 'me', paint: { 'circle-radius': 6, 'circle-color': '#FFFFFF', 'circle-stroke-width': 3, 'circle-stroke-color': tokenColor('navy-700', 'dark') } },
      { id: 'cells-cluster', type: 'symbol', source: 'cells', maxzoom: PIN_ZOOM, filter: ['==', ['get', 'kind'], 'cell'], layout: { ...clusterLayout, 'icon-image': ['get', 'img'] } },
      { id: 'cells-pin', type: 'symbol', source: 'cells', maxzoom: PIN_ZOOM, filter: ['==', ['get', 'kind'], 'pub'], layout: pinLayout as any },
      {
        id: 'pubs-cluster', type: 'symbol', source: 'pubs', minzoom: detailMin, filter: ['has', 'point_count'],
        layout: {
          ...clusterLayout,
          'icon-image': [
            'concat', 'cl-',
            ['case', ['<', ['get', 'point_count'], 10], '44', ['<', ['get', 'point_count'], 100], '52', ['<', ['get', 'point_count'], 1000], '60', '68'],
            '-',
            ['case', ['>', ['get', 'point_count'], 999], ['concat', ['to-string', ['round', ['/', ['get', 'point_count'], 1000]]], 'k'], ['to-string', ['get', 'point_count']]],
          ],
        },
      },
      { id: 'pubs-pin', type: 'symbol', source: 'pubs', minzoom: detailMin, filter: ['!', ['has', 'point_count']], layout: pinLayout as any },
      { id: 'selected-pin', type: 'symbol', source: 'selected', layout: { ...(pinLayout as any), 'icon-size': 1.2, 'symbol-sort-key': 0 } },
    ];
    layers.forEach((l) => m.addLayer(l));
  }

  useEffect(() => {
    const start = initialCenter ?? props.current.userPos ?? { lat: 51.16, lon: 10.45 };
    const m = new maplibregl.Map({
      container: box.current!,
      style: brandStyle(),
      center: [start.lon, start.lat],
      zoom: initialCenter || props.current.userPos ? initialZoom : 5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 19,
      fadeDuration: 0,
    });
    m.touchZoomRotate.disableRotation();
    slowDownZoom(m);
    map.current = m;

    let tilesOk = false;
    const goOffline = () => {
      if (tilesOk || !map.current || offlineRef.current) return;
      offlineRef.current = true;
      setOffline(true);
      m.setStyle(fallbackStyle(), { diff: false });
    };
    const failTimer = setTimeout(goOffline, 7000);
    m.on('sourcedata', (e) => {
      if (e.sourceId === 'omt' && e.isSourceLoaded) tilesOk = true;
    });
    m.on('error', (e: any) => {
      const msg = String(e?.error?.message ?? '');
      if (!tilesOk && (e.sourceId === 'omt' || /openfreemap|tile|Failed to fetch|NetworkError/i.test(msg))) goOffline();
    });
    m.on('styleimagemissing', (e) => {
      if (e.id.startsWith('cl-') && !m.hasImage(e.id)) m.addImage(e.id, clusterImage(e.id), { pixelRatio: RATIO });
    });
    m.on('style.load', () => {
      addLayers(m);
      push();
      pushMe();
      loadVisible();
    });

    const hit = (pt: maplibregl.Point): MapGeoJSONFeature | undefined => {
      const layers = LAYERS.filter((l) => m.getLayer(l));
      const pad = 10; // größere Tippfläche als das sichtbare Symbol
      return m.queryRenderedFeatures([[pt.x - pad, pt.y - pad], [pt.x + pad, pt.y + pad]], { layers })[0];
    };
    m.on('click', async (e) => {
      const f = hit(e.point);
      if (!f) {
        props.current.onSelect?.(null);
        props.current.onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        return;
      }
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const pr = f.properties as Record<string, any>;
      if (pr.kind === 'cell' && pr.country) {
        m.easeTo({ center: [lon, lat], zoom: COUNTRY_ZOOM + 0.6, duration: 400 });
      } else if (pr.kind === 'cell') {
        m.easeTo({ center: [lon, lat], zoom: Math.min(m.getZoom() + 2, PIN_ZOOM + 0.5), duration: 300 });
      } else if (pr.point_count) {
        const zoom = await (m.getSource('pubs') as GeoJSONSource).getClusterExpansionZoom(pr.cluster_id);
        m.easeTo({ center: [lon, lat], zoom: Math.min(zoom + 0.3, 18), duration: 300 });
      } else if (pr.id) {
        props.current.onSelect?.(index.current.get(pr.id) ?? null);
      }
    });
    m.on('mousemove', (e) => {
      m.getCanvas().style.cursor = hit(e.point) ? 'pointer' : '';
    });
    m.on('moveend', () => {
      loadVisible();
      const b = m.getBounds();
      const c = m.getCenter();
      props.current.onMove?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, { lat: c.lat, lon: c.lng });
    });

    return () => {
      clearTimeout(failTimer);
      nameTag.current?.remove();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feste Liste geändert oder gesammelte Kneipen geändert: neu zeichnen
  useEffect(() => {
    push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubs, collected, selectedId]);

  // Kneipendaten auf dem Server geändert (z. B. neue Kneipe freigegeben): Kacheln neu laden
  const firstVersion = useRef(dataVersion);
  useEffect(() => {
    if (dataVersion === firstVersion.current) return;
    cache.current.clear();
    detailIds.current.clear();
    countries.current = null;
    loadVisible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Name der gewählten Kneipe über dem Pin (Auswahl hängt nie nur an Größe oder Farbe)
  useEffect(() => {
    const m = map.current;
    nameTag.current?.remove();
    nameTag.current = null;
    const sel = selectedId ? index.current.get(selectedId) : undefined;
    if (!m || !sel) return;
    const el = document.createElement('div');
    el.className = 'mk-name';
    el.textContent = sel.name;
    el.setAttribute('aria-hidden', 'true');
    nameTag.current = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -64] }).setLngLat([sel.lon, sel.lat]).addTo(m);
  }, [selectedId]);

  // Eigener Standort als Kartenebene unter Pins und Kreisen, damit er keine Zahlen verdeckt
  useEffect(() => {
    pushMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  return (
    <>
      <div className="map-fallback" aria-hidden="true" />
      <div ref={box} className="map" role="region" aria-label={label} />
      <div className="map-attrib">© OpenStreetMap contributors{offline ? ` · ${t('Kartenbild offline')}` : ''}</div>
    </>
  );
});
