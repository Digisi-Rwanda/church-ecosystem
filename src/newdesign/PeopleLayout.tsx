import { Outlet, useLocation, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { isAdministrator, lettersFor } from './menu';
import { RouteSuspense } from './kit/RouteSuspense';

/** The People block of a system: Directory and Organisation, for those who hold access to People. */
export function PeopleLayout() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const { pathname } = useLocation();
  const letters = lettersFor(capabilities, systemId, 'people');
  const chiefAdministration = isAdministrator(capabilities) && /\/people\/(appointments|access|admin)\/?$/.test(pathname);

  if (letters.length === 0 && !chiefAdministration) {
    return <EmptyState variant="error" title={t('door.people.noAccess')} />;
  }
  return (
    <section className="door-block">
      <RouteSuspense>
        <Outlet />
      </RouteSuspense>
    </section>
  );
}
