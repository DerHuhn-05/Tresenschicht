export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
}

export function spokenDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} Meter` : `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Kilometer`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  const d = Math.floor(s / 86400);
  if (d < 7) return d === 1 ? 'gestern' : `vor ${d} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function countdown(untilIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.ceil((new Date(untilIso).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const PUB_TYPE_LABEL = { kneipe: 'Kneipe', bar: 'Bar', biergarten: 'Biergarten' } as const;

export function ageFrom(birthDate: string, now = new Date()): number {
  const b = new Date(birthDate);
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}
