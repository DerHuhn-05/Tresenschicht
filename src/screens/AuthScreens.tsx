import { useEffect, useState } from 'react';
import { api, type User } from '../api';
import { Icon } from '../components/Icon';
import { Field, Notice, Page, PhotoPicker } from '../components/ui';
import { ageFrom } from '../lib/format';
import { MIN_AGE } from '../lib/rules';
import { isDemo } from '../state/app';
import { Datenschutz, Impressum } from './LegalScreens';
import { LANG, setLang, t } from '../lib/i18n';

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

  // Passwort nur im Speicher: damit geht es nach dem Bestätigungslink ohne erneute Eingabe weiter
  const [password, setPassword] = useState('');
  const confirm = (mail: string, pw = '') => {
    setEmail(mail);
    setPassword(pw);
    setView('confirm');
  };
  if (view === 'impressum') return <Impressum onBack={() => setView('welcome')} />;
  if (view === 'datenschutz') return <Datenschutz onBack={() => setView('welcome')} />;
  if (view === 'register') return <Register onBack={() => setView('welcome')} onDone={onDone} onConfirm={confirm} />;
  if (view === 'login') return <Login onBack={() => setView('welcome')} onDone={(u) => onDone(u, false)} onReset={() => setView('reset')} onConfirm={confirm} />;
  if (view === 'reset') return <Reset onBack={() => setView('login')} onDone={(u) => onDone(u, false)} />;
  if (view === 'confirm') return <ConfirmEmail email={email} password={password} onBack={() => setView('login')} onDone={(u) => onDone(u, true)} />;

  return (
    <div className="welcome">
      <div>
        <svg className="welcome-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 9.5 5 4.5h14l1.5 5a2.83 2.83 0 0 1-5.67 0 2.83 2.83 0 0 1-5.66 0 2.83 2.83 0 0 1-5.67 0Z" fill="#F5A31A" stroke="#F5A31A" />
          <path d="M5 12.5v7h14v-7" />
          <path d="M10 19.5v-3.5a2 2 0 0 1 4 0v3.5" />
        </svg>
        <h1 className="t-display">Tresenschicht</h1>
        <p className="lead t-body">{t('Sammle die Kneipen, in denen du warst. Ein Tipp beim Reinkommen reicht. Deine Freunde sehen, wo ihr schon überall wart.')}</p>
      </div>
      <div className="btn-stack">
        <button className="btn btn-primary btn-block" onClick={() => setView('register')}>{t('Konto erstellen')}</button>
        <button className="btn btn-secondary btn-block" onClick={() => setView('login')}>{t('Anmelden')}</button>
        {isDemo && (
          <button className="btn btn-text btn-block" disabled={busy} onClick={demo}>
            {busy ? t('Demo wird vorbereitet …') : t('Ohne Konto ausprobieren (Demo)')}
          </button>
        )}
        <p className="t-legal" style={{ color: 'var(--gray-300)' }}>{t('Ab 18 Jahren. Trink verantwortungsvoll.')}</p>
        <div className="legal-links" style={{ color: 'var(--gray-300)' }}>
          <button onClick={() => setView('datenschutz')}>{t('Datenschutz')}</button>
          <button onClick={() => setView('impressum')}>{t('Impressum')}</button>
          <button onClick={() => setLang(LANG === 'de' ? 'en' : 'de')} lang={LANG === 'de' ? 'en' : 'de'}>{LANG === 'de' ? 'English' : 'Deutsch'}</button>
        </div>
      </div>
    </div>
  );
}

export const USERNAME = /^[A-Za-z0-9._]{3,24}$/;

