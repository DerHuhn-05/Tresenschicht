// Push-Mitteilungen verschicken (Web Push, auch auf dem iPhone in der Home-Bildschirm-App).
//
// { action: 'key' }   → öffentlicher Schlüssel, mit dem sich ein Gerät anmeldet
// { action: 'flush' } → offene Mitteilungen (notifications.pushed_at leer) an alle Geräte der Empfänger schicken.
//                       Die App ruft das nach jeder Aktion auf, die Mitteilungen auslösen kann. Ohne Parameter,
//                       daher harmlos: Es werden nur Mitteilungen verschickt, die ohnehin anstehen.
//
// Die Schlüssel (VAPID) werden aus dem Service-Schlüssel des Projekts abgeleitet: kein zusätzliches Secret nötig,
// und sie bleiben gleich, solange der Service-Schlüssel gleich bleibt.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { createECDH, createHmac } from 'node:crypto';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = (Deno.env.get('APP_URL') || 'https://derhuhn-05.github.io/Tresenschicht/').replace(/\/?$/, '/');
const CONTACT = `mailto:${Deno.env.get('ADMIN_EMAIL') || 'tresenschicht@gmx.net'}`;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function vapidKeys() {
  const priv = createHmac('sha256', SERVICE_KEY).update('tresenschicht-vapid-v1').digest();
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(priv);
  return { publicKey: b64url(new Uint8Array(ecdh.getPublicKey())), privateKey: b64url(new Uint8Array(priv)) };
}
const VAPID = vapidKeys();
webpush.setVapidDetails(CONTACT, VAPID.publicKey, VAPID.privateKey);

type Note = { id: string; user_id: string; kind: string; data: Record<string, string | null> };

const TEXT: Record<string, Record<string, (d: Note['data']) => [string, string]>> = {
  de: {
    friend_request: (d) => ['Neue Freundschaftsanfrage', `@${d.username} möchte mit dir befreundet sein.`],
    friend_accepted: (d) => ['Anfrage angenommen', `@${d.username} und du seid jetzt befreundet.`],
    pub_approved: (d) => (d.edit_kind === 'neu' ? ['Kneipe freigegeben', `„${d.pub_name}“ ist jetzt für alle auf der Karte. Danke!`] : ['Vorschlag übernommen', `Dein Vorschlag zu „${d.pub_name}“ wurde übernommen.`]),
    pub_rejected: (d) => ['Vorschlag nicht übernommen', `Deinen Vorschlag „${d.pub_name}“ haben wir nicht übernommen.`],
    friend_checkin: (d) => [`@${d.username} ist eingecheckt`, `im ${d.pub_name}`],
    review: (d) => ['Neuer Vorschlag zum Prüfen', `${d.edit_kind === 'neu' ? 'Neue Kneipe' : d.edit_kind === 'geschlossen' ? 'Geschlossen gemeldet' : 'Änderung'}: ${d.pub_name} (von @${d.username})`],
  },
  en: {
    friend_request: (d) => ['New friend request', `@${d.username} wants to be your friend.`],
    friend_accepted: (d) => ['Request accepted', `You and @${d.username} are now friends.`],
    pub_approved: (d) => (d.edit_kind === 'neu' ? ['Pub approved', `“${d.pub_name}” is now on the map for everyone. Thanks!`] : ['Suggestion accepted', `Your suggestion for “${d.pub_name}” has been accepted.`]),
    pub_rejected: (d) => ['Suggestion not accepted', `We didn't accept your suggestion “${d.pub_name}”.`],
    friend_checkin: (d) => [`@${d.username} checked in`, `at ${d.pub_name}`],
    review: (d) => ['New suggestion to review', `${d.pub_name} (by @${d.username})`],
  },
};

/** Wohin ein Tipp auf die Mitteilung führt (die App liest ?open=…) */
function target(n: Note) {
  if (n.kind === 'friend_request' || n.kind === 'friend_accepted' || n.kind === 'friend_checkin') return `${APP_URL}?open=user:${n.data.user_id}`;
  if (n.kind === 'review') return `${APP_URL}?open=review`;
  if (n.data.pub_id) return `${APP_URL}?open=pub:${n.data.pub_id}`;
  return `${APP_URL}?open=notifications`;
}

async function flush() {
  // nur frische Mitteilungen; ältere hat die Person ohnehin in der Liste
  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data: notes, error } = await db.from('notifications').select('id, user_id, kind, data').is('pushed_at', null).gte('created_at', since).order('created_at').limit(200);
  if (error) throw error;
  if (!notes?.length) return { sent: 0 };
  // sofort als verschickt markieren, damit parallele Aufrufe nichts doppelt senden
  const ids = notes.map((n) => n.id);
  await db.from('notifications').update({ pushed_at: new Date().toISOString() }).in('id', ids).is('pushed_at', null);
  const users = [...new Set(notes.map((n) => n.user_id))];
  const { data: subs } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, lang').in('user_id', users);
  const { data: unread } = await db.from('notifications').select('user_id').in('user_id', users).is('read_at', null);
  const badge = new Map<string, number>();
  for (const u of unread ?? []) badge.set(u.user_id, (badge.get(u.user_id) ?? 0) + 1);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    (notes as Note[]).flatMap((n) =>
      (subs ?? []).filter((s) => s.user_id === n.user_id).map(async (s) => {
        const [title, body] = (TEXT[s.lang] ?? TEXT.de)[n.kind]?.(n.data) ?? ['Tresenschicht', ''];
        const payload = JSON.stringify({ title, body, url: target(n), tag: `${n.kind}-${n.data.user_id ?? n.data.edit_id ?? n.id}`, badge: badge.get(n.user_id) ?? 1 });
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600 });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.id); // Gerät abgemeldet: Eintrag löschen
          else console.error('push', code, (err as Error).message);
        }
      })
    )
  );
  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);
  return { sent, removed: gone.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'key') return json({ publicKey: VAPID.publicKey });
    if (body.action === 'flush') return json(await flush());
    return json({ error: 'Unbekannte Aktion' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message ?? 'Fehler' }, 500);
  }
});
