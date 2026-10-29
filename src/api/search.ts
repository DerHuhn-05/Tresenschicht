import type { FriendAtPub, PubFeature, PubSearch, PublicProfile } from './types';

/** Kategorie in Arten und Ausstattung übersetzen (wie search_pubs auf dem Server sie erwartet) */
export function searchFilter({ features = [], category }: PubSearch) {
  if (category === 'raucherkneipe') return { features: [...features, 'smoking' as PubFeature], types: ['kneipe', 'bar'] };
  return { features, types: category ? [category] : [] };
}

/** Check-ins von Freunden je Person zusammenfassen: meiste Check-ins zuerst, dann der jüngste Besuch */
export function groupFriends(list: { userId: string; at: string }[], friends: Map<string, PublicProfile>): FriendAtPub[] {
  const by = new Map<string, FriendAtPub>();
  for (const c of list) {
    const user = friends.get(c.userId);
    if (!user) continue;
    const e = by.get(c.userId) ?? { user, visits: 0, lastAt: c.at };
    e.visits++;
    if (c.at > e.lastAt) e.lastAt = c.at;
    by.set(c.userId, e);
  }
  return [...by.values()].sort((a, b) => b.visits - a.visits || b.lastAt.localeCompare(a.lastAt));
}