function Register({ onBack, onDone, onConfirm }: { onBack: () => void; onDone: (u: User, isNew: boolean) => void; onConfirm: (email: string, password?: string) => void }) {
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
    const timer = setTimeout(() => api.isUsernameFree(f.username).then(setFree).catch(() => setFree(null)), 300);
    return () => clearTimeout(timer);
  }, [f.username]);

  const age = f.birthDate ? ageFrom(f.birthDate) : null;
  const errors = {
    username: !f.username ? t('Bitte Benutzernamen eingeben.') : !USERNAME.test(f.username) ? t('3 bis 24 Zeichen: Buchstaben, Ziffern, Punkt und Unterstrich.') : free === false ? t('Dieser Benutzername ist schon vergeben.') : null,
    birthDate: !f.birthDate ? t('Bitte Geburtsdatum eingeben.') : age !== null && age < MIN_AGE ? t('Die App ist erst ab {n} Jahren.', { n: MIN_AGE }) : null,
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) ? t('Bitte gültige E-Mail-Adresse eingeben.') : null,
    password: f.password.length < 8 ? t('Mindestens 8 Zeichen.') : null,
    firstName: !f.firstName.trim() ? t('Bitte Vornamen eingeben.') : null,
    lastName: !f.lastName.trim() ? t('Bitte Nachnamen eingeben.') : null,
    city: !f.city.trim() ? t('Bitte Stadt eingeben.') : null,
  };
  const valid = Object.values(errors).every((x) => !x) && consent && free !== false;
  const show = (k: keyof typeof errors) => (touched[k] ? errors[k] : null);

  return (
    <Page onBack={onBack} title={t('Konto erstellen')}>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
          if (!valid) return setError(consent ? t('Bitte prüfe die markierten Felder.') : t('Bitte bestätige Alter und Datenschutz.'));
          setBusy(true);
          setError(null);
          try {
            const r = await api.signUp({ ...f, username: f.username.trim(), email: f.email.trim(), avatar: avatar?.blob });
            if (r.needsConfirmation) onConfirm(f.email.trim(), f.password);
            else onDone((await api.currentUser())!, true);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field" style={{ marginBottom: 16 }}>
          <span className="field-label">{t('Profilbild (optional)')}</span>
          <PhotoPicker round value={avatar?.url} label={t('Profilbild wählen')} onChange={(blob, url) => setAvatar(blob && url ? { blob, url } : null)} />
        </div>
        <Field label={t('Vorname')} error={show('firstName')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('firstName')} className="input" value={f.firstName} onChange={set('firstName')} onBlur={blur('firstName')} autoComplete="given-name" />}</Field>
        <Field label={t('Nachname')} error={show('lastName')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('lastName')} className="input" value={f.lastName} onChange={set('lastName')} onBlur={blur('lastName')} autoComplete="family-name" />}</Field>
        <Field
          label={t('Benutzername')}
          hint={t('Damit finden dich Freunde. Jeder sieht ihn.')}
          error={show('username') ?? (free === false ? errors.username : null)}
          ok={free && USERNAME.test(f.username) ? t('Frei.') : null}
        >
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('username')} className="input" value={f.username} onChange={set('username')} onBlur={blur('username')} autoCapitalize="none" autoCorrect="off" autoComplete="username" />}
        </Field>
        <Field label={t('Geburtsdatum')} hint={t('Die App ist ab {n} Jahren.', { n: MIN_AGE })} error={show('birthDate')}>
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('birthDate')} className="input" type="date" value={f.birthDate} onChange={set('birthDate')} onBlur={blur('birthDate')} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} />}
        </Field>
        <Field label={t('Stadt')} error={show('city')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('city')} className="input" value={f.city} onChange={set('city')} onBlur={blur('city')} autoComplete="address-level2" />}</Field>
        <Field label={t('E-Mail')} error={show('email')}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('email')} className="input" type="email" value={f.email} onChange={set('email')} onBlur={blur('email')} autoComplete="email" autoCapitalize="none" />}</Field>
        <Field label={t('Passwort')} hint={t('Mindestens 8 Zeichen.')} error={show('password')}>
          {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!show('password')} className="input" type="password" value={f.password} onChange={set('password')} onBlur={blur('password')} autoComplete="new-password" />}
        </Field>
        <label className="check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="t-secondary">
            {t('Ich bin mindestens 18 Jahre alt und habe die')}{' '}
            <button type="button" className="accent-text" style={{ border: 0, background: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setPrivacy(true); }}>
              {LANG === 'en' ? 'privacy policy' : 'Datenschutzerklärung'}
            </button>{' '}
            {t('gelesen.')}
          </span>
        </label>
        {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy}>{busy ? t('Konto wird erstellt …') : t('Konto erstellen')}</button>
      </form>
      {privacy && <Datenschutz onBack={() => setPrivacy(false)} />}
    </Page>
  );
}

function Login({ onBack, onDone, onReset, onConfirm }: { onBack: () => void; onDone: (u: User) => void; onReset: () => void; onConfirm: (email: string, password?: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unconfirmed = !!error && /bestätige|confirm/i.test(error);
  return (
    <Page onBack={onBack} title={t('Anmelden')}>
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
        <Field label={t('E-Mail')}>{(id) => <input id={id} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" required />}</Field>
        <Field label={t('Passwort')}>{(id) => <input id={id} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}</Field>
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
              onConfirm(email.trim(), password);
            }}
          >
            {t('Code zum Bestätigen schicken')}
          </button>
        )}
        <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy || !email || !password}>{busy ? t('Anmelden …') : t('Anmelden')}</button>
        <button type="button" className="btn btn-text btn-block" style={{ marginTop: 12 }} onClick={onReset}>{t('Passwort vergessen?')}</button>
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
    <Page onBack={onBack} title={t('Passwort zurücksetzen')}>
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
          <h1 className="t-h2" style={{ marginTop: 12 }}>{t('Code eingeben')}</h1>
          <p style={{ margin: '8px 0 20px' }}>{t('Gibt es ein Konto zu {email}, bekommst du gleich eine E-Mail. Steht darin ein Code, gib ihn hier ein und wähle ein neues Passwort. Steht darin nur ein Link: Tipp ihn an, dann kannst du dort ein neues Passwort wählen.', { email })}</p>
          <CodeField value={code} onChange={setCode} />
          <Field label={t('Neues Passwort')} hint={t('Mindestens 8 Zeichen.')}>
            {(id, d) => <input id={id} aria-describedby={d} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
          </Field>
          {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy || code.length < 6 || password.length < 8}>
            {busy ? t('Wird gespeichert …') : t('Passwort speichern')}
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
          <p style={{ marginBottom: 20 }}>{t('Gib deine E-Mail-Adresse ein. Wir schicken dir einen Code.')}</p>
          <Field label={t('E-Mail')}>{(id) => <input id={id} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" required />}</Field>
          {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={!email}>{t('Code schicken')}</button>
        </form>
      )}
    </Page>
  );
}

