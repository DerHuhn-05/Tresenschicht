import { useEffect, useState } from 'react';
import { api, type CheckIn, type CollectionEntry } from '../api';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, Confirm, Field, Notice, Page, PhotoPicker, Spinner } from '../components/ui';
import { remove } from '../lib/storage';
import { isDemo, useApp } from '../state/app';
import { cityCount, VisitCard } from './CollectionScreens';

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
  const [recent, setRecent] = useState<CheckIn[]>([]);
  const [ask, setAsk] = useState<'logout' | 'delete' | null>(null);

  useEffect(() => {
    api.collection().then(setEntries);
    api.checkIns().then((c) => setRecent(c.slice(0, 3)));
  }, [app.version]);

  const countries = new Set(entries?.map((e) => e.pub.country)).size;
  const visits = entries?.reduce((n, e) => n + e.visits, 0) ?? 0;
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
          <div className="stats">
            <div className="stat big"><div className="n">{entries.length}</div><div className="muted">Kneipen</div></div>
            <div className="stat"><div className="n">{visits}</div><div className="muted">Besuche</div></div>
            <div className="stat"><div className="n">{cityCount(entries)}</div><div className="muted">Städte</div></div>
            <div className="stat"><div className="n">{countries}</div><div className="muted">{countries === 1 ? 'Land' : 'Länder'}</div></div>
          </div>
          {regular && regular.visits > 1 && (
            <p className="muted t-secondary" style={{ marginTop: 12 }}>
              Stammkneipe: <span className="accent-text" style={{ fontWeight: 600 }}>{regular.pub.name}</span> mit {regular.visits} Besuchen
            </p>
          )}
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
          {u.isAdmin && <Row icon="flag" title="Prüfliste" sub="Neue Kneipen und Änderungen" onClick={() => app.push({ kind: 'review' })} />}
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
        <p className="t-caption muted" style={{ marginTop: 32 }}>Die vollständige Datenschutzerklärung und das Impressum stehen vor dem Start hier.</p>
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
