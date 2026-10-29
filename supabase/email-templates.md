# E-Mail-Vorlagen für Supabase

Die App bestätigt E-Mails und setzt Passwörter mit einem **Code**, nicht mit einem Link. So bleibt man in der
Home-Bildschirm-App, statt in Safari zu landen. Dafür muss der Code (`{{ .Token }}`) in den Mails stehen.

Supabase → **Authentication** → **Emails** → Reiter **Templates**. Jeweils Betreff und Text ersetzen, dann **Save**.

## Confirm signup

**Subject:**

```
Dein Code für Tresenschicht: {{ .Token }}
```

**Message body (Source):**

```html
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000035;max-width:480px">
  <h2 style="margin:0 0 16px">Willkommen bei Tresenschicht</h2>
  <p>Gib diesen Code in der App ein, um deine E-Mail-Adresse zu bestätigen:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:24px 0">{{ .Token }}</p>
  <p style="color:#5E5F73">Der Code gilt eine Stunde. Du hast dich nicht registriert? Dann ignoriere diese Mail.</p>
</div>
```

## Reset Password

**Subject:**

```
Dein Code zum Zurücksetzen: {{ .Token }}
```

**Message body (Source):**

```html
<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000035;max-width:480px">
  <h2 style="margin:0 0 16px">Neues Passwort für Tresenschicht</h2>
  <p>Gib diesen Code in der App ein und wähle ein neues Passwort:</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:24px 0">{{ .Token }}</p>
  <p style="color:#5E5F73">Der Code gilt eine Stunde. Du hast das nicht angefordert? Dann ignoriere diese Mail, dein Passwort bleibt gleich.</p>
</div>
```

Hinweis: Der eingebaute Mailversand von Supabase schickt nur wenige Mails pro Stunde. Für mehr Nutzer unter
**Authentication** → **Emails** → **SMTP Settings** einen eigenen Dienst eintragen (z. B. Brevo oder Resend, kostenlos).
