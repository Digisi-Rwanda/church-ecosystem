import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { resolveActive, type NavModule } from './menu';
import { badge } from './notices';
import { useAnnouncementSummary } from './useAnnouncementSummary';
import { DoorBrand } from './DoorBrand';
import { DoorMenu } from './DoorMenu';
import { MODULE_ICON } from './moduleIcons';

/**
 * The shell of the new design, shared by the Portal and every system: a header, a sidebar of
 * modules and a top bar for the places of the chosen module. What the person may not open is
 * not in `modules`, so it is not drawn, and its address shows a plain "not found".
 */
export function Shell({
  modules,
  where,
  subtitle,
  backTo,
  notificationsTo,
  notificationCount,
  children,
}: {
  modules: NavModule[];
  /** Name for the browser tab: the system or the Portal. */
  where: string;
  subtitle: string;
  backTo?: string;
  notificationsTo: string;
  notificationCount: number;
  children: ReactNode;
}) {
  const t = useT();
  const location = useLocation();
  const { capabilities, signOut } = useFrontDoor();
  const announcements = useAnnouncementSummary();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.pathname;
  const setOpen = (v: boolean | ((x: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === 'function' ? v(cur === location.pathname) : v) ? location.pathname : null));
  const toggleRef = useRef<HTMLButtonElement>(null);

  const active = resolveActive(modules, location.pathname);
  const current = active?.module;
  const allowed = capabilities === null || active !== null;

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

  return (
    <div className="door-frame">
      <a className="door-skip" href="#door-main">
        {t('door.frame.skip')}
      </a>
      <header className="door-frame-top">
        <button
          ref={toggleRef}
          type="button"
          className="btn ghost sm door-burger"
          aria-expanded={open}
          aria-controls="door-side"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="menu" size={18} />
          <span>{open ? t('door.frame.closeMenu') : t('door.frame.openMenu')}</span>
        </button>
        {backTo && (
          <Link className="btn ghost sm door-churchwide" to={backTo}>
            {t('door.frame.churchWide')}
          </Link>
        )}
        <DoorBrand subtitle={subtitle} />
        <div className="door-top-actions">
          <Link className="btn ghost sm" to={notificationsTo}>
            {t('door.portal.nav.notifications')}
            {notificationCount > 0 && <span className="door-badge">{badge(notificationCount)}</span>}
          </Link>
          <ThemeToggle />
          <button type="button" className="btn secondary sm" onClick={signOut}>
            {t('shell.signOut')}
          </button>
        </div>
      </header>
      <div className="door-shell">
        {open && <button type="button" className="door-scrim" aria-label={t('door.frame.closeMenu')} onClick={() => setOpen(false)} />}
        <aside id="door-side" className={`door-side${open ? ' open' : ''}`}>
          <nav aria-label={t('door.frame.modules')}>
            <ul className="door-side-list">
              {modules.map((m) => (
                <li key={m.id}>
                  <NavLink
                    to={m.to}
                    end={m.places.length === 1 && m.places[0]!.end}
                    className={() => `door-side-link${current?.id === m.id ? ' active' : ''}`}
                    aria-current={current?.id === m.id ? 'page' : undefined}
                  >
                    <Icon name={MODULE_ICON[m.id]} size={20} />
                    <span>{t(m.labelKey as 'door.block.home')}</span>
                    {m.id === 'notifications' && notificationCount > 0 && <span className="door-badge">{badge(notificationCount)}</span>}
                    {m.id === 'announcements' && announcements.unread > 0 && <span className="door-badge">{badge(announcements.unread)}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="door-shell-main">
          {current && current.places.length > 1 && (
            <DoorMenu label={t('door.frame.submenu', { module: t(current.labelKey as 'door.block.home') })} className="door-subbar">
              {current.places.map((p) => (
                <NavLink
                  key={p.key}
                  to={p.to}
                  className={() => `door-menu-link${active?.place?.key === p.key ? ' active' : ''}`}
                  aria-current={active?.place?.key === p.key ? 'page' : undefined}
                >
                  {t(p.labelKey as 'door.block.home')}
                </NavLink>
              ))}
            </DoorMenu>
          )}
          <main id="door-main" className="door-frame-body" tabIndex={-1}>
            {allowed ? children : <EmptyState variant="no-results" title={t('door.frame.notFound')} />}
          </main>
        </div>
      </div>
    </div>
  );
}
