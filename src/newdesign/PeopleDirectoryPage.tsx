import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchPeople } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill } from '../components/ui/StatusPill';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useCanWritePeople } from './usePeopleAccess';
import { useLoad } from './useLoad';

const STATUSES = ['ACTIVE', 'INACTIVE', 'VISITOR'] as const;

export function PeopleDirectoryPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const canWrite = useCanWritePeople();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState(false);
  const { loading, failed, data, reload } = useLoad(
    () => fetchPeople({ q: q.trim(), status, archived }),
    `dir|${q.trim()}|${status}|${archived}`,
  );
  const base = `/s/${systemId}/people`;

  return (
    <div className="door-block">
      <div className="door-toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('door.people.search')}
          aria-label={t('door.people.search')}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('door.people.statusFilter')}>
          <option value="">{t('door.people.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`door.status.${s}` as const)}
            </option>
          ))}
        </select>
        {canWrite && (
          <label className="control-check">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            <span>{t('door.people.showArchived')}</span>
          </label>
        )}
        {canWrite && (
          <Link className="btn sm" to={`${base}/new`}>
            {t('door.people.add')}
          </Link>
        )}
      </div>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && data.length === 0 ? (
          <EmptyState variant="no-results" title={t('door.people.none')} detail={t('door.people.noneDetail')} />
        ) : (
          <div className="panel door-table-wrap">
            <table className="table door-stack">
              <thead>
                <tr>
                  <th>{t('door.people.col.code')}</th>
                  <th>{t('door.people.col.name')}</th>
                  <th>{t('door.people.col.status')}</th>
                  <th>{t('door.people.col.phone')}</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td data-label={t('door.people.col.code')}>{p.memberCode ?? '—'}</td>
                    <td data-label={t('door.people.col.name')}>
                      <Link to={`${base}/${p.id}`}>{p.fullName}</Link>
                    </td>
                    <td data-label={t('door.people.col.status')}>
                      <StatusPill status={p.status}>{t(`door.status.${p.status}` as const)}</StatusPill>
                    </td>
                    <td data-label={t('door.people.col.phone')}>{p.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadState>
    </div>
  );
}
