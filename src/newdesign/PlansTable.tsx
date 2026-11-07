import { Link } from 'react-router-dom';
import type { BoardItem } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { StatusChip } from './kit';
import { formatRwf } from './money';
import { levelKeyOf } from './planLevels';
import { planStatusKey, planTone } from './plans';
import { whenSummary } from './when';

/** Programs, events or projects as a table: who owns it, when, how much, who submitted it, who verified it, and where it stands. */
export function PlansTable({ items, systemId }: { items: BoardItem[]; systemId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const status = (p: BoardItem) =>
    p.state === 'WAITING' && p.waitingLevel
      ? t('door.state.waitingFor', { who: t(`door.level.${levelKeyOf(p.waitingLevel)}` as 'door.level.UNIT') })
      : p.state === 'APPROVED' ? t(planStatusKey(p.status, p.planType)) : t(`door.state.${p.state}` as 'door.state.DRAFT');
  /** The President who submitted it: the one who approved at the unit step, else whoever drafted it once it has left Draft. */
  const submittedBy = (p: BoardItem) => (p.state === 'DRAFT' ? '—' : p.levels.find((l) => l.levelKey === 'UNIT')?.byName || p.createdByName || '—');
  const verifiedBy = (p: BoardItem) => {
    const step = p.levels.find((l) => l.levelKey === 'CATECHIST');
    return !step ? '—' : step.status === 'APPROVED' ? step.byName || '—' : t('door.plan.tbl.waiting');
  };
  return (
    <div className="door-table-wrap">
      <table className="door-table door-stack" aria-label={t('door.plan.tbl.label')}>
        <thead>
          <tr>
            <th scope="col">{t('door.plan.tbl.title')}</th>
            <th scope="col" className="col-low">{t('door.plan.tbl.about')}</th>
            <th scope="col">{t('door.plan.tbl.unit')}</th>
            <th scope="col" className="col-low">{t('door.plan.type')}</th>
            <th scope="col">{t('door.plan.tbl.date')}</th>
            <th scope="col" className="num">{t('door.plan.tbl.amount')}</th>
            <th scope="col" className="col-mid">{t('door.plan.tbl.submittedBy')}</th>
            <th scope="col" className="col-mid">{t('door.plan.tbl.verifiedBy')}</th>
            <th scope="col" className="num col-low">{t('door.plan.tbl.files')}</th>
            <th scope="col">{t('door.plan.tbl.status')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} data-tone={planTone(p.state, p.status)}>
              <th scope="row"><Link to={`/s/${systemId}/work/plans/${p.id}`}>{p.title}</Link></th>
              <td className="about col-low" data-label={t('door.plan.tbl.about')}>{p.aim ? <span className="about-text" title={p.aim}>{p.aim}</span> : '—'}</td>
              <td data-label={t('door.plan.tbl.unit')}>{p.unitName}</td>
              <td className="col-low" data-label={t('door.plan.type')}>{t(`door.plan.type.${p.planType}` as 'door.plan.type.EVENT')}</td>
              <td data-label={t('door.plan.tbl.date')}>{whenSummary(p, t, locale)}</td>
              <td className="num" data-label={t('door.plan.tbl.amount')}>{p.amount > 0 ? `${formatRwf(p.amount)}${p.perMonth ? ` ${t('door.plan.tbl.perMonth')}` : ''}` : '—'}</td>
              <td className="col-mid" data-label={t('door.plan.tbl.submittedBy')}>{submittedBy(p)}</td>
              <td className="col-mid" data-label={t('door.plan.tbl.verifiedBy')}>{verifiedBy(p)}</td>
              <td className="num col-low" data-label={t('door.plan.tbl.files')}>
                {p.files > 0 ? (
                  <Link className="file-count" to={`/s/${systemId}/work/plans/${p.id}`} state={{ tab: 'files' }} aria-label={t('door.plan.tbl.filesCount', { count: p.files })}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15 6.5" /></svg>
                    {p.files}
                  </Link>
                ) : '—'}
              </td>
              <td data-label={t('door.plan.tbl.status')}><StatusChip tone={planTone(p.state, p.status)}>{status(p)}</StatusChip></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
