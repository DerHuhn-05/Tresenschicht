import { api } from '../api';
import { LANG } from './i18n';

// Web Push auf diesem Gerät. Auf dem iPhone nur in der Home-Bildschirm-App (ab iOS 16.4) und erst nach Zustimmung,
// die nur durch Antippen erfragt werden darf.
export type PushState = 'unsupported' | 'needs-home' | 'denied' | 'off' | 'on';

const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  // ohne registrierten Service Worker (z. B. lokal über http) gibt es kein Push
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('kein Service Worker');
  return reg;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return ios && !standalone ? 'needs-home' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration().catch(() => null);
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Beim Antippen aufrufen: fragt die Erlaubnis ab und meldet das Gerät an. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return ios && !standalone ? 'needs-home' : 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const key = await api.pushKey();
  if (!key) return 'unsupported';
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api.savePushSubscription(sub.toJSON(), LANG);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    await api.removePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  }
  return 'off';
}

/** Beim Öffnen der App: bestehende Anmeldung auffrischen (Sprache, neuer Schlüssel), ohne zu fragen. */
export async function refreshPush() {
  if (!supported() || Notification.permission !== 'granted') return;
  const reg = await registration().catch(() => null);
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return;
  const key = await api.pushKey().catch(() => null);
  if (key && !sameKey(sub, key)) return void enablePush().catch(() => {});
  await api.savePushSubscription(sub.toJSON(), LANG).catch(() => {});
}

function sameKey(sub: PushSubscription, key: string) {
  const own = sub.options?.applicationServerKey;
  if (!own) return true;
  const a = new Uint8Array(own);
  const b = keyBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Zahl am App-Icon setzen oder entfernen */
export function setBadge(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (n > 0) nav.setAppBadge?.(n).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}
