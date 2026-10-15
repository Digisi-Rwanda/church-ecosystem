import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchApprovals, type ApprovalItem, type ApprovalKind } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { formatRwf } from './money';
import { useLoad } from './useLoad';
import { StatusChip } from './kit';

const KINDS: ApprovalKind[] = ['ACTIVITY', 'AMENDMENT', 'CONTRIBUTION_LIST', 'DONATION', 'SPENDING'];

/** Everything that waits for a decision, shown on the Work page. Open a row to decide it where it always was decided. Hidden when nothing waits. */
export function ApprovalsList({ systemId }: { systemId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const [who, setWho] = useState<'mine' | 'all'>('mine');
  const [kind, setKind] = useState<ApprovalKind | ''>('');
  const list = useLoad(() => fetchApprovals(systemId), `approvals|${systemId}`);
  const all = list.data?.items ?? [];
  if (all.length === 0) return null;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso));
  const rows = all.filter((i) => (who === 'all' || i.mine) && (!kind || i.kind === kind));
  const row = (i: ApprovalItem) => (
    <tr key={i.key} data-tone={i.mine ? 'warn' : undefined}>
      <th scope="row"><Link to={i.href}>{i.title}</Link></th>
      <td data-label={t('door.approvals.col.kind')}>{t(`door.approvals.kind.${i.kind}` as 'door.approvals.kind.ACTIVITY')}</td>
      <td className="num" data-label={t('door.approvals.col.amount')}>{i.amount === null ? '—' : formatRwf(i.amount)}</td>
      <td data-label={t('door.approvals.col.from')}>{i.from}</td>
      <td data-label={t('door.approvals.col.waitingFor')}>{i.waitingFor}</td>
      <td data-label={t('door.approvals.col.since')}>{day(i.since)}</td>
      <td data-label={t('door.approvals.col.status')}>{i.mine ? <StatusChip tone="warn">{t('door.approvals.mine')}</StatusChip> : <span className="muted">{t('door.approvals.others')}</span>}</td>
    </tr>
  );
  return (
    <section className="panel" aria-labelledby="door-approvals-title">
      <h3 id="door-approvals-title">{t('door.approvals.title')}</h3>
      <p className="muted">{t('door.approvals.purpose')}</p>
      <div className="door-filters">
        <SelectField label={t('door.approvals.who')} name="ap-who" value={who} onChange={(e) => setWho(e.target.value as 'mine' | 'all')}>
          <option value="mine">{t('door.approvals.who.mine', { count: list.data?.counts.mine ?? 0 })}</option>
          <option value="all">{t('door.approvals.who.all', { count: list.data?.counts.all ?? 0 })}</option>
        </SelectField>
        <SelectField label={t('door.approvals.type')} name="ap-kind" value={kind} onChange={(e) => setKind(e.target.value as ApprovalKind | '')}>
          <option value="">{t('door.approvals.type.all')}</option>
          {KINDS.map((k) => <option key={k} value={k}>{t(`door.approvals.kind.${k}` as 'door.approvals.kind.ACTIVITY')}</option>)}
        </SelectField>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{t(who === 'mine' ? 'door.approvals.noneMine' : 'door.approvals.none')}</p>
      ) : (
        <div className="door-table-wrap">
          <table className="door-table door-stack" aria-label={t('door.approvals.title')}>
            <thead>
              <tr>
                <th scope="col">{t('door.approvals.col.what')}</th>
                <th scope="col">{t('door.approvals.col.kind')}</th>
                <th scope="col" className="num">{t('door.approvals.col.amount')}</th>
                <th scope="col">{t('door.approvals.col.from')}</th>
                <th scope="col">{t('door.approvals.col.waitingFor')}</th>
                <th scope="col">{t('door.approvals.col.since')}</th>
                <th scope="col">{t('door.approvals.col.status')}</th>
              </tr>
            </thead>
            <tbody>{rows.map(row)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
