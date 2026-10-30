import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type CheckIn, type NearbyPub, type User } from '../api';
import { DEMO_START } from '../api/demoData';
import type { LatLon } from '../lib/geo';
import { LOCK_MINUTES } from '../lib/rules';
import { load, save } from '../lib/storage';

export type Tab = 'map' | 'collection' | 'friends' | 'profile';

export type Route =
  | { kind: 'pub'; id: string }
  | { kind: 'search' }
  | { kind: 'addPub'; pos?: LatLon }
  | { kind: 'details'; checkinId: string }
  | { kind: 'visits'; pubId: string; userId?: string }
  | { kind: 'user'; id: string }
  | { kind: 'review' }
  | { kind: 'editProfile' }
  | { kind: 'privacy' }
  | { kind: 'impressum' }
  | { kind: 'blocked' }
  | { kind: 'datenschutz' }
  | { kind: 'locationHelp' }
  | { kind: 'help' }
  | { kind: 'notifications' }
  | { kind: 'notifySettings' };

export type LocStatus = 'off' | 'asking' | 'ok' | 'denied' | 'unavailable';

export interface LocationState {
  status: LocStatus;
  pos?: LatLon;
  accuracy?: number;
  simulated: boolean;
  /** Steigt bei jedem neuen Standort, damit die Check-in-Prüfung neu läuft. */
  fix: number;
  /** Letzte Fehlermeldung des Geräts (für die Hilfe-Seite) */
  error?: string;
}

interface Toast {
  text: string;
  kind: 'info' | 'success' | 'error';
  id: number;
}

interface AppCtx {
  user: User | null;
  setUser: (u: User | null) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  stack: Route[];
  push: (r: Route) => void;
  pop: () => void;
  reset: () => void;
  toast: Toast | null;
  notify: (text: string, kind?: Toast['kind']) => void;
  clearToast: () => void;
  location: LocationState;
  requestLocation: () => void;
  simulate: (pos: LatLon) => void;
  useRealLocation: (on: boolean) => void;
  lastCheckIn: CheckIn | null;
  lockedUntil: string | null;
  setLastCheckIn: (c: CheckIn | null) => void;
  /** Zähler: Daten haben sich geändert, Listen neu laden. */
  version: number;
  bump: () => void;
  /** Warum gerade keine Check-in-Frage kommt (für den Hinweis auf der Karte). */
  hint: CheckHint;
  setHint: (h: CheckHint) => void;
  /** Check-in für bestimmte Kneipen anbieten (z. B. aus der Kneipen-Seite). */
  offerCheckIn: (pubs: NearbyPub[]) => void;
  offered: NearbyPub[] | null;
  clearOffered: () => void;
}

export type CheckHint = null | 'accuracy' | 'area' | 'error';

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => useContext(Ctx)!;

const isDemo = api.mode === 'demo';
/** Gesetzt, sobald die App einmal nach dem Standort gefragt hat (Onboarding erledigt). */
export const LOCATION_ASKED = 'kneipen-location-asked';

