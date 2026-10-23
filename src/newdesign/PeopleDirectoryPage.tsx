import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchPeopleFilterSchema, fetchUpcoming, searchPeopleFiltered, type FilterSchema } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { FilterBuilder } from './FilterBuilder';
import { FilterChips } from './FilterChips';
import { useFilterLabels } from './filterLabels';
import {
  asSort, buildSearchBody, clearConditions, conditionCount, fieldOf, hasFilters, pageSizes, quickValue, removeCondition, removeFromGroup, removeGroup, requestKey,
  withArchived, withConditions, withPage, withQuery, withQuick, withSize, withSort, type FilterState,
} from './filterModel';
import { parseFilterState, serializeFilterState } from './filterUrl';
import { LoadState } from './LoadState';
import { Pager } from './Pager';
import { loadPeopleViews, storePeopleViews, type PeopleView } from './peopleViews';
import { pageRange, shortDay } from './peopleTools';
import { useCanWritePeople } from './usePeopleAccess';
import { useLoad } from './useLoad';
import { EmptyState, ListRow, PageHeader, PrintButton, RowList, StatusChip } from './kit';

const tone = (s: string) => (s === 'ACTIVE' ? 'success' : s === 'VISITOR' ? 'info' : 'neutral');
const DEBOUNCE_MS = 350;

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

/** The directory: search, filter, sort, keep a view for next time, and see who has a day coming. */
export function PeopleDirectoryPage() {
  const { systemId = '' } = useParams();
  const schema = useLoad(() => fetchPeopleFilterSchema(systemId), `people-schema|${systemId}`);
  // What may be filtered on depends on who is asking, so nothing is drawn until the server has said.
  return (
    <LoadState loading={schema.loading} failed={schema.failed} retry={schema.reload}>
      {schema.data && <Directory schema={schema.data} systemId={systemId} />}
    </LoadState>
  );
}

