import { Outlet } from 'react-router-dom';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { buildPortalModules } from './menu';
import { Shell } from './Shell';
import { useNoticeSummary } from './useNoticeSummary';

/**
 * The Portal: the screen before the systems. A sidebar of Home (the systems), Notifications and
 * Announcements from every system, and the shared blocks the person holds somewhere.
 */
export function PortalLayout() {
  const t = useT();
  const { capabilities } = useFrontDoor();
  const { counts } = useNoticeSummary();
  return (
    <Shell
      modules={buildPortalModules(capabilities)}
      where={t('door.frame.portal')}
      subtitle={t('door.frame.portal')}
      notificationsTo="/portal/notifications"
      notificationCount={counts?.unread ?? 0}
    >
      <Outlet />
    </Shell>
  );
}
