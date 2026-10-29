import { useEffect, useState } from 'react';
import { api, type User } from '../api';
import { Icon } from '../components/Icon';
import { Field, Notice, Page, PhotoPicker } from '../components/ui';
import { ageFrom } from '../lib/format';
import { MIN_AGE } from '../lib/rules';
import { isDemo } from '../state/app';
import { Datenschutz, Impressum } from './LegalScreens';

type AuthView = 'welcome' | 'register' | 'login' | 'reset' | 'confirm' | 'impressum' | 'datenschutz';

export function AuthFlow({ onDone }: { onDone: (u: User, isNew: boolean) => void }) {
  const [view, setView] = useState<AuthView>('welcome');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');

  async function demo() {
    setBusy(true);
    try {
      await api.signUp({ email: `du-${Date.now()}@demo.invalid`, password: 'demo-demo', username: `du_${Math.floor(Math.random() * 900 + 100)}`, firstName: 'Alex', lastName: 'Demo', birthDate: '1996-04-12', city: 'Hamburg' });
      onDone((await api.currentUser())!, true);
    } finally {
      setBusy(false);
    }
  }

  const confirm = (mail: string) => {
    setEmail(mail);
    setView('confirm');
  };
  if (view === 'impressum') return <Impressum onBack={() => setView('welcome')} />;
  if (view === 'datenschutz') return <Datenschutz onBack={() => setView('welcome')} />;
  if (view === 'register') return <Register onBack={() => setView('welcome')} onDone={onDone} onConfirm={confirm} />;
  if (view === 'login') return <Login onBack={() => setView('welcome')} onDone={(u) => onDone(u, false)} onReset={() => setView('reset')} onConfirm={confirm} />;
  if (view === 'reset') return <Reset onBack={() => setView('login')} onDone={(u) => onDone(u, false)} />;
  if (view === 'confirm') return <ConfirmEmail email={email} onBack={() => setView('login')} onDone={(u) => onDone(u, true)} />;

  return (
    <div className="welcome">
      <div>
        <svg className="welcome-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 9.5 5 4.5h14l1.5 5a2.83 2.83 0 0 1-5.67 0 2.83 2.83 0 0 1-5.66 0 2.83 2.83 0 0 1-5.67 0Z" fill="#F5A31A" stroke="#F5A31A" />
          <path d="M5 12.5v7h14v-7" />
          <path d="M10 19.5v-3.5a2 2 0 0 1 4 0v3.5" />
        </svg>
        <h1 className="t-display">Tresenschicht</h1>
        <p className="lead t-body">Sammle die Kneipen, in denen du warst. Ein Tipp beim Reinkommen reicht. Deine Freunde sehen, wo ihr schon überall wart.</p>
      </div>
      <div className="btn-stack">
        <button className="btn btn-primary btn-block" onClick={() => setView('register')}>Konto erstellen</button>
        <button className="btn btn-secondary btn-block" onClick={() => setView('login')}>Anmelden</button>
        {isDemo && (
          <button className="btn btn-text btn-block" disabled={busy} onClick={demo}>
            {busy ? 'Demo wird vorbereitet …' : 'Ohne Konto ausprobieren (Demo)'}
          </button>
        )}
        <p className="t-legal" style={{ color: 'var(--gray-300)' }}>Ab 18 Jahren. Trink verantwortungsvoll.</p>
        <div className="legal-links" style={{ color: 'var(--gray-300)' }}>
          <button onClick={() => setView('datenschutz')}>Datenschutz</button>
          <button onClick={() => setView('impressum')}>Impressum</button>
        </div>
      </div>
    </div>
  );
}

export const USERNAME = /^[A-Za-z0-9._]{3,24}$/;

