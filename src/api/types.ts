import type { LatLon } from '../lib/geo';

export type PubType = 'kneipe' | 'bar' | 'biergarten';
export type PubStatus = 'aktiv' | 'geschlossen' | 'zu_pruefen';

/** Ausstattung aus OpenStreetMap, für die Suchfilter */
export type PubFeature = 'outdoor' | 'darts' | 'cards' | 'wheelchair';

export interface Pub {
  id: string;
  name: string;
  type: PubType;
  lat: number;
  lon: number;
  address: string;
  city: string;
  country: string;
  status: PubStatus;
  source: 'osm' | 'nutzer';
  openingHours?: string;
  features?: Partial<Record<PubFeature, boolean>>;
}

export interface NearbyPub extends Pub {
  distance: number;
}

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  city: string;
  email: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

export type Friendship = 'self' | 'none' | 'requested_by_me' | 'requested_by_them' | 'friends' | 'blocked';

/** F3: Ohne Freundschaft sind nur Benutzername und Profilbild sichtbar. */
export interface PublicProfile {
  id: string;
  username: string;
  avatarUrl?: string;
  friendship: Friendship;
  firstName?: string;
  lastName?: string;
  city?: string;
}

export interface CheckInDetails {
  note?: string;
  bartender?: string;
  drink?: string;
  photoUrl?: string;
  photoAlt?: string;
}

export interface CheckIn {
  id: string;
  userId: string;
  pub: Pub;
  at: string;
  accuracy: number;
  details?: CheckInDetails;
}

export interface CollectionEntry {
  pub: Pub;
  visits: number;
  firstAt: string;
  lastAt: string;
}

export interface FeedItem {
  checkin: CheckIn;
  user: Pick<PublicProfile, 'id' | 'username' | 'avatarUrl'>;
}

export interface FriendRequest {
  user: Pick<PublicProfile, 'id' | 'username' | 'avatarUrl'>;
  at: string;
}

export type CheckInRefusal = 'lock' | 'same_pub' | 'accuracy' | 'country' | 'too_far' | 'not_logged_in';

export type CheckInResult =
  | { ok: true; checkin: CheckIn; lockedUntil: string }
  | { ok: false; reason: CheckInRefusal; retryAt?: string };

export interface NearbyResult {
  inArea: boolean;
  pubs: NearbyPub[];
}

export interface SignUpData {
  email: string;
  password: string;
  username: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  city: string;
  avatar?: Blob;
}

export interface NewPubProposal {
  name: string;
  type: PubType;
  lat: number;
  lon: number;
  address: string;
  city: string;
  photo?: Blob;
  /** Vor Ort: gleich einchecken (gleiche Regeln wie beim normalen Check-in) */
  checkIn?: { pos: LatLon; accuracy: number };
}

/** Rückmeldung zu einem eigenen Vorschlag, der inzwischen geprüft wurde */
export interface ReviewNews {
  id: string;
  kind: PubEdit['kind'];
  name: string;
  accepted: boolean;
}

/** Vorschlag auf der Prüfseite aus der E-Mail */
export interface ReviewLinkEdit {
  id: string;
  kind: PubEdit['kind'];
  status: PubEdit['status'];
  name: string;
  username: string;
  at: string;
  lat?: number;
  lon?: number;
  photoUrl?: string | null;
  rows: [string, string][];
}

export interface PubEdit {
  id: string;
  kind: 'neu' | 'aenderung' | 'geschlossen';
  pub?: Pub;
  proposal: Partial<Pub> & { photoUrl?: string };
  username: string;
  at: string;
  status: 'offen' | 'angenommen' | 'abgelehnt';
}

/** Ein Zählfeld der Karte: Anzahl Kneipen, mittlere Lage; bei genau einer Kneipe die Kneipe selbst. */
export interface PubCell {
  count: number;
  lat: number;
  lon: number;
  pub?: Pub | null;
}

/** Inhalt einer Kartenkachel: unter Zoom 13 Zählfelder, ab Zoom 13 alle Kneipen. */
export interface PubTile {
  cells?: PubCell[];
  pubs?: Pub[];
}