export function AppProvider({ children, initialUser }: { children: ReactNode; initialUser: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [tab, setTabState] = useState<Tab>('map');
  const [stack, setStack] = useState<Route[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [version, setVersion] = useState(0);
  const [lastCheckIn, setLastCheckIn] = useState<CheckIn | null>(null);
  const [location, setLocation] = useState<LocationState>(() => {
    if (load('kneipen-location-granted', false)) save(LOCATION_ASKED, true); // ältere Version

    const simulated = isDemo && load('kneipen-demo-simulate', true);
    return simulated
      ? { status: 'ok', pos: load('kneipen-demo-pos', DEMO_START), accuracy: 15, simulated: true, fix: 1 }
      : { status: 'off', simulated: false, fix: 0 };
  });
  const watchId = useRef<number | null>(null);
  const [hint, setHint] = useState<CheckHint>(null);
  const [offered, setOffered] = useState<NearbyPub[] | null>(null);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => setToast({ text, kind, id: Date.now() }), []);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);
  const setTab = useCallback((t: Tab) => {
    setStack([]);
    setTabState(t);
  }, []);

  // H1: Standort nur, solange die App offen ist. Beim Wechsel in den Hintergrund wird die Abfrage beendet.
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopWatch = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    if (giveUp.current) clearTimeout(giveUp.current);
    giveUp.current = null;
  }, []);

  /** Home-Bildschirm-App (iOS): hat eigene Freigaben, getrennt von Safari */
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;

  // gesture: vom Antippen ausgelöst. iOS lehnt in der Home-Bildschirm-App Abfragen ohne Antippen oft still ab;
  // eine solche Ablehnung gilt nicht als endgültig, die App bittet dann ums Antippen.
  const startWatch = useCallback((gesture = false) => {
    if (!('geolocation' in navigator)) {
      setLocation((l) => ({ ...l, status: 'unavailable', error: 'Kein Standortdienst im Browser' }));
      return;
    }
    stopWatch();
    save(LOCATION_ASKED, true);
    setLocation((l) => (l.status === 'ok' ? l : { ...l, status: 'asking' }));
    const ok = (coarse: boolean) => (p: GeolocationPosition) => {
      save('kneipen-location-granted', true);
      setLocation((l) =>
        // ein grober Standort ersetzt nie einen genauen
        coarse && l.status === 'ok' && !l.simulated && (l.accuracy ?? Infinity) <= p.coords.accuracy
          ? l
          : { status: 'ok', simulated: false, pos: { lat: p.coords.latitude, lon: p.coords.longitude }, accuracy: p.coords.accuracy, fix: l.fix + 1 }
      );
    };
    const fail = (err: GeolocationPositionError) =>
      setLocation((l) => {
        const error = `${err.code}: ${err.message || 'ohne Text'}`;
        if (err.code === err.PERMISSION_DENIED) {
          if (standalone && !gesture) return { ...l, status: 'off', error };
          return { ...l, status: 'denied', error };
        }
        // Kein Signal oder Zeit abgelaufen: Die Abfrage läuft weiter, ein Standort kann noch kommen.
        // iOS meldet drinnen oft erst „nicht verfügbar“ und liefert Sekunden später doch einen Standort.
        return l.status === 'ok' ? { ...l, error } : { ...l, status: 'asking', error };
      });
    // Erst schnell ein grober Standort (WLAN, Mobilfunk), dann genau per GPS
    navigator.geolocation.getCurrentPosition(ok(true), fail, { enableHighAccuracy: false, maximumAge: 120_000, timeout: 15_000 });
    watchId.current = navigator.geolocation.watchPosition(ok(false), fail, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 });
    // Nach 45 Sekunden ohne Standort einen Hinweis zeigen; die Abfrage läuft trotzdem weiter
    giveUp.current = setTimeout(() => setLocation((l) => (l.status === 'asking' ? { ...l, status: 'unavailable' } : l)), 45_000);
  }, [stopWatch, standalone]);

  const requestLocation = useCallback(() => {
    if (location.simulated) {
      setLocation((l) => ({ ...l, fix: l.fix + 1 }));
      return;
    }
    startWatch(true);
  }, [location.simulated, startWatch]);

  const simulate = useCallback((pos: LatLon) => {
    save('kneipen-demo-pos', pos);
    setLocation((l) => ({ status: 'ok', simulated: true, pos, accuracy: 15, fix: l.fix + 1 }));
  }, []);

  const useRealLocation = useCallback(
    (on: boolean) => {
      save('kneipen-demo-simulate', !on);
      if (on) {
        setLocation((l) => ({ ...l, simulated: false, status: 'off' }));
        startWatch(true);
      } else {
        stopWatch();
        setLocation((l) => ({ status: 'ok', simulated: true, pos: load('kneipen-demo-pos', DEMO_START), accuracy: 15, fix: l.fix + 1 }));
      }
    },
    [startWatch, stopWatch]
  );

  useEffect(() => {
    if (!user || location.simulated) return;
    // iOS fragt in Web-Apps pro Sitzung neu: Wer das Onboarding hinter sich hat, bekommt die Abfrage bei jedem Öffnen.
    if (load(LOCATION_ASKED, false)) startWatch();
    // Schon in Safari erlaubt (z. B. über die Einstellungen)? Dann ohne weitere Nachfrage starten.
    let perm: PermissionStatus | null = null;
    const onPerm = () => perm?.state === 'granted' && startWatch();
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => {
        perm = p;
        if (p.state === 'granted' && !load(LOCATION_ASKED, false)) startWatch();
        p.addEventListener?.('change', onPerm);
      })
      .catch(() => {});
    const onVis = () => (document.hidden ? stopWatch() : load(LOCATION_ASKED, false) && startWatch());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      perm?.removeEventListener?.('change', onPerm);
      stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, location.simulated]);

  useEffect(() => {
    if (!user) return setLastCheckIn(null);
    api.lastCheckIn().then(setLastCheckIn).catch(() => {});
  }, [user, version]);

  const lockedUntil = useMemo(() => {
    if (!lastCheckIn) return null;
    const until = Date.parse(lastCheckIn.at) + LOCK_MINUTES * 60_000;
    return until > Date.now() ? new Date(until).toISOString() : null;
    // version sorgt für Neuberechnung nach Ablauf (siehe LockTicker)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCheckIn, version]);

  const value: AppCtx = {
    user, setUser, tab, setTab, stack, push, pop, reset, toast, notify, clearToast: () => setToast(null),
    location, requestLocation, simulate, useRealLocation, lastCheckIn, lockedUntil, setLastCheckIn, version, bump,
    hint, setHint, offerCheckIn: setOffered, offered, clearOffered: () => setOffered(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Sekundentakt für Countdowns. */
export function useNow(active = true, ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

export { isDemo };
