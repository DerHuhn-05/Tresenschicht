import type { StyleSpecification } from 'maplibre-gl';
import { tokenColor, type Theme } from '../lib/theme';

const TILES = (import.meta.env.VITE_TILES_URL as string) || 'https://tiles.openfreemap.org/planet';
const GLYPHS = (import.meta.env.VITE_GLYPHS_URL as string) || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

/**
 * C6: Kartenskin in den Markenfarben. Ruhige Flächen in Nachtblau-Tönen, Straßen hell,
 * Hauptstraßen mit Bernstein-Hauch. Keine Verläufe, keine Schatten. Schema: OpenMapTiles.
 */
export function brandStyle(theme: Theme): StyleSpecification {
  const dark = theme === 'dark';
  const c = (n: string) => tokenColor(n, dark ? 'dark' : 'light');
  const pal = dark
    ? { land: c('navy-950'), water: c('navy-800'), park: '#06083A', building: c('navy-900'), road: c('navy-700'), major: c('navy-600'), casing: c('navy-950'), label: c('gray-300'), halo: c('navy-950'), rail: c('navy-700') }
    : { land: c('navy-50'), water: c('navy-200'), park: '#E4E9EE', building: c('gray-100'), road: c('white'), major: c('amber-100'), casing: c('gray-200'), label: c('gray-600'), halo: c('white'), rail: c('gray-200') };
  if (theme === 'contrast') Object.assign(pal, { land: c('white'), water: c('navy-200'), casing: c('gray-500'), label: c('gray-700'), building: c('gray-200') });

  const font = ['Noto Sans Regular'];
  const roadWidth = (base: number): any => ['interpolate', ['exponential', 1.6], ['zoom'], 10, base * 0.3, 14, base * 1.4, 18, base * 10];

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { omt: { type: 'vector', url: TILES } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': pal.land } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': pal.park } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]], paint: { 'fill-color': pal.park, 'fill-opacity': 0.7 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': pal.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': pal.water, 'line-width': 1.5 } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': pal.building } },
      {
        id: 'road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': pal.casing, 'line-width': roadWidth(1.4), 'line-gap-width': 0 },
      },
      {
        id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': pal.road, 'line-width': roadWidth(1) },
      },
      {
        id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': pal.major, 'line-width': roadWidth(1.3) },
      },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': pal.rail, 'line-width': 1.2, 'line-dasharray': [3, 3] } },
      {
        id: 'boundary', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2],
        paint: { 'line-color': c('navy-400'), 'line-width': 1.5, 'line-dasharray': [4, 3] },
      },
      {
        id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15,
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 12 },
        paint: { 'text-color': pal.label, 'text-halo-color': pal.halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name']], 'text-font': font,
          'text-size': ['match', ['get', 'class'], 'city', 16, 'town', 14, 13],
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
