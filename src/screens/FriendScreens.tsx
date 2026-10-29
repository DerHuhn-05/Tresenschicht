import { useEffect, useState } from 'react';
import { api, type CheckIn, type CollectionEntry, type FeedItem, type FriendRequest, type PublicProfile } from '../api';
import { BadgeGrid } from '../components/Badges';
import { badgesOf } from '../lib/badges';
import { Icon } from '../components/Icon';
import { Avatar, Confirm, Empty, Page, Spinner } from '../components/ui';
import { relativeTime } from '../lib/format';
import { useApp } from '../state/app';
import { StatsPanel } from '../components/Stats';
import { CollectionView, VisitCard } from './CollectionScreens';
import { t } from '../lib/i18n';

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
    const timer = setTimeout(() => api.searchUsers(q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(timer);
  }, [q, app.version]);

  async function respond(id: string, accept: boolean) {
    await api.respondFriendRequest(id, accept);
    app.notify(accept ? t('Ihr seid jetzt befreundet.') : t('Anfrage abgelehnt.'), 'success');
    app.bump();
  }

  return (
    <div className="screen">
      <h1 className="t-display page-title">{t('Freunde')}</h1>
      <div className="input-icon">
        <Icon name="search" />
        <input className="input" type="search" placeholder={t('Benutzername suchen')} aria-label={t('Freunde nach Benutzername suchen')} value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" autoCorrect="off" />
      </div>

      {found ? (
        <section className="section" style={{ marginTop: 16 }} aria-live="polite">
          {found.length === 0 ? <p className="muted">{t('Niemand mit diesem Benutzernamen.')}</p> : (
            <ul className="list">
              {found.map((u) => (
                <li key={u.id}>
                  <button className="list-row" onClick={() => app.push({ kind: 'user', id: u.id })}>
                    <Avatar url={u.avatarUrl} name={u.username} size="sm" />
                    <div className="grow">
                      <div className="title">@{u.username}</div>
                      <div className="sub">{{ friends: t('Befreundet'), requested_by_me: t('Angefragt'), requested_by_them: t('Möchte mit dir befreundet sein'), none: t('Privates Profil'), self: '', blocked: t('Gesperrt') }[u.friendship]}</div>
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
              <h2 className="t-h3 section-title">{t('Anfragen')}</h2>
              <ul className="list">
                {requests.map((r) => (
                  <li key={r.user.id} className="list-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                    <Avatar url={r.user.avatarUrl} name={r.user.username} size="sm" />
                    <div className="grow">
                      <div className="title">@{r.user.username}</div>
                      <div className="sub">{relativeTime(r.at)}</div>
                    </div>
                    <div className="row-gap">
                      <button className="btn btn-primary" style={{ minWidth: 0, minHeight: 44 }} onClick={() => respond(r.user.id, true)}>{t('Annehmen')}</button>
                      <button className="btn btn-text" onClick={() => respond(r.user.id, false)} aria-label={t('Anfrage von {name} ablehnen', { name: r.user.username })}>{t('Ablehnen')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="segmented" role="tablist" aria-label={t('Ansicht')} style={{ marginTop: 24 }}>
            <button role="tab" aria-selected={view === 'feed'} onClick={() => setView('feed')}>{t('Feed')}</button>
            <button role="tab" aria-selected={view === 'friends'} onClick={() => setView('friends')}>
              {t('Freunde')}{friends ? ` (${friends.length})` : ''}
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            {view === 'feed' ? (
              !feed ? <Spinner /> : feed.length === 0 ? (
                <Empty icon="feed" title={t('Noch nichts los')} text={t('Hier siehst du, wo deine Freunde eingecheckt haben. Such oben nach ihrem Benutzernamen.')} />
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
              <Empty icon="friends" title={t('Noch keine Freunde')} text={t('Such oben nach einem Benutzernamen und schick eine Anfrage.')} />
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
  const [visits, setVisits] = useState<CheckIn[]>([]);
  const [remove, setRemove] = useState(false);
  const [block, setBlock] = useState(false);

  useEffect(() => {
    api.profile(id).then((x) => {
      setP(x);
      if (x && (x.friendship === 'friends' || x.friendship === 'self')) {
        api.collection(id).then(setEntries);
        api.checkIns(id).then(setVisits);
      } else setEntries(null);
    });
  }, [id, app.version]);

  if (p === undefined) return <Page onBack={app.pop} title={t('Profil')}><Spinner /></Page>;
  if (p === null) return <Page onBack={app.pop} title={t('Profil')}><p>{t('Dieses Profil gibt es nicht mehr.')}</p></Page>;

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

      {p.friendship === 'blocked' && (
        <div className="stack" style={{ marginTop: 24 }}>
          <p className="muted">{t('Du hast @{name} gesperrt. Ihr findet euch nicht in der Suche und könnt euch keine Anfragen schicken.', { name: p.username })}</p>
          <button className="btn btn-secondary btn-block" onClick={async () => { await api.unblockUser(p.id); app.notify(t('@{name} ist entsperrt.', { name: p.username }), 'success'); app.bump(); }}>
            {t('Entsperren')}
          </button>
        </div>
      )}

      {!friends && p.friendship !== 'blocked' && (
        <div className="stack" style={{ marginTop: 24 }}>
          <div className="row-gap muted"><Icon name="lock" size={20} /><span>{t('Dieses Profil ist privat. Sammlung und Fotos sehen nur Freunde.')}</span></div>
          {p.friendship === 'none' && (
            <button className="btn btn-primary btn-block" onClick={async () => { await api.sendFriendRequest(p.id); app.notify(t('Anfrage gesendet.'), 'success'); app.bump(); }}>
              <Icon name="friend-add" />
              {t('Freundschaft anfragen')}
            </button>
          )}
          {p.friendship === 'requested_by_me' && <p className="muted">{t('Anfrage gesendet. Sobald @{name} annimmt, seht ihr gegenseitig eure Kneipen.', { name: p.username })}</p>}
          {p.friendship === 'requested_by_them' && (
            <div className="row-gap">
              <button className="btn btn-primary" onClick={async () => { await api.respondFriendRequest(p.id, true); app.notify(t('Ihr seid jetzt befreundet.'), 'success'); app.bump(); }}>{t('Annehmen')}</button>
              <button className="btn btn-secondary" onClick={async () => { await api.respondFriendRequest(p.id, false); app.bump(); }}>{t('Ablehnen')}</button>
            </div>
          )}
        </div>
      )}

      {friends && (
        <>
          {!entries ? <Spinner /> : (
            <>
              <div style={{ margin: '24px 0' }}><StatsPanel entries={entries} /></div>
              {entries.length === 0 ? <p className="muted">{t('@{name} hat noch keine Kneipe gesammelt.', { name: p.username })}</p> : <CollectionView entries={entries} userId={p.id} own={false} />}
              <section className="section">
                <h2 className="t-h3 section-title">{t('Abzeichen')}</h2>
                <BadgeGrid badges={badgesOf(entries, visits)} onlyEarned />
              </section>
            </>
          )}
          <button className="btn btn-text btn-block danger-text" style={{ marginTop: 32 }} onClick={() => setRemove(true)}>
            {t('Freundschaft beenden')}
          </button>
        </>
      )}
      {p.friendship !== 'blocked' && (
        <button className="btn btn-text btn-block danger-text" style={{ marginTop: friends ? 0 : 32 }} onClick={() => setBlock(true)}>
          {t('@{name} sperren', { name: p.username })}
        </button>
      )}
      {block && (
        <Confirm
          title={t('@{name} sperren?', { name: p.username })}
          text={t('Eine Freundschaft endet. Ihr findet euch nicht mehr in der Suche und könnt euch keine Anfragen schicken. @{name} erfährt nichts davon. Du kannst das jederzeit im Profil unter „Gesperrte Nutzer“ aufheben.', { name: p.username })}
          confirm={t('Sperren')}
          danger
          onCancel={() => setBlock(false)}
          onConfirm={async () => {
            setBlock(false);
            await api.blockUser(p.id);
            app.notify(t('@{name} ist gesperrt.', { name: p.username }), 'success');
            app.bump();
          }}
        />
      )}
      {remove && (
        <Confirm
          title={t('Freundschaft beenden?')}
          text={t('Ihr seht dann gegenseitig keine Kneipen und Fotos mehr. @{name} wird nicht benachrichtigt.', { name: p.username })}
          confirm={t('Beenden')}
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