function Register({ onBack, onDone, onConfirm }: { onBack: () => void; onDone: (u: User, isNew: boolean) => void; onConfirm: (email: string) => void }) {
  const [privacy, setPrivacy] = useState(false);
  const [f, setF] = useState({ firstName: '', lastName: '', username: '', birthDate: '', city: '', email: '', password: '' });
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [free, setFree] = useState<boolean | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const blur = (k: string) => () => setTouched({ ...touched, [k]: true });

  useEffect(() => {
    setFree(null);
    if (!USERNAME.test(f.username)) return;
    const t = setTimeout(() => api.isUsernameFree(f.username).then(setFree).catch(() => setFree(null)), 300);
    return () => clearTimeout(t);
  }, [f.username]);

  const age = f.birthDate ? ageFrom(f.birthDate) : null;
  const errors = {
    username: !f.username ? 'Bitte Benutzernamen eingeben.' : !USERNAME.test(f.username) ? '3 bis 24 Zeichen: Buchstaben, Ziffern, Punkt und Unterstrich.' : free === false ? 'Dieser Benutzername ist schon vergeben.' : null,
    birthDate: !f.birthDate ? 'Bitte Geburtsdatum eingeben.' : age !== null && age < MIN_AGE ? `Die App ist erst ab ${MIN_AGE} Jahren.` : null,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) ? 'Bitte gültige E-Mail-Adresse eingeben.' : null,
    password: f.password.length < 8 ? 'Mindestens 8 Zeichen.' : null,
    firstName: !f.firstName.trim() ? 'Bitte Vornamen eingeben.' : null,
    lastName: !f.lastName.trim() ? 'Bitte Nachnamen eingeben.' : null,
    city: !f.city.trim() ? 'Bitte Stadt eingeben.' : null,
  };
  const valid = Object.values(errors).every((x) => !x) && consent && free !== false;
  const show = (k: keyof typeof errors) => (touched[k] ? errors[k] : null);

  return (
    <Page onBack={onBack} title="Konto erstellen">
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
          if (!valid) return setError(consent ? 'Bitte prüfe die markierten Felder.' : 'Bitte bestätige Alter und Datenschutz.');
          setBusy(true);
          setError(null);
          try {
            const r = await api.signUp({ ...f, username: f.username.trim(), email: f.email.trim(), avatar: avatar?.blob });
            if (r.needsConfirmation) onConfirm(f.email.trim());
            else onDone((await api.currentUser())!, true);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field" style={{ marginBottom: 16 }}>
          <span className="field-label">Profilbild (optional)</span>
          <PhotoPicker round value={avatar?.url} label="Profilbild wählen" onChange={(blob, url) => setAvatar(blob && url ? { blob, url } : null)} />
        </div>
        <Field label="Vorname" error={show('firstName')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('firstName')} className="input" value={f.firstName} onChange={set('firstName')} onBlur={blur('firstName')} autoComplete="given-name" />}</Field>
        <Field label="Nachname" error={show('lastName')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('lastName')} className="input" value={f.lastName} onChange={set('lastName')} onBlur={blur('lastName')} autoComplete="family-name" />}</Field>
        <Field
          label="Benutzername"
          hint="Damit finden dich Freunde. Jeder sieht ihn."
          error={show('username') ?? (free === false ? errors.username : null)}
          ok={free && USERNAME.test(f.username) ? 'Frei.' : null}
        >
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('username')} className="input" value={f.username} onChange={set('username')} onBlur={blur('username')} autoCapitalize="none" autoCorrect="off" autoComplete="username" />}
        </Field>
        <Field label="Geburtsdatum" hint={`Die App ist ab ${MIN_AGE} Jahren.`} error={show('birthDate')}>
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('birthDate')} className="input" type="date" value={f.birthDate} onChange={set('birthDate')} onBlur={blur('birthDate')} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} />}
        </Field>
        <Field label="Stadt" error={show('city')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('city')} className="input" value={f.city} onChange={set('city')} onBlur={blur('city')} autoComplete="address-level2" />}</Field>
        <Field label="E-Mail" error={show('email')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('email')} className="input" type="email" value={f.email} onChange={set('email')} onBlur={blur('email')} autoComplete="email" autoCapitalize="none" />}</Field>
        <Field label="Passwort" hint="Mindestens 8 Zeichen." error={show('password')}>
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('password')} className="input" type="password" value={f.password} onChange={set('password')} onBlur={blur('password')} autoComplete="new-password" />}
        </Field>
        <label className="check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="t-secondary">
            Ich bin mindestens 18 Jahre alt und habe die{' '}
            <button type="button" className="accent-text" style={{ border: 0, background: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setPrivacy(true); }}>
              Datenschutzerklärung
            </button>{' '}
            gelesen.
          </span>
        </label>
        {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy}>{busy ? 'Konto wird erstellt …' : 'Konto erstellen'}</button>
      </form>
      {privacy && <Datenschutz onBack={() => setPrivacy(false)} />}
    </Page>
  );
}

function Login({ onBack, onDone, onReset, onConfirm }: { onBack: () => void; onDone: (u: User) => void; onReset: () => void; onConfirm: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unconfirmed = !!error && /bestätige/.test(error);
  return (
    <Page onBack={onBack} title="Anmelden">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            onDone(await api.signIn(email.trim(), password));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="E-Mail">{(id) => <input id={id} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" required />}</Field>
        <Field label="Passwort">{(id) => <input id={id} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}</Field>
        {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
        {unconfirmed && (
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 12 }}
            onClick={async () => {
              try {
                await api.resendEmailCode(email.trim());
              } catch {
                /* Code eventuell schon unterwegs; trotzdem zur Eingabe */
              }
              onConfirm(email.trim());
            }}
          >
            Code zum Bestätigen schicken
          </button>
        )}
        <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy || !email || !password}>{busy ? 'Anmelden …' : 'Anmelden'}</button>
        <button type="button" className="btn btn-text btn-block" style={{ marginTop: 12 }} onClick={onReset}>Passwort vergessen?</button>
      </form>
    </Page>
  );
}

