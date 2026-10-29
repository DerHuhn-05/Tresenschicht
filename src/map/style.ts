import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { tokenColor } from '../lib/theme';

const TILES = (import.meta.env.VITE_TILES_URL as string) || 'https://tiles.openfreemap.org/planet';
const GLYPHS = (import.meta.env.VITE_GLYPHS_URL as string) || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const c = (n: string) => tokenColor(n, 'dark');

/**
 * C6: Kartenskin in den Markenfarben, immer im Nachtblau der App (unabhängig vom Hell-/Dunkelmodus).
 * Verschiedene Blautöne trennen die Flächen: Wasser am dunkelsten, Land Nachtblau, Grün und Gebäude
 * eine Spur heller, Straßen in hellen Blautönen, Hauptstraßen mit Bernstein wie Straßenlaternen.
 * Keine Verläufe, keine Schatten, kaum Beschriftung. Schema: OpenMapTiles.
 */
export const MAP_COLORS = {
  land: c('navy-900'), // #000035
  water: c('navy-950'), // #00001F
  green: '#05093F',
  building: c('navy-800'), // #0D0F4A
  minor: c('navy-700'), // #1F2260
  major: c('navy-600'), // #363A7A
  motorway: c('amber-500'),
  label: c('navy-300'), // #A9ACD4
  halo: c('navy-900'),
  border: c('navy-400'),
};

export function brandStyle(): StyleSpecification {
  const m = MAP_COLORS;
  const font = ['Noto Sans Regular'];
  const width = (base: number): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'], 10, base * 0.4, 14, base * 1.6, 18, base * 9];
  const cls = (...v: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', v]];

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { omt: { type: 'vector', url: TILES } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': m.land } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': m.green } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: cls('grass', 'wood'), paint: { 'fill-color': m.green } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': m.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 12, paint: { 'line-color': m.water, 'line-width': 1.5 } },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 15, paint: { 'fill-color': m.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 1] } },
      {
        id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
        filter: cls('minor', 'service', 'tertiary'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': m.minor, 'line-width': width(0.9) },
      },
      {
        id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: cls('trunk', 'primary', 'secondary'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': m.major, 'line-width': width(1.1) },
      },
      {
        id: 'road-motorway', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: cls('motorway'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': m.motorway, 'line-opacity': 0.45, 'line-width': width(1.1) },
      },
      {
        id: 'border', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2],
        paint: { 'line-color': m.border, 'line-width': 1, 'line-dasharray': [3, 3] },
      },
      {
        id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 16,
        layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 12 },
        paint: { 'text-color': m.label, 'text-halo-color': m.halo, 'text-halo-width': 1.5 },
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
        paint: { 'text-color': m.label, 'text-halo-color': m.halo, 'text-halo-width': 1.5 },
      },
    ],
  };
}

/** Ersatz, wenn keine Kacheln geladen werden können: Nachtblau, Pins bleiben nutzbar. */
export function fallbackStyle(): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'land', type: 'background', paint: { 'background-color': MAP_COLORS.land } }] };
}
