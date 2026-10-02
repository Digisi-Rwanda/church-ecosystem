import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  RESTRICTED_LABEL,
  clampPage,
  distinctValues,
  filterRows,
  pageCount,
  pageSlice,
  pageWindow,
  sortRows,
  toCsv,
  type GridColumn,
  type SortState,
} from './dataGridLogic';
import { Icon } from './Icon';

export type { GridColumn } from './dataGridLogic';

export type BulkAction<T> = {
  id: string;
  label: string;
  /** Return a short message to show after the action ("Copied 4 emails"). */
  run: (rows: T[]) => string | void | Promise<string | void>;
};

const DEFAULT_SIZES = [5, 10, 25, 50];

/**
 * Self-contained data table: search, per-column filters, sorting, pagination
 * (5 rows by default), row selection that survives paging and filtering,
 * bulk actions, column picker, density, CSV export, and an optional link to a
 * full-page version.
 */
export function DataGrid<T>({
  title,
  hint,
  rows,
  columns,
  rowKey,
  rowHref,
  pageSizeOptions = DEFAULT_SIZES,
  defaultPageSize = 5,
  selectable = true,
  bulkActions = [],
  exportName,
  fullPageHref,
  fullPageLabel = 'Full page',
  fill = false,
  initialSearch = '',
  footerLeft,
  toolbarExtra,
  emptyText = 'No rows match.',
}: {
  title?: string;
  hint?: string;
  rows: T[];
  columns: GridColumn<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  exportName: string;
  fullPageHref?: string;
  fullPageLabel?: string;
  /** Stretch to the height of the parent; only the rows scroll. */
  fill?: boolean;
  initialSearch?: string;
  footerLeft?: ReactNode;
  toolbarExtra?: ReactNode;
  emptyText?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.id)),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const visibleCols = columns.filter((c) => !hidden.has(c.id));
  const activeFilterCount = Object.values(filters).filter(
    (v) => v.trim() !== '',
  ).length;

  const filtered = useMemo(
    () => filterRows(rows, columns, { search, filters }),
    [rows, columns, search, filters],
  );
  const sorted = useMemo(
    () => sortRows(filtered, columns, sort),
    [filtered, columns, sort],
  );

  const pages = pageCount(sorted.length, pageSize);
  const current = clampPage(page, sorted.length, pageSize);
  const pageRows = pageSlice(sorted, current, pageSize);
  const from = sorted.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(sorted.length, current * pageSize);

  const pageKeys = pageRows.map(rowKey);
  const selectedOnPage = pageKeys.filter((k) => selected.has(k)).length;
  const allOnPage = pageKeys.length > 0 && selectedOnPage === pageKeys.length;
  const allMatchingKeys = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const allMatchingSelected =
    allMatchingKeys.length > 0 &&
    allMatchingKeys.every((k) => selected.has(k));
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected, rowKey],
  );

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedOnPage > 0 && selectedOnPage < pageKeys.length;
    }
  });

  const selectOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of columns) {
      if (c.filter === 'select') out[c.id] = distinctValues(rows, c);
    }
    return out;
  }, [rows, columns]);

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4000);
  }

  function toggleSort(col: GridColumn<T>) {
    if (!col.sortable) return;
    setSort((prev) =>
      prev?.columnId !== col.id
        ? { columnId: col.id, direction: 'asc' }
        : prev.direction === 'asc'
          ? { columnId: col.id, direction: 'desc' }
          : null,
    );
    setPage(1);
  }

  function setFilter(id: string, value: string) {
    setFilters((f) => ({ ...f, [id]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({});
    setSearch('');
    setPage(1);
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) pageKeys.forEach((k) => next.delete(k));
      else pageKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  function download() {
    const out =
      selectedRows.length > 0
        ? sortRows(selectedRows, columns, sort)
        : sorted;
    const csv = toCsv(out, visibleCols);
    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash(`Exported ${out.length} row${out.length === 1 ? '' : 's'}`);
  }

  async function runBulk(action: BulkAction<T>) {
    const message = await action.run(selectedRows);
    if (message) flash(message);
  }

  const colSpan = visibleCols.length + (selectable ? 1 : 0);
  const stickyFirst = selectable ? 'dg-first-after-check' : 'dg-first';

  return (
    <section className={`dg${fill ? ' dg-fill' : ''}`} aria-label={title ?? exportName}>
      <header className="dg-head">
        <div className="dg-titles">
          {title ? <h3>{title}</h3> : null}
          {hint ? <p className="muted">{hint}</p> : null}
        </div>
        {fullPageHref ? (
          <Link to={fullPageHref} className="btn ghost sm dg-full">
            {fullPageLabel}
            <Icon name="external" size={13} />
          </Link>
        ) : null}
      </header>

      <div className="dg-toolbar">
        <label className="dg-search">
          <Icon name="search" size={14} />
          <input
            type="search"
            value={search}
            placeholder="Search this table…"
            aria-label={`Search ${title ?? 'table'}`}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          type="button"
          className={`btn ghost sm${showFilters || activeFilterCount ? ' dg-on' : ''}`}
          aria-pressed={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
        {activeFilterCount > 0 || search ? (
          <button type="button" className="dg-link" onClick={clearFilters}>
            Clear
          </button>
        ) : null}
        <span className="dg-spacer" />
        {toolbarExtra}
        <details className="dg-menu">
          <summary className="btn ghost sm">Columns</summary>
          <div className="dg-menu-pop">
            {columns.map((c, i) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={!hidden.has(c.id)}
                  disabled={i === 0}
                  onChange={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    })
                  }
                />{' '}
                {c.header}
              </label>
            ))}
          </div>
        </details>
        <button
          type="button"
          className="btn ghost sm"
          aria-pressed={compact}
          onClick={() => setCompact((v) => !v)}
        >
          {compact ? 'Comfortable' : 'Compact'}
        </button>
        <button type="button" className="btn ghost sm" onClick={download}>
          Export CSV
        </button>
      </div>

      {selected.size > 0 ? (
        <div className="dg-bulk" role="region" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          {bulkActions.map((a) => (
            <button
              key={a.id}
              type="button"
              className="btn secondary sm"
              onClick={() => void runBulk(a)}
            >
              {a.label}
            </button>
          ))}
          <button type="button" className="btn secondary sm" onClick={download}>
            Export selected
          </button>
          {!allMatchingSelected && allOnPage && sorted.length > pageKeys.length ? (
            <button
              type="button"
              className="dg-link"
              onClick={() =>
                setSelected((prev) => new Set([...prev, ...allMatchingKeys]))
              }
            >
              Select all {sorted.length} matching
            </button>
          ) : null}
          <span className="dg-spacer" />
          <button
            type="button"
            className="dg-link"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      ) : null}

      <div
        className="dg-notice"
        role="status"
        aria-live="polite"
        hidden={!notice}
      >
        {notice}
      </div>

      <div className="dg-scroll">
        <table className={`dg-table${compact ? ' compact' : ''}`}>
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" className="dg-check">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allOnPage}
                    disabled={pageKeys.length === 0}
                    onChange={togglePage}
                  />
                </th>
              ) : null}
              {visibleCols.map((c, i) => {
                const active = sort?.columnId === c.id ? sort.direction : null;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className={i === 0 ? stickyFirst : undefined}
                    aria-sort={
                      active === 'asc'
                        ? 'ascending'
                        : active === 'desc'
                          ? 'descending'
                          : c.sortable
                            ? 'none'
                            : undefined
                    }
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        className={`dg-sort${active ? ' active' : ''}`}
                        onClick={() => toggleSort(c)}
                      >
                        {c.header}
                        <span className="dg-sort-ind" aria-hidden>
                          {active === 'asc' ? '▲' : active === 'desc' ? '▼' : '↕'}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
            {showFilters ? (
              <tr className="dg-filter-row">
                {selectable ? <th className="dg-check" /> : null}
                {visibleCols.map((c, i) => (
                  <th key={c.id} className={i === 0 ? stickyFirst : undefined}>
                    {c.filter === 'select' ? (
                      <select
                        aria-label={`Filter ${c.header}`}
                        value={filters[c.id] ?? ''}
                        onChange={(e) => setFilter(c.id, e.target.value)}
                      >
                        <option value="">All</option>
                        {(selectOptions[c.id] ?? []).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : c.filter === 'text' ? (
                      <input
                        type="text"
                        aria-label={`Filter ${c.header}`}
                        placeholder="Filter…"
                        value={filters[c.id] ?? ''}
                        onChange={(e) => setFilter(c.id, e.target.value)}
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="dg-empty muted">
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const key = rowKey(row);
                const isSel = selected.has(key);
                return (
                  <tr key={key} className={isSel ? 'selected' : undefined}>
                    {selectable ? (
                      <td className="dg-check">
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={isSel}
                          onChange={() => toggleRow(key)}
                        />
                      </td>
                    ) : null}
                    {visibleCols.map((c, i) => {
                      const v = c.value(row);
                      const content =
                        v === null ? (
                          <span
                            className="muted dg-locked"
                            title="Pastoral / secretary access only"
                          >
                            <Icon name="lock" size={11} /> {RESTRICTED_LABEL}
                          </span>
                        ) : c.render ? (
                          c.render(row)
                        ) : v === 'None' ? (
                          <span className="muted">None</span>
                        ) : (
                          v
                        );
                      const first = i === 0;
                      return first ? (
                        <th
                          key={c.id}
                          scope="row"
                          className={`${stickyFirst} dg-rowhead`}
                        >
                          {rowHref ? (
                            <Link to={rowHref(row)}>{content}</Link>
                          ) : (
                            content
                          )}
                        </th>
                      ) : (
                        <td key={c.id}>{content}</td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <footer className="dg-foot">
        <div className="dg-foot-left muted">
          {sorted.length === 0
            ? '0 rows'
            : `${from}–${to} of ${sorted.length}`}
          {sorted.length !== rows.length ? ` (filtered from ${rows.length})` : ''}
          {footerLeft}
        </div>
        <label className="dg-size muted">
          Rows per page{' '}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <nav className="dg-pages" aria-label="Pagination">
          <button
            type="button"
            className="dg-pg"
            disabled={current === 1}
            onClick={() => setPage(1)}
            aria-label="First page"
          >
            «
          </button>
          <button
            type="button"
            className="dg-pg"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          {pageWindow(current, pages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="dg-gap" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={`dg-pg${n === current ? ' active' : ''}`}
                aria-current={n === current ? 'page' : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            className="dg-pg"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
            aria-label="Next page"
          >
            ›
          </button>
          <button
            type="button"
            className="dg-pg"
            disabled={current === pages}
            onClick={() => setPage(pages)}
            aria-label="Last page"
          >
            »
          </button>
        </nav>
      </footer>
    </section>
  );
}
