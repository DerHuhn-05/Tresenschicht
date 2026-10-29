// Web-Mercator-Kacheln (wie bei Kartenkacheln): z/x/y. Die Karte lädt Kneipen kachelweise und merkt sie sich.
export const DETAIL_ZOOM = 13; // Kacheln ab hier mit einzelnen Kneipen, darunter Zählfelder vom Server
export const PIN_ZOOM = 12; // ab hier zeigt die Karte alle Kneipen einzeln (Stadtansicht), auch überlappend
export const COUNTRY_ZOOM = 6; // darunter ein Kreis je Land
export const CELLS_PER_TILE = 16; // feine Zählfelder (etwa 16 px), die App fasst sie nach Abstand zusammen

export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

export function latToTileY(lat: number, z: number): number {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/** Alle Kacheln einer Zoomstufe, die den Ausschnitt abdecken, plus ein Rand von `pad` Kacheln. */
export function tilesFor(b: { west: number; south: number; east: number; north: number }, z: number, pad = 1) {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, Math.floor(lonToTileX(b.west, z)) - pad);
  const x1 = Math.min(max, Math.floor(lonToTileX(b.east, z)) + pad);
  const y0 = Math.max(0, Math.floor(latToTileY(b.north, z)) - pad);
  const y1 = Math.min(max, Math.floor(latToTileY(b.south, z)) + pad);
  const out: [number, number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  return out;
}
