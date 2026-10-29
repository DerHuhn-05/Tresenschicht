import { distanceM, inWorkArea, type LatLon } from '../lib/geo';
import { blobToDataUrl } from '../lib/image';
import { GPS_ALLOWANCE_M, LOCK_MINUTES, MAX_ACCURACY_M, RADIUS_M, SAME_PUB_HOURS } from '../lib/rules';
import { load, save } from '../lib/storage';
import { CELLS_PER_TILE, DETAIL_ZOOM, latToTileY, lonToTileX } from '../lib/tiles';
import { DEMO_FRIENDS, DEMO_PUBS } from './demoData';
import { searchFilter } from './search';
import type {
  Api, CountryTotal, PubSearch, PubTile, ReportItem, CheckIn, CheckInDetails, CheckInResult, CollectionEntry, FeedItem, FriendRequest, Pub, PubEdit, PublicProfile, ReviewLinkEdit, ReviewNews, User,
} from './types';
import { t } from '../lib/i18n';

// Demo-Backend: dieselben Regeln wie der Server, Daten nur im Browser (localStorage).
interface DbUser extends User {
  password: string;
}
interface DbCheckIn {
  id: string;
  userId: string;
  pubId: string;
  at: string;
  accuracy: number;
  details?: CheckInDetails;
}
interface DbFriendship {
  from: string;
  to: string;
  status: 'angefragt' | 'angenommen';
  at: string;
}
interface DbEdit {
  id: string;
  kind: PubEdit['kind'];
  pubId?: string;
  proposal: PubEdit['proposal'];
  userId: string;
  at: string;
  status: PubEdit['status'];
  seen?: boolean;
}
interface Db {
  v: 1;
  users: DbUser[];
  pubs: Pub[];
  checkins: DbCheckIn[];
  friendships: DbFriendship[];
  edits: DbEdit[];
  reports: { id?: string; checkinId: string; userId: string; reason: string; at: string; status?: string }[];
  bookmarks?: { userId: string; pubId: string; at: string }[];
  blocks?: { userId: string; blockedId: string }[];
  session: string | null;
}

