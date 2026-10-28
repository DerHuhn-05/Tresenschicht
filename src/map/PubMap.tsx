import maplibregl, { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Bounds, Pub } from '../api';
import markerDark from '../assets/pub-marker-dark.svg';
import markerLight from '../assets/pub-marker.svg';
import { PUB_TYPE_LABEL, spokenDistance } from '../lib/format';
import { distanceM, type LatLon } from '../lib/geo';
import { useTheme } from '../lib/theme';
import { brandStyle, fallbackStyle } from './style';

export interface PubMapHandle {
  flyTo(pos: LatLon, zoom?: number): void;
  fit(points: LatLon[]): void;
  center(): LatLon;
}

interface Props {
  pubs: Pub[];
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

const CLUSTER_SIZE = (n: number) => (n < 10 ? 44 : n < 100 ? 52 : 60); // cluster-s, -m, -l

/**
 * Karte mit MapLibre. Pins und Sammel-Marker sind HTML-Buttons, damit VoiceOver sie vorliest
 * („Zum Anker, Kneipe, 120 Meter“) und die Tippfläche mindestens 44 pt groß ist.
 */
export const PubMap = forwardRef<PubMapHandle, Props>(function PubMap(
  { pubs, collected, selectedId, onSelect, userPos, initialCenter, initialZoom = 15, onMapClick, onMove, label = 'Karte der Kneipen' },
  ref
) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const me = useRef<maplibregl.Marker | null>(null);
  const theme = useTheme();
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const props = useRef({ pubs, collected, selectedId, onSelect, userPos, onMapClick, onMove, theme });
  props.current = { pubs, collected, selectedId, onSelect, userPos, onMapClick, onMove, theme };

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

  function geojson(list: Pub[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: list.map((p) => ({ type: 'Feature', id: p.id, geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id } })),
    };
  }

  function addPubSource(m: MlMap) {
    if (m.getSource('pubs')) return;
    m.addSource('pubs', { type: 'geojson', data: geojson(props.current.pubs), cluster: true, clusterRadius: 44, clusterMaxZoom: 17 });
    // Unsichtbare Ebene, damit die Quelle gekachelt wird; sichtbar sind die HTML-Marker.
    m.addLayer({ id: 'pubs-anchor', type: 'circle', source: 'pubs', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });
  }

