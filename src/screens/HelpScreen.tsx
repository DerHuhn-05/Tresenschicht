import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Field, Notice, Page } from '../components/ui';
import { OPERATOR } from '../lib/legal';
import { useApp } from '../state/app';

const TOPICS = ['Frage', 'Problem melden', 'Kneipe oder Daten falsch', 'Datenschutz', 'Sonstiges'] as const;

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Der Check-in klappt nicht',
    a: 'Die App braucht deinen Standort, solange sie offen ist. Prüfe unter Profil → Standort, ob er erlaubt ist. Drinnen ist GPS manchmal ungenau: kurz ans Fenster oder vor die Tür gehen hilft.',
  },
  {
    q: 'Eine Kneipe fehlt oder ist falsch',
    a: 'Auf der Karte „Kneipe fehlt?“ antippen und die Kneipe vorschlagen. Falsche Angaben korrigierst du in der Kneipe über „Änderung vorschlagen“ oder „Geschlossen melden“. Wir prüfen jeden Vorschlag.',
  },
  {
    q: 'Wer sieht meine Check-ins?',
    a: 'Nur deine Freunde. Dein Profil ist privat: Sammlung, Check-ins und Fotos sehen nur Freunde.',
  },
  {
    q: 'Wie lösche ich mein Konto?',
    a: 'Unter Profil ganz unten „Konto löschen“. Profil, Sammlung, Check-ins, Fotos und Freundschaften werden dann gelöscht.',
  },
];

/** Hilfe: häufige Fragen und Kontakt per E-Mail. Die Mail öffnet sich vorausgefüllt in der Mail-App. */
export function HelpScreen() {
  const app = useApp();
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('Frage');
  const [text, setText] = useState('');
  const email = OPERATOR.email;

  const mailto = () => {
    const subject = `Tresenschicht: ${topic}`;
    const footer = [
      '',
      '—',
      app.user ? `Nutzername: @${app.user.username}` : 'Nicht angemeldet',
      `Gerät: ${navigator.userAgent}`,
    ].join('\n');
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text.trim()}\n${footer}`)}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      app.notify('E-Mail-Adresse kopiert', 'success');
    } catch {
      app.notify(email);
    }
  };

  return (
    <Page onBack={app.pop} title="Hilfe und Kontakt">
      <h1 className="t-h2" style={{ marginBottom: 16 }}>Hilfe und Kontakt</h1>

      <section className="section">
        <h2 className="t-h3 section-title">Häufige Fragen</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>
                <span>{f.q}</span>
                <Icon name="chevron-down" size={20} muted />
              </summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="t-h3 section-title">Schreib uns</h2>
        <div className="chips" role="group" aria-label="Thema" style={{ marginBottom: 16 }}>
          {TOPICS.map((t) => (
            <button key={t} className="chip" aria-pressed={topic === t} onClick={() => setTopic(t)}>
              {t}
            </button>
          ))}
        </div>
        <Field label="Deine Nachricht" hint="Beim Senden öffnet sich deine Mail-App mit dieser Nachricht.">
          {(id, d) => <textarea id={id} aria-describedby={d} className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={5} />}
        </Field>
        <a
          className={`btn btn-primary btn-block${text.trim() ? '' : ' is-disabled'}`}
          href={text.trim() ? mailto() : undefined}
          aria-disabled={!text.trim()}
          style={{ marginTop: 8 }}
        >
          <Icon name="mail" size={20} /> E-Mail schreiben
        </a>
        <div style={{ marginTop: 16 }}>
          <Notice icon="info">
            Du bekommst sofort eine automatische Bestätigung. Wir antworten in der Regel innerhalb weniger Tage.
          </Notice>
        </div>
        <button className="btn btn-text btn-block" style={{ marginTop: 8 }} onClick={copy}>
          {email} kopieren
        </button>
      </section>
    </Page>
  );
}
