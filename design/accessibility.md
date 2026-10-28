# Barrierefreiheit

Die App muss für Menschen mit Sehschwäche, Farbfehlsichtigkeit, Bewegungseinschränkung und Screenreader nutzbar sein. Jede Regel hier ist messbar; die Maße stehen als Tokens in `size`, `spacing` und `stroke`.

## Lesbarkeit

- Fließtext ist mindestens 17 pt (`body`). Kleiner als `secondary` (15 pt) wird nur Hilfstext (`caption` 13 pt, `legal` 12 pt); unter 12 pt gibt es nichts.
- Alle Schriften skalieren mit der iOS-Einstellung für Textgröße (Dynamic Type) bis zur größten Barrierefreiheitsstufe. Die Pixelwerte der Typo-Stile gelten für die mittlere Stufe „Groß“. Layouts brechen um statt abzuschneiden: Text darf mehrzeilig werden, Buttons wachsen in der Höhe.
- Überschriften sind schwer (Gewicht 700 bis 800), Text normal (400) oder halbfett (600). Bei aktivierter iOS-Einstellung „Fetter Text“ wird 400 zu 600 und 600 zu 700.
- Zeilenlänge im Fließtext höchstens 65 Zeichen; auf dem iPhone ergibt sich das durch den Seitenrand `space-5` (20 pt).
- Text ist linksbündig und nie in Großbuchstaben gesetzt. Kein Text über Fotos ohne einfarbige Fläche (`surface-inverse`) dahinter.

## Kontrast

Maßstab ist WCAG 2.2: Text mindestens 4,5:1, große Schrift (ab 24 pt oder fett ab 19 pt), Rahmen, Fokusring und Symbole mindestens 3:1. Der Modus „Hoher Kontrast“ verlangt für Text mindestens 7:1. Die Werte unten sind aus den Farbwerten berechnet; in Klammern steht die Mindestanforderung.

| Vordergrund | Hintergrund | Hell | Dunkel | Hoher Kontrast |
| --- | --- | --- | --- | --- |
| `text` | `bg` | 20,0:1 (≥ 4,5) | 20,0:1 (≥ 4,5) | 20,6:1 (≥ 7) |
| `text` | `bg-subtle` | 18,5:1 (≥ 4,5) | 20,6:1 (≥ 4,5) | 19,1:1 (≥ 7) |
| `text` | `surface` | 20,0:1 (≥ 4,5) | 17,7:1 (≥ 4,5) | 20,6:1 (≥ 7) |
| `text-muted` | `bg` | 6,2:1 (≥ 4,5) | 11,1:1 (≥ 4,5) | 9,3:1 (≥ 7) |
| `text-muted` | `bg-subtle` | 5,8:1 (≥ 4,5) | 11,4:1 (≥ 4,5) | 8,6:1 (≥ 7) |
| `text-muted` | `surface` | 6,2:1 (≥ 4,5) | 9,8:1 (≥ 4,5) | 9,3:1 (≥ 7) |
| `text-inverse` | `surface-inverse` | 20,0:1 (≥ 4,5) | 20,0:1 (≥ 4,5) | 20,6:1 (≥ 7) |
| `text-accent` | `bg` | 5,8:1 (≥ 4,5) | 13,1:1 (≥ 4,5) | 8,6:1 (≥ 7) |
| `text-accent` | `surface` | 5,8:1 (≥ 4,5) | 11,6:1 (≥ 4,5) | 8,6:1 (≥ 7) |
| `on-action` | `action` | 20,0:1 (≥ 4,5) | 9,6:1 (≥ 4,5) | 20,6:1 (≥ 7) |
| `on-accent` | `accent` | 9,6:1 (≥ 4,5) | 9,6:1 (≥ 4,5) | 9,9:1 (≥ 7) |
| `on-accent-subtle` | `accent-subtle` | 17,9:1 (≥ 4,5) | 14,4:1 (≥ 4,5) | 18,4:1 (≥ 7) |
| `danger` | `bg` | 5,8:1 (≥ 4,5) | 8,7:1 (≥ 4,5) | 9,1:1 (≥ 7) |
| `danger` | `surface` | 5,8:1 (≥ 4,5) | 7,8:1 (≥ 4,5) | 9,1:1 (≥ 7) |
| `success` | `bg` | 6,0:1 (≥ 4,5) | 10,5:1 (≥ 4,5) | 9,4:1 (≥ 7) |
| `success` | `surface` | 6,0:1 (≥ 4,5) | 9,3:1 (≥ 4,5) | 9,4:1 (≥ 7) |
| `border` | `bg` | 4,2:1 (≥ 3) | 7,1:1 (≥ 3) | 20,0:1 (≥ 3) |
| `border` | `surface` | 4,2:1 (≥ 3) | 6,3:1 (≥ 3) | 20,0:1 (≥ 3) |
| `focus` | `bg` | 10,3:1 (≥ 3) | 13,1:1 (≥ 3) | 20,6:1 (≥ 3) |
| `focus` | `surface` | 10,3:1 (≥ 3) | 11,6:1 (≥ 3) | 20,6:1 (≥ 3) |
| `marker-glyph` | `marker` | 9,6:1 (≥ 3) | 9,6:1 (≥ 3) | 9,9:1 (≥ 3) |
| `marker` | `bg` | 20,0:1 (≥ 3) | 9,6:1 (≥ 3) | 20,6:1 (≥ 3) |
| `marker` | `surface` | 20,0:1 (≥ 3) | 8,6:1 (≥ 3) | 20,6:1 (≥ 3) |
| `action` | `bg` | 20,0:1 (≥ 3) | 9,6:1 (≥ 3) | 20,6:1 (≥ 3) |

