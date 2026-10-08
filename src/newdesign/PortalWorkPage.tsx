import { fetchPlans, fetchWork } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { planStatusKey } from './plans';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';
import { SystemLink } from './SystemLink';

/** The Portal's Work: everything assigned to me or planned with me, from every system, each linking into its system. */
export function PortalWorkPage({ part = 'tasks' }: { part?: 'tasks' | 'plans' }) {
  const t = useT();
  const { portal } = useFrontDoor();
  const tasks = useLoad(() => fetchWork({ view: 'mine', status: 'open' }), 'portal-work');
  const plans = useLoad(() => fetchPlans({ view: 'mine', status: 'open' }), 'portal-plans');
  const name = (id: string) => portal.find((s) => s.id === id)?.shortName ?? id;
  return (
    <section className="door-block" aria-labelledby="door-pwork-title">
      <div>
        <PageHeader id="door-pwork-title" title={t('door.portal.work.title')} />
        <p className="muted">{t('door.portal.work.subtitle')}</p>
      </div>
      {part === 'tasks' && (<>
      <h3>{t('door.work.tasks')}</h3>
      <LoadState loading={tasks.loading} failed={tasks.failed} retry={tasks.reload}>
        {(tasks.data ?? []).length === 0 ? (
          <EmptyState title={t('door.portal.work.none')} />
        ) : (
          <ul className="door-notices">
            {(tasks.data ?? []).map((w) => (
              <li key={w.id} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong>
                      <SystemLink to={`/s/${w.systemId}/work`}>{w.title}</SystemLink>
                    </strong>
                    {w.overdue && <span className="door-chip warn">{t('door.work.overdue')}</span>}
                  </div>
                  <p className="muted">{name(w.systemId)}{w.dueDate ? ` · ${w.dueDate.slice(0, 10)}` : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
      </>)}
      {part === 'plans' && (<>
      <h3>{t('door.portal.work.plans')}</h3>
      <LoadState loading={plans.loading} failed={plans.failed} retry={plans.reload}>
        {(plans.data ?? []).length === 0 ? (
          <EmptyState title={t('door.portal.work.none')} />
        ) : (
          <ul className="door-notices">
            {(plans.data ?? []).map((p) => (
              <li key={p.id} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong>
                      <SystemLink to={`/s/${p.systemId}/work/plans/${p.id}`}>{p.title}</SystemLink>
                    </strong>
                    <span className="door-chip">{t(planStatusKey(p.status))}</span>
                  </div>
                  <p className="muted">{name(p.systemId)} · {t(`door.plan.type.${p.planType ?? 'PROJECT'}` as 'door.plan.type.PROGRAM')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
      </>)}
    </section>
  );
}
