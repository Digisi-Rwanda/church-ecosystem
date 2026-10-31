import type { ContributionListView } from '../api/frontDoorApi';
import { useState } from 'react';
import { useT } from '../i18n/I18nContext';
import { SearchBox, matchesText } from './kit';
import { formatRwf } from './money';
import { listStatusKey } from './moneyBlock';

/** One row per person per list: full name, code, type, month, amount, approval date, status. Combined team lists are left out so nobody counts twice. */
export function ContributionsTable({ lists }: { lists: ContributionListView[] }) {
  const t = useT();
  const [text, setText] = useState('');
  const rows = lists
    .filter((l) => l.status !== 'COMBINED')
    .flatMap((l) => l.lines.map((x) => ({ key: `${l.id}-${x.id}`, list: l, line: x })))
    .filter((r) => matchesText(text, r.line.name, r.line.memberCode, r.list.typeName, r.list.month, r.list.teamName))
    .sort((a, b) => a.line.name.localeCompare(b.line.name));
  const sum = rows.reduce((s, r) => s + r.line.amount, 0);
  return (
    <section className="panel" aria-label={t('door.money.table.title')}>
      <h3>{t('door.money.table.title')}</h3>
      <SearchBox value={text} onChange={setText} label={t('door.search.contributions')} clearLabel={t('door.search.clear')} />
      {rows.length === 0 ? (
        <p className="muted">{t(text ? 'door.search.noMatch' : 'door.money.table.none')}</p>
      ) : (
        <div className="door-table-wrap">
          <table className="door-table door-stack">
            <thead>
              <tr>
                <th scope="col">{t('door.money.table.fullName')}</th>
                <th scope="col">{t('door.money.lines.code')}</th>
                <th scope="col">{t('door.money.table.type')}</th>
                <th scope="col">{t('door.money.table.month')}</th>
                <th scope="col">{t('door.money.lines.amount')}</th>
                <th scope="col">{t('door.money.table.date')}</th>
                <th scope="col">{t('door.money.table.status')}</th>
                <th scope="col">{t('door.money.table.list')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, list, line }) => (
                <tr key={key}>
                  <th scope="row">{line.name}</th>
                  <td data-label={t('door.money.lines.code')}>{line.memberCode ?? '—'}</td>
                  <td data-label={t('door.money.table.type')}>{list.typeName}</td>
                  <td data-label={t('door.money.table.month')}>{list.month}</td>
                  <td data-label={t('door.money.lines.amount')}>{formatRwf(line.amount)}</td>
                  <td data-label={t('door.money.table.date')}>{list.decidedOn ?? '—'}</td>
                  <td data-label={t('door.money.table.status')}>{t(listStatusKey(list.status))}</td>
                  <td data-label={t('door.money.table.list')}>{list.level === 'UNIT' ? t('door.money.list.unit') : list.teamName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p>
          <strong>{t('door.money.table.total')}</strong> {formatRwf(sum)}
        </p>
      )}
    </section>
  );
}
