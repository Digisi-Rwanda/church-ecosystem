import type { PlanType } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';
import { PlansList } from './PlansList';
import { useParams } from 'react-router-dom';
import { PageHeader } from './kit';

/** Programs, Events or Projects of a system: the same plan engine, one page for each type. */
export function PlansPage({ planType }: { planType: PlanType }) {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  if (lettersFor(capabilities, systemId, 'work').length === 0) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  return (
    <section className="door-block" aria-labelledby="door-plans-title">
      <PageHeader id="door-plans-title" title={t(`door.plans.${planType}` as 'door.plans.PROGRAM')} purpose={t(`door.purpose.${planType}` as 'door.purpose.PROGRAM')} />
      <PlansList systemId={systemId} planType={planType} />
    </section>
  );
}
