import { useEffect, useState } from 'react';
import { api, NOTIFY_DEFAULTS, type AppNotification, type NotifyPrefKey, type NotifyPrefs } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { Empty, Notice, Page, Spinner } from '../components/ui';
import { relativeTime } from '../lib/format';
import { t } from '../lib/i18n';
import { disablePush, enablePush, pushState, setBadge, type PushState } from '../lib/push';
import { useApp, type Route } from '../state/app';

/** Titel und Text einer Mitteilung in der gewählten Sprache */
export function noteText(n: AppNotification): { title: string; body: string; icon: IconName } {
  const d = n.data;
  switch (n.kind) {
    case 'friend_request':
      return { title: t('Neue Freundschaftsanfrage'), body: t('@{name} möchte mit dir befreundet sein.', { name: d.username ?? '' }), icon: 'friend-add' };
    case 'friend_accepted':
      return { title: t('Anfrage angenommen'), body: t('@{name} und du seid jetzt befreundet.', { name: d.username ?? '' }), icon: 'friends' };
    case 'pub_approved':
      return d.edit_kind === 'neu'
        ? { title: t('Kneipe freigegeben'), body: t('„{name}“ ist geprüft und jetzt für alle auf der Karte.', { name: d.pub_name ?? '' }), icon: 'success' }
        : { title: t('Vorschlag übernommen'), body: t('Dein Vorschlag zu „{name}“ wurde übernommen.', { name: d.pub_name ?? '' }), icon: 'success' };
    case 'pub_rejected':
      return { title: t('Vorschlag nicht übernommen'), body: t('Deinen Vorschlag „{name}“ haben wir nicht übernommen.', { name: d.pub_name ?? '' }), icon: 'info' };
    case 'friend_checkin':
      return { title: t('@{name} ist eingecheckt', { name: d.username ?? '' }), body: t('im {pub}', { pub: d.pub_name ?? '' }), icon: 'checkin' };
    case 'review':
      return { title: t('Neuer Vorschlag zum Prüfen'), body: `${d.pub_name ?? ''} · @${d.username ?? ''}`, icon: 'flag' };
  }
}

/** Wohin ein Tipp auf die Mitteilung führt */
export function noteRoute(n: AppNotification): Route | null {
  if ((n.kind === 'friend_request' || n.kind === 'friend_accepted' || n.kind === 'friend_checkin') && n.data.user_id) return { kind: 'user', id: n.data.user_id };
  if (n.kind === 'review') return { kind: 'review' };
  if (n.data.pub_id) return { kind: 'pub', id: n.data.pub_id };
  return null;
}

