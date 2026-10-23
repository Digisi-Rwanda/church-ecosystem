import { Outlet, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';
import { RouteSuspense } from './kit/RouteSuspense';

/** The People block of a system: Directory and Organisation, for those who hold access to People. */
export function PeopleLayout() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const letters = lettersFor(capabilities, systemId, 'people');

  if (letters.length === 0) {
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
