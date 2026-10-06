import { NavLink, Outlet, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';

/** The People block of a system: Directory and Organisation, for those who hold access to People. */
export function PeopleLayout() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const letters = lettersFor(capabilities, systemId, 'people');

  if (letters.length === 0) {
    return <EmptyState variant="error" title={t('door.people.noAccess')} />;
  }
  const base = `/s/${systemId}/people`;
  return (
    <section className="door-block">
      <nav className="door-menu" aria-label={t('door.people.tabs')}>
        <NavLink to={base} end className={({ isActive }) => `door-menu-link${isActive ? ' active' : ''}`}>
          {t('door.people.tab.directory')}
        </NavLink>
        <NavLink to={`${base}/units`} className={({ isActive }) => `door-menu-link${isActive ? ' active' : ''}`}>
          {t('door.people.tab.units')}
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
