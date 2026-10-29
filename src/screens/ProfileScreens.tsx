import { useEffect, useState } from 'react';
import { api, type CheckIn, type CollectionEntry, type PublicProfile } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, Confirm, Field, Notice, Page, PhotoPicker, Sheet, Spinner } from '../components/ui';
import { remove } from '../lib/storage';
import { isDemo, useApp } from '../state/app';
import { BadgeGrid } from '../components/Badges';
import { badgesOf } from '../lib/badges';
import { StatsPanel, StatTile } from '../components/Stats';
import { USERNAME } from './AuthScreens';
import { VisitCard } from './CollectionScreens';
import { LANG, plural, setLang, t, type Lang } from '../lib/i18n';

function Row({ icon, title, sub, onClick, danger }: { icon: IconName; title: string; sub?: string; onClick: () => void; danger?: boolean }) {
  return (
    <li>
      <button className={`list-row${danger ? ' danger-text' : ''}`} onClick={onClick}>
        <Icon name={icon} />
        <div className="grow">
          <div className="title">{title}</div>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {!danger && <span className="chev"><Icon name="chevron-right" /></span>}
      </button>
    </li>
  );
}

export function ProfileScreen() {
  const app = useApp();
  const u = app.user!;
  const [entries, setEntries] = useState<CollectionEntry[] | null>(null);
  const [all, setAll] = useState<CheckIn[]>([]);
  const [ask, setAsk] = useState<'logout' | 'delete' | null>(null);

  useEffect(() => {
    api.collection().then(setEntries);
    api.checkIns().then(setAll);
  }, [app.version]);
  const recent = all.slice(0, 3);
  const year = new Date().getFullYear();
  const thisYear = {
    visits: all.filter((c) => new Date(c.at).getFullYear() === year).length,
    newPubs: entries?.filter((e) => new Date(e.firstAt).getFullYear() === year).length ?? 0,
  };
  const topCities = Object.entries(
    (entries ?? []).reduce<Record<string, number>>((m, e) => {
      if (e.pub.city) m[e.pub.city] = (m[e.pub.city] ?? 0) + 1;
      return m;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const regular = entries?.slice().sort((a, b) => b.visits - a.visits)[0];
  const loc = app.location;
  const locText = loc.simulated ? t('Simuliert (Demo)') : { ok: t('Erlaubt, solange die App offen ist'), asking: t('Wird abgefragt'), denied: t('Nicht erlaubt'), unavailable: t('Nicht verfügbar'), off: t('Noch nicht erlaubt') }[loc.status];
  const [langSheet, setLangSheet] = useState(false);

  return (
    <div className="screen">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <Avatar url={u.avatarUrl} name={u.username} size="lg" />
        <div>
          <h1 className="t-h1">{u.firstName} {u.lastName}</h1>
          <p className="muted">@{u.username} · {u.city}</p>
        </div>
      </div>

      {!entries ? <Spinner /> : (
        <section className="section" style={{ marginTop: 24 }}>
          <StatsPanel entries={entries} />
          {regular && regular.visits > 1 && (
            <p className="muted t-secondary" style={{ marginTop: 12 }}>
              {t('Stammkneipe')}: <span className="accent-text" style={{ fontWeight: 600 }}>{regular.pub.name}</span> {t('mit {n} Check-ins', { n: regular.visits })}
            </p>
          )}
        </section>
      )}

      {entries && (
        <section className="section">
          <h2 className="t-h3 section-title">{year}</h2>
          <div className="stats stats-2">
            <StatTile icon="pub" n={thisYear.newPubs} label={t(thisYear.newPubs === 1 ? 'neue Kneipe' : 'neue Kneipen')} />
            <StatTile icon="checkin" n={thisYear.visits} label={t(thisYear.visits === 1 ? 'Check-in' : 'Check-ins')} />
          </div>
          {topCities.length > 0 && (
            <ul className="list" style={{ marginTop: 12 }} aria-label={t('Meistbesuchte Städte')}>
              {topCities.map(([city, n]) => (
                <li key={city} className="list-row" style={{ cursor: 'default' }}>
                  <Icon name="city" />
                  <div className="grow"><div className="title">{city}</div></div>
                  <span className="muted">{plural(n, 'Kneipe', 'Kneipen')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {entries && (
        <section className="section">
          <h2 className="t-h3 section-title">{t('Abzeichen')}</h2>
          <BadgeGrid badges={badgesOf(entries, all)} />
        </section>
      )}

      {recent.length > 0 && (
        <section className="section">
          <h2 className="t-h3 section-title">{t('Zuletzt')}</h2>
          {recent.map((c) => <VisitCard key={c.id} c={c} own />)}
        </section>
      )}

      <section className="section">
        <h2 className="t-h3 section-title">{t('Konto')}</h2>
        <ul className="list">
          <Row icon="edit" title={t('Profil bearbeiten')} sub={t('Name, Benutzername, Stadt, Profilbild')} onClick={() => app.push({ kind: 'editProfile' })} />
          <Row icon="feed" title={t('Sprache')} sub={LANG === 'de' ? 'Deutsch' : 'English'} onClick={() => setLangSheet(true)} />
          <Row icon="location" title={t('Standort')} sub={locText} onClick={() => app.push({ kind: 'locationHelp' })} />
          <Row icon="lock" title={t('Privatsphäre und Datenschutz')} sub={t('Dein Profil ist privat')} onClick={() => app.push({ kind: 'privacy' })} />
          <Row icon="close" title={t('Gesperrte Nutzer')} onClick={() => app.push({ kind: 'blocked' })} />
          {u.isAdmin && <Row icon="flag" title={t('Prüfliste')} sub={t('Neue Kneipen und Änderungen')} onClick={() => app.push({ kind: 'review' })} />}
          <Row icon="mail" title={t('Hilfe und Kontakt')} sub={t('Fragen, Probleme, Feedback')} onClick={() => app.push({ kind: 'help' })} />
          <Row icon="info" title={t('Datenschutzerklärung')} onClick={() => app.push({ kind: 'datenschutz' })} />
          <Row icon="info" title={t('Impressum')} onClick={() => app.push({ kind: 'impressum' })} />
          <Row icon="logout" title={t('Abmelden')} onClick={() => setAsk('logout')} />
          <Row icon="delete" title={t('Konto löschen')} onClick={() => setAsk('delete')} danger />
        </ul>
      </section>

      {isDemo && (
        <section className="section">
          <h2 className="t-h3 section-title">Demo</h2>
          <ul className="list">
            <Row
              icon="location"
              title={loc.simulated ? t('Echten Standort nutzen') : t('Standort simulieren')}
              sub={loc.simulated ? t('Fragt dein Gerät nach dem Standort') : t('Standort auf der Karte setzen')}
              onClick={() => app.useRealLocation(loc.simulated)}
            />
            <Row
              icon="delete"
              title={t('Demo-Daten zurücksetzen')}
              onClick={() => {
                ['kneipen-demo-db', 'kneipen-declined', 'kneipen-demo-pos'].forEach(remove);
                location.reload();
              }}
              danger
            />
          </ul>
          <p className="t-caption muted" style={{ marginTop: 8 }}>{t('Im Demo-Modus bleiben alle Daten auf diesem Gerät. Für die echte App trägst du die Supabase-Zugangsdaten ein.')}</p>
        </section>
      )}

      <p className="t-legal muted" style={{ marginTop: 32 }}>{t('Kartendaten')} © OpenStreetMap contributors (ODbL). Tresenschicht.</p>

      {ask === 'logout' && (
        <Confirm title={t('Abmelden?')} text={t('Deine Kneipen bleiben gespeichert.')} confirm={t('Abmelden')} onCancel={() => setAsk(null)}
          onConfirm={async () => { await api.signOut(); app.setUser(null); }} />
      )}
      {ask === 'delete' && (
        <Confirm
          title={t('Konto endgültig löschen?')}
          text={t('Profil, Sammlung, Check-ins, Fotos und Freundschaften werden gelöscht. Das lässt sich nicht rückgängig machen.')}
          confirm={t('Konto löschen')}
          danger
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            try {
              await api.deleteAccount();
              app.setUser(null);
            } catch (e) {
              app.notify((e as Error).message, 'error');
            }
          }}
        />
      )}
      {langSheet && (
        <Sheet label={t('Sprache')} onClose={() => setLangSheet(false)}>
          <h2 className="t-h2" tabIndex={-1} style={{ marginBottom: 16 }}>{t('Sprache')}</h2>
          <ul className="list" role="radiogroup" aria-label={t('Sprache')}>
            {(['de', 'en'] as Lang[]).map((l) => (
              <li key={l}>
                <button className={`list-row${LANG === l ? ' selected' : ''}`} role="radio" aria-checked={LANG === l} lang={l} onClick={() => (l === LANG ? setLangSheet(false) : setLang(l))}>
                  <div className="grow"><div className="title">{l === 'de' ? 'Deutsch' : 'English'}</div></div>
                  <span className="radio" aria-hidden="true">{LANG === l && <Icon name="check" size={16} />}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="t-caption muted" style={{ marginTop: 12 }}>{t('Kneipennamen und Adressen bleiben, wie sie sind.')}</p>
        </Sheet>
      )}
    </div>
  );
}

export function EditProfile() {
  const app = useApp();
  const u = app.user!;
  const [firstName, setFirst] = useState(u.firstName);
  const [lastName, setLast] = useState(u.lastName);
  const [city, setCity] = useState(u.city);
  const [username, setUsername] = useState(u.username);
  const [free, setFree] = useState<boolean | null>(null);
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const name = username.trim().replace(/^@/, '');
  const changed = name.toLowerCase() !== u.username.toLowerCase();
  useEffect(() => {
    setFree(null);
    if (!changed || !USERNAME.test(name)) return;
    const timer = setTimeout(() => api.isUsernameFree(name).then(setFree).catch(() => setFree(null)), 300);
    return () => clearTimeout(timer);
  }, [name, changed]);
  const nameError = !USERNAME.test(name) ? t('3 bis 24 Zeichen: Buchstaben, Ziffern, Punkt und Unterstrich.') : changed && free === false ? t('Dieser Benutzername ist schon vergeben.') : null;
  return (
    <Page onBack={app.pop} title={t('Profil bearbeiten')}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            if (nameError) return;
            app.setUser(await api.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), city: city.trim(), username: name, avatar: avatar?.blob }));
            app.notify(t('Gespeichert.'), 'success');
            app.pop();
          } catch (err) {
            app.notify((err as Error).message, 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="field">
          <span className="field-label">{t('Profilbild')}</span>
          <PhotoPicker round value={avatar?.url ?? u.avatarUrl} label={t('Profilbild wählen')} onChange={(blob, url) => setAvatar(blob && url ? { blob, url } : null)} />
          <p className="field-hint">{t('Profilbild und Benutzername sieht jeder.')}</p>
        </div>
        <Field label={t('Vorname')}>{(id) => <input id={id} className="input" value={firstName} onChange={(e) => setFirst(e.target.value)} required autoComplete="given-name" />}</Field>
        <Field label={t('Nachname')}>{(id) => <input id={id} className="input" value={lastName} onChange={(e) => setLast(e.target.value)} required autoComplete="family-name" />}</Field>
        <Field label={t('Stadt')}>{(id) => <input id={id} className="input" value={city} onChange={(e) => setCity(e.target.value)} required autoComplete="address-level2" />}</Field>
        <Field label={t('Benutzername')} hint={t('Unter diesem Namen finden dich Freunde.')} error={nameError} ok={changed && free ? t('Frei.') : null}>
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!nameError} className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />}
        </Field>
        <button className="btn btn-primary btn-block" style={{ marginTop: 32 }} disabled={saving || !!nameError || (changed && free !== true)}>{saving ? t('Wird gespeichert …') : t('Speichern')}</button>
      </form>
    </Page>
  );
}

export function PrivacyScreen() {
  const app = useApp();
  return (
    <Page onBack={app.pop} title={t('Privatsphäre')}>
      <div className="stack">
        <h1 className="t-h2">{t('Was andere sehen')}</h1>
        <p><strong>{t('Alle:')}</strong> {t('dein Profilbild und deinen Benutzernamen.')}</p>
        <p><strong>{t('Deine Freunde:')}</strong> {t('Name, Stadt, deine Kneipen, Check-ins, Details und Fotos.')}</p>
        <p><strong>{t('Niemand:')}</strong> {t('deinen Standort. Wir speichern nur die Kneipe und den Zeitpunkt des Check-ins.')}</p>
        <h2 className="t-h3" style={{ marginTop: 32 }}>{t('Standort')}</h2>
        <p>{t('Die App fragt den Standort nur ab, solange sie geöffnet ist, und nur für den Check-in. Es gibt kein Tracking im Hintergrund.')}</p>
        <h2 className="t-h3" style={{ marginTop: 32 }}>{t('Fotos')}</h2>
        <p>{t('Fotos liegen verkleinert auf unserem Server in der EU, damit deine Freunde sie sehen können. Den Aufnahmeort entfernen wir vor dem Hochladen. Löschst du einen Check-in, löschen wir das Foto mit.')}</p>
        <h2 className="t-h3" style={{ marginTop: 32 }}>{t('Verantwortungsvoll')}</h2>
        <p>{t('Die App ist ab 18. Es gibt keine Ranglisten nach Menge. Alkoholfreie Getränke zählen genauso.')}</p>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 32 }} onClick={() => app.push({ kind: 'datenschutz' })}>
          {t('Vollständige Datenschutzerklärung')}
        </button>
      </div>
    </Page>
  );
}

export function LocationHelp() {
  const app = useApp();
  const s = app.location.status;
  const blocked = s === 'denied' || s === 'unavailable';
  return (
    <Page onBack={app.pop} title={t('Standort')}>
      <div className="stack">
        <Icon name={blocked ? 'location-off' : 'location'} size={32} />
        <h1 className="t-h2">{blocked ? t('Standort freigeben') : t('Wofür die App deinen Standort braucht')}</h1>
        <p>{t('Nur für den Check-in: Beim Öffnen schaut die App, ob du in einer Kneipe bist, und fragt dich dann. Der Standort wird nicht gespeichert und nie anderen gezeigt.')}</p>
        {s === 'ok' && (
          <Notice icon="success">
            {app.location.accuracy ? t('Der Standort ist freigegeben, Genauigkeit etwa {n} m.', { n: Math.round(app.location.accuracy) }) : t('Der Standort ist freigegeben.')}
          </Notice>
        )}
        {blocked && (
          <>
            <Notice icon="warning">
              {s === 'denied'
                ? t('Dein iPhone hat den Zugriff auf den Standort abgelehnt. So erlaubst du ihn wieder:')
                : t('Dein iPhone liefert gerade keinen Standort. Prüf diese Einstellungen:')}
            </Notice>
            {LANG === 'en' ? (
              <>
                <h2 className="t-h3" style={{ marginTop: 8 }}>1. Location Services</h2>
                <p>
                  Settings → <strong>Privacy &amp; Security</strong> → <strong>Location Services</strong>: turn on at the top. Further down the
                  list, tap <strong>Safari Websites</strong> → choose <strong>While Using the App</strong> and turn on <strong>Precise Location</strong>.
                </p>
                <h2 className="t-h3" style={{ marginTop: 8 }}>2. Safari</h2>
                <p>
                  Settings → <strong>Apps</strong> → <strong>Safari</strong> (on older iOS directly <strong>Safari</strong>) → at the bottom under
                  “Settings for Websites” → <strong>Location</strong> → <strong>Ask</strong> or <strong>Allow</strong>.
                </p>
                <h2 className="t-h3" style={{ marginTop: 8 }}>3. Reopen the app</h2>
                <p>
                  Close the app completely (swipe up from the bottom edge and push the app away) and open it again from the Home Screen. Your
                  iPhone will then ask again.
                </p>
              </>
            ) : (
              <>
                <h2 className="t-h3" style={{ marginTop: 8 }}>1. Ortungsdienste</h2>
                <p>
                  Einstellungen → <strong>Datenschutz &amp; Sicherheit</strong> → <strong>Ortungsdienste</strong>: oben einschalten. Weiter unten in der
                  Liste <strong>Safari-Websites</strong> antippen → <strong>Beim Verwenden der App</strong> wählen und <strong>Genauer Standort</strong>{' '}
                  einschalten.
                </p>
                <h2 className="t-h3" style={{ marginTop: 8 }}>2. Safari</h2>
                <p>
                  Einstellungen → <strong>Apps</strong> → <strong>Safari</strong> (bei älterem iOS direkt <strong>Safari</strong>) → ganz unten
                  unter „Einstellungen für Websites“ → <strong>Standort</strong> → <strong>Fragen</strong> oder <strong>Erlauben</strong>.
                </p>
                <h2 className="t-h3" style={{ marginTop: 8 }}>3. App neu öffnen</h2>
                <p>
                  Die App ganz schließen (vom unteren Rand nach oben wischen und die App nach oben wegschieben) und vom Home-Bildschirm neu
                  öffnen. Dann fragt dein iPhone noch einmal.
                </p>
              </>
            )}
          </>
        )}
        {!blocked && s !== 'ok' && (
          <p className="muted t-secondary">
            {t('Dein iPhone fragt gleich, ob Tresenschicht deinen Standort verwenden darf. Wähle „Erlauben“. Auf dem iPhone fragt eine Web-App bei jedem Öffnen neu, das ist eine Vorgabe von iOS.')}
          </p>
        )}
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: 24 }}
          onClick={() => {
            app.requestLocation();
            app.pop();
          }}
        >
          {blocked ? t('Noch einmal versuchen') : s === 'ok' ? t('Standort aktualisieren') : t('Standort erlauben')}
        </button>
      </div>
    </Page>
  );
}

export function BlockedUsers() {
  const app = useApp();
  const [list, setList] = useState<PublicProfile[] | null>(null);
  const reload = () => api.blockedUsers().then(setList).catch((e) => app.notify((e as Error).message, 'error'));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Page onBack={app.pop} title={t('Gesperrte Nutzer')}>
      <p className="muted" style={{ marginBottom: 20 }}>{t('Gesperrte Nutzer finden dich nicht in der Suche und können dir keine Anfrage schicken. Sie erfahren nichts davon.')}</p>
      {!list ? <Spinner /> : list.length === 0 ? (
        <p className="muted">{t('Du hast niemanden gesperrt.')}</p>
      ) : (
        <ul className="list">
          {list.map((u) => (
            <li key={u.id} className="list-row" style={{ cursor: 'default' }}>
              <Avatar url={u.avatarUrl} name={u.username} size="sm" />
              <div className="grow"><div className="title">@{u.username}</div></div>
              <button
                className="btn btn-text"
                onClick={async () => {
                  await api.unblockUser(u.id);
                  app.notify(t('@{name} ist entsperrt.', { name: u.username }), 'success');
                  reload();
                }}
              >
                {t('Entsperren')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
