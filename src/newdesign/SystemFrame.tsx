import { Outlet, useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { buildModules } from './menu';
import { useNoticeSummary } from './useNoticeSummary';
import { Shell } from './Shell';
import { RouteSuspense } from './kit/RouteSuspense';

/**
 * One frame for every system. A sidebar lists the modules, a top bar lists the places of the
 * chosen module. Everything comes from the server's capabilities answer.
 */
export function SystemFrame() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { portal, capabilities, status, reload } = useFrontDoor();
  const system = portal.find((s) => s.id === systemId);
  const { counts } = useNoticeSummary();

  if (!system && status === 'error') {
    return (
      <main className="door-page">
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
      </main>
    );
  }
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
    <Shell
      modules={buildModules(capabilities, systemId)}
      where={system.name}
      subtitle={`${system.name} · ${t('door.portal.role', { role: system.role })}`}
      brandSub={system.name}
      roleLabel={system.role}
      backTo={capabilities && capabilities.systems.length > 1 ? '/portal' : undefined}
      notificationsTo={`/s/${systemId}/notifications?system=${encodeURIComponent(systemId)}`}
      notificationCount={counts?.bySystem[systemId] ?? 0}
    >
      <RouteSuspense>
        <Outlet />
      </RouteSuspense>
    </Shell>
  );
}
