import type { LatLon } from '../lib/geo';

export type PubType = 'kneipe' | 'bar' | 'biergarten';
export type PubStatus = 'aktiv' | 'geschlossen' | 'zu_pruefen';

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

export type Friendship = 'self' | 'none' | 'requested_by_me' | 'requested_by_them' | 'friends';

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
  deleteAccount(): Promise<void>;
  isUsernameFree(username: string): Promise<boolean>;
  updateProfile(patch: Partial<Pick<User, 'firstName' | 'lastName' | 'city'>> & { avatar?: Blob }): Promise<User>;

  // Kneipen (B, D)
  pubsInBounds(b: Bounds): Promise<Pub[]>;
  nearbyPubs(pos: LatLon, accuracy: number): Promise<NearbyResult>;
  searchPubs(query: string): Promise<Pub[]>;
  getPub(id: string): Promise<Pub | null>;
  proposePub(p: NewPubProposal): Promise<void>;
  proposeEdit(pubId: string, patch: Partial<Pick<Pub, 'name' | 'openingHours'>>): Promise<void>;
  reportClosed(pubId: string): Promise<void>;
  reviewQueue(): Promise<PubEdit[]>;
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
}