- Bernstein (`accent`) ist als Text auf Weiß nicht lesbar (2,1:1). Auf Weiß nur `text-accent`, als Fläche immer mit `on-accent`.
- Der Karten-Pin ist Nachtblau mit Bernstein-Symbol (hell) oder Bernstein mit Nachtblau-Symbol (dunkel), damit er sich auf jeder Karte abhebt.
- Die Kartenansicht selbst (OpenStreetMap-Kacheln) ist nicht von uns gefärbt; die Pin-Farben sind auf hellem und dunklem Kartenstil auf 3:1 geprüft.

## Farben allein reichen nie

- Fehler und Erfolg haben immer Wort und Icon, nicht nur Farbe. Erfolg ist Blau (`success`), Fehler Rot (`danger`); beide unterscheiden sich damit nicht nur auf der Rot-Grün-Achse.
- Gewählte Zustände (Kneipe in der Auswahl, ausgewählter Marker) zeigen zusätzlich Haken, größere Form oder Rahmen `stroke-strong`, nicht nur Farbwechsel.
- Karten-Marker zeigen bei Auswahl den Kneipennamen als Text.

## Bedienung

- Jede Tippfläche ist mindestens 44 × 44 pt (`touch-min`), auch wenn das sichtbare Symbol kleiner ist. Zwischen zwei Tippflächen mindestens 8 pt (`space-2`).
- Buttons sind 52 pt hoch (`button-height`); Listenzeilen mindestens 56 pt (`row-height`).
- Der Check-in braucht einen Tipp. Es gibt keine Gesten, die nur mit zwei Fingern oder Wischen gehen; jede Wischaktion hat einen sichtbaren Button.
- Fokusring: 3 pt (`focus-width`), Farbe `focus`, 2 pt Abstand (`focus-offset`); er ist auf allen Flächen mindestens 3:1.
- Bewegung: Animationen höchstens 250 ms. Bei iOS-Einstellung „Bewegung reduzieren“ werden sie durch Überblenden ersetzt.

## Screenreader (VoiceOver)

- Jedes Bedienelement hat ein Label mit Funktion, nicht mit Form: „Ja, ich bin hier“, nicht „Button“.
- Karten-Marker lesen Name, Typ und Entfernung vor: „Zum Anker, Kneipe, 120 Meter“. Ein Sammel-Marker sagt: „12 Kneipen, zum Vergrößern doppeltippen“.
- Die Karte hat zusätzlich eine Listenansicht mit denselben Orten, damit niemand an der Karte hängen bleibt.
- Das Check-in-Sheet liest zuerst die Frage, dann die Antworten vor, in der Reihenfolge von oben nach unten.
- Nutzerfotos haben ein optionales Textfeld „Bildbeschreibung“; ohne Eintrag liest VoiceOver „Foto von {Benutzername} in {Kneipenname}“.

## Modi

Die App liefert drei Farbmodi: Hell, Dunkel und Hoher Kontrast. Der Modus folgt der iOS-Einstellung (Dunkelmodus, „Kontrast erhöhen“); Nutzerinnen und Nutzer können ihn nicht einzeln abschalten.
