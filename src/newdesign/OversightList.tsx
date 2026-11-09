import { useState } from 'react';
import { fetchOversight, type OversightItem } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { ApprovalReview } from './ApprovalReview';
import { StatusChip } from './kit';
import { categoryKey, formatRwf } from './money';
import { useLoad } from './useLoad';

const tone = (s: string) => (s === 'SUSPENDED' ? 'danger' : s === 'PENDING_APPROVAL' ? 'warn' : s === 'RUNNING' ? 'success' : 'neutral');

/** The Church Leader's view of every live activity: date, activity, description, amount, category, attachments, Catechist status and status. Shown only to the Church Leader. */
export function OversightList({ systemId }: { systemId?: string }) {
  const t = useT();
  const { locale } = useI18n();
  const list = useLoad(() => fetchOversight(systemId), `oversight|${systemId ?? ''}`);
  const [open, setOpen] = useState<OversightItem | null>(null);
  if (!list.data?.enabled || list.data.items.length === 0) return null;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '—');
  return (
    <section className="panel" aria-labelledby="door-oversight-title">
      <h3 id="door-oversight-title">{t('door.ov.title')}</h3>
      <p className="muted">{t('door.ov.purpose')}</p>
      <div className="door-table-wrap">
        <table className="door-table door-stack" aria-label={t('door.ov.title')}>
          <thead>
            <tr>
              <th scope="col">{t('door.ov.col.date')}</th>
              <th scope="col">{t('door.ov.col.activity')}</th>
              <th scope="col">{t('door.ov.col.description')}</th>
              <th scope="col" className="num">{t('door.approvals.col.amount')}</th>
              <th scope="col">{t('door.ac.category')}</th>
              <th scope="col">{t('door.ov.col.files')}</th>
              <th scope="col">{t('door.ov.col.catechist')}</th>
              <th scope="col">{t('door.approvals.col.status')}</th>
              <th scope="col"><span className="sr-only">{t('door.funds.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((i) => (
              <tr key={i.id} data-tone={i.canDecide ? 'warn' : undefined}>
                <td data-label={t('door.ov.col.date')}>{day(i.date)}</td>
                <th scope="row">{i.title}</th>
                <td data-label={t('door.ov.col.description')}>{i.description || '—'}</td>
                <td className="num" data-label={t('door.approvals.col.amount')}>{formatRwf(i.amount)}</td>
                <td data-label={t('door.ac.category')}>{i.categories.length ? i.categories.map((c) => t(categoryKey(c) as 'door.money.cat.OTHER')).join(', ') : '—'}</td>
                <td data-label={t('door.ov.col.files')}>{i.attachments}</td>
                <td data-label={t('door.ov.col.catechist')}>{t(`door.ov.catechist.${i.catechist}` as 'door.ov.catechist.APPROVED')}</td>
                <td data-label={t('door.approvals.col.status')}>
                  <StatusChip tone={tone(i.status)}>{i.status === 'PENDING_APPROVAL' && i.waitingFor ? t('door.state.waitingFor', { who: i.waitingFor }) : t(`door.ov.status.${i.status}` as 'door.ov.status.RUNNING')}</StatusChip>
                </td>
                <td data-label={t('door.funds.actions')}><button type="button" className="btn secondary sm" onClick={() => setOpen(i)}>{t(i.canDecide ? 'door.rv.review' : 'door.ov.open')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <ApprovalReview item={open} canSuspendNow={open.canSuspend} onClose={() => setOpen(null)} onDone={() => { setOpen(null); list.reload(); }} />}
    </section>
  );
}