/** Gemeldeter Beitrag in der Prüfliste */
export interface ReportItem {
  id: string;
  reason: string;
  at: string;
  checkinId: string;
  reporter: string;
  author: string;
  pubName: string;
  note?: string;
  bartender?: string;
  drink?: string;
  photoUrl?: string;
  photoPath?: string;
}

/** Ein Kreis je Land beim weiten Herauszoomen */
export interface CountryTotal {
  code: string;
  name: string;
  count: number;
  lat: number;
  lon: number;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Api {
  readonly mode: 'demo' | 'supabase';

  // Konto (A)
  currentUser(): Promise<User | null>;
  signUp(data: SignUpData): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** E-Mail mit dem Code aus der Mail bestätigen; bleibt in der App statt im Browser. */
  verifyEmailCode(email: string, code: string): Promise<User>;
  resendEmailCode(email: string): Promise<void>;
  resetPasswordWithCode(email: string, code: string, password: string): Promise<User>;
  deleteAccount(): Promise<void>;
  isUsernameFree(username: string): Promise<boolean>;
  updateProfile(patch: Partial<Pick<User, 'firstName' | 'lastName' | 'city' | 'username'>> & { avatar?: Blob }): Promise<User>;

  // Kneipen (B, D)
  pubsInBounds(b: Bounds): Promise<Pub[]>;
  pubTile(z: number, x: number, y: number): Promise<PubTile>;
  countryTotals(): Promise<CountryTotal[]>;
  nearestPubs(pos: LatLon, limit?: number): Promise<NearbyPub[]>;
  nearbyPubs(pos: LatLon, accuracy: number): Promise<NearbyResult>;
  searchPubs(query: string, features?: PubFeature[]): Promise<Pub[]>;
  bookmarks(): Promise<Pub[]>;
  setBookmark(pubId: string, on: boolean): Promise<void>;
  getPub(id: string): Promise<Pub | null>;
  /** Legt die Kneipe zur Prüfung an. Mit `checkIn` zählt sie sofort als Besuch; Ergebnis des Check-ins oder null. */
  proposePub(p: NewPubProposal): Promise<CheckInResult | null>;
  proposeEdit(pubId: string, patch: Partial<Pick<Pub, 'name' | 'openingHours'>>): Promise<void>;
  reportClosed(pubId: string): Promise<void>;
  reviewQueue(): Promise<PubEdit[]>;
  /** Geprüfte eigene Vorschläge, die noch nicht gemeldet wurden; danach als gesehen markiert */
  reviewNews(): Promise<ReviewNews[]>;
  /** Prüfseite aus der E-Mail (ohne Login, der Link enthält eine Signatur) */
  reviewByLink(id: string, token: string): Promise<ReviewLinkEdit>;
  decideByLink(id: string, token: string, accept: boolean): Promise<void>;
  review(id: string, accept: boolean): Promise<void>;

  // Check-in (C)
  lastCheckIn(): Promise<CheckIn | null>;
  checkIn(pubId: string, pos: LatLon, accuracy: number): Promise<CheckInResult>;
  undoCheckIn(id: string): Promise<void>;
  saveDetails(checkinId: string, details: Omit<CheckInDetails, 'photoUrl'>, photo?: Blob | null): Promise<CheckIn>;
  deleteCheckIn(id: string): Promise<void>;

  // Sammlung (E)
  collection(userId?: string): Promise<CollectionEntry[]>;
  checkIns(userId?: string, pubId?: string): Promise<CheckIn[]>;

  // Freunde (F)
  searchUsers(query: string): Promise<PublicProfile[]>;
  profile(userId: string): Promise<PublicProfile | null>;
  sendFriendRequest(userId: string): Promise<void>;
  respondFriendRequest(userId: string, accept: boolean): Promise<void>;
  removeFriend(userId: string): Promise<void>;
  friendRequests(): Promise<FriendRequest[]>;
  friends(): Promise<PublicProfile[]>;
  feed(): Promise<FeedItem[]>;
  reportContent(checkinId: string, reason: string): Promise<void>;
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  blockedUsers(): Promise<PublicProfile[]>;
  reportQueue(): Promise<ReportItem[]>;
  resolveReport(item: ReportItem, removeContent: boolean): Promise<void>;
}
