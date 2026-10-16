import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchParentOptions, setParent, type PlanDetail } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { planStatusKey } from './plans';
import { useLoad } from './useLoad';
import { StatusChip } from './kit';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;

/** Where this plan belongs, if anywhere, and what belongs to it. Linking is always optional. */
export function PlanLinks({ p, systemId, run }: { p: PlanDetail; systemId: string; run: Run }) {
  const t = useT();
  const [pick, setPick] = useState('');
  const options = useLoad(() => (p.canLink ? fetchParentOptions(p.id) : Promise.resolve([])), `plan-parents|${p.id}|${p.canLink}|${p.parent?.id ?? ''}`);
  const to = (id: string) => `/s/${systemId}/work/plans/${id}`;
  if (!p.parent && p.children.length === 0 && !p.canLink) return null;
  return (
    <div className="panel">
      <h3>{t('door.plan.links.title')}</h3>
      {p.planType !== 'PROGRAM' && (
        <p>
          {p.parent ? (
            <>
              {t('door.plan.links.under')}: <Link to={to(p.parent.id)}>{p.parent.title}</Link> <span className="muted">({t(`door.plan.type.${p.parent.planType}` as const)})</span>
            </>
          ) : (
            <span className="muted">{t('door.plan.links.alone')}</span>
          )}
        </p>
      )}
      {p.canLink && (
        <div className="door-row">
          <SelectField label={t('door.plan.links.pick')} name="p-parent" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">—</option>
            {(options.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {t(`door.plan.type.${o.planType}` as const)}
              </option>
            ))}
          </SelectField>
          <button type="button" className="btn secondary sm" disabled={!pick} onClick={() => void run(() => setParent(p.id, pick), () => setPick(''))}>
            {t('door.plan.links.go')}
          </button>
          {p.parent && (
            <button type="button" className="btn ghost sm" onClick={() => void run(() => setParent(p.id, null))}>
              {t('door.plan.links.remove')}
            </button>
          )}
        </div>
      )}
      {p.children.length > 0 && (
        <>
          <h4>{t('door.plan.links.below')}</h4>
          <ul className="door-list">
            {p.children.map((c) => (
              <li key={c.id}>
                <Link to={to(c.id)}>{c.title}</Link> <span className="muted">({t(`door.plan.type.${c.planType}` as const)})</span>{' '}
                <StatusChip>{t(planStatusKey(c.status, c.planType))}</StatusChip>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
