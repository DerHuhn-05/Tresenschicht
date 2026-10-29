// Vorschläge (neue Kneipe, Änderung, geschlossen) per E-Mail prüfen.
//
// 1. Nach einem Vorschlag ruft die App { action: 'notify', editId } mit dem Token der angemeldeten Person auf.
//    Die Funktion schickt eine Mail an ADMIN_EMAIL mit Name, Ort und einem Link zur Prüfseite der App.
// 2. Die Prüfseite (…/?review=<id>&t=<token>) holt die Angaben mit { action: 'get' } und entscheidet mit
//    { action: 'decide', accept }. Der Token im Link ist eine Signatur der Vorschlags-ID, ein Login ist nicht nötig.
//    Der Link selbst ändert nichts: E-Mail-Programme, die Links vorab öffnen, lösen also keine Freigabe aus.
// 3. Nach der Entscheidung sieht die Person die Rückmeldung beim nächsten Öffnen der App. Ist MAIL_FROM
//    (Absender mit eigener Domain) gesetzt, bekommt sie zusätzlich eine E-Mail.
//
// Secrets (supabase secrets set …): RESEND_API_KEY, optional ADMIN_EMAIL, APP_URL, MAIL_FROM.
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'tresenschicht@gmx.net';
const APP_URL = (Deno.env.get('APP_URL') || 'https://derhuhn-05.github.io/Tresenschicht/').replace(/\/?$/, '/');
// Ohne eigene Domain verschickt Resend nur an die eigene Kontoadresse (ADMIN_EMAIL)
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? '';
const ADMIN_FROM = MAIL_FROM || 'Tresenschicht <onboarding@resend.dev>';

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const KIND = { neu: 'Neue Kneipe', aenderung: 'Änderung', geschlossen: 'Als geschlossen gemeldet' } as Record<string, string>;
const TYPE = { kneipe: 'Kneipe', bar: 'Bar', biergarten: 'Biergarten' } as Record<string, string>;

async function sign(id: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`pub-review:${id}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function verify(id: string, token: string) {
  const want = await sign(id);
  if (typeof token !== 'string' || token.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function sendMail(to: string, from: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY fehlt');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!r.ok) throw new Error(`Mailversand fehlgeschlagen: ${r.status} ${await r.text()}`);
}

/** Vorschlag mit allem, was Mail und Prüfseite brauchen */
async function loadEdit(id: string) {
  const { data: e, error } = await db.from('pub_edits').select('*, pubs(*), profiles!pub_edits_user_id_fkey(username)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!e) return null;
  const v = (e.vorschlag ?? {}) as Record<string, any>;
  const pub = e.pubs as Record<string, any> | null;
  const name = v.name ?? pub?.name ?? '';
  const lat = v.lat ?? pub?.lat;
  const lon = v.lon ?? pub?.lon;
  let photoUrl: string | null = null;
  if (v.photoPath) {
    const { data } = await db.storage.from('photos').createSignedUrl(v.photoPath, 60 * 60 * 24 * 7);
    photoUrl = data?.signedUrl ?? null;
  }
  return {
    id: e.id as string,
    kind: e.kind as string,
    status: e.status as string,
    userId: e.user_id as string,
    mailedAt: e.mailed_at as string | null,
    at: e.created_at as string,
    username: (e.profiles as any)?.username ?? 'unbekannt',
    name,
    currentName: pub?.name ?? null,
    type: v.type ?? pub?.type ?? 'kneipe',
    address: v.address ?? pub?.address ?? '',
    city: v.city ?? pub?.city ?? '',
    country: pub?.country ?? '',
    lat, lon,
    openingHours: v.openingHours ?? null,
    withCheckIn: !!v.checkin,
    photoUrl,
  };
}

type Edit = NonNullable<Awaited<ReturnType<typeof loadEdit>>>;

function details(e: Edit) {
  const rows: [string, string][] = [['Art', TYPE[e.type] ?? e.type], ['Adresse', [e.address, e.city].filter(Boolean).join(', ') || '–']];
  if (e.kind === 'aenderung') {
    if (e.name && e.name !== e.currentName) rows.unshift(['Neuer Name', `${e.currentName} → ${e.name}`]);
    if (e.openingHours) rows.push(['Öffnungszeiten', e.openingHours]);
  }
  if (e.kind === 'neu') rows.push(['Check-in vor Ort', e.withCheckIn ? 'ja' : 'nein']);
  rows.push(['Von', `@${e.username}`]);
  return rows;
}

async function notifyAdmin(e: Edit) {
  const link = `${APP_URL}?review=${e.id}&t=${await sign(e.id)}`;
  const map = e.lat != null ? `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=19/${e.lat}/${e.lon}` : '';
  const subject = `${KIND[e.kind] ?? 'Vorschlag'}: ${e.name}${e.city ? ` in ${e.city}` : ''}`;
  const rows = details(e);
  const html = `<!doctype html><html><body style="margin:0;background:#F4F4F8;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000035">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:24px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:13px;color:#5A5C80;padding-bottom:4px">${esc(KIND[e.kind] ?? 'Vorschlag')}</td></tr>
<tr><td style="font-size:24px;font-weight:800;padding-bottom:16px">${esc(e.name)}</td></tr>
${rows.map(([k, v]) => `<tr><td style="font-size:15px;padding:4px 0"><span style="color:#5A5C80">${esc(k)}:</span> ${esc(v)}</td></tr>`).join('')}
${map ? `<tr><td style="font-size:15px;padding:4px 0 16px"><a href="${map}" style="color:#000035">Auf der Karte ansehen</a></td></tr>` : ''}
${e.photoUrl ? `<tr><td style="padding-bottom:16px"><img src="${esc(e.photoUrl)}" alt="Foto" width="472" style="width:100%;border-radius:12px"></td></tr>` : ''}
<tr><td style="padding-top:8px"><a href="${link}" style="display:block;text-align:center;background:#F5A31A;color:#000035;font-weight:700;font-size:17px;text-decoration:none;padding:14px;border-radius:12px">Prüfen: freigeben oder ablehnen</a></td></tr>
<tr><td style="font-size:12px;color:#5A5C80;padding-top:16px">Der Link öffnet die Prüfseite der App. Erst dort wird entschieden.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [`${KIND[e.kind] ?? 'Vorschlag'}: ${e.name}`, ...rows.map(([k, v]) => `${k}: ${v}`), map && `Karte: ${map}`, '', `Prüfen: ${link}`].filter(Boolean).join('\n');
  await sendMail(ADMIN_EMAIL, ADMIN_FROM, subject, html, text);
}

