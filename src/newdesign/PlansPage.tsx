import type { PlanType } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';
import { PlansList } from './PlansList';
import { useParams } from 'react-router-dom';

/** Programs, Events or Projects of a system: the same plan engine, one page for each type. */
export function PlansPage({ planType }: { planType: PlanType }) {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  if (lettersFor(capabilities, systemId, 'work').length === 0) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  return (
    <section className="door-block" aria-labelledby="door-plans-title">
      <h2 id="door-plans-title">{t(`door.plans.${planType}` as 'door.plans.PROGRAM')}</h2>
      <PlansList systemId={systemId} planType={planType} />
    </section>
  );
}