/** Feld für den 6- bis 8-stelligen Code aus der E-Mail; iOS schlägt ihn aus der Mail-App vor. */
function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label={t('Code aus der E-Mail')}>
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
function ConfirmEmail({ email, password, onBack, onDone }: { email: string; password: string; onBack: () => void; onDone: (u: User) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Steht in der Mail nur ein Link (Standardvorlage von Supabase): Nach dem Antippen ist die Adresse bestätigt,
  // die Anmeldung mit dem eben gewählten Passwort klappt dann. Beim Zurückkehren in die App still versuchen.
  async function afterLink(silent: boolean) {
    if (!password) return onBack(); // Passwort unbekannt: zur Anmeldung
    if (!silent) setBusy(true);
    try {
      onDone(await api.signIn(email, password));
    } catch (err) {
      if (!silent) setError(/bestätige|confirm/i.test((err as Error).message) ? t('Die Adresse ist noch nicht bestätigt. Tipp zuerst den Link in der Mail an.') : (err as Error).message);
    } finally {
      if (!silent) setBusy(false);
    }
  }
  useEffect(() => {
    const onVis = () => !document.hidden && afterLink(true);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);
  const [wait, setWait] = useState(60);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
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
    <Page onBack={onBack} title={t('E-Mail bestätigen')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Icon name="mail" size={32} />
        <h1 className="t-h2" style={{ marginTop: 12 }}>{t('Schau in dein Postfach')}</h1>
        <p style={{ margin: '8px 0 20px' }}>{t('Wir haben dir einen Code an {email} geschickt. Gib ihn hier ein, dann bist du drin.', { email })}</p>
        <CodeField value={code} onChange={setCode} />
        {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
        <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy || code.length < 6}>
          {busy ? t('Wird geprüft …') : t('Bestätigen')}
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
          {wait > 0 ? t('Neuen Code in {n} s anfordern', { n: wait }) : t('Neuen Code anfordern')}
        </button>
        <div className="card" style={{ marginTop: 24 }}>
          <p className="t-body-strong">{t('In der Mail steht nur ein Link?')}</p>
          <p className="t-secondary muted" style={{ marginTop: 4 }}>{t('Tipp ihn an, um die Adresse zu bestätigen. Komm danach hierher zurück.')}</p>
          <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => afterLink(false)}>
            {password ? t('Ich habe bestätigt, weiter') : t('Ich habe bestätigt, zur Anmeldung')}
          </button>
        </div>
        <p className="t-caption muted" style={{ marginTop: 16 }}>{t('Keine Mail? Schau im Spam-Ordner nach.')}</p>
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
        <h1 className="t-h1">{t('Einchecken mit einem Tipp')}</h1>
        <p>{t('Wenn du die App in einer Kneipe öffnest, schaut sie kurz, wo du bist, und fragt: „Bist du hier?“')}</p>
        <ul style={{ paddingLeft: 20, margin: 0 }} className="muted">
          <li>{t('Nur, solange die App offen ist')}</li>
          <li>{t('Kein Tracking im Hintergrund')}</li>
          <li>{t('Niemand sieht deinen Standort, nur deine Kneipen')}</li>
        </ul>
      </div>
      <div className="btn-stack">
        <button className="btn btn-primary btn-block" onClick={onAllow}>{t('Standort erlauben')}</button>
        <button className="btn btn-text btn-block" onClick={onLater}>{t('Später')}</button>
      </div>
    </div>
  );
}

/** Nach dem Link aus der Mail „Passwort zurücksetzen“: angemeldet, jetzt ein neues Passwort wählen. */
export function SetNewPassword({ onDone }: { onDone: (u: User) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="page" role="dialog" aria-modal="true" aria-label={t('Neues Passwort')} style={{ zIndex: 60 }}>
      <div className="screen">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              onDone(await api.setNewPassword(password));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="lock" size={32} />
          <h1 className="t-h2" style={{ marginTop: 12 }}>{t('Neues Passwort wählen')}</h1>
          <p style={{ margin: '8px 0 20px' }}>{t('Du kommst über den Link aus der Mail. Wähle jetzt ein neues Passwort.')}</p>
          <Field label={t('Neues Passwort')} hint={t('Mindestens 8 Zeichen.')}>
            {(id, d) => <input id={id} aria-describedby={d} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />}
          </Field>
          {error && <div style={{ marginTop: 16 }}><Notice icon="error">{error}</Notice></div>}
          <button className="btn btn-primary btn-block" style={{ marginTop: 24 }} disabled={busy || password.length < 8}>
            {busy ? t('Wird gespeichert …') : t('Passwort speichern')}
          </button>
        </form>
      </div>
    </div>
  );
}