function Reset({ onBack, onDone }: { onBack: () => void; onDone: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Page onBack={onBack} title="Passwort zurücksetzen">
      {sent ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              onDone(await api.resetPasswordWithCode(email.trim(), code, password));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="mail" size={32} />
          <h1 className="t-h2" style={{ marginTop: 12 }}>Code eingeben</h1>
          <p style={{ margin: '8px 0 20px' }}>Gibt es ein Konto zu {email}, bekommst du gleich eine E-Mail mit einem Code. Gib ihn hier ein und wähle ein neues Passwort.</p>
          <CodeField value={code} onChange={setCode} />
          <Field label="Neues Passwort" hint="Mindestens 8 Zeichen.">
            {(id, d) => <input id={id} aria-describedby={d} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
          </Field>
          {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy || code.length < 6 || password.length < 8}>
            {busy ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api.resetPassword(email.trim());
              setSent(true);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <p style={{ marginBottom: 20 }}>Gib deine E-Mail-Adresse ein. Wir schicken dir einen Code.</p>
          <Field label="E-Mail">{(id) => <input id={id} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" required />}</Field>
          {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={!email}>Code schicken</button>
        </form>
      )}
    </Page>
  );
}

/** Feld für den 6- bis 8-stelligen Code aus der E-Mail; iOS schlägt ihn aus der Mail-App vor. */
function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Code aus der E-Mail">
      {(id) => (
        <input
          id={id}
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
          style={{ fontSize: 28, letterSpacing: 8, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
          autoFocus
        />
      )}
    </Field>
  );
}

/** A3: E-Mail bestätigen mit Code, damit man in der Home-Bildschirm-App bleibt statt im Browser zu landen. */
function ConfirmEmail({ email, onBack, onDone }: { email: string; onBack: () => void; onDone: (u: User) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  async function submit(c = code) {
    if (c.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api.verifyEmailCode(email, c));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page onBack={onBack} title="E-Mail bestätigen">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Icon name="mail" size={32} />
        <h1 className="t-h2" style={{ marginTop: 12 }}>Schau in dein Postfach</h1>
        <p style={{ margin: '8px 0 20px' }}>Wir haben dir einen Code an <strong>{email}</strong> geschickt. Gib ihn hier ein, dann bist du drin.</p>
        <CodeField value={code} onChange={setCode} />
        {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy || code.length < 6}>
          {busy ? 'Wird geprüft …' : 'Bestätigen'}
        </button>
        <button
          type="button"
          className="btn btn-text btn-block"
          style={{ marginTop: 12 }}
          disabled={wait > 0}
          onClick={async () => {
            setError(null);
            try {
              await api.resendEmailCode(email);
              setWait(60);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          {wait > 0 ? `Neuen Code in ${wait} s anfordern` : 'Neuen Code anfordern'}
        </button>
        <p className="t-caption muted" style={{ marginTop: 16 }}>Keine Mail? Schau im Spam-Ordner nach. Den Link in der Mail brauchst du nicht.</p>
      </form>
    </Page>
  );
}

/** A4: Standortabfrage beim Onboarding mit kurzer Erklärung. */
export function LocationOnboarding({ onAllow, onLater }: { onAllow: () => void; onLater: () => void }) {
  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: 'calc(env(safe-area-inset-top) + 64px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
      <div className="stack">
        <Icon name="location" size={32} />
        <h1 className="t-h1">Einchecken mit einem Tipp</h1>
        <p>Wenn du die App in einer Kneipe öffnest, schaut sie kurz, wo du bist, und fragt: „Bist du hier?“</p>
        <ul style={{ paddingLeft: 20, margin: 0 }} className="muted">
          <li>Nur, solange die App offen ist</li>
          <li>Kein Tracking im Hintergrund</li>
          <li>Niemand sieht deinen Standort, nur deine Kneipen</li>
        </ul>
      </div>
      <div className="btn-stack">
        <button className="btn btn-primary btn-block" onClick={onAllow}>Standort erlauben</button>
        <button className="btn btn-text btn-block" onClick={onLater}>Später</button>
      </div>
    </div>
  );
}
