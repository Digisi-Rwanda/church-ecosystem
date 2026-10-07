import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addReportSchedule, composeReport, fetchReportOptions, fetchReportSchedules, fetchReports, stopReportSchedule,
  type ReportKind, type ReportOptions,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { kindKey, lastMonth, periodLabel, reportErrorKey, sortReports, stateKey } from './reports';
import { useLoad } from './useLoad';

function ComposeForm({ options, systemId, onDone, onCancel }: { options: ReportOptions; systemId: string; onDone: (id: string) => void; onCancel: () => void }) {
  const t = useT();
  const units = options.units.filter((u) => u.systemId === systemId && u.kinds.length > 0);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [kind, setKind] = useState<ReportKind | ''>('');
  const [period, setPeriod] = useState(lastMonth());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const kinds = units.find((u) => u.id === unitId)?.kinds ?? [];
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
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.reports.new')}</h3>
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
      <SelectField label={t('door.reports.kind')} name="r-kind" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {t(kindKey(k))}
          </option>
        ))}
      </SelectField>
      <TextField label={t('door.reports.period')} name="r-period" hint={t('door.reports.periodHint')} value={period} placeholder="2026-10" onChange={(e) => setPeriod(e.target.value.trim())} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
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
      <div>
        <h2 id="door-reports-title">{t('door.block.reports')}</h2>
        <p className="muted">{t('door.reports.intro')}</p>
      </div>
      <div className="door-row" role="group" aria-label={t('door.reports.tabs')}>
        <button type="button" className={tab === 'library' ? 'btn sm' : 'btn ghost sm'} aria-pressed={tab === 'library'} onClick={() => setTab('library')}>
          {t('door.reports.tab.library')}
        </button>
        <button type="button" className={tab === 'schedules' ? 'btn sm' : 'btn ghost sm'} aria-pressed={tab === 'schedules'} onClick={() => setTab('schedules')}>
          {t('door.reports.tab.schedules')}
        </button>
      </div>
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
            {canCompose && !form && (
              <button type="button" className="btn" onClick={() => setForm('compose')}>
                {t('door.reports.new')}
              </button>
            )}
          </div>
          {form === 'compose' && options.data && <ComposeForm options={options.data} systemId={systemId} onDone={(id) => navigate(`/s/${systemId}/reports/${id}`)} onCancel={() => setForm(null)} />}
          <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
            {items.length === 0 ? (
              <EmptyState title={t('door.reports.none')} detail={t('door.reports.noneDetail')} />
            ) : (
              <ul className="door-notices">
                {items.map((r) => (
                  <li key={r.id} className="panel door-notice">
                    <div className="door-notice-main">
                      <div className="door-row">
                        <strong>
                          <Link to={`/s/${systemId}/reports/${r.id}`}>
                            {t(kindKey(r.kind))} · {periodLabel(r.periodKey, locale)}
                          </Link>
                        </strong>
                        <span className={`door-chip${r.status === 'DRAFT' ? ' warn' : ''}`}>{t(`door.reports.status.${r.status}` as const)}</span>
                      </div>
                      <p className="muted">{r.unitName}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </LoadState>
        </>
      )}
      {tab === 'schedules' && (
        <>
          <p className="muted">{t('door.reports.schedule.intro')}</p>
          {canSchedule && !form && (
            <button type="button" className="btn" onClick={() => setForm('schedule')}>
              {t('door.reports.schedule.new')}
            </button>
          )}
          {form === 'schedule' && options.data && (
            <ScheduleForm options={options.data} systemId={systemId} onDone={() => { setForm(null); schedules.reload(); }} onCancel={() => setForm(null)} />
          )}
          <LoadState loading={schedules.loading} failed={schedules.failed} retry={schedules.reload}>
            {(schedules.data?.schedules ?? []).length === 0 ? (
              <EmptyState title={t('door.reports.schedule.none')} detail={t('door.reports.schedule.noneDetail')} />
            ) : (
              <ul className="door-notices">
                {(schedules.data?.schedules ?? []).map((s) => (
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
