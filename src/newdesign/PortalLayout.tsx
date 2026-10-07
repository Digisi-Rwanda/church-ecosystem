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
  const { capabilities, portal } = useFrontDoor();
  const roleLabel = portal.find((s) => s.role !== 'Member')?.role ?? portal[0]?.role;
  const { counts } = useNoticeSummary();
  return (
    <Shell
      modules={buildPortalModules(capabilities)}
      where={t('door.frame.portal')}
      subtitle={t('door.frame.portal')}
      brandSub={t('door.frame.portal')}
      roleLabel={roleLabel}
      notificationsTo="/portal/notifications"
      notificationCount={counts?.unread ?? 0}
    >
      <Outlet />
    </Shell>
  );
}
