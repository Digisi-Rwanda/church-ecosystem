import { Suspense } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../ErrorBoundary';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { CommandPalette } from '../CommandPalette';
import { Icon, type IconName } from '../ui/Icon';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useAttention } from '../../hooks/useAttention';
import { useI18n } from '../../i18n/I18nContext';
import type { MessageKey } from '../../i18n/translate';
import { peekExitToMainChurch, consumeExitToMainChurch } from '../../navigation/systemScope';
import { authService } from '../../services';

function weekOfLabel(locale: string, d = new Date()) {
  const start = new Date(d);
  // Church week often begins Sunday
  start.setDate(d.getDate() - d.getDay());
  start.setHours(0, 0, 0, 0);
  return start.toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const NAV_GROUPS: Array<{
  /** Stable id used by the access logic below (never shown). */
  label: string;
  labelKey: MessageKey;
  items: Array<{
    to: string;
    labelKey: MessageKey;
    icon: IconName;
    end?: boolean;
    secondary?: boolean;
  }>;
}> = [
  {
    label: 'Home',
    labelKey: 'nav.group.home',
    items: [
      { to: '/', labelKey: 'nav.home', icon: 'home', end: true },
      { to: '/inbox', labelKey: 'nav.inbox', icon: 'inbox' },
    ],
  },
  {
    label: 'People & org',
    labelKey: 'nav.group.people',
    items: [
      { to: '/people', labelKey: 'nav.people', icon: 'users' },
      {
        to: '/organization',
        labelKey: 'nav.organization',
        icon: 'building',
        secondary: true,
      },
      {
        to: '/participation',
        labelKey: 'nav.participation',
        icon: 'hand',
        secondary: true,
      },
    ],
  },
  {
    label: 'Work',
    labelKey: 'nav.group.work',
    items: [
      { to: '/mission', labelKey: 'nav.mission', icon: 'pulse' },
      { to: '/programs', labelKey: 'nav.programs', icon: 'program', secondary: true },
      { to: '/events', labelKey: 'nav.events', icon: 'event', secondary: true },
      { to: '/tasks', labelKey: 'nav.tasks', icon: 'task', secondary: true },
      { to: '/projects', labelKey: 'nav.projects', icon: 'folder', secondary: true },
      { to: '/calendar', labelKey: 'nav.calendar', icon: 'calendar', secondary: true },
    ],
  },
  {
    label: 'Admin',
    labelKey: 'nav.group.admin',
    items: [
      { to: '/access', labelKey: 'nav.access', icon: 'lock' },
      { to: '/systems', labelKey: 'nav.systems', icon: 'systems', secondary: true },
    ],
  },
];

export function AppShell({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const {
    personName,
    roleLabels,
    logout,
    currentSystem,
    refreshSession,
    canViewPeople,
    account,
    can,
    session,
  } = useAuth();
  const location = useLocation();
  const { t, locale } = useI18n();
  const { unreadCount } = useAttention();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  useEffect(() => {
    // Do not steal an active peer/shared session on a transient Back into Main.
    // "Open Main Church" arms exit and switches session before navigating here.
    if (!session) return;
    if (session.currentSystemId !== 'sys-main' && !peekExitToMainChurch()) {
      return;
    }
    if (peekExitToMainChurch()) {
      consumeExitToMainChurch();
      authService.setCurrentSystem('sys-main', 'main');
      refreshSession();
      return;
    }
    // Already scoped to Main — avoid refreshSession loops on every render.
    if (session.currentSystemId === 'sys-main') return;
    authService.setCurrentSystem('sys-main', 'main');
    refreshSession();
  }, [refreshSession, session?.currentSystemId, location.pathname]);

  const profilePath = account ? `/people/${account.personId}` : '/people';
  /** Access engine + systems registry — governance only (not regular members). */
  const canAdminTools = can('AUDIT', 'VIEW', 'sys-main');
  const canOrg = can('ORG_UNIT', 'VIEW');
  const canProgram = can('PROGRAM', 'VIEW');
  const canEvent = can('EVENT', 'VIEW');
  const canTask = can('TASK', 'VIEW');
  const canProject = can('PROJECT', 'VIEW');
  const canMission = canProgram || canEvent || canTask || canProject;
  const canCalendar = canProgram || canEvent;

  /** Never list a module the signed-in person cannot open. */
  function navItemAllowed(to: string): boolean {
    switch (to) {
      case '/':
      case '/inbox':
        return true;
      case '/people':
        return true; // remapped to Profile when directory is closed
      case '/organization':
        return canOrg;
      case '/participation':
        return true; // own participation desk
      case '/mission':
        return canMission;
      case '/programs':
        return canProgram;
      case '/events':
        return canEvent;
      case '/tasks':
        return canTask;
      case '/projects':
        return canProject;
      case '/calendar':
        return canCalendar;
      default:
        return true;
    }
  }

  const navGroups = NAV_GROUPS.map((group) => {
    if (group.label === 'Admin') {
      if (!canAdminTools) return { ...group, items: [] };
      return group;
    }

    const items = group.items
      .filter((item) => navItemAllowed(item.to))
      .map((item) =>
        item.to === '/people' && !canViewPeople
          ? {
              ...item,
              to: profilePath,
              labelKey: 'nav.profile' as MessageKey,
              icon: 'user' as IconName,
            }
          : item,
      );

    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  const weekLabel = useMemo(() => weekOfLabel(locale), [locale]);

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        {t('shell.skip')}
      </a>
      <CommandPalette />
      <button
        type="button"
        className="nav-backdrop"
        aria-label={t('shell.menuClose')}
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside className="sidebar" aria-label={t('shell.primaryNav')} id="app-sidebar">
        <div className="brand">
          <img
            className="brand-logo"
            src="/brand/adepr-logo.png"
            alt="ADEPR"
            width={44}
            height={44}
          />
          <div className="brand-text">
            ADEPR Kacyiru
            <small>{currentSystem?.shortName ?? t('shell.mainChurch')}</small>
          </div>
          <button
            type="button"
            className="nav-drawer-close"
            aria-label={t('shell.menuClose')}
            onClick={() => setNavOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="nav" aria-label={t('shell.mainNav')}>
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label">{t(group.labelKey)}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    [
                      item.secondary ? 'nav-secondary' : '',
                      isActive ? 'active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                >
                  <span className="nav-link-main">
                    <Icon name={item.icon} size={15} className="nav-icon" />
                    <span className="nav-label">{t(item.labelKey)}</span>
                  </span>
                  {item.to === '/inbox' && unreadCount > 0 ? (
                    <span className="nav-badge" aria-label={t('shell.unread', { count: unreadCount })}>
                      {unreadCount}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-foot-name">{personName}</div>
          <div className="sidebar-foot-role">
            {roleLabels.join(' · ') || t('shell.memberFallback')}
          </div>
          <button
            type="button"
            className="btn sm btn-signout"
            onClick={logout}
          >
            {t('shell.signOut')}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              type="button"
              className="nav-toggle"
              aria-label={t('shell.menuOpen')}
              aria-expanded={navOpen}
              aria-controls="app-sidebar"
              onClick={() => setNavOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="topbar-titles">
              <p className="topbar-week">{t('shell.weekOf', { date: weekLabel })}</p>
              <h1>{title}</h1>
              <p className="topbar-subtitle">{subtitle}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <button
              type="button"
              className="topbar-search"
              onClick={() => window.dispatchEvent(new Event('adepr:cmdk'))}
              title={t('shell.searchTitle')}
              aria-label={t('shell.searchOpen')}
            >
              <Icon name="search" size={15} />
              <span className="topbar-search-label">{t('shell.search')}</span>
              <kbd className="topbar-kbd">⌘K</kbd>
            </button>
            <NavLink to="/inbox" className="topbar-inbox" aria-label={t('shell.inbox')}>
              <Icon name="inbox" size={15} />
              <span className="topbar-inbox-label">{t('shell.inbox')}</span>
              {unreadCount > 0 ? (
                <span className="nav-badge" aria-label={t('shell.unread', { count: unreadCount })}>
                  {unreadCount}
                </span>
              ) : null}
            </NavLink>
            <span className="muted topbar-account">{personName}</span>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          {/* A crashing page must not take the menu with it; reset when you navigate. */}
          <ErrorBoundary key={location.pathname} label={location.pathname}>
            <Suspense fallback={<div className="route-loading" role="status">{t('shell.loading')}</div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