  function pinElement(p: Pub): HTMLElement {
    const el = document.createElement('button');
    el.className = 'mk mk-pin';
    el.type = 'button';
    const img = document.createElement('img');
    img.alt = '';
    el.appendChild(img);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      props.current.onSelect?.(props.current.pubs.find((x) => x.id === p.id) ?? null);
    });
    return el;
  }

  function decoratePin(el: HTMLElement, p: Pub) {
    const { selectedId, collected, userPos, theme } = props.current;
    (el.firstChild as HTMLImageElement).src = theme === 'dark' ? markerDark : markerLight;
    const sel = p.id === selectedId;
    const done = !!collected?.has(p.id);
    el.classList.toggle('is-selected', sel);
    el.setAttribute('aria-pressed', String(sel));
    const dist = userPos ? `, ${spokenDistance(distanceM(userPos, p))}` : '';
    el.setAttribute('aria-label', `${p.name}, ${PUB_TYPE_LABEL[p.type]}${dist}${done ? ', schon gesammelt' : ''}`);
    let badge = el.querySelector('.mk-done');
    if (done && !badge) {
      badge = document.createElement('span');
      badge.className = 'mk-done';
      badge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      el.appendChild(badge);
    } else if (!done && badge) badge.remove();
    let lbl = el.querySelector('.mk-label');
    if (sel && !lbl) {
      lbl = document.createElement('span');
      lbl.className = 'mk-label';
      lbl.setAttribute('aria-hidden', 'true');
      el.appendChild(lbl);
    }
    if (lbl) sel ? (lbl.textContent = p.name) : lbl.remove();
  }

  function clusterElement(id: number, count: number, lngLat: [number, number]): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'mk mk-cluster';
    const s = CLUSTER_SIZE(count);
    el.style.width = el.style.height = `${s}px`;
    el.textContent = count > 999 ? '999+' : String(count);
    el.setAttribute('aria-label', `${count} Kneipen, zum Vergrößern doppeltippen`);
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const m = map.current!;
      const zoom = await (m.getSource('pubs') as GeoJSONSource).getClusterExpansionZoom(id);
      m.easeTo({ center: lngLat, zoom: Math.min(zoom + 0.5, 18), duration: 250 });
    });
    return el;
  }

  function syncMarkers() {
    const m = map.current;
    if (!m || !m.getSource('pubs') || !m.isSourceLoaded('pubs')) return;
    const feats = m.querySourceFeatures('pubs');
    const seen = new Set<string>();
    const byId = new Map(props.current.pubs.map((p) => [p.id, p]));
    for (const f of feats) {
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const pr = f.properties as Record<string, any>;
      const key = pr.cluster ? `c-${pr.cluster_id}-${pr.point_count}` : `p-${pr.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let mk = markers.current.get(key);
      if (!mk) {
        if (pr.cluster) {
          mk = new maplibregl.Marker({ element: clusterElement(pr.cluster_id, pr.point_count, coords) }).setLngLat(coords);
        } else {
          const pub = byId.get(pr.id);
          if (!pub) continue;
          mk = new maplibregl.Marker({ element: pinElement(pub), anchor: 'bottom' }).setLngLat(coords);
        }
        mk.addTo(m);
        markers.current.set(key, mk);
      }
      if (!pr.cluster) {
        const pub = byId.get(pr.id);
        if (pub) decoratePin(mk.getElement(), pub);
        mk.getElement().style.zIndex = pr.id === props.current.selectedId ? '3' : '1';
      }
    }
    for (const [key, mk] of markers.current) {
      if (!seen.has(key)) {
        mk.remove();
        markers.current.delete(key);
      }
    }
  }

  useEffect(() => {
    const start = initialCenter ?? props.current.userPos ?? { lat: 51.16, lon: 10.45 };
    const m = new maplibregl.Map({
      container: box.current!,
      style: brandStyle(theme),
      center: [start.lon, start.lat],
      zoom: initialCenter || props.current.userPos ? initialZoom : 5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 19,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    let tilesOk = false;
    const failTimer = setTimeout(() => !tilesOk && goOffline(), 7000);
    function goOffline() {
      if (tilesOk || !map.current || offlineRef.current) return;
      offlineRef.current = true;
      setOffline(true);
      m.setStyle(fallbackStyle(props.current.theme));
    }
    m.on('sourcedata', (e) => {
      if (e.sourceId === 'omt' && e.isSourceLoaded) tilesOk = true;
    });
    m.on('error', (e: any) => {
      const msg = String(e?.error?.message ?? '');
      if (!tilesOk && (e.sourceId === 'omt' || /openfreemap|tile|Failed to fetch|NetworkError/i.test(msg))) goOffline();
    });
    m.on('style.load', () => {
      if (offlineRef.current) m.setPaintProperty('land', 'background-opacity', 0);
      addPubSource(m);
      syncMarkers();
    });
    m.on('render', syncMarkers);
    m.on('click', (e) => {
      props.current.onSelect?.(null);
      props.current.onMapClick?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    m.on('moveend', () => {
      const b = m.getBounds();
      const c = m.getCenter();
      props.current.onMove?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, { lat: c.lat, lon: c.lng });
    });
    return () => {
      clearTimeout(failTimer);
      markers.current.forEach((mk) => mk.remove());
      markers.current.clear();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Farbmodus gewechselt: Skin neu setzen (die Quelle der Kneipen kommt in style.load zurück)
  useEffect(() => {
    const m = map.current;
    if (!m || offline) return;
    m.setStyle(brandStyle(theme));
    markers.current.forEach((mk, key) => key.startsWith('p-') && mk.remove());
    [...markers.current.keys()].filter((k) => k.startsWith('p-')).forEach((k) => markers.current.delete(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    if (offline && map.current?.getLayer('land')) map.current.setPaintProperty('land', 'background-opacity', 0);
  }, [offline]);

  useEffect(() => {
    const src = map.current?.getSource('pubs') as GeoJSONSource | undefined;
    src?.setData(geojson(pubs));
  }, [pubs]);

  useEffect(() => {
    markers.current.forEach((mk, key) => {
      if (!key.startsWith('p-')) return;
      const pub = pubs.find((p) => `p-${p.id}` === key);
      if (pub) {
        decoratePin(mk.getElement(), pub);
        mk.getElement().style.zIndex = pub.id === selectedId ? '3' : '1';
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, collected, userPos, theme]);

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
      {offline && <div className="map-fallback" aria-hidden="true" />}
      <div ref={box} className="map" role="region" aria-label={label} />
      <div className="map-attrib">© OpenStreetMap contributors{offline ? ' · Kartenbild offline' : ''}</div>
    </>
  );
});
