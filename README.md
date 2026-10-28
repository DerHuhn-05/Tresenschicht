# Kneipen-App (Arbeitstitel)

Web-App (PWA) fürs iPhone: Kneipen sammeln per GPS-Check-in, eigene Karte, Freunde mit privaten Profilen.
Gebaut nach dem Anforderungsblatt „Kneipen-Check-in-App: Anforderungen und Plan“ und dem Design System „Kneipen-App (Arbeitstitel)“.

## Schnellstart (Demo, ohne Backend)

```bash
npm install
npm run dev        # http://localhost:5173
```

Ohne Supabase-Zugangsdaten läuft die App im **Demo-Modus**: Daten bleiben im Browser, der Standort ist simuliert
(Hamburg, erfundene Kneipen). Auf der Karte setzt „Standort setzen“ deinen Standort per Tipp, „Andere Kneipe“ springt
zu einer Stelle mit mehreren Treffern.

## Mit echtem Backend (Supabase Free, etwa 0 € im Monat)

1. Projekt auf supabase.com anlegen, Region **EU (Frankfurt)**.
2. SQL-Editor: `supabase/schema.sql` ausführen.
3. Ländergrenzen und Kneipen: im GitHub-Repo das Secret `SUPABASE_DB_URL` anlegen (Supabase → **Connect** →
   **Session pooler**, `[YOUR-PASSWORD]` durch das Datenbank-Passwort ersetzen). Dann Actions → **Kneipen importieren** →
   Run workflow. Der Workflow lädt die Ländergrenzen (Natural Earth) und die OSM-Auszüge von Geofabrik, filtert
   Kneipen, Bars und Biergärten (ohne Clubs, ohne Geschlossenes) und schreibt sie in die Datenbank. Zum Testen nur
   `germany` eintragen. Er läuft danach am 1. jedes Monats von selbst und hält die Daten aktuell.
4. Lokal geht es auch: `osmium tags-filter … nwr/amenity=pub,bar,biergarten`, `osmium export … -f geojsonseq --add-unique-id=type_id`,
   `node scripts/osm-to-csv.mjs pubs.geojsonseq > pubs.csv`, dann `psql "$DB_URL" -f supabase/import-pubs.sql`.
5. `.env.example` nach `.env` kopieren, `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` eintragen.
6. Dein Konto zum Prüfer machen: `update profiles set is_admin = true where username = 'deinname';`
7. Unter Authentication → URL Configuration die Adresse der App als Site URL eintragen (für Bestätigungs- und Passwort-Links).

## Veröffentlichen

`npm run build` erzeugt `dist/`. Kostenlos z. B. über GitHub Pages (`.github/workflows/deploy.yml`, Secrets
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Freunde öffnen die Adresse in Safari → Teilen → „Zum Home-Bildschirm“.

`.github/workflows/keepalive.yml` ruft die Datenbank täglich auf, damit Supabase Free nicht nach 7 Tagen pausiert
(Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`). Datensicherung: regelmäßig `pg_dump` oder Supabase-Backups.

## Was umgesetzt ist

| Bereich | Umsetzung |
| --- | --- |
| A Konto | Registrierung mit allen Feldern aus A1, Benutzername einmalig ohne Groß/Klein (Index + Live-Prüfung), Mindestalter 18 (Datenbank-Regel), E-Mail-Bestätigung, Passwort zurücksetzen, Konto löschen, Standort-Erklärung im Onboarding |
| B Karte | MapLibre mit eigenem Skin in Markenfarben (hell, dunkel, hoher Kontrast), Pins aus dem Design System, Sammel-Marker mit Zahl, Listenansicht als Alternative, Sammlung als Karte auch bei Freunden |
| C Check-in | Prüfung beim Öffnen, nur „Bist du im …?“, Auswahl bei mehreren Treffern mit „Keine davon“, 50 m Umkreis, Genauigkeit ≤ 100 m, 5-Minuten-Sperre und 12-Stunden-Regel **serverseitig** (`check_in()`), Sperre sichtbar als Countdown, Fehlklick in den ersten 5 Minuten zurücknehmen, „Nein“ gilt 30 Min. oder bis 100 m entfernt |
| D Daten | OSM-Import (Kneipe, Bar, Biergarten, keine Clubs), Kneipe eintragen mit „Meinst du …?“, Änderung vorschlagen, geschlossen melden, Prüfliste, Suche nach Name und Stadt |
| E Sammlung | Kneipe-ID + Zeitpunkt, Zahl, Liste, Karte, Statistik (Besuche, Städte, Länder, Stammkneipe), Details nachträglich (Text, Barkeeper, Getränk inkl. alkoholfrei, Foto) |
| F Freunde | Suche nach Benutzername, Anfrage annehmen/ablehnen, nur gegenseitige Freundschaft, private Profile (sonst nur Bild und Name), Feed |
| G Fotos | Auf dem Server (privater Bucket, nur Freunde), vorher auf 1.600 px / ~300 KB verkleinert, GPS-Daten entfernt, Löschen entfernt die Datei, Melden-Funktion |
| H Datenschutz | Standort nur bei geöffneter App (Abfrage endet im Hintergrund), nie für andere sichtbar |

## Aufbau

```
design/            Tokens und Brand-Regeln aus dem Design System (Quelle für src/styles/tokens.css)
src/api/           Schnittstelle (types.ts), Demo-Backend (demo.ts), Supabase (supabase.ts)
src/map/           Kartenskin und Kartenkomponente
src/screens/       Bildschirme
supabase/schema.sql Tabellen, Zugriffsregeln, Check-in-Regeln, Speicher
scripts/           Token-Build, OSM-Umwandlung, Ländergrenzen
```

Farben ändern: `design/tokens.json` bearbeiten, dann `npm run tokens`.

## Offen

- Push-Nachrichten (iOS nur für installierte Web-Apps; Telegram-Bot oder ntfy als Alternative), E-Mail-Erinnerung nach 6 Tagen.
- Datenschutzerklärung und Impressum einbinden (Entwurf liegt als eigenes Dokument vor).
- Fake-GPS-Erkennung und Prüfung auffälliger Sprünge zwischen Check-ins.
- Beta-Funktionen: Badges, Merkliste, Filter.
