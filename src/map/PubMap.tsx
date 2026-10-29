import maplibregl, { type GeoJSONSource, type LayerSpecification, type Map as MlMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Bounds, Pub, PubCell, PubTile } from '../api';
import markerUrl from '../assets/pub-marker-dark.svg';
import type { LatLon } from '../lib/geo';
import { tokenColor } from '../lib/theme';
import { DETAIL_ZOOM, tilesFor } from '../lib/tiles';
import { brandStyle, fallbackStyle } from './style';

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
const clusterSize = (n: number) => (n < 10 ? 44 : n < 100 ? 52 : 60); // cluster-s, -m, -l
const clusterLabel = (n: number) => (n > 999 ? `${Math.floor(n / 1000)}k` : String(n));

/** Sammel-Marker als Bild mit Zahl: Bernstein-Kreis, Nachtblau-Ring und -Zahl. Braucht keine Kartenschrift. */
function clusterImage(label: string) {
  const n = label.endsWith('k') ? Number(label.slice(0, -1)) * 1000 : Number(label);
  const s = clusterSize(n);
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
  g.font = `800 ${label.length > 3 ? 15 : 17}px -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, s / 2, s / 2 + 1);
  return g.getImageData(0, 0, cv.width, cv.height);
}

/** Pin aus dem Design System; „gesammelt“ bekommt einen Haken oben rechts (nicht nur Farbe). */
function pinImage(img: HTMLImageElement, done: boolean) {
  const w = 44;
  const h = 50;
  const cv = document.createElement('canvas');
  cv.width = w * RATIO;
  cv.height = h * RATIO;
  const g = cv.getContext('2d')!;
  g.scale(RATIO, RATIO);
  g.drawImage(img, 0, 2, 40, 48);
  if (done) {
    g.fillStyle = GLYPH;
    g.beginPath();
    g.arc(34, 9, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = DONE;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(34, 9, 8, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(30, 9.2);
    g.lineTo(32.8, 12);
    g.lineTo(38, 6.4);
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
  { pubs, loadTile, dataVersion = 0, collected, selectedId, onSelect, userPos, initialCenter, initialZoom = 15, onMapClick, onMove, label = 'Karte der Kneipen' },
  ref
) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const me = useRef<maplibregl.Marker | null>(null);
  const nameTag = useRef<maplibregl.Marker | null>(null);
  const pin = useRef<HTMLImageElement | null>(null);
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const tiled = !!loadTile;

  // Daten, die beim Stilwechsel (Ersatzkarte) erhalten bleiben
  const index = useRef(new Map<string, Pub>()); // alle bekannten Kneipen nach id
  const detailIds = useRef(new Set<string>()); // Kneipen aus Zoom-13-Kacheln
  const cache = useRef(new Map<string, PubTile | 'loading'>());
  const tries = useRef(new Map<string, number>());
  const props = useRef({ pubs, loadTile, collected, selectedId, onSelect, userPos, onMapClick, onMove });
  props.current = { pubs, loadTile, collected, selectedId, onSelect, userPos, onMapClick, onMove };

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

  function cellFeatures(cells: PubCell[]): GeoJSON.Feature<GeoJSON.Point>[] {
    return cells.map((c) => {
      if (c.count === 1 && c.pub) {
        index.current.set(c.pub.id, c.pub);
        return { ...pubFeature(c.pub, isDone(c.pub.id)), properties: { kind: 'pub', id: c.pub.id, done: isDone(c.pub.id) } };
      }
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { kind: 'cell', count: c.count, label: clusterLabel(c.count) } };
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
      if (z < DETAIL_ZOOM) {
        const b = m.getBounds();
        const tiles = tilesFor({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, z, 1);
        const parts = tiles.map(([tz, tx, ty]) => cache.current.get(`${tz}/${tx}/${ty}`)).filter((t): t is PubTile => !!t && t !== 'loading');
        source('cells')!.setData({ type: 'FeatureCollection', features: parts.flatMap((t) => cellFeatures(t.cells ?? [])) });
      }
    }
    const sel = props.current.selectedId ? index.current.get(props.current.selectedId) : undefined;
    source('selected')!.setData(sel ? { type: 'FeatureCollection', features: [pubFeature(sel, isDone(sel.id))] } : EMPTY);
  }

  /** Fehlende Kacheln für den Ausschnitt nachladen; geladene bleiben im Speicher. */
  function loadVisible() {
    const m = map.current;
    const load = props.current.loadTile;
    if (!m || !load) return;
    const z = Math.min(Math.floor(m.getZoom()), DETAIL_ZOOM);
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
    if (pin.current && !m.hasImage('pin')) {
      const a = pinImage(pin.current, false);
      const b = pinImage(pin.current, true);
      m.addImage('pin', a, { pixelRatio: RATIO });
      m.addImage('pin-done', b, { pixelRatio: RATIO });
    }
    if (m.getSource('pubs')) return;
    m.addSource('cells', { type: 'geojson', data: EMPTY });
    m.addSource('pubs', { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 44, clusterMaxZoom: 16 });
    m.addSource('selected', { type: 'geojson', data: EMPTY });
    const pinLayout = {
      'icon-image': ['case', ['get', 'done'], 'pin-done', 'pin'],
      'icon-anchor': 'bottom',
      'icon-offset': [2, 0],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } as const;
    const clusterLayout = { 'icon-allow-overlap': true, 'icon-ignore-placement': true } as const;
    const detailMin = tiled ? DETAIL_ZOOM : 0;
    const layers: LayerSpecification[] = [
      { id: 'cells-cluster', type: 'symbol', source: 'cells', maxzoom: DETAIL_ZOOM, filter: ['==', ['get', 'kind'], 'cell'], layout: { ...clusterLayout, 'icon-image': ['concat', 'cl-', ['get', 'label']] } },
      { id: 'cells-pin', type: 'symbol', source: 'cells', maxzoom: DETAIL_ZOOM, filter: ['==', ['get', 'kind'], 'pub'], layout: pinLayout as any },
      {
        id: 'pubs-cluster', type: 'symbol', source: 'pubs', minzoom: detailMin, filter: ['has', 'point_count'],
        layout: { ...clusterLayout, 'icon-image': ['concat', 'cl-', ['case', ['>', ['get', 'point_count'], 999], ['concat', ['to-string', ['floor', ['/', ['get', 'point_count'], 1000]]], 'k'], ['to-string', ['get', 'point_count']]]] },
      },
      { id: 'pubs-pin', type: 'symbol', source: 'pubs', minzoom: detailMin, filter: ['!', ['has', 'point_count']], layout: pinLayout as any },
      { id: 'selected-pin', type: 'symbol', source: 'selected', layout: { ...(pinLayout as any), 'icon-size': 1.2 } },
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

    const img = new Image();
    img.src = markerUrl;
    img.decode().then(() => {
      pin.current = img;
      if (m.isStyleLoaded() && m.getSource('pubs')) {
        m.addImage('pin', pinImage(img, false), { pixelRatio: RATIO });
        m.addImage('pin-done', pinImage(img, true), { pixelRatio: RATIO });
      }
    });

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
      if (e.id.startsWith('cl-') && !m.hasImage(e.id)) m.addImage(e.id, clusterImage(e.id.slice(3)), { pixelRatio: RATIO });
    });
    m.on('style.load', () => {
      addLayers(m);
      push();
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
      if (pr.kind === 'cell') {
        m.easeTo({ center: [lon, lat], zoom: Math.min(m.getZoom() + 2, DETAIL_ZOOM + 0.5), duration: 300 });
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
      me.current?.remove();
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

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!userPos) {
      me.current?.remove();
      me.current = null;
      return;
    }
    if (!me.current) {
      const el = document.createElement('div');
      el.className = 'me-dot';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Dein Standort');
      me.current = new maplibregl.Marker({ element: el }).setLngLat([userPos.lon, userPos.lat]).addTo(m);
    } else me.current.setLngLat([userPos.lon, userPos.lat]);
  }, [userPos]);

  return (
    <>
      <div className="map-fallback" aria-hidden="true" />
      <div ref={box} className="map" role="region" aria-label={label} />
      <div className="map-attrib">© OpenStreetMap contributors{offline ? ' · Kartenbild offline' : ''}</div>
    </>
  );
});