function Directory({ schema, systemId }: { schema: FilterSchema; systemId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const canWrite = useCanWritePeople();
  const labels = useFilterLabels(schema);
  const [sp, setSp] = useSearchParams();
  const defaults = useMemo(() => ({ size: schema.limits.defaultPageSize }), [schema]);
  const parsed = useMemo(() => parseFilterState(sp, schema), [sp, schema]);
  const state = parsed.state;
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(0);
  const [views, setViews] = useState<PeopleView[]>(loadPeopleViews);
  const base = `/s/${systemId}/people`;

  /** Every change goes through the address: the page below is only ever a picture of it. */
  const go = (next: FilterState, replace = false) => setSp(serializeFilterState(next, defaults), { replace });

  // An address with parts this viewer cannot use (an old link, a field since taken away) is tidied once, and the person is told.
  useEffect(() => {
    if (parsed.dropped === 0) return;
    setNotice(parsed.dropped);
    setSp(serializeFilterState(parsed.state, defaults), { replace: true });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.dropped, sp]);

  // The search box types freely; the address follows a moment after the last key, replacing rather than adding history.
  const [text, setText] = useState(state.q);
  useEffect(() => { setText((cur) => (cur.trim() === state.q ? cur : state.q)); }, [state.q]);
  useEffect(() => {
    const typed = text.trim();
    if (typed === state.q) return;
    const id = window.setTimeout(() => {
      setSp((prev) => serializeFilterState(withQuery(parseFilterState(prev, schema).state, typed.slice(0, schema.limits.stringLength)), defaults), { replace: true });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const asked: FilterState = canWrite ? state : { ...state, archived: false };
  const body = buildSearchBody(asked, systemId);
  const results = useLoad(() => searchPeopleFiltered(body), `people-search|${requestKey(body)}`);
  const upcoming = useLoad(() => fetchUpcoming(30), 'people-upcoming');
  const list = results.data?.people ?? [];
  const total = results.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / state.size));

  // A link to a page that no longer exists (the list has shrunk) goes to the last one that does.
  useEffect(() => {
    if (results.data && results.data.total > 0 && results.data.people.length === 0 && state.page > pages) go(withPage(state, pages), true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [results.data, pages]);

  const filtered = hasFilters(state);
  const statusField = fieldOf(schema, 'status');
  const sort = state.sort ?? schema.defaultSort;
  const kept = (s: FilterState) => serializeFilterState({ ...s, page: 1 }, defaults).toString();
  const viewName = () => (state.q || (state.all[0] ? labels.sentence(state.all[0]) : state.groups[0]?.[0] ? labels.sentence(state.groups[0][0]) : t('door.people.allStatuses'))).slice(0, 40);
  const saveView = () => {
    const name = viewName();
    const next = [{ name, query: kept(state) }, ...views.filter((v) => v.name !== name)].slice(0, 12);
    setViews(next);
    storePeopleViews(next);
  };
  const dropView = (name: string) => {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    storePeopleViews(next);
  };
  const openView = (v: PeopleView) => {
    const p = parseFilterState(new URLSearchParams(v.query), schema);
    if (p.dropped) setNotice(p.dropped);
    go({ ...p.state, page: 1 });
  };

  const emptyAction = filtered ? <button type="button" className="btn secondary" onClick={() => go({ ...clearConditions(withQuery(state, '')), archived: false })}>{t('door.pf.clearEverything')}</button> : undefined;

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
            {canWrite && <Link className="btn ghost no-print" to={`${base}/import`}>{t('door.people.import')}</Link>}
            {canWrite && <Link className="btn ghost no-print" to={`${base}/duplicates`}>{t('door.people.duplicates')}</Link>}
          </>
        }
      />
      <div className="door-toolbar pf-toolbar">
        <input type="search" value={text} maxLength={schema.limits.stringLength} onChange={(e) => setText(e.target.value)} placeholder={t('door.people.search')} aria-label={t('door.people.search')} />
        {statusField?.choices && (
          <select value={quickValue(state, 'status')} onChange={(e) => go(withQuick(state, 'status', e.target.value))} aria-label={t('door.people.statusFilter')}>
            <option value="">{t('door.people.allStatuses')}</option>
            {statusField.choices.map((s) => (<option key={s} value={s}>{labels.choice(s)}</option>))}
          </select>
        )}
        {canWrite && (
          <label className="control-check">
            <input type="checkbox" checked={state.archived} onChange={(e) => go(withArchived(state, e.target.checked))} />
            <span>{t('door.people.showArchived')}</span>
          </label>
        )}
        <button type="button" className="btn secondary sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {conditionCount(state) > 0 ? t('door.people.filters.withCount', { count: conditionCount(state) }) : t('door.people.filters.title')}
        </button>
        <button type="button" className="btn ghost sm" onClick={saveView} disabled={!filtered && !state.sort}>{t('door.people.saveView')}</button>
      </div>

      {notice > 0 && (
        <p className="pf-notice" role="status">
          <span>{t('door.pf.notice', { count: notice })}</span>
          <button type="button" className="btn ghost sm" onClick={() => setNotice(0)}>{t('door.pf.dismiss')}</button>
        </p>
      )}

      {open && (
        <FilterBuilder
          key={requestKey([state.all, state.groups])}
          schema={schema} labels={labels} all={state.all} groups={state.groups}
          onApply={(all, groups) => { go(withConditions(state, all, groups)); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}

      <FilterChips
        all={state.all} groups={state.groups} labels={labels}
        onRemove={(i) => go(removeCondition(state, i))}
        onRemoveFromGroup={(g, i) => go(removeFromGroup(state, g, i))}
        onRemoveGroup={(g) => go(removeGroup(state, g))}
        onClear={() => go(clearConditions(state))}
        onEdit={() => setOpen(true)}
      />

      {views.length > 0 && (
        <ul className="door-chips" aria-label={t('door.people.views')}>
          {views.map((v) => (
            <li key={v.name}>
              <button type="button" className="door-chip" onClick={() => openView(v)}>{v.name}</button>
              <button type="button" className="btn ghost sm" aria-label={t('door.people.dropView', { name: v.name })} onClick={() => dropView(v.name)}>×</button>
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

      {results.failed === 'invalid' || results.failed === 'forbidden' ? (
        <EmptyState
          variant="error"
          title={t(results.failed === 'invalid' ? 'door.pf.err.rejected.title' : 'door.pf.err.refused.title')}
          detail={t(results.failed === 'invalid' ? 'door.pf.err.rejected.detail' : 'door.pf.err.refused.detail')}
          action={<button type="button" className="btn" onClick={() => go({ ...clearConditions(withQuery(state, '')), archived: false })}>{t('door.pf.clearEverything')}</button>}
        />
      ) : (
        <LoadState loading={results.loading} failed={results.failed} retry={results.reload}>
          {list.length === 0 ? (
            <EmptyState variant="no-results" title={t('door.people.none')} detail={t(filtered ? 'door.pf.noneFiltered' : 'door.people.noneDetail')} action={emptyAction} />
          ) : (
            <>
              <div className="pf-resultbar">
                <PeopleCount offset={results.data?.offset ?? 0} shown={list.length} total={total} filtered={filtered} />
                <div className="pf-sort">
                  <label className="sr-only" htmlFor="pf-sort-field">{t('door.pf.sortBy')}</label>
                  <select id="pf-sort-field" value={sort.field} onChange={(e) => go(withSort(state, asSort(schema, e.target.value, sort.dir)))}>
                    {schema.sortable.map((f) => (<option key={f} value={f}>{t('door.pf.sortOption', { field: labels.field(f) })}</option>))}
                  </select>
                  <button type="button" className="btn ghost sm" aria-label={t(sort.dir === 'asc' ? 'door.pf.sortAsc' : 'door.pf.sortDesc')} onClick={() => go(withSort(state, asSort(schema, sort.field, sort.dir === 'asc' ? 'desc' : 'asc')))}>
                    {sort.dir === 'asc' ? '↑' : '↓'}
                  </button>
                  <label className="sr-only" htmlFor="pf-size">{t('door.pf.pageSize')}</label>
                  <select id="pf-size" value={state.size} onChange={(e) => go(withSize(state, Number(e.target.value)))}>
                    {pageSizes(schema.limits).map((n) => (<option key={n} value={n}>{t('door.pf.perPage', { n })}</option>))}
                  </select>
                </div>
              </div>
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
              <Pager page={state.page} pages={pages} onPage={(n) => { go(withPage(state, n)); window.scrollTo({ top: 0 }); }} />
            </>
          )}
        </LoadState>
      )}
    </div>
  );
}
