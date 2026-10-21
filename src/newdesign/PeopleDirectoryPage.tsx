import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchPeoplePage, fetchPeopleFilterOptions, fetchUpcoming, searchPeople, type SearchedPerson } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { PeopleFilterPanel } from './PeopleFilterPanel';
import { cleanFilters, isComplete, toCriteria, type ActiveFilter } from './peopleFilters';
import { loadViews, pageRange, shortDay, storeViews, type SavedView } from './peopleTools';
import { Pager } from './Pager';
import { useCanWritePeople } from './usePeopleAccess';
import { useLoad } from './useLoad';
import { EmptyState, ListRow, PageHeader, PrintButton, RowList, StatusChip } from './kit';

const PAGE_SIZE = 50;
const STATUSES = ['ACTIVE', 'INACTIVE', 'VISITOR'] as const;
const tone = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'VISITOR' ? 'info' : 'neutral');

/** How many people there are, and which of them this page shows. Announced politely when it changes. */
function PeopleCount({ offset, shown, total, filtered }: { offset: number; shown: number; total: number; filtered: boolean }) {
  const t = useT();
  const r = pageRange(offset, shown, total);
  return (
    <p className="people-count" role="status" aria-live="polite">
      {total <= shown ? t(filtered ? 'door.people.count.matches' : 'door.people.count.all', { total }) : t(filtered ? 'door.people.count.rangeMatches' : 'door.people.count.range', { from: r.from, to: r.to, total })}
    </p>
  );
}

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
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const offset = (page - 1) * PAGE_SIZE;
  const options = useLoad(() => fetchPeopleFilterOptions(systemId), `people-fopts|${systemId}`);
  const active = filters.filter(isComplete);
  const criteria = { ...toCriteria(active), ...(q.trim() ? { q: q.trim() } : {}), ...(status && !active.some((f) => f.kind === 'status') ? { status: [status as 'ACTIVE'] } : {}) };
  const { loading, failed, data, reload } = useLoad(
    async (): Promise<{ list: SearchedPerson[]; total: number }> => {
      if (active.length === 0) {
        const r = await fetchPeoplePage({ q: q.trim(), status, archived, systemId, limit: PAGE_SIZE, offset });
        return { list: r.people, total: r.total };
      }
      const r = await searchPeople({ criteria, systemId, archived, limit: PAGE_SIZE, offset });
      return { list: r.people, total: r.total };
    },
    `dir|${systemId}|${q.trim()}|${status}|${archived}|${JSON.stringify(active)}|${page}`,
  );
  const upcoming = useLoad(() => fetchUpcoming(30), 'people-upcoming');
  const base = `/s/${systemId}/people`;
  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  const saveView = () => {
    const name = (q.trim() || (active.length ? active.map((f) => t(`door.people.fk.${f.kind}` as 'door.people.fk.unit')).join(' + ').slice(0, 40) : '') || (status ? t(`door.status.${status}` as 'door.status.ACTIVE') : t('door.people.allStatuses'))).slice(0, 40);
    const next = [{ name, q: q.trim(), status, archived, filters: active }, ...views.filter((v) => v.name !== name)];
    setViews(next);
    storeViews(next);
  };
  const dropView = (name: string) => {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    storeViews(next);
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
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('door.people.search')} aria-label={t('door.people.search')} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('door.people.statusFilter')}>
          <option value="">{t('door.people.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`door.status.${s}` as const)}
            </option>
          ))}
        </select>
        {canWrite && (
          <label className="control-check">
            <input type="checkbox" checked={archived} onChange={(e) => { setArchived(e.target.checked); setPage(1); }} />
            <span>{t('door.people.showArchived')}</span>
          </label>
        )}
        {options.data && options.data.criteria.some((k) => k !== 'q' && k !== 'status') && (
          <button type="button" className="btn ghost sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            {active.length > 0 ? t('door.people.filters.withCount', { count: active.length }) : t('door.people.filters.title')}
          </button>
        )}
        <button type="button" className="btn ghost sm" onClick={saveView} disabled={!q.trim() && !status && !archived && active.length === 0}>
          {t('door.people.saveView')}
        </button>
      </div>
      {options.data && (open || active.length > 0) && <PeopleFilterPanel options={options.data} filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} />}
      {views.length > 0 && (
        <ul className="door-chips" aria-label={t('door.people.views')}>
          {views.map((v) => (
            <li key={v.name}>
              <button type="button" className="door-chip" onClick={() => { setQ(v.q); setStatus(v.status); setArchived(v.archived); setFilters(cleanFilters(v.filters)); setOpen(true); setPage(1); }}>
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
          <>
          <PeopleCount offset={offset} shown={list.length} total={total} filtered={active.length > 0 || !!q.trim() || !!status} />
          <RowList label={t('door.people.tab.directory')}>
            {list.map((p) => (
              <ListRow
                key={p.id}
                avatarName={p.fullName}
                title={p.fullName}
                detail={[p.memberCode, p.phone, p.marital === 'WIDOWED' ? t('door.people.marital.WIDOWED') : null, typeof p.children === 'number' && p.children > 0 ? t('door.people.children', { count: p.children }) : null].filter(Boolean).join(' · ') || undefined}
                status={<StatusChip tone={tone(p.status)}>{t(`door.status.${p.status}` as const)}</StatusChip>}
                to={`${base}/${p.id}`}
              />
            ))}
          </RowList>
          <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPage={(n) => { setPage(n); window.scrollTo({ top: 0 }); }} />
          </>
        )}
      </LoadState>
    </div>
  );
}
