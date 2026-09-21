import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  isCatechist,
  isChurchLeader,
  isOrdainedPastor,
} from '../../domain/churchLeadership';
import { canSeeSystemAdminNav } from '../../domain/systemAdmin';
import { CommandPalette } from '../CommandPalette';
import { Icon, type IconName } from '../ui/Icon';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useAttention } from '../../hooks/useAttention';
import { peekExitToMainChurch, consumeExitToMainChurch } from '../../navigation/systemScope';
import {
  authService,
  churchFinanceService,
} from '../../services';
import { canViewBoard } from '../../services/boardService';

function weekOfLabel(d = new Date()) {
  const start = new Date(d);
  // Church week often begins Sunday
  start.setDate(d.getDate() - d.getDay());
  start.setHours(0, 0, 0, 0);
  return start.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    to: string;
    label: string;
    icon: IconName;
    end?: boolean;
    secondary?: boolean;
  }>;
}> = [
  {
    label: 'Home',
    items: [
      { to: '/', label: 'Home', icon: 'home', end: true },
      { to: '/inbox', label: 'Inbox', icon: 'inbox' },
      { to: '/board', label: 'Board', icon: 'board', secondary: true },
      { to: '/pastoral', label: 'Pastoral desk', icon: 'pastoral', secondary: true },
      {
        to: '/correspondence',
        label: 'Correspondence',
        icon: 'folder',
        secondary: true,
      },
      {
        to: '/system-admin',
        label: 'System admin',
        icon: 'settings',
        secondary: true,
      },
    ],
  },
  {
    label: 'People & org',
    items: [
      { to: '/people', label: 'People', icon: 'users' },
      {
        to: '/organization',
        label: 'Organisation',
        icon: 'building',
        secondary: true,
      },
      {
        to: '/participation',
        label: 'Participation',
        icon: 'hand',
        secondary: true,
      },
    ],
  },
  {
    label: 'Work',
    items: [
      { to: '/mission', label: 'Mission', icon: 'pulse' },
      { to: '/programs', label: 'Programs', icon: 'program', secondary: true },
      { to: '/events', label: 'Events', icon: 'event', secondary: true },
      { to: '/tasks', label: 'Tasks', icon: 'task', secondary: true },
      { to: '/projects', label: 'Projects', icon: 'folder', secondary: true },
      { to: '/calendar', label: 'Calendar', icon: 'calendar', secondary: true },
      {
        to: '/reports/leadership',
        label: 'Reports',
        icon: 'chart',
        secondary: true,
      },
    ],
  },
  {
    label: 'Treasury',
    items: [
      { to: '/finance', label: 'Overview', icon: 'wallet', end: true },
      {
        to: '/finance/collections',
        label: 'Collections',
        icon: 'hand',
        secondary: true,
      },
      {
        to: '/finance/budgets',
        label: 'Budgets',
        icon: 'chart',
        secondary: true,
      },
      {
        to: '/finance/balance-sheet',
        label: 'Balance sheet',
        icon: 'layers',
        secondary: true,
      },
      {
        to: '/finance/reports',
        label: 'Reports',
        icon: 'chart',
        secondary: true,
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/access', label: 'Access', icon: 'lock' },
      { to: '/systems', label: 'Systems', icon: 'systems', secondary: true },
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
    positions,
    roles,
  } = useAuth();
  const location = useLocation();
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
  const canTreasury = Boolean(
    account && churchFinanceService.canViewGeneral(account.personId),
  );
  const canBoard =
    !!account &&
    (can('BOARD', 'VIEW', 'sys-main') ||
      canViewBoard(account.personId, positions, roles));
  const canPastoral =
    isChurchLeader(roles) || isCatechist(roles) || isOrdainedPastor(roles);
  const canCorrespondence =
    can('CORRESPONDENCE', 'VIEW') ||
    can('CORRESPONDENCE', 'CREATE') ||
    can('CORRESPONDENCE', 'MANAGE');
  const canSystemAdmin = Boolean(
    account && canSeeSystemAdminNav(account.personId, positions, roles),
  );
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
      case '/board':
        return canBoard;
      case '/pastoral':
        return canPastoral;
      case '/correspondence':
        return canCorrespondence;
      case '/system-admin':
        return canSystemAdmin;
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
      case '/reports/leadership':
        return canProgram;
      default:
        return true;
    }
  }

  const navGroups = NAV_GROUPS.map((group) => {
    if (group.label === 'Admin') {
      if (!canAdminTools) return { ...group, items: [] };
      return group;
    }
    if (group.label === 'Treasury') {
      if (!canTreasury) return { ...group, items: [] };
      return group;
    }

    const items = group.items
      .filter((item) => navItemAllowed(item.to))
      .map((item) =>
        item.to === '/people' && !canViewPeople
          ? {
              ...item,
              to: profilePath,
              label: 'Profile',
              icon: 'user' as IconName,
            }
          : item,
      );

    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  const weekLabel = useMemo(() => weekOfLabel(), []);

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <CommandPalette />
      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside className="sidebar" aria-label="Primary" id="app-sidebar">
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
            <small>{currentSystem?.shortName ?? 'Main Church'}</small>
          </div>
          <button
            type="button"
            className="nav-drawer-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="nav" aria-label="Main">
          {navGroups.map((group) => (
            <div key={group.label} className="nav-group">
              <div className="nav-group-label">{group.label}</div>
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
                    <span className="nav-label">{item.label}</span>
                  </span>
                  {item.to === '/inbox' && unreadCount > 0 ? (
                    <span className="nav-badge" aria-label={`${unreadCount} unread`}>
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
            {roleLabels.join(' · ') || 'Member'}
          </div>
          <button
            type="button"
            className="btn sm btn-signout"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              type="button"
              className="nav-toggle"
              aria-label="Open menu"
              aria-expanded={navOpen}
              aria-controls="app-sidebar"
              onClick={() => setNavOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="topbar-titles">
              <p className="topbar-week">Week of {weekLabel}</p>
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
              title="Search (Ctrl/⌘+K)"
              aria-label="Open search"
            >
              <Icon name="search" size={15} />
              <span className="topbar-search-label">Search</span>
              <kbd className="topbar-kbd">⌘K</kbd>
            </button>
            <NavLink to="/inbox" className="topbar-inbox" aria-label="Inbox">
              <Icon name="inbox" size={15} />
              <span className="topbar-inbox-label">Inbox</span>
              {unreadCount > 0 ? (
                <span className="nav-badge" aria-label={`${unreadCount} unread`}>
                  {unreadCount}
                </span>
              ) : null}
            </NavLink>
            <span className="muted topbar-account">{personName}</span>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