const KEY = 'kneipen-demo-db';
const COUNTRY_CENTERS: Record<string, { name: string; lat: number; lon: number }> = {
  DE: { name: 'Deutschland', lat: 51.09, lon: 10.37 }, AT: { name: 'Österreich', lat: 47.59, lon: 14.13 },
  CH: { name: 'Schweiz', lat: 46.8, lon: 8.22 }, FR: { name: 'Frankreich', lat: 46.62, lon: 2.45 },
  BE: { name: 'Belgien', lat: 50.64, lon: 4.64 }, NL: { name: 'Niederlande', lat: 52.28, lon: 5.64 },
  LU: { name: 'Luxemburg', lat: 49.77, lon: 6.07 }, DK: { name: 'Dänemark', lat: 56.23, lon: 9.37 },
  PL: { name: 'Polen', lat: 52.12, lon: 19.39 }, CZ: { name: 'Tschechien', lat: 49.73, lon: 15.31 },
  IT: { name: 'Italien', lat: 43.52, lon: 12.15 }, ES: { name: 'Spanien', lat: 40.39, lon: -3.56 },
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function seed(): Db {
  const users: DbUser[] = DEMO_FRIENDS.map((f) => ({ ...f, birthDate: '1995-05-05', email: `${f.username}@demo.invalid`, password: 'x' }));
  const ci = (userId: string, pubIdx: number, h: number, details?: CheckInDetails): DbCheckIn => ({
    id: uid(), userId, pubId: DEMO_PUBS[pubIdx].id, at: hoursAgo(h), accuracy: 12, details,
  });
  return {
    v: 1,
    users,
    pubs: DEMO_PUBS,
    checkins: [
      ci('u-lena', 2, 3, { drink: 'Bier', note: 'Kicker ist wieder repariert.' }),
      ci('u-lena', 9, 30),
      ci('u-lena', 0, 52, { bartender: 'Hanne' }),
      ci('u-lena', 7, 120, { drink: 'Alkoholfrei' }),
      ci('u-jonas', 5, 6, { drink: 'Wein', note: 'Ruhig heute, gute Musik.' }),
      ci('u-jonas', 12, 28),
      ci('u-jonas', 15, 75, { drink: 'Bier' }),
      ci('u-mia', 8, 10),
      ci('u-tom', 4, 2),
    ],
    friendships: [
      { from: 'u-lena', to: 'u-jonas', status: 'angenommen', at: hoursAgo(500) },
    ],
    edits: [],
    reports: [],
    session: null,
  };
}

export class DemoApi implements Api {
  readonly mode = 'demo' as const;
  private db: Db;

  constructor() {
    const stored = load<Db | null>(KEY, null);
    this.db = stored?.v === 1 ? stored : seed();
  }

  private commit() {
    save(KEY, this.db);
  }
  private wait<T>(v: T, ms = 180): Promise<T> {
    return new Promise((r) => setTimeout(() => r(v), ms));
  }
  private me(): DbUser {
    const u = this.db.users.find((x) => x.id === this.db.session);
    if (!u) throw new Error(t('Du bist nicht angemeldet.'));
    return u;
  }
  private publicUser(u: DbUser): User {
    const { password: _pw, ...rest } = u;
    return rest;
  }
  private pub(id: string) {
    return this.db.pubs.find((p) => p.id === id)!;
  }
  private toCheckIn(c: DbCheckIn): CheckIn {
    return { id: c.id, userId: c.userId, pub: this.pub(c.pubId), at: c.at, accuracy: c.accuracy, details: c.details };
  }
  private relation(a: string, b: string): DbFriendship | undefined {
    return this.db.friendships.find((f) => (f.from === a && f.to === b) || (f.from === b && f.to === a));
  }
  private friendshipOf(otherId: string): PublicProfile['friendship'] {
    const me = this.me().id;
    if (otherId === me) return 'self';
    const r = this.relation(me, otherId);
    if (!r) return 'none';
    if (r.status === 'angenommen') return 'friends';
    return r.from === me ? 'requested_by_me' : 'requested_by_them';
  }
  private profileOf(u: DbUser): PublicProfile {
    const friendship = this.friendshipOf(u.id);
    const base = { id: u.id, username: u.username, avatarUrl: u.avatarUrl, friendship };
    return friendship === 'friends' || friendship === 'self' ? { ...base, firstName: u.firstName, lastName: u.lastName, city: u.city } : base;
  }
  private canSee(userId: string) {
    const f = this.friendshipOf(userId);
    return f === 'self' || f === 'friends';
  }

  // Konto
  async currentUser() {
    const u = this.db.users.find((x) => x.id === this.db.session);
    return this.wait(u ? this.publicUser(u) : null, 0);
  }

  async signUp(d: Parameters<Api['signUp']>[0]) {
    if (!(await this.isUsernameFree(d.username))) throw new Error(t('Dieser Benutzername ist schon vergeben.'));
    if (this.db.users.some((u) => u.email.toLowerCase() === d.email.toLowerCase())) throw new Error(t('Für diese E-Mail gibt es schon ein Konto.'));
    const user: DbUser = {
      id: uid(), username: d.username, firstName: d.firstName, lastName: d.lastName, birthDate: d.birthDate,
      city: d.city, email: d.email, password: d.password, isAdmin: true,
      avatarUrl: d.avatar ? await blobToDataUrl(d.avatar) : undefined,
    };
    this.db.users.push(user);
    this.db.session = user.id;
    // Damit die Demo lebt: Lena und Jonas sind schon befreundet, Mia fragt an.
    this.db.friendships.push(
      { from: 'u-lena', to: user.id, status: 'angenommen', at: hoursAgo(48) },
      { from: user.id, to: 'u-jonas', status: 'angenommen', at: hoursAgo(40) },
      { from: 'u-mia', to: user.id, status: 'angefragt', at: hoursAgo(1) },
    );
    this.commit();
    return this.wait({ needsConfirmation: false });
  }

  async signIn(email: string, password: string) {
    const u = this.db.users.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
    if (!u) throw new Error(t('E-Mail oder Passwort stimmt nicht.'));
    this.db.session = u.id;
    this.commit();
    return this.wait(this.publicUser(u));
  }

  async signOut() {
    this.db.session = null;
    this.commit();
  }

  async resetPassword() {
    await this.wait(null);
  }

  // Im Demo-Modus gibt es keine E-Mails; jeder sechsstellige Code gilt.
  async verifyEmailCode() {
    return this.publicUser(this.me());
  }

  async resendEmailCode() {
    await this.wait(null);
  }

  async resetPasswordWithCode(email: string, _code: string, password: string) {
    const u = this.db.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error(t('Der Code stimmt nicht oder ist abgelaufen. Fordere einen neuen an.'));
    u.password = password;
    this.db.session = u.id;
    this.commit();
    return this.publicUser(u);
  }

  async deleteAccount() {
    const me = this.me().id;
    this.db.checkins = this.db.checkins.filter((c) => c.userId !== me);
    this.db.friendships = this.db.friendships.filter((f) => f.from !== me && f.to !== me);
    this.db.users = this.db.users.filter((u) => u.id !== me);
    this.db.session = null;
    this.commit();
  }

  async isUsernameFree(username: string) {
    return this.wait(!this.db.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase()), 80);
  }

  async updateProfile(patch: Parameters<Api['updateProfile']>[0]) {
    const me = this.me();
    const { avatar, ...rest } = patch;
    if (rest.username && rest.username.toLowerCase() !== me.username.toLowerCase() && !(await this.isUsernameFree(rest.username))) {
      throw new Error(t('Dieser Benutzername ist schon vergeben.'));
    }
    Object.assign(me, rest);
    if (avatar) me.avatarUrl = await blobToDataUrl(avatar);
    this.commit();
    return this.publicUser(me);
  }

  // Kneipen
  async pubsInBounds() {
    return this.wait(this.db.pubs.filter((p) => p.status === 'aktiv'), 0);
  }

  // Dieselbe Rechnung wie pub_tile() auf dem Server
  async pubTile(z: number, x: number, y: number): Promise<PubTile> {
    const inTile = this.db.pubs.filter((p) => p.status === 'aktiv' && Math.floor(lonToTileX(p.lon, z)) === x && Math.floor(latToTileY(p.lat, z)) === y);
    if (z >= DETAIL_ZOOM) return this.wait({ pubs: inTile }, 60);
    const cells = new Map<string, Pub[]>();
    for (const p of inTile) {
      const k = `${Math.floor((lonToTileX(p.lon, z) - x) * CELLS_PER_TILE)}/${Math.floor((latToTileY(p.lat, z) - y) * CELLS_PER_TILE)}`;
      cells.set(k, [...(cells.get(k) ?? []), p]);
    }
    return this.wait(
      {
        cells: [...cells.values()].map((ps) => ({
          count: ps.length,
          lat: ps.reduce((a, p) => a + p.lat, 0) / ps.length,
          lon: ps.reduce((a, p) => a + p.lon, 0) / ps.length,
          pub: ps.length === 1 ? ps[0] : null,
        })),
      },
      60
    );
  }

  // Landesmitten wie pub_countries() auf dem Server (Schwerpunkt der größten Landesfläche)
  async countryTotals(): Promise<CountryTotal[]> {
    const counts = new Map<string, number>();
    for (const p of this.db.pubs) if (p.status === 'aktiv') counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
    return this.wait(
      [...counts].filter(([code]) => COUNTRY_CENTERS[code]).map(([code, count]) => ({ code, count, ...COUNTRY_CENTERS[code] })),
      60
    );
  }

  async nearestPubs(pos: LatLon, limit = 100) {
    return this.wait(
      this.db.pubs
        .filter((p) => p.status === 'aktiv')
        .map((p) => ({ ...p, distance: distanceM(pos, p) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit),
      60
    );
  }

  async nearbyPubs(pos: LatLon, accuracy = 0) {
    if (!inWorkArea(pos)) return this.wait({ inArea: false, pubs: [] });
    const pubs = this.db.pubs
      .filter((p) => p.status === 'aktiv')
      .map((p) => ({ ...p, distance: distanceM(pos, p) }))
      .filter((p) => p.distance <= RADIUS_M + Math.min(Math.max(accuracy, 0), GPS_ALLOWANCE_M))
      .sort((a, b) => a.distance - b.distance);
    return this.wait({ inArea: true, pubs });
  }

  async searchPubs(query: string, opts: PubSearch = {}) {
    const q = query.trim().toLowerCase();
    if (!q && !(opts.near && opts.category)) return [];
    const { features, types } = searchFilter(opts);
    const words = q ? q.split(/\s+/) : [];
    const near = opts.near;
    const hits = this.db.pubs
      .filter((p) => p.status === 'aktiv' && words.every((w) => `${p.name} ${p.city} ${p.address}`.toLowerCase().includes(w)))
      .filter((p) => features.every((f) => p.features?.[f]) && (!types.length || types.includes(p.type)));
    if (!q && near) hits.sort((a, b) => distanceM(near, a) - distanceM(near, b));
    return this.wait(hits.slice(0, 40));
  }

  async bookmarks() {
    const me = this.me().id;
    return this.wait(
      (this.db.bookmarks ?? []).filter((b) => b.userId === me).sort((a, b) => b.at.localeCompare(a.at)).map((b) => this.pub(b.pubId)),
      60
    );
  }

  async setBookmark(pubId: string, on: boolean) {
    const me = this.me().id;
    const list = (this.db.bookmarks ?? []).filter((b) => !(b.userId === me && b.pubId === pubId));
    if (on) list.push({ userId: me, pubId, at: new Date().toISOString() });
    this.db.bookmarks = list;
    this.commit();
  }

  async getPub(id: string) {
    return this.wait(this.db.pubs.find((p) => p.id === id) ?? null, 0);
  }

  async proposePub(p: Parameters<Api['proposePub']>[0]): Promise<CheckInResult | null> {
    const { photo, checkIn, ...rest } = p;
    if (!inWorkArea(p)) throw new Error(t('Kneipen gehen nur in Deutschland, seinen Nachbarländern, Italien und Spanien.'));
    // wie auf dem Server: sofort angelegt, aber erst nach der Prüfung für alle sichtbar
    const pub: Pub = { id: uid(), name: p.name, type: p.type, lat: p.lat, lon: p.lon, address: p.address, city: p.city, country: 'DE', status: 'zu_pruefen', source: 'nutzer' };
    this.db.pubs.push(pub);
    this.db.edits.push({
      id: uid(), kind: 'neu', pubId: pub.id, userId: this.me().id, at: new Date().toISOString(), status: 'offen',
      proposal: { ...rest, photoUrl: photo ? await blobToDataUrl(photo) : undefined },
    });
    this.commit();
    if (!checkIn) return this.wait(null);
    return this.checkIn(pub.id, checkIn.pos, checkIn.accuracy);
  }

  async proposeEdit(pubId: string, patch: Partial<Pick<Pub, 'name' | 'openingHours'>>) {
    this.db.edits.push({ id: uid(), kind: 'aenderung', pubId, userId: this.me().id, at: new Date().toISOString(), status: 'offen', proposal: patch });
    this.commit();
    await this.wait(null);
  }

  async reportClosed(pubId: string) {
    this.db.edits.push({ id: uid(), kind: 'geschlossen', pubId, userId: this.me().id, at: new Date().toISOString(), status: 'offen', proposal: { status: 'geschlossen' } });
    this.commit();
    await this.wait(null);
  }

  async reviewQueue() {
    return this.wait(
      this.db.edits
        .filter((e) => e.status === 'offen')
        .map((e) => ({
          id: e.id, kind: e.kind, proposal: e.proposal, at: e.at, status: e.status,
          pub: e.pubId ? this.pub(e.pubId) : undefined,
          username: this.db.users.find((u) => u.id === e.userId)?.username ?? 'unbekannt',
        }))
    );
  }

  async review(id: string, accept: boolean) {
    const e = this.db.edits.find((x) => x.id === id);
    if (!e) return;
    e.status = accept ? 'angenommen' : 'abgelehnt';
    if (e.kind === 'neu' && e.pubId) {
      // schon angelegt: freischalten oder samt Check-ins entfernen
      if (accept) this.pub(e.pubId).status = 'aktiv';
      else {
        const id = e.pubId;
        this.db.pubs = this.db.pubs.filter((x) => x.id !== id);
        this.db.checkins = this.db.checkins.filter((c) => c.pubId !== id);
        e.pubId = undefined;
      }
    } else if (accept) {
      if (e.kind === 'neu') {
        const p = e.proposal;
        this.db.pubs.push({
          id: uid(), name: p.name!, type: p.type ?? 'kneipe', lat: p.lat!, lon: p.lon!, address: p.address ?? '',
          city: p.city ?? '', country: 'DE', status: 'aktiv', source: 'nutzer',
        });
      } else if (e.pubId) {
        const { photoUrl: _p, ...patch } = e.proposal;
        Object.assign(this.pub(e.pubId), patch);
      }
    }
    this.commit();
  }

  async reviewNews(): Promise<ReviewNews[]> {
    const me = this.me().id;
    const list = this.db.edits.filter((e) => e.userId === me && e.status !== 'offen' && !e.seen);
    list.forEach((e) => (e.seen = true));
    if (list.length) this.commit();
    return this.wait(list.map((e) => ({ id: e.id, kind: e.kind, accepted: e.status === 'angenommen', name: e.proposal.name ?? (e.pubId ? this.pub(e.pubId)?.name : '') ?? '' })));
  }

  async reviewByLink(): Promise<ReviewLinkEdit> {
    throw new Error(t('Die Prüfung per E-Mail gibt es nur mit dem echten Server.'));
  }

  async decideByLink() {
    throw new Error(t('Die Prüfung per E-Mail gibt es nur mit dem echten Server.'));
  }

  // Check-in: dieselben Prüfungen wie die Funktion check_in() auf dem Server
  async lastCheckIn() {
    if (!this.db.session) return null;
    const mine = this.db.checkins.filter((c) => c.userId === this.db.session).sort((a, b) => b.at.localeCompare(a.at));
    return mine[0] ? this.toCheckIn(mine[0]) : null;
  }

  async checkIn(pubId: string, pos: LatLon, accuracy: number): Promise<CheckInResult> {
    const me = this.me();
    const pub = this.pub(pubId);
    if (accuracy > MAX_ACCURACY_M) return { ok: false, reason: 'accuracy' };
    if (!inWorkArea(pos)) return { ok: false, reason: 'country' };
    if (distanceM(pos, pub) > RADIUS_M + Math.min(accuracy, GPS_ALLOWANCE_M)) return { ok: false, reason: 'too_far' };
    const mine = this.db.checkins.filter((c) => c.userId === me.id).sort((a, b) => b.at.localeCompare(a.at));
    const now = Date.now();
    if (mine[0] && now - Date.parse(mine[0].at) < LOCK_MINUTES * 60_000) {
      return { ok: false, reason: 'lock', retryAt: new Date(Date.parse(mine[0].at) + LOCK_MINUTES * 60_000).toISOString() };
    }
    const samePub = mine.find((c) => c.pubId === pubId);
    if (samePub && now - Date.parse(samePub.at) < SAME_PUB_HOURS * 3600_000) {
      return { ok: false, reason: 'same_pub', retryAt: new Date(Date.parse(samePub.at) + SAME_PUB_HOURS * 3600_000).toISOString() };
    }
    const c: DbCheckIn = { id: uid(), userId: me.id, pubId, at: new Date(now).toISOString(), accuracy: Math.round(accuracy) };
    this.db.checkins.push(c);
    this.commit();
    return this.wait({ ok: true, checkin: this.toCheckIn(c), lockedUntil: new Date(now + LOCK_MINUTES * 60_000).toISOString() }, 350);
  }

  async undoCheckIn(id: string) {
    const c = this.db.checkins.find((x) => x.id === id && x.userId === this.me().id);
    if (!c) return;
    if (Date.now() - Date.parse(c.at) > LOCK_MINUTES * 60_000) throw new Error(t('Zurücknehmen geht nur in den ersten 5 Minuten. Du kannst den Besuch löschen.'));
    this.db.checkins = this.db.checkins.filter((x) => x.id !== id);
    this.commit();
  }

  async saveDetails(checkinId: string, details: Omit<CheckInDetails, 'photoUrl'>, photo?: Blob | null) {
    const c = this.db.checkins.find((x) => x.id === checkinId && x.userId === this.me().id);
    if (!c) throw new Error(t('Diesen Besuch gibt es nicht mehr.'));
    const photoUrl = photo === null ? undefined : photo ? await blobToDataUrl(photo) : c.details?.photoUrl;
    c.details = { ...details, photoUrl };
    this.commit();
    return this.wait(this.toCheckIn(c));
  }

  async deleteCheckIn(id: string) {
    this.db.checkins = this.db.checkins.filter((x) => !(x.id === id && x.userId === this.me().id));
    this.commit();
  }

  // Sammlung
  async collection(userId?: string) {
    const id = userId ?? this.me().id;
    if (!this.canSee(id)) return [];
    const map = new Map<string, CollectionEntry>();
    for (const c of this.db.checkins.filter((x) => x.userId === id)) {
      const e = map.get(c.pubId);
      if (!e) map.set(c.pubId, { pub: this.pub(c.pubId), visits: 1, firstAt: c.at, lastAt: c.at });
      else {
        e.visits++;
        if (c.at < e.firstAt) e.firstAt = c.at;
        if (c.at > e.lastAt) e.lastAt = c.at;
      }
    }
    return this.wait([...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
  }

  async checkIns(userId?: string, pubId?: string) {
    const id = userId ?? this.me().id;
    if (!this.canSee(id)) return [];
    return this.wait(
      this.db.checkins
        .filter((c) => c.userId === id && (!pubId || c.pubId === pubId))
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((c) => this.toCheckIn(c))
    );
  }

  // Freunde
  async searchUsers(query: string) {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (q.length < 2) return [];
    const me = this.me().id;
    return this.wait(this.db.users.filter((u) => u.id !== me && !this.blockedBetween(me, u.id) && u.username.toLowerCase().includes(q)).map((u) => this.profileOf(u)));
  }

  async profile(userId: string) {
    const u = this.db.users.find((x) => x.id === userId);
    const me = this.me().id;
    if (!u || (this.db.blocks ?? []).some((x) => x.userId === userId && x.blockedId === me)) return this.wait(null);
    if ((this.db.blocks ?? []).some((x) => x.userId === me && x.blockedId === userId)) return this.wait({ id: u.id, username: u.username, avatarUrl: u.avatarUrl, friendship: 'blocked' as const });
    return this.wait(this.profileOf(u));
  }

  async sendFriendRequest(userId: string) {
    const me = this.me().id;
    if (this.blockedBetween(me, userId)) throw new Error(t('Anfrage nicht möglich.'));
    const r = this.relation(me, userId);
    if (r && r.from === userId && r.status === 'angefragt') r.status = 'angenommen';
    else if (!r) this.db.friendships.push({ from: me, to: userId, status: 'angefragt', at: new Date().toISOString() });
    this.commit();
    await this.wait(null);
  }

  async respondFriendRequest(userId: string, accept: boolean) {
    const me = this.me().id;
    const r = this.db.friendships.find((f) => f.from === userId && f.to === me && f.status === 'angefragt');
    if (!r) return;
    if (accept) r.status = 'angenommen';
    else this.db.friendships = this.db.friendships.filter((f) => f !== r);
    this.commit();
  }

  async removeFriend(userId: string) {
    const me = this.me().id;
    this.db.friendships = this.db.friendships.filter((f) => !((f.from === me && f.to === userId) || (f.from === userId && f.to === me)));
    this.commit();
  }

  async friendRequests(): Promise<FriendRequest[]> {
    const me = this.me().id;
    return this.wait(
      this.db.friendships
        .filter((f) => f.to === me && f.status === 'angefragt')
        .map((f) => {
          const u = this.db.users.find((x) => x.id === f.from)!;
          return { user: { id: u.id, username: u.username, avatarUrl: u.avatarUrl }, at: f.at };
        }),
      0
    );
  }

  async friends() {
    const me = this.me().id;
    const ids = this.db.friendships
      .filter((f) => f.status === 'angenommen' && (f.from === me || f.to === me))
      .map((f) => (f.from === me ? f.to : f.from));
    return this.wait(this.db.users.filter((u) => ids.includes(u.id)).map((u) => this.profileOf(u)));
  }

  async feed(): Promise<FeedItem[]> {
    const friendIds = new Set((await this.friends()).map((f) => f.id));
    return this.db.checkins
      .filter((c) => friendIds.has(c.userId))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 50)
      .map((c) => {
        const u = this.db.users.find((x) => x.id === c.userId)!;
        return { checkin: this.toCheckIn(c), user: { id: u.id, username: u.username, avatarUrl: u.avatarUrl } };
      });
  }

  async reportContent(checkinId: string, reason: string) {
    this.db.reports.push({ id: uid(), checkinId, reason, userId: this.me().id, at: new Date().toISOString(), status: 'offen' });
    this.commit();
    await this.wait(null);
  }

  private blockedBetween(a: string, b: string) {
    return (this.db.blocks ?? []).some((x) => (x.userId === a && x.blockedId === b) || (x.userId === b && x.blockedId === a));
  }

  async blockUser(userId: string) {
    const me = this.me().id;
    this.db.blocks = [...(this.db.blocks ?? []).filter((x) => !(x.userId === me && x.blockedId === userId)), { userId: me, blockedId: userId }];
    this.db.friendships = this.db.friendships.filter((f) => !((f.from === me && f.to === userId) || (f.from === userId && f.to === me)));
    this.commit();
    await this.wait(null);
  }

  async unblockUser(userId: string) {
    const me = this.me().id;
    this.db.blocks = (this.db.blocks ?? []).filter((x) => !(x.userId === me && x.blockedId === userId));
    this.commit();
  }

  async blockedUsers() {
    const me = this.me().id;
    const ids = (this.db.blocks ?? []).filter((x) => x.userId === me).map((x) => x.blockedId);
    return this.wait(this.db.users.filter((u) => ids.includes(u.id)).map((u) => ({ id: u.id, username: u.username, avatarUrl: u.avatarUrl, friendship: 'blocked' as const })));
  }

  async reportQueue(): Promise<ReportItem[]> {
    if (!this.me().isAdmin) throw new Error(t('Nur für die Prüfung freigeschaltete Konten.'));
    return this.wait(
      this.db.reports
        .filter((r) => (r.status ?? 'offen') === 'offen' && this.db.checkins.some((c) => c.id === r.checkinId))
        .map((r) => {
          const c = this.db.checkins.find((x) => x.id === r.checkinId)!;
          return {
            id: r.id ?? r.checkinId, reason: r.reason, at: r.at, checkinId: c.id,
            reporter: this.db.users.find((u) => u.id === r.userId)?.username ?? '?',
            author: this.db.users.find((u) => u.id === c.userId)?.username ?? '?',
            pubName: this.pub(c.pubId).name, note: c.details?.note, bartender: c.details?.bartender, drink: c.details?.drink,
            photoUrl: c.details?.photoUrl,
          };
        })
    );
  }

  async resolveReport(item: ReportItem, removeContent: boolean) {
    for (const r of this.db.reports) if ((r.id ?? r.checkinId) === item.id || (removeContent && r.checkinId === item.checkinId)) r.status = removeContent ? 'entfernt' : 'verworfen';
    if (removeContent) {
      const c = this.db.checkins.find((x) => x.id === item.checkinId);
      if (c) c.details = undefined;
    }
    this.commit();
  }
}
