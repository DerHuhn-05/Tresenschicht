import { useEffect, useState } from 'react';
import { api, type CollectionEntry, type FeedItem, type FriendRequest, type PublicProfile } from '../api';
import { Icon } from '../components/Icon';
import { Avatar, Confirm, Empty, Page, Spinner } from '../components/ui';
import { relativeTime } from '../lib/format';
import { useApp } from '../state/app';
import { cityCount, CollectionView, VisitCard } from './CollectionScreens';

export function FriendsScreen() {
  const app = useApp();
  const [view, setView] = useState<'feed' | 'friends'>('feed');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PublicProfile[] | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<PublicProfile[] | null>(null);
  const [feed, setFeed] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    api.friendRequests().then(setRequests).catch(() => {});
    api.friends().then(setFriends).catch(() => setFriends([]));
    api.feed().then(setFeed).catch(() => setFeed([]));
  }, [app.version]);

  useEffect(() => {
    if (q.trim().length < 2) return setFound(null);
    const t = setTimeout(() => api.searchUsers(q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, app.version]);

  async function respond(id: string, accept: boolean) {
    await api.respondFriendRequest(id, accept);
    app.notify(accept ? 'Ihr seid jetzt befreundet.' : 'Anfrage abgelehnt.', 'success');
    app.bump();
  }

  return (
    <div className="screen">
      <h1 className="t-h1">Freunde</h1>
      <div className="input-icon" style={{ marginTop: 16 }}>
        <Icon name="search" />
        <input className="input" type="search" placeholder="Benutzername suchen" aria-label="Freunde nach Benutzername suchen" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" autoCorrect="off" />
      </div>

      {found ? (
        <section className="section" style={{ marginTop: 16 }} aria-live="polite">
          {found.length === 0 ? <p className="muted">Niemand mit diesem Benutzernamen.</p> : (
            <ul className="list">
              {found.map((u) => (
                <li key={u.id}>
                  <button className="list-row" onClick={() => app.push({ kind: 'user', id: u.id })}>
                    <Avatar url={u.avatarUrl} name={u.username} size="sm" />
                    <div className="grow">
                      <div className="title">@{u.username}</div>
                      <div className="sub">{{ friends: 'Befreundet', requested_by_me: 'Angefragt', requested_by_them: 'Möchte mit dir befreundet sein', none: 'Privates Profil', self: '' }[u.friendship]}</div>
                    </div>
                    <span className="chev"><Icon name="chevron-right" /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          {requests.length > 0 && (
            <section className="section" style={{ marginTop: 24 }}>
              <h2 className="t-h3 section-title">Anfragen</h2>
              <ul className="list">
                {requests.map((r) => (
                  <li key={r.user.id} className="list-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                    <Avatar url={r.user.avatarUrl} name={r.user.username} size="sm" />
                    <div className="grow">
                      <div className="title">@{r.user.username}</div>
                      <div className="sub">{relativeTime(r.at)}</div>
                    </div>
                    <div className="row-gap">
                      <button className="btn btn-primary" style={{ minWidth: 0, minHeight: 44 }} onClick={() => respond(r.user.id, true)}>Annehmen</button>
                      <button className="btn btn-text" onClick={() => respond(r.user.id, false)} aria-label={`Anfrage von ${r.user.username} ablehnen`}>Ablehnen</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="segmented" role="tablist" aria-label="Ansicht" style={{ marginTop: 24 }}>
            <button role="tab" aria-selected={view === 'feed'} onClick={() => setView('feed')}>Feed</button>
            <button role="tab" aria-selected={view === 'friends'} onClick={() => setView('friends')}>
              Freunde{friends ? ` (${friends.length})` : ''}
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            {view === 'feed' ? (
              !feed ? <Spinner /> : feed.length === 0 ? (
                <Empty icon="feed" title="Noch nichts los" text="Hier siehst du, wo deine Freunde eingecheckt haben. Such oben nach ihrem Benutzernamen." />
              ) : (
                feed.map((f) => (
                  <div key={f.checkin.id} style={{ marginBottom: 12 }}>
                    <button className="row-gap" style={{ border: 0, background: 'none', padding: '4px 0', cursor: 'pointer', minHeight: 44 }} onClick={() => app.push({ kind: 'user', id: f.user.id })}>
                      <Avatar url={f.user.avatarUrl} name={f.user.username} size="sm" />
                      <span className="t-secondary muted">{relativeTime(f.checkin.at)}</span>
                    </button>
                    <VisitCard c={f.checkin} own={false} by={f.user.username} />
                  </div>
                ))
              )
            ) : !friends ? <Spinner /> : friends.length === 0 ? (
              <Empty icon="friends" title="Noch keine Freunde" text="Such oben nach einem Benutzernamen und schick eine Anfrage." />
            ) : (
              <ul className="list">
                {friends.map((u) => (
                  <li key={u.id}>
                    <button className="list-row" onClick={() => app.push({ kind: 'user', id: u.id })}>
                      <Avatar url={u.avatarUrl} name={u.username} size="sm" />
                      <div className="grow">
                        <div className="title">{u.firstName} {u.lastName}</div>
                        <div className="sub">@{u.username}{u.city ? ` · ${u.city}` : ''}</div>
                      </div>
                      <span className="chev"><Icon name="chevron-right" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** F3: Ohne Freundschaft nur Profilbild und Benutzername. */
export function UserProfile({ id }: { id: string }) {
  const app = useApp();
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [entries, setEntries] = useState<CollectionEntry[] | null>(null);
  const [remove, setRemove] = useState(false);

  useEffect(() => {
    api.profile(id).then((x) => {
      setP(x);
      if (x && (x.friendship === 'friends' || x.friendship === 'self')) api.collection(id).then(setEntries);
      else setEntries(null);
    });
  }, [id, app.version]);

  if (p === undefined) return <Page onBack={app.pop} title="Profil"><Spinner /></Page>;
  if (p === null) return <Page onBack={app.pop} title="Profil"><p>Dieses Profil gibt es nicht mehr.</p></Page>;

  const friends = p.friendship === 'friends';
  return (
    <Page onBack={app.pop} title={`@${p.username}`}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <Avatar url={p.avatarUrl} name={p.username} size="lg" />
        <div>
          {friends && <h1 className="t-h1">{p.firstName} {p.lastName}</h1>}
          <p className={friends ? 'muted' : 't-h2'}>@{p.username}{friends && p.city ? ` · ${p.city}` : ''}</p>
        </div>
      </div>

      {!friends && (
        <div className="stack" style={{ marginTop: 24 }}>
          <div className="row-gap muted"><Icon name="lock" size={20} /><span>Dieses Profil ist privat. Sammlung und Fotos sehen nur Freunde.</span></div>
          {p.friendship === 'none' && (
            <button className="btn btn-primary btn-block" onClick={async () => { await api.sendFriendRequest(p.id); app.notify('Anfrage gesendet.', 'success'); app.bump(); }}>
              <Icon name="friend-add" />
              Freundschaft anfragen
            </button>
          )}
          {p.friendship === 'requested_by_me' && <p className="muted">Anfrage gesendet. Sobald @{p.username} annimmt, seht ihr gegenseitig eure Kneipen.</p>}
          {p.friendship === 'requested_by_them' && (
            <div className="row-gap">
              <button className="btn btn-primary" onClick={async () => { await api.respondFriendRequest(p.id, true); app.notify('Ihr seid jetzt befreundet.', 'success'); app.bump(); }}>Annehmen</button>
              <button className="btn btn-secondary" onClick={async () => { await api.respondFriendRequest(p.id, false); app.bump(); }}>Ablehnen</button>
            </div>
          )}
        </div>
      )}

      {friends && (
        <>
          {!entries ? <Spinner /> : (
            <>
              <div className="stats" style={{ margin: '24px 0' }}>
                <div className="stat big"><div className="n">{entries.length}</div><div className="muted">Kneipen</div></div>
                <div className="stat"><div className="n">{entries.reduce((n, e) => n + e.visits, 0)}</div><div className="muted">Besuche</div></div>
                <div className="stat"><div className="n">{cityCount(entries)}</div><div className="muted">Städte</div></div>
              </div>
              {entries.length === 0 ? <p className="muted">@{p.username} hat noch keine Kneipe gesammelt.</p> : <CollectionView entries={entries} userId={p.id} own={false} />}
            </>
          )}
          <button className="btn btn-text btn-block danger-text" style={{ marginTop: 32 }} onClick={() => setRemove(true)}>
            Freundschaft beenden
          </button>
        </>
      )}
      {remove && (
        <Confirm
          title="Freundschaft beenden?"
          text={`Ihr seht dann gegenseitig keine Kneipen und Fotos mehr. @${p.username} wird nicht benachrichtigt.`}
          confirm="Beenden"
          danger
          onCancel={() => setRemove(false)}
          onConfirm={async () => {
            setRemove(false);
            await api.removeFriend(p.id);
            app.bump();
          }}
        />
      )}
    </Page>
  );
}
