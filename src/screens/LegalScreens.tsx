import type { ReactNode } from 'react';
import { Page } from '../components/ui';
import { AUTHORITY, OPERATOR, PRIVACY_DATE } from '../lib/legal';

function Mail() {
  return OPERATOR.email ? <a className="accent-text" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> : <span>per E-Mail (Adresse folgt)</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section stack">
      <h2 className="t-h3">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows, head }: { head: string[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="legal-table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Impressum({ onBack }: { onBack: () => void }) {
  return (
    <Page onBack={onBack} title="Impressum">
      <div className="stack">
        <h1 className="t-h2">Impressum</h1>
        <p className="muted">Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</p>
        <p>
          {OPERATOR.name}
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.city}
          <br />
          {OPERATOR.country}
        </p>
        <p>
          <strong>Kontakt:</strong> <Mail />
        </p>
        <p>
          <strong>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:</strong>
          <br />
          {OPERATOR.name}, Anschrift wie oben
        </p>
        <p className="muted t-secondary">
          Tresenschicht ist ein privates, nicht kommerzielles Projekt für einen Freundeskreis. Kartendaten © OpenStreetMap contributors,
          verfügbar unter der Open Database License (ODbL).
        </p>
      </div>
    </Page>
  );
}

export function Datenschutz({ onBack }: { onBack: () => void }) {
  return (
    <Page onBack={onBack} title="Datenschutzerklärung">
      <h1 className="t-h2">Datenschutzerklärung</h1>
      <p className="muted t-secondary" style={{ marginTop: 4 }}>Stand: {PRIVACY_DATE}</p>

      <Section title="Verantwortlicher">
        <p>
          Diese App betreibt {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}. Fragen zum Datenschutz schickst du <Mail />.
        </p>
        <p>
          Tresenschicht richtet sich an einen Freundeskreis und steht nicht im App Store. Mit der Registrierung bestätigst du, diese
          Erklärung gelesen zu haben.
        </p>
      </Section>

      <Section title="Welche Daten wir verarbeiten">
        <p>Wir speichern nur, was die App zum Funktionieren braucht.</p>
        <Rows
          head={['Daten', 'Wofür', 'Rechtsgrundlage', 'Wie lange']}
          rows={[
            ['Vorname, Nachname, Geburtsdatum, Benutzername, Stadt, E-Mail', 'Konto, Alterskontrolle, Freunde finden', 'Nutzungsvertrag (Art. 6 Abs. 1 b DSGVO)', 'bis zur Löschung deines Kontos'],
            ['Passwort', 'Anmeldung; nur verschlüsselt gespeichert, nie im Klartext', 'Nutzungsvertrag', 'bis zur Löschung deines Kontos'],
            ['Profilbild', 'Anzeige im Profil und in Freundeslisten', 'Einwilligung (Art. 6 Abs. 1 a DSGVO)', 'bis du es oder dein Konto löschst'],
            ['Check-ins (Kneipe, Zeitpunkt, Genauigkeit des Standorts)', 'Sammlung, Karte, Statistik, Badges', 'Nutzungsvertrag', 'bis du den Check-in oder dein Konto löschst'],
            ['Merkliste', 'Kneipen, die du besuchen willst', 'Nutzungsvertrag', 'bis du sie entfernst oder dein Konto löschst'],
            ['Freiwillige Angaben (Text, Barkeeper, Getränk)', 'Erinnerung an einen Besuch', 'Einwilligung', 'bis du sie löschst'],
            ['Fotos zu Besuchen', 'Anzeige für deine Freunde', 'Einwilligung', 'bis du sie löschst'],
            ['Freundschaften, Anfragen, Sperren', 'Sichtbarkeit deiner Daten für Freunde, Schutz vor Belästigung', 'Nutzungsvertrag', 'bis zur Auflösung oder Aufhebung'],
            ['Technische Daten (IP-Adresse, Zeitpunkt der Anfrage)', 'Sicherheit und Fehlersuche', 'berechtigtes Interesse (Art. 6 Abs. 1 f DSGVO)', '30 Tage'],
            ['Meldungen von Inhalten', 'Schutz vor Missbrauch', 'berechtigtes Interesse', 'bis die Meldung geklärt ist, höchstens 12 Monate'],
          ]}
        />
        <p>Wir verkaufen deine Daten nicht und nutzen sie nicht für Werbung. Wir erstellen keine Profile über dein Verhalten außerhalb der App.</p>
      </Section>

      <Section title="Standort">
        <p>Die App fragt deinen Standort nur ab, während sie geöffnet ist, und nur, um dir „Bist du hier?“ zu zeigen. Im Hintergrund verfolgt sie dich nicht.</p>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Die Freigabe kannst du jederzeit in den iPhone-Einstellungen ändern oder widerrufen. Ohne Standort kannst du nicht einchecken.</li>
          <li>Dein Standort wird an den Server geschickt, dort mit den Kneipen in der Nähe verglichen und danach verworfen.</li>
          <li>Gespeichert wird nur, was du bestätigst: die Kneipe, der Zeitpunkt und wie genau der Standort war. Koordinaten oder einen Bewegungsverlauf speichern wir nicht.</li>
          <li>Andere sehen nie, wo du gerade bist, sondern nur deine Kneipen, und nur wenn ihr befreundet seid.</li>
        </ul>
      </Section>

      <Section title="Fotos und freiwillige Angaben">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Text, Barkeeper-Name, Getränk und Foto sind freiwillig und kommen erst nach dem Check-in dazu. Du kannst sie jederzeit ändern oder löschen.</li>
          <li>Fotos liegen auf unserem Server, damit deine Freunde sie sehen können. Vor dem Hochladen verkleinert die App das Bild und entfernt den Aufnahmeort.</li>
          <li>Lade nur Fotos hoch, auf denen niemand zu sehen ist, der damit nicht einverstanden ist. Das gilt auch für Barkeeper und andere Gäste.</li>
          <li>Löschst du einen Beitrag, wird das Foto vom Server gelöscht.</li>
        </ul>
      </Section>

      <Section title="Wer deine Daten sehen kann">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li><strong>Alle Nutzer</strong> sehen nur dein Profilbild und deinen Benutzernamen.</li>
          <li><strong>Deine Freunde</strong> (beide haben die Anfrage bestätigt) sehen zusätzlich Name, Stadt, deine Kneipen, Check-ins, Badges und Fotos.</li>
          <li><strong>Niemand</strong> sieht dein Geburtsdatum, deine E-Mail-Adresse oder deinen Standort.</li>
          <li>Als Betreiber kann ich technisch auf die Datenbank zugreifen, nutze das aber nur für Wartung, Fehlersuche und um Meldungen zu klären.</li>
        </ul>
      </Section>

      <Section title="Dienstleister und Weitergabe">
        <Rows
          head={['Dienst', 'Wofür', 'Welche Daten', 'Sitz']}
          rows={[
            ['Supabase (Supabase Inc., USA)', 'Konten, Check-ins, Fotos speichern, E-Mails mit Code', 'alle Daten aus der Tabelle oben', 'Rechenzentrum in Frankfurt am Main (EU)'],
            ['OpenFreeMap (openfreemap.org)', 'Kartenbild anzeigen', 'IP-Adresse und angezeigter Kartenausschnitt', 'siehe openfreemap.org'],
            ['GitHub Pages (GitHub Inc., USA)', 'App-Dateien ausliefern', 'IP-Adresse', 'USA (EU-US Data Privacy Framework)'],
          ]}
        />
        <p>Die Kartendaten stammen von OpenStreetMap („© OpenStreetMap contributors“). Eine Weitergabe an andere Stellen findet nicht statt, außer wenn ein Gesetz es verlangt.</p>
      </Section>

      <Section title="Speicherdauer und Löschung">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Dein Konto und alle Inhalte bleiben, bis du das Konto löschst.</li>
          <li>Du löschst dein Konto in der App unter Profil. Dann verschwinden Profil, Check-ins, Sammlung, Freundschaften und Fotos sofort, aus Sicherungen spätestens nach 30 Tagen.</li>
          <li>Technische Protokolle mit IP-Adressen löscht der Hoster nach 30 Tagen.</li>
          <li>Vorgeschlagene Kneipen, die nicht freigegeben werden, lösche ich nach 30 Tagen.</li>
        </ul>
      </Section>

      <Section title="Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Schreib
          dafür <Mail />. Ich antworte innerhalb eines Monats. Eine Einwilligung kannst du jederzeit widerrufen, zum Beispiel indem du ein Foto löschst.
        </p>
        <p>
          Du kannst dich bei einer Datenschutzaufsicht beschweren, zum Beispiel in deinem Bundesland oder bei der für mich zuständigen Behörde:{' '}
          {AUTHORITY.name}, {AUTHORITY.address},{' '}
          <a className="accent-text" href={AUTHORITY.web} target="_blank" rel="noreferrer">
            {AUTHORITY.web.replace('https://', '')}
          </a>
          .
        </p>
      </Section>

      <Section title="Mindestalter und Änderungen">
        <p>Die App ist ab 18 Jahren. Bist du jünger, nutze sie nicht.</p>
        <p>Ändert sich die App, passe ich diese Erklärung an. Das Datum der letzten Änderung steht oben.</p>
      </Section>
    </Page>
  );
}
