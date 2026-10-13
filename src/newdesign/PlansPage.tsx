import { useParams } from 'react-router-dom';
import { fetchPlanOptions, type PlanType } from '../api/frontDoorApi';
import { Link } from 'react-router-dom';
import { useLoad } from './useLoad';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';
import { PlansList } from './PlansList';
import { PageHeader } from './kit';

/** Programs, Events or Projects of a system: the same plan engine, one page for each type. */
export function PlansPage({ planType }: { planType: PlanType }) {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const canCreate = !!options.data?.units.some((u) => u.systemId === systemId);
  if (lettersFor(capabilities, systemId, 'work').length === 0) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  return (
    <section className="door-block" aria-labelledby="door-plans-title">
      <PageHeader
        id="door-plans-title"
        title={t(`door.plans.${planType}` as 'door.plans.PROGRAM')}
        purpose={t(`door.purpose.${planType}` as 'door.purpose.PROGRAM')}
        primary={canCreate ? <Link className="btn" to={`/s/${systemId}/work/plans/new?kind=${planType.toLowerCase()}`}>{t(`door.plan.new.${planType}` as 'door.plan.new.EVENT')}</Link> : undefined}
      />
      <PlansList systemId={systemId} planType={planType} />
    </section>
  );
}