export function NotificationsScreen() {
  const app = useApp();
  const [list, setList] = useState<AppNotification[] | null>(null);
  useEffect(() => {
    api.notifications().then((l) => {
      setList(l);
      // Öffnen der Liste gilt als gelesen
      if (l.some((n) => !n.read)) api.markNotificationsRead().then(() => app.bump()).catch(() => {});
      setBadge(0);
    }).catch(() => setList([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Page onBack={app.pop} title={t('Mitteilungen')} right={
      <button className="icon-btn" aria-label={t('Mitteilungen einstellen')} onClick={() => app.push({ kind: 'notifySettings' })}>
        <Icon name="settings" />
      </button>
    }>
      {!list ? <Spinner /> : list.length === 0 ? (
        <Empty icon="bell" title={t('Noch keine Mitteilungen')} text={t('Hier erscheinen Freundschaftsanfragen, Neuigkeiten zu deinen Vorschlägen und, wenn du willst, Check-ins deiner Freunde.')} />
      ) : (
        <ul className="list">
          {list.map((n) => {
            const x = noteText(n);
            const r = noteRoute(n);
            return (
              <li key={n.id}>
                <button className={`list-row${n.read ? '' : ' unread'}`} onClick={() => r && app.push(r)} disabled={!r}>
                  <Icon name={x.icon} muted={n.read} />
                  <div className="grow">
                    <div className="title">{x.title}</div>
                    <div className="sub">{x.body} · {relativeTime(n.at)}</div>
                  </div>
                  {r && <span className="chev"><Icon name="chevron-right" /></span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

const PREFS: { key: NotifyPrefKey; label: string; admin?: boolean }[] = [
  { key: 'friend_request', label: 'Neue Freundschaftsanfrage' },
  { key: 'friend_accepted', label: 'Anfrage angenommen' },
  { key: 'pub_approved', label: 'Deine vorgeschlagene Kneipe wurde geprüft' },
  { key: 'friend_checkin', label: 'Ein Freund hat eingecheckt' },
  { key: 'review', label: 'Neuer Vorschlag zum Prüfen', admin: true },
];

export function NotifySettings() {
  const app = useApp();
  const [prefs, setPrefs] = useState<NotifyPrefs>(NOTIFY_DEFAULTS);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.notifyPrefs().then(setPrefs).catch(() => {});
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  async function toggle(k: NotifyPrefKey) {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try {
      await api.setNotifyPrefs(next);
    } catch (e) {
      setPrefs(prefs);
      app.notify((e as Error).message, 'error');
    }
  }

  async function push(on: boolean) {
    setBusy(true);
    try {
      const s = on ? await enablePush() : await disablePush();
      setState(s);
      if (on && s === 'on') app.notify(t('Push-Mitteilungen sind auf diesem Gerät an.'), 'success');
      if (on && s === 'denied') app.notify(t('Mitteilungen sind für die App nicht erlaubt.'), 'error');
    } catch (e) {
      app.notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page onBack={app.pop} title={t('Mitteilungen')}>
      <h1 className="t-h2" style={{ marginBottom: 16 }}>{t('Mitteilungen')}</h1>

      <section>
        <h2 className="t-h3 section-title">{t('Push auf diesem Gerät')}</h2>
        {state === null ? <Spinner /> : state === 'on' ? (
          <div className="stack">
            <Notice icon="success">{t('Push-Mitteilungen sind auf diesem Gerät an.')}</Notice>
            <button className="btn btn-secondary btn-block" disabled={busy} onClick={() => push(false)}>{t('Push auf diesem Gerät ausschalten')}</button>
          </div>
        ) : state === 'off' ? (
          <div className="stack">
            <p className="muted">{t('Bekomme Mitteilungen auf den Sperrbildschirm, auch wenn die App geschlossen ist.')}</p>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={() => push(true)}>
              <Icon name="bell" size={20} /> {t('Push-Mitteilungen aktivieren')}
            </button>
          </div>
        ) : state === 'needs-home' ? (
          <Notice icon="info">{t('Auf dem iPhone gibt es Push nur in der App vom Home-Bildschirm: In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“. Danach die App von dort öffnen.')}</Notice>
        ) : state === 'denied' ? (
          <Notice icon="warning">{t('Mitteilungen sind für die App nicht erlaubt. Einstellungen → Mitteilungen → Tresenschicht → Mitteilungen erlauben.')}</Notice>
        ) : (
          <Notice icon="info">{t('Dieses Gerät oder dieser Browser unterstützt keine Push-Mitteilungen. Die Liste in der App funktioniert trotzdem.')}</Notice>
        )}
      </section>

      <section className="section">
        <h2 className="t-h3 section-title">{t('Worüber du Bescheid bekommst')}</h2>
        <div className="stack">
          {PREFS.filter((p) => !p.admin || app.user?.isAdmin).map((p) => (
            <label key={p.key} className="check-row">
              <input type="checkbox" checked={prefs[p.key]} onChange={() => toggle(p.key)} />
              <span>{t(p.label)}</span>
            </label>
          ))}
        </div>
        <p className="t-caption muted" style={{ marginTop: 12 }}>{t('Gilt für Push und für die Liste in der App.')}</p>
      </section>
    </Page>
  );
}
