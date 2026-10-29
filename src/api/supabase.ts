import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LatLon } from '../lib/geo';
import type {
  Api, Bounds, CheckIn, CheckInDetails, CheckInResult, CollectionEntry, FeedItem, FriendRequest, NearbyResult, Pub, PubEdit, PublicProfile, SignUpData, User,
} from './types';

// Echtes Backend (supabase/schema.sql). Alle Regeln prüft der Server; die App zeigt nur an.
type Row = Record<string, any>;

function toPub(r: Row): Pub {
  return {
    id: r.id, name: r.name, type: r.type, lat: r.lat, lon: r.lon, address: r.address ?? '', city: r.city ?? '',
    country: r.country ?? '', status: r.status, source: r.source, openingHours: r.opening_hours ?? undefined,
  };
}

function must<T>(res: { data: T; error: { message: string } | null } | { data: unknown; error: { message: string } }): NonNullable<T> {
  if (res.error) throw new Error(translate(res.error.message));
  return res.data as NonNullable<T>;
}

function translate(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/Email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  if (/already registered/i.test(msg)) return 'Für diese E-Mail gibt es schon ein Konto.';
  if (/profiles_username_lower|duplicate key/i.test(msg)) return 'Dieser Benutzername ist schon vergeben.';
  if (/birth_date/i.test(msg)) return 'Die App ist erst ab 18 Jahren.';
  if (/Database error saving new user/i.test(msg)) return 'Konto konnte nicht angelegt werden. Prüfe Benutzername und Geburtsdatum.';
  if (/expired|invalid.*(otp|token)|otp.*invalid|token.*invalid/i.test(msg)) return 'Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.';
  if (/only request this after|security purposes/i.test(msg)) return 'Bitte warte kurz, bevor du einen neuen Code anforderst.';
  if (/rate limit/i.test(msg)) return 'Gerade wurden zu viele E-Mails verschickt. Versuch es später noch einmal.';
  if (/should be different|same.*password/i.test(msg)) return 'Das neue Passwort muss sich vom alten unterscheiden.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Keine Verbindung. Prüfe dein Internet und versuche es noch einmal.';
  return msg;
}

export class SupabaseApi implements Api {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  private me: User | null = null;
  private urlCache = new Map<string, string>();
  /** Profilbild aus der Registrierung, bis die E-Mail bestätigt ist */
  private pendingAvatar: Blob | null = null;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  private uid(): string {
    if (!this.me) throw new Error('Du bist nicht angemeldet.');
    return this.me.id;
  }

  private avatarUrl(path?: string | null) {
    return path ? this.sb.storage.from('avatars').getPublicUrl(path).data.publicUrl : undefined;
  }

  private async signedUrls(paths: string[]): Promise<void> {
    const missing = [...new Set(paths)].filter((p) => p && !this.urlCache.has(p));
    if (!missing.length) return;
    const data = must(await this.sb.storage.from('photos').createSignedUrls(missing, 3600));
    for (const d of data ?? []) if (d.signedUrl && d.path) this.urlCache.set(d.path, d.signedUrl);
  }

  private async loadProfile(id: string, email: string): Promise<User> {
    const p = must(await this.sb.from('profiles').select('*').eq('id', id).single()) as Row;
    this.me = {
      id, email, username: p.username, firstName: p.first_name, lastName: p.last_name, birthDate: p.birth_date,
      city: p.city, avatarUrl: this.avatarUrl(p.avatar_path), isAdmin: p.is_admin,
    };
    return this.me;
  }

