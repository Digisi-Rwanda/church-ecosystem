import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { discardReport, fetchReport, fetchReports, reportStep, type ReportDetail } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { PageHeader } from './kit';
import { LoadState } from './LoadState';
import { cellText, deltaText, kindKey, periodLabel, previousPeriod, reportErrorKey } from './reports';
import { useLoad } from './useLoad';

/** One report: figures as they stood when composed. A published report is frozen. */
export function ReportPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { systemId = '', reportId = '' } = useParams();
  const load = useLoad(() => fetchReport(reportId), `report|${reportId}`);
  const [error, setError] = useState('');
  const r: ReportDetail | null = load.data ?? null;
  const prevKey = r ? previousPeriod(r.periodKey) : '';
  const before = useLoad(async () => {
    if (!r) return null;
    const found = (await fetchReports({ systemId: r.systemId, kind: r.kind, period: prevKey, status: 'PUBLISHED' })).reports.find((x) => x.unitName === r.unitName);
    return found ? fetchReport(found.id) : null;
  }, `report-before|${reportId}|${r?.id ?? ''}`);
  const prev = before.data?.snapshot ?? null;
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      if (after) after();
      else load.reload();
    } catch (err) {
      setError(t(reportErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  return (
    <section className="door-block" aria-labelledby="door-report-title">
      <p className="no-print">
        <Link to={`/s/${systemId}/reports`}>{t('door.reports.back')}</Link>
      </p>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {r && (
          <>
            <PageHeader
              id="door-report-title"
              title={<>{t(kindKey(r.kind))} · {periodLabel(r.periodKey, locale)}</>}
              purpose={r.unitName}
              meta={<span className={`door-chip${r.status === 'DRAFT' ? ' warn' : ''}`}>{t(`door.reports.status.${r.status}` as const)}</span>}
            />
            <div>
              <p className="muted">
                {r.status === 'DRAFT'
                  ? t('door.reports.composedBy', { name: r.composedByName, date: when(r.composedAt) })
                  : t('door.reports.publishedBy', { name: r.publishedByName ?? '', date: when(r.publishedAt) })}
              </p>
              {r.status === 'DRAFT' && <p className="muted">{t('door.reports.draftHint')}</p>}
              {r.status === 'PUBLISHED' && <p className="muted">{t('door.reports.frozen')}</p>}
            </div>
            <div className="door-row no-print">
              {r.canEdit && (
                <button type="button" className="btn ghost" onClick={() => void run(() => reportStep(r.id, 'refresh'))}>
                  {t('door.reports.refresh')}
                </button>
              )}
              {r.canPublish && (
                <button type="button" className="btn" onClick={() => void run(() => reportStep(r.id, 'publish'))}>
                  {t('door.reports.publish')}
                </button>
              )}
              {r.canEdit && (
                <button type="button" className="btn ghost" onClick={() => void run(() => discardReport(r.id), () => navigate(`/s/${systemId}/reports`))}>
                  {t('door.reports.discard')}
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => window.print()}>
                {t('door.reports.print')}
              </button>
            </div>
            {error && (
              <p className="door-error" role="alert">
                {error}
              </p>
            )}
            {!r.snapshot ? (
              <EmptyState variant="error" title={t('door.reports.unreadable')} />
            ) : (
              <>
                <div className="panel print-sheet">
                  <dl className="door-facts">
                    {r.snapshot.summary.map((s) => (
                      <div key={s.key}>
                        <dt>{t(`door.reports.sum.${r.kind}.${s.key}` as 'door.reports.sum.MONEY.income')}</dt>
                        <dd>
                          {cellText(s.value, s.type)}
                          {prev && deltaText(s.value, prev.summary.find((x) => x.key === s.key)?.value ?? null) && (
                            <span className="muted"> ({deltaText(s.value, prev.summary.find((x) => x.key === s.key)?.value ?? null)} {t('door.reports.vsLast', { period: periodLabel(prevKey, locale) })})</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {r.snapshot.tables.map((tbl) => (
                  <div key={tbl.key} className="panel">
                    <h3>{t(`door.reports.tbl.${r.kind}.${tbl.key}` as 'door.reports.tbl.MONEY.accounts')}</h3>
                    {tbl.rows.length === 0 ? (
                      <p className="muted">{t('door.reports.noRows')}</p>
                    ) : (
                      <div className="door-table-wrap">
                        <table className="door-table door-stack">
                          <thead>
                            <tr>
                              {tbl.columns.map((c) => (
                                <th key={c.key} scope="col">
                                  {t(`door.reports.col.${c.key}` as 'door.reports.col.name')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tbl.rows.map((row, i) => (
                              <tr key={i}>
                                {row.map((v, j) => (
                                  <td key={j} data-label={t(`door.reports.col.${tbl.columns[j].key}` as 'door.reports.col.name')}>{tbl.columns[j].type === 'code' && v ? t(`door.reports.val.${String(v)}` as 'door.reports.val.HELD') : cellText(v, tbl.columns[j].type)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}
