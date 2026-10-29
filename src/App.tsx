import { useEffect, useState, type CSSProperties } from 'react';
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
import { HelpScreen } from './screens/HelpScreen';
import { load } from './lib/storage';
import { LOCATION_ASKED, useApp, type Route, type Tab } from './state/app';
import { t } from './lib/i18n';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'map', label: t('Karte'), icon: 'map' },
  { id: 'collection', label: t('Check-ins'), icon: 'collection' },
  { id: 'friends', label: t('Freunde'), icon: 'friends' },
  { id: 'profile', label: t('Profil'), icon: 'profile' },
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
    case 'help': return <HelpScreen />;
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

  // Rückmeldung zu eigenen Vorschlägen, sobald sie geprüft sind
  useEffect(() => {
    if (!app.user) return;
    api.reviewNews().then((news) => {
      if (!news.length) return;
      const ok = news.filter((n) => n.accepted);
      const no = news.filter((n) => !n.accepted);
      const parts = [];
      if (ok.length) parts.push(ok.length === 1 ? (ok[0].kind === 'neu' ? t('„{name}“ ist geprüft und jetzt für alle auf der Karte.', { name: ok[0].name }) : t('Dein Vorschlag zu „{name}“ wurde übernommen.', { name: ok[0].name })) : t('{n} deiner Vorschläge wurden übernommen.', { n: ok.length }));
      if (no.length) parts.push(no.length === 1 ? t('Deinen Vorschlag „{name}“ haben wir nicht übernommen.', { name: no[0].name }) : t('{n} Vorschläge haben wir nicht übernommen.', { n: no.length }));
      app.notify(ok.length ? `${parts.join(' ')} ${t('Danke!')}` : parts.join(' '), ok.length ? 'success' : 'info');
      if (ok.length) app.bump();
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.user?.id]);

  let body;
  if (!app.user) {
    body = (
      <AuthFlow
        onDone={(u, isNew) => {
          app.setUser(u);
          app.setTab('map');
          if (isNew) app.notify(t('Willkommen, {name}.', { name: u.firstName }), 'success');
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
        <nav className="tabbar" aria-label={t('Hauptnavigation')} style={{ '--i': TABS.findIndex((x) => x.id === app.tab) } as CSSProperties}>
          {/* gleitende Markierung hinter dem gewählten Tab */}
          <span className="tab-indicator" aria-hidden="true" />
          {TABS.map((tab) => {
            const on = app.tab === tab.id;
            return (
              <button key={tab.id} className="tab" aria-current={on ? 'page' : undefined} onClick={() => app.setTab(tab.id)}>
                <Icon name={tab.icon} muted={!on} />
                <span>{tab.label}</span>
                {tab.id === 'friends' && requests > 0 && <span className="badge" aria-label={t('{n} offene Anfragen', { n: requests })}>{requests}</span>}
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
