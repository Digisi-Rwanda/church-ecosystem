import { Navigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { AnnouncementsStrip } from './AnnouncementsStrip';
import { useFrontDoor } from './FrontDoorContext';
import { landingPath } from './portalHome';
import { PortalWeek } from './PortalWeek';
import { SystemCards } from './SystemCards';
import { CardsSkeleton, PageHeader } from './kit';

/** The Portal: one card per system this person may enter, as the server answers. */
export function PortalPage() {
  const t = useT();
  const { status, portal, reload, personName } = useFrontDoor();
  // A person with exactly one system goes straight into it; everyone else sees the cards.
  const landing = status === 'in' ? landingPath(portal) : null;
  if (landing) return <Navigate to={landing} replace />;

  return (
    <>
      <div className="door-greeting">
        <PageHeader title={t('door.portal.greeting', { name: personName })} purpose={t('door.portal.subtitle')} />
      </div>

      {status === 'in' && <PortalWeek />}
      {status === 'in' && <AnnouncementsStrip />}

      {status === 'loading' && (
        <CardsSkeleton />
      )}
      {status === 'error' && (
        <EmptyState
          variant="error"
          title={t('door.portal.errorTitle')}
          detail={t('door.portal.errorDetail')}
          action={
            <button type="button" className="btn" onClick={() => void reload()}>
              {t('door.portal.retry')}
            </button>
          }
        />
      )}
      {status === 'in' && portal.length === 0 && (
        <EmptyState title={t('door.portal.emptyTitle')} detail={t('door.portal.emptyDetail')} />
      )}
      {status === 'in' && portal.length > 0 && <SystemCards systems={portal} />}
    </>
  );
}
