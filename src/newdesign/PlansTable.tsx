import { Link } from 'react-router-dom';
import type { BoardItem } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { StatusChip } from './kit';
import { formatRwf } from './money';
import { levelKeyOf } from './planLevels';
import { planStatusKey, stateTone } from './plans';
import { whenSummary } from './when';

/** Programs, events or projects as a table: who owns it, when, how much, who submitted it, who verified it, and where it stands. */
export function PlansTable({ items }: { items: BoardItem[] }) {
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
            <th scope="col">{t('door.plan.tbl.unit')}</th>
            <th scope="col">{t('door.plan.type')}</th>
            <th scope="col">{t('door.plan.tbl.date')}</th>
            <th scope="col">{t('door.plan.tbl.amount')}</th>
            <th scope="col">{t('door.plan.tbl.submittedBy')}</th>
            <th scope="col">{t('door.plan.tbl.verifiedBy')}</th>
            <th scope="col">{t('door.plan.tbl.status')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <th scope="row"><Link to={`/s/${p.systemId}/work/plans/${p.id}`}>{p.title}</Link></th>
              <td data-label={t('door.plan.tbl.unit')}>{p.unitName}</td>
              <td data-label={t('door.plan.type')}>{t(`door.plan.type.${p.planType}` as 'door.plan.type.EVENT')}</td>
              <td data-label={t('door.plan.tbl.date')}>{whenSummary(p, t, locale)}</td>
              <td data-label={t('door.plan.tbl.amount')}>{p.amount > 0 ? `${formatRwf(p.amount)}${p.perMonth ? ` ${t('door.plan.tbl.perMonth')}` : ''}` : '—'}</td>
              <td data-label={t('door.plan.tbl.submittedBy')}>{submittedBy(p)}</td>
              <td data-label={t('door.plan.tbl.verifiedBy')}>{verifiedBy(p)}</td>
              <td data-label={t('door.plan.tbl.status')}><StatusChip tone={stateTone(p.state)}>{status(p)}</StatusChip></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
