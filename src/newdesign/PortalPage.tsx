import { Navigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { useT } from '../i18n/I18nContext';
import { AnnouncementsStrip } from './AnnouncementsStrip';
import { useFrontDoor } from './FrontDoorContext';
import { landingPath } from './portalHome';
import { SystemCards } from './SystemCards';

/** The Portal: one card per system this person may enter, as the server answers. */
export function PortalPage() {
  const t = useT();
  const { status, portal, reload } = useFrontDoor();
  // A person with exactly one system goes straight into it; everyone else sees the cards.
  const landing = status === 'in' ? landingPath(portal) : null;
  if (landing) return <Navigate to={landing} replace />;

  return (
    <>
      <div>
        <h1>{t('door.portal.title')}</h1>
        <p className="muted">{t('door.portal.subtitle')}</p>
      </div>

      {status === 'in' && <AnnouncementsStrip />}

      {status === 'loading' && (
        <div className="door-center" role="status">
          <Spinner size="lg" label={t('door.portal.loading')} />
        </div>
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
