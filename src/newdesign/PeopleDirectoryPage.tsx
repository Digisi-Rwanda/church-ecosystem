import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchPeople, fetchUpcoming } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { loadViews, peopleToCsv, shortDay, storeViews, type SavedView } from './peopleTools';
import { useCanWritePeople } from './usePeopleAccess';
import { useLoad } from './useLoad';
import { EmptyState, ListRow, PageHeader, PrintButton, RowList, StatusChip } from './kit';

const STATUSES = ['ACTIVE', 'INACTIVE', 'VISITOR'] as const;
const tone = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'VISITOR' ? 'info' : 'neutral');

/** The directory: search, filter, keep a view for next time, export the list, and see who has a day coming. */
export function PeopleDirectoryPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const canWrite = useCanWritePeople();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [archived, setArchived] = useState(false);
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const { loading, failed, data, reload } = useLoad(() => fetchPeople({ q: q.trim(), status, archived, systemId }), `dir|${systemId}|${q.trim()}|${status}|${archived}`);
  const upcoming = useLoad(() => fetchUpcoming(30), 'people-upcoming');
  const base = `/s/${systemId}/people`;
  const list = data ?? [];

  const saveView = () => {
    const name = (q.trim() || (status ? t(`door.status.${status}` as 'door.status.ACTIVE') : t('door.people.allStatuses'))).slice(0, 40);
    const next = [{ name, q: q.trim(), status, archived }, ...views.filter((v) => v.name !== name)];
    setViews(next);
    storeViews(next);
  };
  const dropView = (name: string) => {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    storeViews(next);
  };
  const exportCsv = () => {
    const head = [t('door.people.col.code'), t('door.people.col.name'), t('door.people.col.status'), t('door.people.col.phone'), 'email'];
    const blob = new Blob(['﻿', peopleToCsv(list, head)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'people.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="door-block">
      <PageHeader
        id="door-people-title"
        title={t('door.people.tab.directory')}
        purpose={t('door.people.purpose')}
        primary={canWrite ? <Link className="btn" to={`${base}/new`}>{t('door.people.add')}</Link> : undefined}
        actions={
          <>
            <PrintButton />
            <button type="button" className="btn ghost no-print" onClick={exportCsv} disabled={list.length === 0}>
              {t('door.people.export')}
            </button>
            {canWrite && (
              <Link className="btn ghost no-print" to={`${base}/import`}>
                {t('door.people.import')}
              </Link>
            )}
            {canWrite && (
              <Link className="btn ghost no-print" to={`${base}/duplicates`}>
                {t('door.people.duplicates')}
              </Link>
            )}
          </>
        }
      />
      <div className="door-toolbar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('door.people.search')} aria-label={t('door.people.search')} />
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
        <button type="button" className="btn ghost sm" onClick={saveView} disabled={!q.trim() && !status && !archived}>
          {t('door.people.saveView')}
        </button>
      </div>
      {views.length > 0 && (
        <ul className="door-chips" aria-label={t('door.people.views')}>
          {views.map((v) => (
            <li key={v.name}>
              <button type="button" className="door-chip" onClick={() => { setQ(v.q); setStatus(v.status); setArchived(v.archived); }}>
                {v.name}
              </button>
              <button type="button" className="btn ghost sm" aria-label={t('door.people.dropView', { name: v.name })} onClick={() => dropView(v.name)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {(upcoming.data ?? []).length > 0 && (
        <div className="waiting-strip">
          <h3>{t('door.people.upcoming')}</h3>
          <RowList label={t('door.people.upcoming')}>
            {(upcoming.data ?? []).slice(0, 6).map((u) => (
              <ListRow
                key={`${u.personId}-${u.kind}`}
                avatarName={u.name}
                title={u.name}
                detail={`${shortDay(u.day, locale)} · ${t(u.kind === 'BIRTHDAY' ? 'door.people.upcoming.birthday' : 'door.people.upcoming.anniversary', { years: u.years })}`}
                to={`${base}/${u.personId}`}
              />
            ))}
          </RowList>
        </div>
      )}
      <LoadState loading={loading} failed={failed} retry={reload}>
        {list.length === 0 ? (
          <EmptyState variant="no-results" title={t('door.people.none')} detail={t('door.people.noneDetail')} />
        ) : (
          <RowList label={t('door.people.tab.directory')}>
            {list.map((p) => (
              <ListRow
                key={p.id}
                avatarName={p.fullName}
                title={p.fullName}
                detail={[p.memberCode, p.phone].filter(Boolean).join(' · ') || undefined}
                status={<StatusChip tone={tone(p.status)}>{t(`door.status.${p.status}` as const)}</StatusChip>}
                to={`${base}/${p.id}`}
              />
            ))}
          </RowList>
        )}
      </LoadState>
    </div>
  );
}
