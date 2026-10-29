import { useEffect, useState } from 'react';
import { api } from './api';
import { Icon, type IconName } from './components/Icon';
import { Toast } from './components/ui';
import { AuthFlow, LocationOnboarding } from './screens/AuthScreens';
import { CheckInFlow } from './screens/CheckInFlow';
import { CollectionScreen, DetailsScreen, VisitsScreen } from './screens/CollectionScreens';
import { FriendsScreen, UserProfile } from './screens/FriendScreens';
import { MapScreen } from './screens/MapScreen';
import { BlockedUsers, EditProfile, LocationHelp, PrivacyScreen, ProfileScreen } from './screens/ProfileScreens';
import { AddPub, PubDetail, ReviewQueue, SearchScreen } from './screens/PubScreens';
import { Datenschutz, Impressum } from './screens/LegalScreens';
import { load } from './lib/storage';
import { LOCATION_ASKED, useApp, type Route, type Tab } from './state/app';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'map', label: 'Karte', icon: 'map' },
  { id: 'collection', label: 'Check-ins', icon: 'collection' },
  { id: 'friends', label: 'Freunde', icon: 'friends' },
  { id: 'profile', label: 'Profil', icon: 'profile' },
];

function RouteView({ r }: { r: Route }) {
  const app = useApp();
  switch (r.kind) {
    case 'pub': return <PubDetail id={r.id} />;
    case 'search': return <SearchScreen />;
    case 'addPub': return <AddPub pos={r.pos} />;
    case 'details': return <DetailsScreen checkinId={r.checkinId} />;
    case 'visits': return <VisitsScreen pubId={r.pubId} userId={r.userId} />;
    case 'user': return <UserProfile id={r.id} />;
    case 'review': return <ReviewQueue />;
    case 'editProfile': return <EditProfile />;
    case 'privacy': return <PrivacyScreen />;
    case 'impressum': return <Impressum onBack={app.pop} />;
    case 'blocked': return <BlockedUsers />;
    case 'datenschutz': return <Datenschutz onBack={app.pop} />;
    case 'locationHelp': return <LocationHelp />;
  }
}

export function App() {
  const app = useApp();
  // A4: Standort-Erklärung beim Öffnen, bis einmal gefragt wurde; „Später“ gilt nur für diese Sitzung
  const [onboarding, setOnboarding] = useState(() => !load(LOCATION_ASKED, false));
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    if (!app.user) return;
    api.friendRequests().then((r) => setRequests(r.length)).catch(() => {});
  }, [app.user, app.version]);

  let body;
  if (!app.user) {
    body = (
      <AuthFlow
        onDone={(u, isNew) => {
          app.setUser(u);
          app.setTab('map');
          if (isNew) app.notify(`Willkommen, ${u.firstName}.`, 'success');
        }}
      />
    );
  } else if (onboarding && !app.location.simulated && app.location.status === 'off') {
    body = (
      <LocationOnboarding
        onAllow={() => {
          app.requestLocation();
          setOnboarding(false);
        }}
        onLater={() => setOnboarding(false)}
      />
    );
  } else {
    body = (
      <>
        {app.tab === 'map' && <MapScreen />}
        {app.tab === 'collection' && <CollectionScreen />}
        {app.tab === 'friends' && <FriendsScreen />}
        {app.tab === 'profile' && <ProfileScreen />}
        <nav className="tabbar" aria-label="Hauptnavigation">
          {TABS.map((t) => {
            const on = app.tab === t.id;
            return (
              <button key={t.id} className="tab" aria-current={on ? 'page' : undefined} onClick={() => app.setTab(t.id)}>
                <Icon name={t.icon} muted={!on} />
                <span>{t.label}</span>
                {t.id === 'friends' && requests > 0 && <span className="badge" aria-label={`${requests} offene Anfragen`}>{requests}</span>}
              </button>
            );
          })}
        </nav>
        {app.stack.map((r, i) => (
          <div key={i} hidden={i < app.stack.length - 1}>
            <RouteView r={r} />
          </div>
        ))}
        <CheckInFlow />
      </>
    );
  }

  return (
    <div className="app">
      {body}
      {app.toast && <Toast key={app.toast.id} text={app.toast.text} kind={app.toast.kind} onDone={app.clearToast} />}
    </div>
  );
}
