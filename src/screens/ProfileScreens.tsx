import { useEffect, useState } from 'react';
import { api, type CheckIn, type CollectionEntry, type PublicProfile } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, Confirm, Field, Notice, Page, PhotoPicker, Spinner } from '../components/ui';
import { remove } from '../lib/storage';
import { isDemo, useApp } from '../state/app';
import { BadgeGrid } from '../components/Badges';
import { badgesOf } from '../lib/badges';
import { StatsPanel, StatTile } from '../components/Stats';
import { VisitCard } from './CollectionScreens';

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
  const locText = loc.simulated ? 'Simuliert (Demo)' : { ok: 'Erlaubt, solange die App offen ist', asking: 'Wird abgefragt', denied: 'Nicht erlaubt', unavailable: 'Nicht verfügbar', off: 'Noch nicht erlaubt' }[loc.status];

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
              Stammkneipe: <span className="accent-text" style={{ fontWeight: 600 }}>{regular.pub.name}</span> mit {regular.visits} Check-ins
            </p>
          )}
        </section>
      )}

      {entries && (
        <section className="section">
          <h2 className="t-h3 section-title">{year}</h2>
          <div className="stats stats-2">
            <StatTile icon="pub" n={thisYear.newPubs} label={thisYear.newPubs === 1 ? 'neue Kneipe' : 'neue Kneipen'} />
            <StatTile icon="checkin" n={thisYear.visits} label={thisYear.visits === 1 ? 'Check-in' : 'Check-ins'} />
          </div>
          {topCities.length > 0 && (
            <ul className="list" style={{ marginTop: 12 }} aria-label="Meistbesuchte Städte">
              {topCities.map(([city, n]) => (
                <li key={city} className="list-row" style={{ cursor: 'default' }}>
                  <Icon name="city" />
                  <div className="grow"><div className="title">{city}</div></div>
                  <span className="muted">{n} {n === 1 ? 'Kneipe' : 'Kneipen'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {entries && (
        <section className="section">
          <h2 className="t-h3 section-title">Abzeichen</h2>
          <BadgeGrid badges={badgesOf(entries, all)} />
        </section>
      )}

      {recent.length > 0 && (
        <section className="section">
          <h2 className="t-h3 section-title">Zuletzt</h2>
          {recent.map((c) => <VisitCard key={c.id} c={c} own />)}
        </section>
      )}

      <section className="section">
        <h2 className="t-h3 section-title">Konto</h2>
        <ul className="list">
          <Row icon="edit" title="Profil bearbeiten" onClick={() => app.push({ kind: 'editProfile' })} />
          <Row icon="location" title="Standort" sub={locText} onClick={() => app.push({ kind: 'locationHelp' })} />
          <Row icon="lock" title="Privatsphäre und Datenschutz" sub="Dein Profil ist privat" onClick={() => app.push({ kind: 'privacy' })} />
          <Row icon="close" title="Gesperrte Nutzer" onClick={() => app.push({ kind: 'blocked' })} />
          {u.isAdmin && <Row icon="flag" title="Prüfliste" sub="Neue Kneipen und Änderungen" onClick={() => app.push({ kind: 'review' })} />}
          <Row icon="mail" title="Hilfe und Kontakt" sub="Fragen, Probleme, Feedback" onClick={() => app.push({ kind: 'help' })} />
          <Row icon="info" title="Datenschutzerklärung" onClick={() => app.push({ kind: 'datenschutz' })} />
          <Row icon="info" title="Impressum" onClick={() => app.push({ kind: 'impressum' })} />
          <Row icon="logout" title="Abmelden" onClick={() => setAsk('logout')} />
          <Row icon="delete" title="Konto löschen" onClick={() => setAsk('delete')} danger />
        </ul>
      </section>

      {isDemo && (
        <section className="section">
          <h2 className="t-h3 section-title">Demo</h2>
          <ul className="list">
            <Row
              icon="location"
              title={loc.simulated ? 'Echten Standort nutzen' : 'Standort simulieren'}
              sub={loc.simulated ? 'Fragt dein Gerät nach dem Standort' : 'Standort auf der Karte setzen'}
              onClick={() => app.useRealLocation(loc.simulated)}
            />
            <Row
              icon="delete"
              title="Demo-Daten zurücksetzen"
              onClick={() => {
                ['kneipen-demo-db', 'kneipen-declined', 'kneipen-demo-pos'].forEach(remove);
                location.reload();
              }}
              danger
            />
          </ul>
          <p className="t-caption muted" style={{ marginTop: 8 }}>Im Demo-Modus bleiben alle Daten auf diesem Gerät. Für die echte App trägst du die Supabase-Zugangsdaten ein.</p>
        </section>
      )}

      <p className="t-legal muted" style={{ marginTop: 32 }}>Kartendaten © OpenStreetMap contributors (ODbL). Tresenschicht.</p>

      {ask === 'logout' && (
        <Confirm title="Abmelden?" text="Deine Kneipen bleiben gespeichert." confirm="Abmelden" onCancel={() => setAsk(null)}
          onConfirm={async () => { await api.signOut(); app.setUser(null); }} />
      )}
      {ask === 'delete' && (
        <Confirm
          title="Konto endgültig löschen?"
          text="Profil, Sammlung, Besuche, Fotos und Freundschaften werden gelöscht. Das lässt sich nicht rückgängig machen."
          confirm="Konto löschen"
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
    </div>
  );
}

export function EditProfile() {
  const app = useApp();
  const u = app.user!;
  const [firstName, setFirst] = useState(u.firstName);
  const [lastName, setLast] = useState(u.lastName);
  const [city, setCity] = useState(u.city);
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Page onBack={app.pop} title="Profil bearbeiten">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            app.setUser(await api.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), city: city.trim(), avatar: avatar?.blob }));
            app.notify('Gespeichert.', 'success');
            app.pop();
          } catch (err) {
            app.notify((err as Error).message, 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="field">
          <span className="field-label">Profilbild</span>
          <PhotoPicker round value={avatar?.url ?? u.avatarUrl} label="Profilbild wählen" onChange={(blob, url) => setAvatar(blob && url ? { blob, url } : null)} />
          <p className="field-hint">Profilbild und Benutzername sieht jeder.</p>
        </div>
        <Field label="Vorname">{(id) => <input id={id} className="input" value={firstName} onChange={(e) => setFirst(e.target.value)} required autoComplete="given-name" />}</Field>
        <Field label="Nachname">{(id) => <input id={id} className="input" value={lastName} onChange={(e) => setLast(e.target.value)} required autoComplete="family-name" />}</Field>
        <Field label="Stadt">{(id) => <input id={id} className="input" value={city} onChange={(e) => setCity(e.target.value)} required autoComplete="address-level2" />}</Field>
        <Field label="Benutzername" hint="Der Benutzername lässt sich nicht ändern.">
          {(id, d) => <input id={id} aria-describedby={d} className="input" value={`@${u.username}`} readOnly />}
        </Field>
        <button className="btn btn-primary btn-block" style={{ marginTop: 32 }} disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button>
      </form>
    </Page>
  );
}

export function PrivacyScreen() {
  const app = useApp();
  return (
    <Page onBack={app.pop} title="Privatsphäre">
      <div className="stack">
        <h1 className="t-h2">Was andere sehen</h1>
        <p><strong>Alle:</strong> dein Profilbild und deinen Benutzernamen.</p>
        <p><strong>Deine Freunde:</strong> Name, Stadt, deine Kneipen, Besuche, Details und Fotos.</p>
        <p><strong>Niemand:</strong> deinen Standort. Wir speichern nur die Kneipe und den Zeitpunkt des Check-ins.</p>
        <h2 className="t-h3" style={{ marginTop: 32 }}>Standort</h2>
        <p>Die App fragt den Standort nur ab, solange sie geöffnet ist, und nur für den Check-in. Es gibt kein Tracking im Hintergrund.</p>
        <h2 className="t-h3" style={{ marginTop: 32 }}>Fotos</h2>
        <p>Fotos liegen verkleinert auf unserem Server in der EU, damit deine Freunde sie sehen können. Den Aufnahmeort entfernen wir vor dem Hochladen. Löschst du einen Besuch, löschen wir das Foto mit.</p>
        <h2 className="t-h3" style={{ marginTop: 32 }}>Verantwortungsvoll</h2>
        <p>Die App ist ab 18. Es gibt keine Ranglisten nach Menge. Alkoholfreie Getränke zählen genauso.</p>
        <button className="btn btn-secondary btn-block" style={{ marginTop: 32 }} onClick={() => app.push({ kind: 'datenschutz' })}>
          Vollständige Datenschutzerklärung
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
    <Page onBack={app.pop} title="Standort">
      <div className="stack">
        <Icon name={blocked ? 'location-off' : 'location'} size={32} />
        <h1 className="t-h2">{blocked ? 'Standort freigeben' : 'Wofür die App deinen Standort braucht'}</h1>
        <p>
          Nur für den Check-in: Beim Öffnen schaut die App, ob du in einer Kneipe bist, und fragt dich dann. Der Standort wird
          nicht gespeichert und nie anderen gezeigt.
        </p>
        {s === 'ok' && (
          <Notice icon="success">
            Der Standort ist freigegeben{app.location.accuracy ? `, Genauigkeit etwa ${Math.round(app.location.accuracy)} m` : ''}.
          </Notice>
        )}
        {blocked && (
          <>
            <Notice icon="warning">
              {s === 'denied'
                ? 'Dein iPhone hat den Zugriff auf den Standort abgelehnt. So erlaubst du ihn wieder:'
                : 'Dein iPhone liefert gerade keinen Standort. Prüf diese Einstellungen:'}
            </Notice>
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
        {!blocked && s !== 'ok' && (
          <p className="muted t-secondary">
            Dein iPhone fragt gleich: „Tresenschicht möchte deinen Standort verwenden“. Wähle <strong>Erlauben</strong>. Auf dem iPhone
            fragt eine Web-App bei jedem Öffnen neu, das ist eine Vorgabe von iOS.
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
          {blocked ? 'Noch einmal versuchen' : s === 'ok' ? 'Standort aktualisieren' : 'Standort erlauben'}
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
    <Page onBack={app.pop} title="Gesperrte Nutzer">
      <p className="muted" style={{ marginBottom: 20 }}>Gesperrte Nutzer finden dich nicht in der Suche und können dir keine Anfrage schicken. Sie erfahren nichts davon.</p>
      {!list ? <Spinner /> : list.length === 0 ? (
        <p className="muted">Du hast niemanden gesperrt.</p>
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
                  app.notify(`@${u.username} ist entsperrt.`, 'success');
                  reload();
                }}
              >
                Entsperren
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
