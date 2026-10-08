import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { resolveActive, type NavModule } from './menu';
import { badge } from './notices';
import { useAnnouncementSummary } from './useAnnouncementSummary';
import { LanguageSwitch } from './LanguageSwitch';
import { OfflineBanner } from './OfflineBanner';
import { warm } from './warm';
import { MODULE_ICON } from './moduleIcons';

function weekOfLabel(locale: string, d = new Date()) {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** The four places a phone shows in the bottom bar, in order; a person without one of them simply sees fewer. */
const BOTTOM_PREFERRED = ['home', 'schedule', 'people', 'notifications', 'work'];

/** Sidebar sections, in order; a module outside every section is not drawn. */
const GROUPS: Array<{ key: string; labelKey: string; ids: string[] }> = [
  { key: 'home', labelKey: 'nav.group.home', ids: ['home', 'notifications', 'announcements'] },
  { key: 'people', labelKey: 'nav.group.people', ids: ['people', 'units'] },
  { key: 'work', labelKey: 'nav.group.work', ids: ['work', 'schedule', 'ministry'] },
  { key: 'money', labelKey: 'door.shell.group.money', ids: ['money', 'reports', 'governance'] },
  { key: 'admin', labelKey: 'nav.group.admin', ids: ['settings'] },
];

/**
 * The shell of the new design, shared by the Portal and every system: a header, a sidebar of
 * modules and a top bar for the places of the chosen module. What the person may not open is
 * not in `modules`, so it is not drawn, and its address shows a plain "not found".
 */
export function Shell({
  modules,
  where,
  subtitle,
  brandSub,
  roleLabel,
  backTo,
  notificationsTo,
  notificationCount,
  children,
}: {
  modules: NavModule[];
  /** Name for the browser tab: the system or the Portal. */
  where: string;
  subtitle: string;
  /** Small line under the church name in the sidebar: the system's short name. */
  brandSub?: string;
  /** The person's role here, shown in the sidebar foot. */
  roleLabel?: string;
  backTo?: string;
  notificationsTo: string;
  notificationCount: number;
  children: ReactNode;
}) {
  const t = useT();
  const { locale, fmt } = useI18n();
  const weekLabel = useMemo(() => weekOfLabel(locale), [locale]);
  const location = useLocation();
  const { capabilities, signOut, personName } = useFrontDoor();
  const announcements = useAnnouncementSummary();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.pathname;
  const setOpen = (v: boolean | ((x: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === 'function' ? v(cur === location.pathname) : v) ? location.pathname : null));
  const toggleRef = useRef<HTMLButtonElement>(null);
  // A module with several places opens like a tree in the sidebar. The one you are in is open by itself; a click on its arrow overrides that.
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const active = resolveActive(modules, location.pathname);
  const current = active?.module;
  const allowed = capabilities === null || active !== null;

  useEffect(() => {
    if (!current) return;
    setOverride((o) => (current.id in o ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== current.id)) : o));
  }, [current?.id]); // oxlint-disable-line react-hooks/exhaustive-deps

  const placeName = active?.place ?? current?.places[0];
  const pageTitle = placeName ? `${t(placeName.labelKey as 'door.block.home')} · ${where}` : where;
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const placeTitle = placeName ? t(placeName.labelKey as 'door.block.home') : where;
  const close = () => setOpen(false);
  const bottom = BOTTOM_PREFERRED.map((id) => modules.find((m) => m.id === id)).filter((m): m is NavModule => !!m).slice(0, 4);
  const groups = GROUPS.map((g) => ({ ...g, items: modules.filter((m) => g.ids.includes(m.id)) })).filter((g) => g.items.length > 0);

  return (
    <div className={`app-shell${open ? ' nav-open' : ''}`}>
      <a className="door-skip" href="#door-main">
        {t('door.frame.skip')}
      </a>
      <button type="button" className="nav-backdrop" aria-label={t('shell.menuClose')} tabIndex={open ? 0 : -1} onClick={close} />
      <aside id="door-side" className="sidebar" aria-label={t('shell.primaryNav')}>
        <div className="brand">
          <img className="brand-logo" src="/brand/adepr-logo.png" alt="ADEPR" width={44} height={44} />
          <div className="brand-text">
            ADEPR Kacyiru
            <small>{brandSub ?? where}</small>
          </div>
          <button type="button" className="nav-drawer-close" aria-label={t('shell.menuClose')} onClick={close}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <nav className="nav" aria-label={t('door.frame.modules')}>
          {backTo && (
            <div className="nav-group">
              <a href={backTo} target="_blank" rel="noopener noreferrer" onClick={close} className="door-back-link">
                <span className="nav-link-main">
                  <Icon name="home" size={15} className="nav-icon" />
                  <span className="nav-label">{t('door.frame.allSystems')}</span>
                </span>
              </a>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key} className="nav-group">
              <div className="nav-group-label">{t(g.labelKey as 'nav.group.home')}</div>
              {g.items.map((m) => {
                const count = m.id === 'notifications' ? notificationCount : m.id === 'announcements' ? announcements.unread : 0;
                const tree = m.places.length > 1;
                const isOpen = tree && (override[m.id] ?? current?.id === m.id);
                const link = (
                  <NavLink
                    key={m.id}
                    to={m.to}
                    end={m.places.length === 1 && m.places[0]!.end}
                    onClick={tree ? () => setOverride((o) => ({ ...o, [m.id]: true })) : close}
                    onMouseEnter={() => warm(m.to)}
                    onFocus={() => warm(m.to)}
                    onTouchStart={() => warm(m.to)}
                    className={() => (current?.id === m.id ? (tree ? 'parent-active' : 'active') : undefined)}
                    aria-current={current?.id === m.id && !tree ? 'page' : undefined}
                  >
                    <span className="nav-link-main">
                      <Icon name={MODULE_ICON[m.id]} size={15} className="nav-icon" />
                      <span className="nav-label">{t(m.labelKey as 'door.block.home')}</span>
                    </span>
                    {count > 0 && <span className="nav-badge">{badge(count)}</span>}
                  </NavLink>
                );
                if (!tree) return link;
                return (
                  <div key={m.id} className={`nav-item${isOpen ? ' open' : ''}`}>
                    <div className="nav-item-row">
                      {link}
                      <button
                        type="button"
                        className="nav-caret"
                        aria-expanded={isOpen}
                        aria-controls={`nav-tree-${m.id}`}
                        aria-label={t('door.frame.submenu', { module: t(m.labelKey as 'door.block.home') })}
                        onClick={() => setOverride((o) => ({ ...o, [m.id]: !isOpen }))}
                      >
                        <Icon name="chevron-down" size={14} />
                      </button>
                    </div>
                    {isOpen && (
                      <ul id={`nav-tree-${m.id}`} className="nav-tree">
                        {m.places.map((p) => (
                          <li key={p.key}>
                            {p.external ? (
                              <a href={p.to} target="_blank" rel="noopener noreferrer" onClick={close}>
                                <span className="nav-label">{p.label ?? t(p.labelKey as 'door.block.home')}</span>
                              </a>
                            ) : (
                              <NavLink
                                to={p.to}
                                onClick={close}
                                onMouseEnter={() => warm(p.to)}
                                onTouchStart={() => warm(p.to)}
                                className={() => (current?.id === m.id && active?.place?.key === p.key ? 'active' : undefined)}
                                aria-current={current?.id === m.id && active?.place?.key === p.key ? 'page' : undefined}
                              >
                                <span className="nav-label">{p.label ?? t(p.labelKey as 'door.block.home')}</span>
                              </NavLink>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-foot-name">{personName}</div>
          <div className="sidebar-foot-role">{roleLabel || t('shell.memberFallback')}</div>
          <button type="button" className="btn sm btn-signout" onClick={signOut}>
            {t('shell.signOut')}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              ref={toggleRef}
              type="button"
              className="nav-toggle"
              aria-label={t('shell.menuOpen')}
              aria-expanded={open}
              aria-controls="door-side"
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="topbar-titles">
              <p className="topbar-week">{t('shell.weekOf', { date: weekLabel })}</p>
              <h1>{placeTitle}</h1>
              <p className="topbar-subtitle">{subtitle}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <LanguageSwitch />
            <ThemeToggle />
            <Link to={notificationsTo} className="topbar-inbox" aria-label={t('door.portal.nav.notifications')}>
              <Icon name="inbox" size={15} />
              <span className="topbar-inbox-label">{t('door.portal.nav.notifications')}</span>
              {notificationCount > 0 && <span className="nav-badge">{badge(notificationCount)}</span>}
            </Link>
          </div>
        </header>
        <OfflineBanner />
        <div className="print-head" aria-hidden>ADEPR Kacyiru · {where} · {fmt.date(new Date())}</div>
        <main id="door-main" className="content door-content" tabIndex={-1}>
          {allowed ? children : <EmptyState variant="no-results" title={t('door.frame.notFound')} />}
        </main>
        <nav className="bottom-nav no-print" aria-label={t('door.frame.bottomNav')}>
          {bottom.map((m) => {
            const count = m.id === 'notifications' ? notificationCount : 0;
            return (
              <NavLink
                key={m.id}
                to={m.to}
                end={m.places.length === 1 && m.places[0]!.end}
                className={() => (current?.id === m.id ? 'active' : undefined)}
                aria-current={current?.id === m.id ? 'page' : undefined}
                onTouchStart={() => warm(m.to)}
              >
                <span className="bottom-nav-icon">
                  <Icon name={MODULE_ICON[m.id]} size={20} />
                  {count > 0 && <span className="nav-badge">{badge(count)}</span>}
                </span>
                <span className="bottom-nav-label">{t(m.labelKey as 'door.block.home')}</span>
              </NavLink>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="door-side">
            <span className="bottom-nav-icon"><Icon name="menu" size={20} /></span>
            <span className="bottom-nav-label">{t('door.frame.more')}</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
