import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  appointOffice,
  endAppointment,
  fetchAppointments,
  fetchPeople,
  fetchStructure,
  fetchVacancies,
  type AppointmentRow,
  type DirectoryPerson,
  type Vacancy,
} from '../api/frontDoorApi';
import { ApiError } from '../api/client';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import type { OfficeCode } from '../../server/src/shared/vocabulary';
import { accessErrorKey, groupByUnit, officesFor, sortVacancies } from './access';
import { LoadState } from './LoadState';
import { flattenTree } from './structure';
import { useLoad } from './useLoad';

const bodyCode = (e: unknown): string | undefined =>
  e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;

/** Who holds which office, which seats are empty, and (for those who may) appoint and end. */
export function AppointmentsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const base = `/s/${systemId}/people`;
  const [showEnded, setShowEnded] = useState(false);
  const { loading, failed, data, reload } = useLoad(async () => {
    const [list, structure, vac] = await Promise.all([fetchAppointments({ ended: showEnded }), fetchStructure(), fetchVacancies()]);
    return { list, structure, vac };
  }, `appointments|${showEnded}`);

  const [prefill, setPrefill] = useState<{ unitId: string; office: OfficeCode } | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const units = useMemo(() => data?.structure.units ?? [], [data]);
  const groups = useMemo(
    () => (data ? groupByUnit(data.list.appointments, flattenTree(units).map((r) => r.unit)) : []),
    [data, units],
  );
  const canAct = !!data && (data.list.canAppoint || data.list.canAppointLeader);

  return (
    <div className="door-block">
      <h2>{t('door.access.appointments.title')}</h2>
      <p className="muted">{t('door.access.appointments.intro')}</p>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <VacancyPanel
              vacancies={data.vac.vacancies}
              conflicts={data.vac.conflicts}
              admins={data.vac.administrators}
              onFill={canAct ? (unitId, office) => setPrefill({ unitId, office }) : undefined}
            />
            {message && (
              <p className="door-ok" role="status">
                {message}
              </p>
            )}
            {canAct && (
              <AppointForm
                key={prefill ? `${prefill.unitId}|${prefill.office}` : 'blank'}
                units={units}
                isLeader={data.list.canAppoint}
                isAdministrator={data.list.canAppointLeader}
                prefill={prefill}
                onDone={() => {
                  setMessage(t('door.access.appointed'));
                  setPrefill(null);
                  reload();
                }}
              />
            )}
            <label className="door-check">
              <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
              {t('door.access.showEnded')}
            </label>
            {groups.length === 0 ? (
              <p className="muted">{t('door.access.noAppointments')}</p>
            ) : (
              groups.map((g) => (
                <div className="panel" key={g.key}>
                  <h3>
                    {g.unitName}
                    {g.unitCode && <span className="muted"> · {g.unitCode}</span>}
                  </h3>
                  <ul className="door-list">
                    {g.rows.map((r) => (
                      <li key={r.id} className="door-appt">
                        <div>
                          <strong>{t(`door.office.${r.office}` as const)}</strong>
                          {' · '}
                          <Link to={`${base}/${r.personId}`}>{r.personName}</Link>
                          {r.memberCode && <span className="muted"> {r.memberCode}</span>}
                          <div className="muted">
                            {t('door.access.since', { date: r.startDate ?? '—' })}
                            {r.endDate && ` · ${t(r.live ? 'door.access.termEnds' : 'door.access.ended', { date: r.endDate })}`}
                            {r.endsSoon && <span className="door-chip warn"> {t('door.access.endsSoon')}</span>}
                          </div>
                        </div>
                        {r.live && canAct && (r.office === 'CHURCH_LEADER' ? data.list.canAppointLeader : data.list.canAppoint) && (
                          <button type="button" className="btn ghost sm" onClick={() => setEnding(ending === r.id ? null : r.id)}>
                            {t('door.access.end')}
                          </button>
                        )}
                        {ending === r.id && (
                          <EndForm
                            row={r}
                            onDone={() => {
                              setEnding(null);
                              setMessage(t('door.access.ended.done'));
                              reload();
                            }}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}

function VacancyPanel({
  vacancies,
  conflicts,
  admins,
  onFill,
}: {
  vacancies: Vacancy[];
  conflicts: Array<{ unitId: string; unitName: string; office: OfficeCode }>;
  admins: { count: number; minimum: number };
  onFill?: (unitId: string, office: OfficeCode) => void;
}) {
  const t = useT();
  const sorted = sortVacancies(vacancies);
  const short = admins.count < admins.minimum;
  if (sorted.length === 0 && conflicts.length === 0 && !short) {
    return <p className="door-ok">{t('door.access.vacancies.none')}</p>;
  }
  return (
    <div className="panel door-attention" role="region" aria-label={t('door.access.vacancies.title')}>
      <h3>{t('door.access.vacancies.title')}</h3>
      {short && <p className="door-warn">{t('door.access.vacancies.admins', { count: String(admins.count), minimum: String(admins.minimum) })}</p>}
      {conflicts.map((c) => (
        <p key={`${c.unitId}|${c.office}`} className="door-warn">
          {t('door.access.vacancies.conflict', { office: t(`door.office.${c.office}` as const), unit: c.unitName })}
        </p>
      ))}
      <ul className="door-list">
        {sorted.map((v) => (
          <li key={`${v.unitId}|${v.office}|${v.reason}`} className="door-appt">
            <span>
              <strong>{t(`door.office.${v.office}` as const)}</strong> · {v.unitName}{' '}
              <span className={`door-chip${v.reason === 'EMPTY' ? ' warn' : ''}`}>
                {v.reason === 'EMPTY' ? t('door.access.vacancies.empty') : t('door.access.vacancies.endsOn', { date: v.endsOn ?? '' })}
              </span>
              {v.reason === 'ENDS_SOON' && v.holderName && <span className="muted"> {v.holderName}</span>}
            </span>
            {onFill && v.reason === 'EMPTY' && (
              <button type="button" className="btn secondary sm" onClick={() => onFill(v.unitId, v.office)}>
                {t('door.access.vacancies.fill')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppointForm({
  units,
  isLeader,
  isAdministrator,
  prefill,
  onDone,
}: {
  units: Array<{ id: string; name: string; kind: 'CENTRAL' | 'MINISTRY' | 'ORGANISATION' | 'TEAM'; systemId?: string | null }>;
  isLeader: boolean;
  isAdministrator: boolean;
  prefill: { unitId: string; office: OfficeCode } | null;
  onDone: () => void;
}) {
  const t = useT();
  const [unitId, setUnitId] = useState(prefill?.unitId ?? '');
  const [office, setOffice] = useState<OfficeCode | ''>(prefill?.office ?? '');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<DirectoryPerson[]>([]);
  const [personId, setPersonId] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unit = units.find((u) => u.id === unitId);
  const offices = unit ? officesFor(unit.kind, unit.systemId, isLeader, isAdministrator) : [];

  const search = async () => {
    setError('');
    try {
      setFound(q.trim() ? await fetchPeople({ q: q.trim() }) : []);
    } catch {
      setError(t('door.people.error'));
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!unitId || !office || !personId) {
      setError(t('door.access.form.incomplete'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await appointOffice({ personId, orgUnitId: unitId, office, endDate: endDate || null });
      onDone();
    } catch (err) {
      setError(t(accessErrorKey(bodyCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.access.form.title')}</h3>
      <SelectField
        label={t('door.access.form.unit')}
        name="unit"
        value={unitId}
        onChange={(e) => {
          setUnitId(e.target.value);
          setOffice('');
        }}
      >
        <option value="">{t('door.access.form.choose')}</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </SelectField>
      <SelectField label={t('door.access.form.office')} name="office" value={office} onChange={(e) => setOffice(e.target.value as OfficeCode)} disabled={!unit}>
        <option value="">{t('door.access.form.choose')}</option>
        {offices.map((o) => (
          <option key={o} value={o}>
            {t(`door.office.${o}` as const)}
          </option>
        ))}
      </SelectField>
      <div className="door-search-row">
        <TextField label={t('door.access.form.person')} name="person-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('door.people.search')} />
        <button type="button" className="btn secondary" onClick={() => void search()}>
          {t('door.access.form.search')}
        </button>
      </div>
      {found.length > 0 && (
        <SelectField label={t('door.access.form.pickPerson')} name="person" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">{t('door.access.form.choose')}</option>
          {found.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} {p.memberCode ?? ''}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label={t('door.access.form.termEnd')} name="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} hint={t('door.access.form.termHint')} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? t('door.people.form.saving') : t('door.access.form.submit')}
      </button>
    </form>
  );
}

function EndForm({ row, onDone }: { row: AppointmentRow; onDone: () => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError(t('door.access.end.reasonRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await endAppointment(row.id, reason.trim());
      onDone();
    } catch (err) {
      setError(t(accessErrorKey(bodyCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="door-form door-end" onSubmit={submit} noValidate>
      <p className="muted">{t('door.access.end.warn', { name: row.personName, office: t(`door.office.${row.office}` as const) })}</p>
      <TextField label={t('door.access.end.reason')} name={`reason-${row.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn danger" disabled={busy}>
        {t('door.access.end.confirm')}
      </button>
    </form>
  );
}
