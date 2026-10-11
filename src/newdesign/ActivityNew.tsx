import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchPlanOptions, type PlanType } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { PageHeader } from './kit';
import { PlanForm } from './PlanForm';
import { useLoad } from './useLoad';

const KINDS: Record<string, PlanType> = { event: 'EVENT', project: 'PROJECT', program: 'PROGRAM' };

/** A new activity on one page. It is saved as a draft; sending it for approval is a button on the activity itself. */
export function ActivityNew() {
  const t = useT();
  const navigate = useNavigate();
  const { systemId = '' } = useParams();
  const [query] = useSearchParams();
  const planType = KINDS[(query.get('kind') ?? '').toLowerCase()] ?? 'EVENT';
  const options = useLoad(fetchPlanOptions, 'plan-options');
  if (options.failed) return <EmptyState variant="error" title={t('door.work.err.gone')} />;
  return (
    <section className="door-block" aria-labelledby="door-actnew-title">
      <PageHeader id="door-actnew-title" title={t('door.act.new')} back={<Link to={`/s/${systemId}/money/plan`}>← {t('door.money.plan')}</Link>} purpose={t('door.act.new.purpose')} />
      <LoadState loading={options.loading || !options.data} failed={false} retry={options.reload}>
        {options.data && (
          <PlanForm
            options={options.data}
            systemId={systemId}
            planType={planType}
            onDone={(plan) => navigate(`/s/${systemId}/work/plans/${plan.id}`)}
            onCancel={() => navigate(`/s/${systemId}/money/plan`)}
          />
        )}
      </LoadState>
    </section>
  );
}
