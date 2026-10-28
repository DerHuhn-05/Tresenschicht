export interface LatLon {
  lat: number;
  lon: number;
}

export function distanceM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Grobe Umrisse für den Demo-Modus. Im Betrieb prüft der Server mit echten Ländergrenzen (PostGIS).
const WORK_AREA: [number, number][] = [
  [-5.2, 48.4], [2.5, 51.1], [3.3, 51.4], [4.7, 53.6], [8.0, 57.8], [10.7, 57.8], [15.3, 55.3],
  [18.0, 55.0], [23.0, 54.4], [24.2, 50.8], [22.6, 49.0], [18.9, 49.5], [17.2, 48.0], [16.9, 47.7],
  [16.1, 46.8], [13.7, 46.5], [12.2, 46.9], [10.5, 46.3], [9.0, 45.8], [7.0, 45.9], [7.7, 43.8],
  [3.1, 42.4], [-1.8, 43.3], [-1.4, 46.2], [-4.9, 47.9],
];

export function inWorkArea(p: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = WORK_AREA.length - 1; i < WORK_AREA.length; j = i++) {
    const [xi, yi] = WORK_AREA[i];
    const [xj, yj] = WORK_AREA[j];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