async function notifyProposer(e: Edit, accepted: boolean) {
  if (!MAIL_FROM) return; // ohne eigene Domain: nur Meldung in der App
  const { data } = await db.auth.admin.getUserById(e.userId);
  const to = data?.user?.email;
  if (!to) return;
  const what = e.kind === 'neu' ? `Deine Kneipe „${e.name}“` : `Dein Vorschlag zu „${e.name}“`;
  const msg = accepted
    ? e.kind === 'neu' ? `${what} ist geprüft und jetzt für alle auf der Karte. Danke fürs Eintragen!` : `${what} wurde übernommen. Danke!`
    : `${what} haben wir nicht übernommen. Vielleicht gibt es die Kneipe schon oder die Angaben passten nicht.`;
  const subject = accepted ? (e.kind === 'neu' ? `${e.name} ist jetzt auf der Karte` : 'Dein Vorschlag wurde übernommen') : 'Zu deinem Vorschlag';
  const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#000035;padding:24px">
<p style="font-size:17px">Hallo @${esc(e.username)},</p><p style="font-size:17px">${esc(msg)}</p>
<p><a href="${APP_URL}" style="color:#000035;font-weight:700">Tresenschicht öffnen</a></p></body></html>`;
  await sendMail(to, MAIL_FROM, subject, html, `Hallo @${e.username},\n\n${msg}\n\n${APP_URL}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.editId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Ungültige Anfrage' }, 400);

    if (body.action === 'notify') {
      // nur die Person, die den Vorschlag gemacht hat, und nur einmal
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
      const { data: u } = await db.auth.getUser(jwt);
      const e = await loadEdit(id);
      if (!u?.user || !e || e.userId !== u.user.id) return json({ error: 'Nicht erlaubt' }, 403);
      if (e.status !== 'offen' || e.mailedAt) return json({ ok: true, skipped: true });
      // erst vormerken (zwei Aufrufe schicken nicht doppelt), bei Fehler wieder freigeben
      const { data: claimed } = await db.from('pub_edits').update({ mailed_at: new Date().toISOString() }).eq('id', id).is('mailed_at', null).select('id');
      if (!claimed?.length) return json({ ok: true, skipped: true });
      try {
        await notifyAdmin(e);
      } catch (err) {
        await db.from('pub_edits').update({ mailed_at: null }).eq('id', id);
        throw err;
      }
      return json({ ok: true });
    }

    if (!(await verify(id, body.token))) return json({ error: 'Der Link ist ungültig.' }, 403);
    const e = await loadEdit(id);
    if (!e) return json({ error: 'Diesen Vorschlag gibt es nicht mehr.' }, 404);

    if (body.action === 'get') {
      const { userId: _u, mailedAt: _m, ...pub } = e;
      return json({ edit: { ...pub, rows: details(e) } });
    }

    if (body.action === 'decide') {
      if (e.status !== 'offen') return json({ ok: true, already: e.status });
      const accept = !!body.accept;
      const { error } = await db.rpc('review_edit', { p_id: id, p_accept: accept });
      if (error) throw error;
      try {
        await notifyProposer(e, accept);
      } catch (err) {
        console.error(err); // Freigabe gilt trotzdem; die Person sieht die Meldung in der App
      }
      return json({ ok: true, status: accept ? 'angenommen' : 'abgelehnt' });
    }

    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message ?? 'Fehler' }, 500);
  }
});
