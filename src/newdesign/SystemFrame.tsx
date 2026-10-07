import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { activeModule, buildModules, canSeeBlock } from './menu';
import { badge } from './notices';
import { churchWideLink } from './portalHome';
import { useNoticeSummary } from './useNoticeSummary';
import { DoorBrand } from './DoorBrand';
import { DoorMenu } from './DoorMenu';
import { MODULE_ICON } from './moduleIcons';

/**
 * One frame for every system. A sidebar lists the modules, a top bar lists the places of the
 * chosen module. Everything comes from the server's capabilities answer: a module or place the
 * person cannot open is not drawn at all, and opening its address shows a plain "not found".
 */
export function SystemFrame() {
  const t = useT();
  const { systemId = '' } = useParams();
  const location = useLocation();
  const { portal, capabilities, signOut } = useFrontDoor();
  const system = portal.find((s) => s.id === systemId);
  const modules = buildModules(capabilities, systemId);
  const { counts } = useNoticeSummary();
  const churchWide = churchWideLink(portal, systemId);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.pathname;
  const setOpen = (v: boolean | ((x: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === 'function' ? v(cur === location.pathname) : v) ? location.pathname : null));
  const toggleRef = useRef<HTMLButtonElement>(null);

  const block = location.pathname.split('/')[3] || 'home';
  const current = activeModule(modules, block);
  const allowed = capabilities === null || canSeeBlock(modules, block);

  const place = current?.places.find((p) => p.block === block);
  const pageTitle = place && system ? `${t(place.labelKey as 'door.block.home')} · ${system.name}` : system?.name;
  useEffect(() => {
    if (pageTitle) document.title = pageTitle;
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

  if (!system) {
    return (
      <main className="door-page">
        <EmptyState
          variant="error"
          title={t('door.frame.notYours')}
          action={
            <Link className="btn" to="/portal">
              {t('door.frame.allSystems')}
            </Link>
          }
        />
      </main>
    );
  }

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
        {churchWide && (
          <Link className="btn ghost sm door-churchwide" to={churchWide}>
            {t('door.frame.churchWide')}
          </Link>
        )}
        <DoorBrand subtitle={`${system.name} · ${t('door.portal.role', { role: system.role })}`} />
        <div className="door-top-actions">
          <Link className="btn ghost sm" to={`/portal/notifications?system=${encodeURIComponent(systemId)}`}>
            {t('door.portal.nav.notifications')}
            {counts && (counts.bySystem[systemId] ?? 0) > 0 && <span className="door-badge">{badge(counts.bySystem[systemId] ?? 0)}</span>}
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
                    end={m.id === 'home'}
                    className={() => `door-side-link${current?.id === m.id ? ' active' : ''}`}
                    aria-current={current?.id === m.id ? 'page' : undefined}
                  >
                    <Icon name={MODULE_ICON[m.id]} size={20} />
                    <span>{t(`door.module.${m.id}` as 'door.module.home')}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="door-shell-main">
          {current && current.places.length > 1 && (
            <DoorMenu label={t('door.frame.submenu', { module: t(`door.module.${current.id}` as 'door.module.home') })} className="door-subbar">
              {current.places.map((p) => (
                <NavLink
                  key={p.block}
                  to={p.to}
                  end={p.block === 'home' || undefined}
                  className={({ isActive }) => `door-menu-link${isActive ? ' active' : ''}`}
                >
                  {t(p.labelKey as 'door.block.home')}
                </NavLink>
              ))}
            </DoorMenu>
          )}
          <main id="door-main" className="door-frame-body" tabIndex={-1}>
            {allowed ? <Outlet /> : <EmptyState variant="no-results" title={t('door.frame.notFound')} />}
          </main>
        </div>
      </div>
    </div>
  );
}
