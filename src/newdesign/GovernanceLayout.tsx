import { Outlet, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { buildOwnMenu } from './menu';

/** Governance inside a system: Meetings and the Decision register. Shown only to holders of a Governance letter. */
export function GovernanceLayout() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const allowed = buildOwnMenu(capabilities, systemId).some((i) => i.block === 'governance');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} detail={t('door.gov.noAccess')} />;
  return (
    <section className="door-block" aria-labelledby="door-gov-title">
      <div>
        <h2 id="door-gov-title">{t('door.gov.title')}</h2>
        <p className="muted">{t('door.gov.intro')}</p>
      </div>
      <Outlet />
    </section>
  );
}
