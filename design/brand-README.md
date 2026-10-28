Gestalte jede Oberfläche der Kneipen-App schlicht, linear und mit schweren Überschriften. Nachtblau trägt Text und Hauptaktionen, Bernstein setzt den einen Akzent, Weiß und Grautöne halten Ruhe. Der Name der App ist noch offen; „Kneipen-App“ ist ein Arbeitstitel. Die Zielplattform ist das iPhone (iOS), alle Maße sind in Punkt (pt).

## Inhalt und Ton

- Sprich die Person mit „du“ an, kurz und im Präsens. Ein Satz pro Gedanke.
- Schreibe Deutsch, ohne Emoji und ohne Ausrufezeichen, außer bei einem echten Erfolgsmoment.
- Benenne die Handlung, nicht das Bedienelement: „Ja, ich bin hier“, „Kneipe fehlt?“, nicht „OK“ oder „Weiter“.
- Beim Check-in fragt die App nur: „Bist du im Zum Anker?“ Alles Weitere (Text, Barkeeper, Getränk, Foto) kommt nachträglich und heißt „Details hinzufügen“.
- Gib Zahlen mit Einheit: „120 m“, „27 Kneipen“, „vor 2 Std.“. Zähler in Überschrift-Größe nutzen `stat`.
- Fehlermeldungen sagen, was passiert ist und was die Person tun kann: „Kein Standort. Öffne die Einstellungen und erlaube den Zugriff, während die App geöffnet ist.“
- Schreibe „Kneipe“, wenn Kneipe, Bar oder Biergarten gemeint sind; nenne den genauen Typ nur im Detail.

## Farbe

- Setze `bg` als Seitenhintergrund und `text` für Text. Sekundärtext ist `text-muted`.
- Primärbutton: `action` mit `on-action`. Im hellen Modus ist das Nachtblau, im dunklen Modus Bernstein.
- Bernstein (`accent`) ist der einzige Akzent: Badges, gewählte Zustände, Symbol im Marker. Setze Text auf Bernstein-Flächen immer in `on-accent`. Bernstein-Text auf Weiß ist nur als `text-accent` erlaubt.
- Das Nachtblau `navy-900` (`#000035`) gilt als „fast Schwarz“. Verwende kein reines Schwarz (`#000000`).
- Grautöne sind leicht bläulich (`gray-50` bis `gray-900`). Rahmen von Bedienelementen sind `border`; Trennlinien zwischen Zeilen `border-subtle`.
- Fehler (`danger`, Rot) und Erfolg (`success`, Blau) stehen nie ohne Wort oder Icon.
- Keine Verläufe, keine Schlagschatten. Tiefe entsteht durch Fläche (`surface` auf `bg-subtle`) und Rahmen.

## Typografie

- Systemschrift des iPhones (SF Pro). Überschriften `display`, `h1`, `h2`, `h3` sind schwer (800 und 700) und leicht enger gesetzt; alles andere ist 400 bis 600.
- Verwende ausschließlich die Stile aus Typografie. Kein Stil unter 12 pt. Fließtext ist `body` (17 pt).
- Alle Texte folgen der iOS-Einstellung für Textgröße; Layouts brechen um statt abzuschneiden.
- Text ist linksbündig, nie in Großbuchstaben, und nie auf Fotos ohne einfarbige Fläche dahinter.

## Raster und Layout

- Abstände nur aus `space-1` bis `space-16` (4-pt-Raster). Seitenrand ist `space-5` (20 pt), Innenabstand von Sheets `space-5`, Abstand zwischen Abschnitten `space-8`.
- Ecken: `radius-md` (8) für Buttons, Felder und Karten; `radius-lg` (12) für das Check-in-Sheet und Feed-Bilder; `radius-full` für Profilbild und Cluster-Marker. Die Marke ist klar und linear; alle Ecken sind gerundet, kein Radius über 12 außer rund.
- Tippflächen sind mindestens 44 × 44 pt (`touch-min`), Buttons 52 pt hoch (`button-height`).
- Respektiere die Safe Areas von iOS (Notch, Home-Indikator); Inhalte enden nie darunter.
- Tab-Leiste mit vier Einträgen: Karte, Meine Kneipen, Freunde, Profil. Jeder Eintrag hat Icon und Text (`tab-label`).

## Icons und Marker

- Icons stammen ausschließlich aus dem Set IconSet: Linie 2 pt auf einem 24-pt-Raster (`icon-md`), runde Enden und Ecken, Linienfarbe `text` oder `text-muted`, dazu ein kleiner Bernstein-Akzent (`accent`). Kein Emoji als Icon, keine fremden Icon-Sets daneben.
- Karten-Marker liegen unter Marker: Pin `pub-marker.svg` (40 × 48) und Sammel-Marker `cluster-marker.svg`. Der Pin trägt als Symbol das Icon `pub` aus dem Icon-Set. Die Spitze des Pins liegt genau auf dem Ort der Kneipe.
- Die Marker sind Entwürfe; ein Logo gibt es noch nicht. Bis dahin steht der Name in `display` in Nachtblau.

## Bewegung

- Übergänge dauern höchstens 250 ms und sind einfach (Einblenden, Hochschieben des Sheets). Bei „Bewegung reduzieren“ wird nur überblendet.

## Barrierefreiheit

Kontrastwerte, Mindestgrößen, Screenreader-Regeln und der Modus „Hoher Kontrast“ stehen im Abschnitt Barrierefreiheit. Sie gelten für jede neue Oberfläche, bevor sie fertig ist.