  private async uploadAvatar(blob: Blob) {
    const path = `${this.uid()}/avatar-${Date.now()}.jpg`;
    must(await this.sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true }));
    must(await this.sb.from('profiles').update({ avatar_path: path }).eq('id', this.uid()));
  }

  // Konto
  async currentUser() {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return (this.me = null);
    try {
      return await this.loadProfile(u.id, u.email ?? '');
    } catch {
      return (this.me = null);
    }
  }

  async signUp(d: SignUpData) {
    const res = await this.sb.auth.signUp({
      email: d.email,
      password: d.password,
      options: {
        emailRedirectTo: location.origin + location.pathname,
        data: { username: d.username, first_name: d.firstName, last_name: d.lastName, birth_date: d.birthDate, city: d.city },
      },
    });
    const data = must(res);
    if (data.session && data.user) {
      await this.loadProfile(data.user.id, d.email);
      if (d.avatar) await this.uploadAvatar(d.avatar);
      return { needsConfirmation: false };
    }
    this.pendingAvatar = d.avatar ?? null;
    return { needsConfirmation: true }; // A3: E-Mail-Bestätigung per Code
  }

  async verifyEmailCode(email: string, code: string) {
    const token = code.replace(/\s/g, '');
    let res = await this.sb.auth.verifyOtp({ email, token, type: 'email' });
    if (res.error) res = await this.sb.auth.verifyOtp({ email, token, type: 'signup' });
    const data = must(res);
    const user = await this.loadProfile(data.user!.id, data.user!.email ?? email);
    if (this.pendingAvatar) {
      await this.uploadAvatar(this.pendingAvatar).catch(() => {});
      this.pendingAvatar = null;
      return this.loadProfile(user.id, user.email);
    }
    return user;
  }

  async resendEmailCode(email: string) {
    must(await this.sb.auth.resend({ type: 'signup', email }));
  }

  async resetPasswordWithCode(email: string, code: string, password: string) {
    const data = must(await this.sb.auth.verifyOtp({ email, token: code.replace(/\s/g, ''), type: 'recovery' }));
    must(await this.sb.auth.updateUser({ password }));
    return this.loadProfile(data.user!.id, data.user!.email ?? email);
  }

  async signIn(email: string, password: string) {
    const data = must(await this.sb.auth.signInWithPassword({ email, password }));
    return this.loadProfile(data.user.id, data.user.email ?? email);
  }

  async signOut() {
    await this.sb.auth.signOut();
    this.me = null;
  }

  async resetPassword(email: string) {
    must(await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
  }

  async deleteAccount() {
    const uid = this.uid();
    for (const bucket of ['photos', 'avatars']) {
      const files = must(await this.sb.storage.from(bucket).list(uid, { limit: 1000 })) ?? [];
      if (files.length) must(await this.sb.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`)));
    }
    must(await this.sb.rpc('delete_account'));
    await this.sb.auth.signOut();
    this.me = null;
  }

  async isUsernameFree(username: string) {
    return must(await this.sb.rpc('username_available', { p_username: username })) as boolean;
  }

  async updateProfile(patch: Parameters<Api['updateProfile']>[0]) {
    const { avatar, firstName, lastName, city } = patch;
    const row: Row = {};
    if (firstName !== undefined) row.first_name = firstName;
    if (lastName !== undefined) row.last_name = lastName;
    if (city !== undefined) row.city = city;
    if (Object.keys(row).length) must(await this.sb.from('profiles').update(row).eq('id', this.uid()));
    if (avatar) await this.uploadAvatar(avatar);
    return this.loadProfile(this.uid(), this.me!.email);
  }

  // Kneipen
  async pubsInBounds(b: Bounds) {
    const rows = must(await this.sb.rpc('pubs_in_bbox', { w: b.west, s: b.south, e: b.east, n: b.north })) as Row[];
    return rows.map(toPub);
  }

  async nearbyPubs(pos: LatLon, accuracy: number): Promise<NearbyResult> {
    const r = must(await this.sb.rpc('nearby_pubs', { p_lat: pos.lat, p_lon: pos.lon, p_accuracy: accuracy })) as Row;
    return { inArea: r.inArea, pubs: (r.pubs as Row[]).map((p) => ({ ...toPub(p), distance: p.distance })) };
  }

  async searchPubs(query: string) {
    if (!query.trim()) return [];
    return (must(await this.sb.rpc('search_pubs', { q: query })) as Row[]).map(toPub);
  }

  async getPub(id: string) {
    const r = must(await this.sb.from('pubs').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? toPub(r) : null;
  }

  async proposePub(p: Parameters<Api['proposePub']>[0]) {
    const { photo, ...vorschlag } = p;
    let photoPath: string | undefined;
    if (photo) {
      photoPath = `${this.uid()}/pub-${Date.now()}.jpg`;
      must(await this.sb.storage.from('photos').upload(photoPath, photo, { contentType: 'image/jpeg' }));
    }
    must(await this.sb.from('pub_edits').insert({ user_id: this.uid(), kind: 'neu', vorschlag: { ...vorschlag, photoPath } }));
  }

  async proposeEdit(pubId: string, patch: Partial<Pick<Pub, 'name' | 'openingHours'>>) {
    must(await this.sb.from('pub_edits').insert({ user_id: this.uid(), pub_id: pubId, kind: 'aenderung', vorschlag: patch }));
  }

  async reportClosed(pubId: string) {
    must(await this.sb.from('pub_edits').insert({ user_id: this.uid(), pub_id: pubId, kind: 'geschlossen', vorschlag: { status: 'geschlossen' } }));
  }

  async reviewQueue(): Promise<PubEdit[]> {
    const rows = must(
      await this.sb.from('pub_edits').select('*, pubs(*), profiles!pub_edits_user_id_fkey(username)').eq('status', 'offen').order('created_at')
    ) as Row[];
    return rows.map((r) => ({
      id: r.id, kind: r.kind, pub: r.pubs ? toPub(r.pubs) : undefined, proposal: r.vorschlag,
      username: r.profiles?.username ?? 'unbekannt', at: r.created_at, status: r.status,
    }));
  }

  async review(id: string, accept: boolean) {
    must(await this.sb.rpc('review_edit', { p_id: id, p_accept: accept }));
  }

  // Check-in
  private async checkInsQuery(filter: (q: any) => any): Promise<CheckIn[]> {
    const rows = must(
      await filter(this.sb.from('checkins').select('*, pubs(*), checkin_details(*, photos(path))').order('created_at', { ascending: false }).limit(200))
    ) as Row[];
    await this.signedUrls(rows.map((r) => r.checkin_details?.photos?.path).filter(Boolean));
    return rows.map((r) => {
      const d = r.checkin_details as Row | null;
      const details: CheckInDetails | undefined = d
        ? { note: d.note ?? undefined, bartender: d.bartender ?? undefined, drink: d.drink ?? undefined, photoAlt: d.photo_alt ?? undefined,
            photoUrl: d.photos?.path ? this.urlCache.get(d.photos.path) : undefined }
        : undefined;
      return { id: r.id, userId: r.user_id, pub: toPub(r.pubs), at: r.created_at, accuracy: r.accuracy, details };
    });
  }

  async lastCheckIn() {
    if (!this.me) return null;
    const list = await this.checkInsQuery((q) => q.eq('user_id', this.uid()).limit(1));
    return list[0] ?? null;
  }

  async checkIn(pubId: string, pos: LatLon, accuracy: number): Promise<CheckInResult> {
    const r = must(await this.sb.rpc('check_in', { p_pub: pubId, p_lat: pos.lat, p_lon: pos.lon, p_accuracy: accuracy })) as Row;
    if (!r.ok) return { ok: false, reason: r.reason, retryAt: r.retryAt };
    const pub = (await this.getPub(pubId))!;
    return { ok: true, lockedUntil: r.lockedUntil, checkin: { id: r.id, userId: this.uid(), pub, at: r.at, accuracy: Math.round(accuracy) } };
  }

  async undoCheckIn(id: string) {
    must(await this.sb.rpc('undo_checkin', { p_id: id }));
  }

  async saveDetails(checkinId: string, details: Omit<CheckInDetails, 'photoUrl'>, photo?: Blob | null) {
    const existing = must(await this.sb.from('checkin_details').select('photo_id, photos(path)').eq('checkin_id', checkinId).maybeSingle()) as Row | null;
    let photoId: string | null = existing?.photo_id ?? null;
    if (photo !== undefined && existing?.photos?.path) {
      // G2: altes Foto wirklich löschen
      await this.sb.storage.from('photos').remove([existing.photos.path]);
      await this.sb.from('photos').delete().eq('id', existing.photo_id);
      photoId = null;
    }
    if (photo) {
      const path = `${this.uid()}/${checkinId}-${Date.now()}.jpg`;
      must(await this.sb.storage.from('photos').upload(path, photo, { contentType: 'image/jpeg' }));
      const p = must(await this.sb.from('photos').insert({ user_id: this.uid(), path, size: photo.size }).select('id').single()) as Row;
      photoId = p.id;
    }
    must(
      await this.sb.from('checkin_details').upsert({
        checkin_id: checkinId, note: details.note || null, bartender: details.bartender || null, drink: details.drink || null,
        photo_alt: details.photoAlt || null, photo_id: photoId, updated_at: new Date().toISOString(),
      })
    );
    return (await this.checkInsQuery((q) => q.eq('id', checkinId)))[0];
  }

  async deleteCheckIn(id: string) {
    const d = must(await this.sb.from('checkin_details').select('photo_id, photos(path)').eq('checkin_id', id).maybeSingle()) as Row | null;
    if (d?.photos?.path) {
      await this.sb.storage.from('photos').remove([d.photos.path]);
      await this.sb.from('photos').delete().eq('id', d.photo_id);
    }
    must(await this.sb.from('checkins').delete().eq('id', id));
  }

  // Sammlung
  async collection(userId?: string): Promise<CollectionEntry[]> {
    const rows = must(await this.sb.rpc('collection', { p_user: userId ?? this.uid() })) as Row[];
    return rows.map((r) => ({ pub: toPub(r.pub), visits: r.visits, firstAt: r.firstAt, lastAt: r.lastAt }));
  }

  async checkIns(userId?: string, pubId?: string) {
    return this.checkInsQuery((q) => {
      let x = q.eq('user_id', userId ?? this.uid());
      if (pubId) x = x.eq('pub_id', pubId);
      return x;
    });
  }

  // Freunde
  private toProfile(r: Row): PublicProfile {
    return {
      id: r.id, username: r.username, avatarUrl: this.avatarUrl(r.avatar_path), friendship: r.friendship,
      firstName: r.firstName, lastName: r.lastName, city: r.city,
    };
  }

  async searchUsers(query: string) {
    return (must(await this.sb.rpc('search_users', { q: query })) as Row[]).map((r) => this.toProfile(r));
  }

  async profile(userId: string) {
    const r = must(await this.sb.rpc('get_profile', { p_user: userId })) as Row | null;
    return r ? this.toProfile(r) : null;
  }

  async sendFriendRequest(userId: string) {
    must(await this.sb.rpc('send_friend_request', { p_user: userId }));
  }

  async respondFriendRequest(userId: string, accept: boolean) {
    const q = this.sb.from('friendships');
    if (accept) must(await q.update({ status: 'angenommen' }).eq('user_id', userId).eq('other_id', this.uid()));
    else must(await q.delete().eq('user_id', userId).eq('other_id', this.uid()));
  }

  async removeFriend(userId: string) {
    const me = this.uid();
    must(await this.sb.from('friendships').delete().or(`and(user_id.eq.${me},other_id.eq.${userId}),and(user_id.eq.${userId},other_id.eq.${me})`));
  }

  async friendRequests(): Promise<FriendRequest[]> {
    const rows = must(await this.sb.rpc('friend_requests')) as Row[];
    return rows.map((r) => ({ user: { id: r.id, username: r.username, avatarUrl: this.avatarUrl(r.avatar_path) }, at: r.at }));
  }

  async friends() {
    const rows = must(await this.sb.from('profiles').select('id, username, avatar_path, first_name, last_name, city').neq('id', this.uid())) as Row[];
    return rows.map((r) => ({
      id: r.id, username: r.username, avatarUrl: this.avatarUrl(r.avatar_path), friendship: 'friends' as const,
      firstName: r.first_name, lastName: r.last_name, city: r.city,
    }));
  }

  async feed(): Promise<FeedItem[]> {
    const friends = await this.friends();
    if (!friends.length) return [];
    const byId = new Map(friends.map((f) => [f.id, f]));
    const list = await this.checkInsQuery((q) => q.in('user_id', [...byId.keys()]).limit(50));
    return list.map((c) => {
      const f = byId.get(c.userId)!;
      return { checkin: c, user: { id: f.id, username: f.username, avatarUrl: f.avatarUrl } };
    });
  }

  async reportContent(checkinId: string, reason: string) {
    must(await this.sb.from('reports').insert({ checkin_id: checkinId, user_id: this.uid(), reason }));
  }
}
