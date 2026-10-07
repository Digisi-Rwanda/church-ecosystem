import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPlanOptions, fetchPlans } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { PlanForm } from './PlanForm';
import { planStatusKey, sortPlans } from './plans';
import { useLoad } from './useLoad';
import { useNavigate } from 'react-router-dom';

/** Full work in one system: plans that are approved, run, closed and reported. */
export function PlansList({ systemId }: { systemId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [view, setView] = useState<'mine' | 'all'>('all');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [creating, setCreating] = useState(false);
  const list = useLoad(() => fetchPlans({ systemId, view, status: show }), `plans|${systemId}|${view}|${show}`);
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const canCreate = !!options.data && options.data.units.some((u) => u.systemId === systemId);
  const items = sortPlans(list.data ?? []);
  return (
    <>
      <div className="door-filters">
        <SelectField label={t('door.work.view')} name="pl-view" value={view} onChange={(e) => setView(e.target.value as 'mine' | 'all')}>
          <option value="all">{t('door.work.view.all')}</option>
          <option value="mine">{t('door.plan.view.mine')}</option>
        </SelectField>
        <SelectField label={t('door.work.show')} name="pl-show" value={show} onChange={(e) => setShow(e.target.value as 'open' | 'all')}>
          <option value="open">{t('door.work.show.open')}</option>
          <option value="all">{t('door.work.show.all')}</option>
        </SelectField>
        {canCreate && !creating && (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            {t('door.plan.new')}
          </button>
        )}
      </div>
      {creating && options.data && (
        <PlanForm options={options.data} systemId={systemId} onDone={(p) => navigate(`/s/${systemId}/work/plans/${p.id}`)} onCancel={() => setCreating(false)} />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {items.length === 0 ? (
          <EmptyState title={t('door.plan.none')} detail={t('door.plan.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {items.map((p) => (
              <li key={p.id} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong>
                      <Link to={`/s/${systemId}/work/plans/${p.id}`}>{p.title}</Link>
                    </strong>
                    <span className={`door-chip${p.status === 'PENDING_APPROVAL' || p.status === 'CLOSING' ? ' warn' : ''}`}>{t(planStatusKey(p.status))}</span>
                  </div>
                  <p className="muted">
                    {p.leaderName} · {p.unitName}
                    {p.waitingLevel ? ` · ${t('door.plan.waiting', { level: p.waitingLevel })}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </>
  );
}
