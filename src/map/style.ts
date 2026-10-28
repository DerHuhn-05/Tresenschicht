import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { tokenColor, type Theme } from '../lib/theme';

const TILES = (import.meta.env.VITE_TILES_URL as string) || 'https://tiles.openfreemap.org/planet';
const GLYPHS = (import.meta.env.VITE_GLYPHS_URL as string) || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/**
 * C6: Kartenskin in den Markenfarben, bewusst reduziert. Die Karte ist Bühne für die Pins:
 * zwei, drei Flächentöne, Straßen als feine Linien ohne Rand, kaum Beschriftung, keine POIs,
 * keine Verläufe, keine Schatten. Hell: Nachtblau auf fast Weiß. Dunkel: Nachtkarte mit
 * Bernstein-Hauptstraßen wie Straßenlaternen. Schema: OpenMapTiles.
 */
export function brandStyle(theme: Theme): StyleSpecification {
  const dark = theme === 'dark';
  const c = (n: string) => tokenColor(n, dark ? 'dark' : 'light');

  const pal = dark
    ? {
        land: c('navy-950'),
        green: '#03052C', // kaum sichtbar dunkler Hauch
        water: c('navy-800'),
        building: c('navy-900'),
        minor: c('navy-700'),
        major: c('amber-500'),
        majorOpacity: 0.55,
        label: c('navy-300'),
        halo: c('navy-950'),
        border: c('navy-600'),
      }
    : {
        land: c('navy-50'),
        green: '#EAEDF3',
        water: c('navy-200'),
        building: c('navy-100'),
        minor: c('white'),
        major: c('navy-200'),
        majorOpacity: 1,
        label: c('navy-500'),
        halo: c('navy-50'),
        border: c('navy-400'),
      };
  if (theme === 'contrast') Object.assign(pal, { land: c('white'), minor: c('gray-200'), major: c('navy-400'), label: c('navy-900'), halo: c('white'), building: c('gray-100') });

  const font = ['Noto Sans Regular'];
  const width = (base: number): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'], 10, base * 0.4, 14, base * 1.6, 18, base * 9];
  const cls = (...v: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', v]];

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { omt: { type: 'vector', url: TILES } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': pal.land } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': pal.green } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('grass', 'wood'), paint: { 'fill-color': pal.green } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': pal.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 12, paint: { 'line-color': pal.water, 'line-width': 1.5 } },
      // Gebäude erst nah dran und nur als leiser Ton, damit Straßenzüge lesbar bleiben
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 15, paint: { 'fill-color': pal.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 1] } },
      {
        id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
        filter: cls('minor', 'service', 'tertiary'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': pal.minor, 'line-width': width(0.9) },
      },
      {
        id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: cls('motorway', 'trunk', 'primary', 'secondary'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': pal.major, 'line-opacity': pal.majorOpacity, 'line-width': width(1.1) },
      },
      {
        id: 'border', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2],
        paint: { 'line-color': pal.border, 'line-width': 1, 'line-dasharray': [3, 3] },
      },
      // Straßennamen nur ganz nah, Ortsteile und Städte sonst
      {
        id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 16,
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 12 },
        paint: { 'text-color': pal.label, 'text-halo-color': pal.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: cls('city', 'town', 'suburb', 'quarter'),
        layout: {
          'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name']],
          'text-font': font,
          'text-size': ['match', ['get', 'class'], 'city', 15, 'town', 14, 12],
          'text-max-width': 8,
        },
        paint: { 'text-color': pal.label, 'text-halo-color': pal.halo, 'text-halo-width': 1.5 },
      },
    ],
  };
}

/** Ersatz, wenn keine Kacheln geladen werden können: ruhige Fläche, Marker bleiben nutzbar. */
export function fallbackStyle(theme: Theme): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'land', type: 'background', paint: { 'background-color': tokenColor('bg-subtle', theme) } }] };
}
