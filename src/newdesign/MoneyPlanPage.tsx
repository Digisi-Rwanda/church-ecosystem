import { Link, useParams } from 'react-router-dom';
import { useT } from '../i18n/I18nContext';
import { ActivitiesView } from './ActivitiesPage';
import { PageHeader } from './kit';

/** The action plan: every activity of the unit, with what it costs. New ones are made in the three-step flow. */
export function MoneyPlanPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  return (
    <section className="door-block" aria-labelledby="door-mplan-title">
      <div>
        <PageHeader
          id="door-mplan-title"
          title={t('door.money.plan')}
          purpose={t('door.purpose.moneyPlan')}
          primary={<Link className="btn" to={`/s/${systemId}/money/plan/new/event`}>{t('door.ac.new')}</Link>}
        />
        <p className="muted">{t('door.money.plan.intro')}</p>
      </div>
      <ActivitiesView systemId={systemId} />
    </section>
  );
}
