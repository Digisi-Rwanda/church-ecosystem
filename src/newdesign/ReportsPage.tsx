import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addReportSchedule, composeReport, fetchReportOptions, fetchReportSchedules, fetchReports, stopReportSchedule,
  type ReportKind, type ReportOptions, type ReportScheduleItem,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { boardCounts, kindKey, lastMonth, periodLabel, reportErrorKey, sortReports, stateKey } from './reports';
import { useLoad } from './useLoad';
import { ListRow, PageHeader, RowList, Segmented, SidePanel, StatusChip, Tabs } from './kit';

function ComposeForm({ options, systemId, onDone, onCancel }: { options: ReportOptions; systemId: string; onDone: (id: string) => void; onCancel: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const units = options.units.filter((u) => u.systemId === systemId && u.kinds.length > 0);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [kind, setKind] = useState<ReportKind | ''>('');
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(lastMonth());
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const kinds = units.find((u) => u.id === unitId)?.kinds ?? [];
  const period = mode === 'month' ? month : year;
  const thisYear = new Date().getUTCFullYear();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!unitId || !kind || !/^\d{4}(-\d{2})?$/.test(period)) return setError(t('door.reports.err.input'));
    setBusy(true);
    setError('');
    try {
      onDone((await composeReport({ unitId, kind, periodKey: period })).id);
    } catch (err) {
      setError(t(reportErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  const unitName = units.find((u) => u.id === unitId)?.name ?? '';
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      {units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="r-unit" value={unitId} onChange={(e) => { setUnitId(e.target.value); setKind(''); }}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <div role="radiogroup" aria-label={t('door.reports.pickKind')} className="rk-wrap">
        <p className="rk-title">{t('door.reports.pickKind')}</p>
        <div className="rk-grid">
          {kinds.length === 0 && <p className="muted">{t('door.gov.meeting.choose')}</p>}
          {kinds.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`rk-card${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
              <strong>{t(kindKey(k))}</strong>
              <span>{t(`door.reports.help.${k}` as 'door.reports.help.MONEY')}</span>
            </button>
          ))}
        </div>
      </div>
      <Segmented
        label={t('door.reports.period')}
        value={mode}
        onChange={setMode}
        items={[
          { key: 'month', label: t('door.reports.mode.month') },
          { key: 'year', label: t('door.reports.mode.year') },
        ]}
      />
      {mode === 'month' ? (
        <div className="rk-period">
          <TextField label={t('door.reports.period')} name="r-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <div className="door-row">
            <button type="button" className="btn ghost sm" onClick={() => setMonth(lastMonth())}>{t('door.reports.lastMonth')}</button>
            <button type="button" className="btn ghost sm" onClick={() => setMonth(new Date().toISOString().slice(0, 7))}>{t('door.reports.thisMonth')}</button>
          </div>
        </div>
      ) : (
        <SelectField label={t('door.reports.period')} name="r-year" value={year} onChange={(e) => setYear(e.target.value)}>
          {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </SelectField>
      )}
      {kind && unitId && /^\d{4}(-\d{2})?$/.test(period) && <p className="rk-summary">{t('door.reports.summary', { kind: t(kindKey(kind)), unit: unitName, period: periodLabel(period, locale) })}</p>}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy || !unitId || !kind}>
          {t('door.reports.compose')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

function ScheduleForm({ options, systemId, onDone, onCancel }: { options: ReportOptions; systemId: string; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const units = options.schedulerUnits.filter((u) => u.systemId === systemId);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [kind, setKind] = useState<ReportKind | ''>('');
  const [day, setDay] = useState('5');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(day);
    if (!unitId || !kind || !Number.isInteger(n) || n < 1 || n > 28) return setError(t('door.reports.err.input'));
    try {
      await addReportSchedule({ unitId, kind, dueDay: n });
      onDone();
    } catch (err) {
      setError(t(reportErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.reports.schedule.new')}</h3>
      {units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="s-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField label={t('door.reports.kind')} name="s-kind" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {options.kinds.map((k) => (
          <option key={k} value={k}>
            {t(kindKey(k))}
          </option>
        ))}
      </SelectField>
      <TextField label={t('door.reports.schedule.day')} name="s-day" inputMode="numeric" hint={t('door.reports.schedule.dayHint')} value={day} onChange={(e) => setDay(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn">
          {t('door.reports.schedule.add')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** What is received, due and late, at a glance. Late ones come first so nobody has to hunt for them. */
function ReportBoard({ items }: { items: ReportScheduleItem[] }) {
  const t = useT();
  const c = boardCounts(items);
  if (items.length === 0) return null;
  return (
    <div className="queue-grid">
      {(['LATE', 'DUE', 'RECEIVED'] as const).map((st) => (
        <div key={st} className="panel queue-card">
          <h3>
            {t(stateKey(st))} <span className="muted">{c[st]}</span>
          </h3>
        </div>
      ))}
    </div>
  );
}

/** The Reports block: the library of reports, and the monthly schedules of what each unit owes. */
export function ReportsPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [tab, setTab] = useState<'library' | 'schedules'>('library');
  const [kind, setKind] = useState('');
  const [form, setForm] = useState<'compose' | 'schedule' | null>(null);
  const allowed = lettersFor(capabilities, systemId, 'reports').length > 0;
  const list = useLoad(() => fetchReports({ systemId, kind }), `reports|${systemId}|${kind}`);
  const schedules = useLoad(() => fetchReportSchedules(systemId), `report-sched|${systemId}`);
  const options = useLoad(fetchReportOptions, 'report-options');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const canCompose = !!list.data?.canCompose && !!options.data && options.data.units.some((u) => u.systemId === systemId && u.kinds.length > 0);
  const canSchedule = !!schedules.data?.canSchedule && !!options.data;
  const items = sortReports(list.data?.reports ?? []);
  return (
    <section className="door-block" aria-labelledby="door-reports-title">
      <PageHeader
        id="door-reports-title"
        title={t('door.block.reports')}
        purpose={t('door.purpose.reports')}
        primary={
          tab === 'library' && canCompose ? (
            <button type="button" className="btn" onClick={() => setForm('compose')}>
              {t('door.reports.new')}
            </button>
          ) : tab === 'schedules' && canSchedule ? (
            <button type="button" className="btn" onClick={() => setForm('schedule')}>
              {t('door.reports.schedule.new')}
            </button>
          ) : undefined
        }
      />
      <Tabs
        label={t('door.reports.tabs')}
        value={tab}
        onChange={setTab}
        items={[
          { key: 'library', label: t('door.reports.tab.library') },
          { key: 'schedules', label: t('door.reports.tab.schedules'), count: (schedules.data?.schedules ?? []).filter((x) => x.state === 'LATE').length },
        ]}
      />
      <SidePanel open={form === 'compose' && !!options.data} title={t('door.reports.new')} purpose={t('door.reports.intro')} onClose={() => setForm(null)}>
        {options.data && (
          <div className="side-form">
            <ComposeForm options={options.data} systemId={systemId} onDone={(id) => navigate(`/s/${systemId}/reports/${id}`)} onCancel={() => setForm(null)} />
          </div>
        )}
      </SidePanel>
      <SidePanel open={form === 'schedule' && !!options.data} title={t('door.reports.schedule.new')} purpose={t('door.reports.schedule.intro')} onClose={() => setForm(null)}>
        {options.data && (
          <div className="side-form">
            <ScheduleForm options={options.data} systemId={systemId} onDone={() => { setForm(null); schedules.reload(); }} onCancel={() => setForm(null)} />
          </div>
        )}
      </SidePanel>
      {tab === 'library' && (
        <>
          <div className="door-filters">
            <SelectField label={t('door.reports.kind')} name="r-filter" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t('door.reports.allKinds')}</option>
              {(options.data?.kinds ?? []).map((k) => (
                <option key={k} value={k}>
                  {t(kindKey(k))}
                </option>
              ))}
            </SelectField>
          </div>
          <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
            {items.length === 0 ? (
              <EmptyState title={t('door.reports.none')} detail={t('door.reports.noneDetail')} />
            ) : (
              <RowList label={t('door.reports.tab.library')}>
                {items.map((r) => (
                  <ListRow
                    key={r.id}
                    title={`${t(kindKey(r.kind))} · ${periodLabel(r.periodKey, locale)}`}
                    detail={r.unitName}
                    status={<StatusChip tone={r.status === 'DRAFT' ? 'warn' : 'success'}>{t(`door.reports.status.${r.status}` as const)}</StatusChip>}
                    to={`/s/${systemId}/reports/${r.id}`}
                  />
                ))}
              </RowList>
            )}
          </LoadState>
        </>
      )}
      {tab === 'schedules' && (
        <>
          <p className="muted">{t('door.reports.schedule.intro')}</p>
          <ReportBoard items={schedules.data?.schedules ?? []} />
          <LoadState loading={schedules.loading} failed={schedules.failed} retry={schedules.reload}>
            {(schedules.data?.schedules ?? []).length === 0 ? (
              <EmptyState title={t('door.reports.schedule.none')} detail={t('door.reports.schedule.noneDetail')} />
            ) : (
              <ul className="door-notices">
                {[...(schedules.data?.schedules ?? [])].sort((a, b) => ['LATE', 'DUE', 'RECEIVED'].indexOf(a.state) - ['LATE', 'DUE', 'RECEIVED'].indexOf(b.state)).map((s) => (
                  <li key={s.id} className="panel door-notice">
                    <div className="door-notice-main">
                      <div className="door-row">
                        <strong>
                          {t(kindKey(s.kind))} · {s.unitName}
                        </strong>
                        <span className={`door-chip${s.state === 'LATE' ? ' warn' : ''}`}>{t(stateKey(s.state))}</span>
                      </div>
                      <p className="muted">{t('door.reports.schedule.line', { period: periodLabel(s.periodKey, locale), due: s.dueOn })}</p>
                      {schedules.data?.canSchedule && (
                        <button type="button" className="btn ghost sm" onClick={() => void stopReportSchedule(s.id).then(schedules.reload)}>
                          {t('door.reports.schedule.stop')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </LoadState>
        </>
      )}
    </section>
  );
}
