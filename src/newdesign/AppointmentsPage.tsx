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
} from '../api/frontDoorApi';
import { ApiError } from '../api/client';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import type { OfficeCode } from '../../server/src/shared/vocabulary';
import { accessErrorKey, groupByUnit, officesFor } from './access';
import { LoadState } from './LoadState';
import { flattenTree } from './structure';
import { useLoad } from './useLoad';
import { PageHeader, SidePanel, initialsOf } from './kit';

const bodyCode = (e: unknown): string | undefined =>
  e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;

/** Who holds which office, which seats are empty, and (for those who may) appoint and end. */
export function AppointmentsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const base = `/s/${systemId}/people`;
  const [showEnded, setShowEnded] = useState(false);
  const { loading, failed, data, reload } = useLoad(async () => {
    const [list, structure, vac] = await Promise.all([fetchAppointments({ ended: showEnded, systemId }), fetchStructure(systemId), fetchVacancies(systemId)]);
    return { list, structure, vac };
  }, `appointments|${systemId}|${showEnded}`);

  const [prefill, setPrefill] = useState<{ unitId: string; office: OfficeCode } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const units = useMemo(() => data?.structure.units ?? [], [data]);
  const cards = useMemo(() => {
    if (!data) return [];
    const groups = groupByUnit(data.list.appointments, flattenTree(units).map((r) => r.unit));
    const empty = data.vac.vacancies.filter((v) => v.reason === 'EMPTY');
    const out = groups.map((g) => ({ ...g, vacant: empty.filter((v) => v.unitId === g.key) }));
    for (const v of empty) {
      if (!out.some((g) => g.key === v.unitId)) out.push({ key: v.unitId, unitName: v.unitName, unitCode: null, rows: [], vacant: empty.filter((x) => x.unitId === v.unitId) });
    }
    return out.filter((g, i) => out.findIndex((x) => x.key === g.key) === i);
  }, [data, units]);
  const canAct = !!data && (data.list.canAppoint || data.list.canAppointLeader);
  const live = data ? data.list.appointments.filter((r) => r.live).length : 0;
  const vacant = data ? data.vac.vacancies.filter((v) => v.reason === 'EMPTY').length : 0;
  const soon = data ? data.list.appointments.filter((r) => r.live && r.endsSoon).length : 0;
  const open = (next: { unitId: string; office: OfficeCode } | null) => {
    setPrefill(next);
    setFormOpen(true);
  };

  return (
    <div className="door-block">
      <PageHeader
        title={t('door.access.appointments.title')}
        purpose={t('door.purpose.appointments')}
        primary={canAct ? <button type="button" className="btn" onClick={() => open(null)}>{t('door.access.form.title')}</button> : undefined}
      />
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data && (
          <>
            <ul className="seat-stats" aria-label={t('door.access.appointments.title')}>
              <li><strong>{live}</strong><span>{t('door.access.stat.leaders')}</span></li>
              <li className={vacant ? 'warn' : ''}><strong>{vacant}</strong><span>{t('door.access.stat.vacant')}</span></li>
              <li className={soon ? 'warn' : ''}><strong>{soon}</strong><span>{t('door.access.stat.soon')}</span></li>
            </ul>
            <Concerns conflicts={data.vac.conflicts} admins={systemId === 'sys-main' ? data.vac.administrators : undefined} />
            {message && <p className="door-ok" role="status">{message}</p>}
            <label className="door-check">
              <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
              {t('door.access.showEnded')}
            </label>
            {cards.length === 0 ? (
              <p className="muted">{t('door.access.noAppointments')}</p>
            ) : (
              <div className="seat-grid">
                {cards.map((g) => (
                  <section className="seat-card" key={g.key} aria-label={g.unitName}>
                    <header>
                      <strong>{g.unitName}</strong>
                      {g.unitCode && <small>{g.unitCode}</small>}
                      <span className={`seat-count${g.vacant.length ? ' warn' : ''}`}>{g.rows.filter((r) => r.live).length}/{g.rows.filter((r) => r.live).length + g.vacant.length}</span>
                    </header>
                    <ul className="seat-list">
                      {g.rows.map((r) => (
                        <li key={r.id} className={`seat${r.live ? '' : ' ended'}`}>
                          <span className="seat-avatar" aria-hidden="true">{initialsOf(r.personName)}</span>
                          <span className="seat-main">
                            <small className="seat-office">{t(`door.office.${r.office}` as const)}</small>
                            <Link to={`${base}/${r.personId}`}>{r.personName}</Link>
                            <small className="muted">
                              {t('door.access.since', { date: r.startDate ?? '—' })}
                              {r.endDate && ` · ${t(r.live ? 'door.access.termEnds' : 'door.access.ended', { date: r.endDate })}`}
                              {r.endsSoon && <span className="door-chip warn"> {t('door.access.endsSoon')}</span>}
                            </small>
                          </span>
                          {r.live && canAct && (r.office === 'CHURCH_LEADER' ? data.list.canAppointLeader : data.list.canAppoint) && (
                            <button type="button" className="btn ghost sm" onClick={() => setEnding(ending === r.id ? null : r.id)}>{t('door.access.end')}</button>
                          )}
                          {ending === r.id && (
                            <EndForm row={r} onDone={() => { setEnding(null); setMessage(t('door.access.ended.done')); reload(); }} />
                          )}
                        </li>
                      ))}
                      {g.vacant.map((v) => (
                        <li key={`${v.unitId}|${v.office}`} className="seat vacant">
                          <span className="seat-avatar" aria-hidden="true">+</span>
                          <span className="seat-main">
                            <small className="seat-office">{t(`door.office.${v.office}` as const)}</small>
                            <strong>{t('door.access.vacancies.empty')}</strong>
                          </span>
                          {canAct && <button type="button" className="btn sm" onClick={() => open({ unitId: v.unitId, office: v.office })}>{t('door.access.vacancies.fill')}</button>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            {canAct && (
              <SidePanel open={formOpen} title={t('door.access.form.title')} purpose={t('door.access.appointments.intro')} onClose={() => setFormOpen(false)}>
                <AppointForm
                  key={prefill ? `${prefill.unitId}|${prefill.office}` : 'blank'}
                  units={units}
                  isLeader={data.list.canAppoint}
                  isAdministrator={data.list.canAppointLeader}
                  prefill={prefill}
                  onDone={() => {
                    setMessage(t('door.access.appointed'));
                    setPrefill(null);
                    setFormOpen(false);
                    reload();
                  }}
                />
              </SidePanel>
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}

/** Problems that are not an empty seat: two people in one office, too few Administrators. */
function Concerns({ conflicts, admins }: { conflicts: Array<{ unitId: string; unitName: string; office: OfficeCode }>; admins?: { count: number; minimum: number } }) {
  const t = useT();
  const short = !!admins && admins.count < admins.minimum;
  if (conflicts.length === 0 && !short) return null;
  return (
    <div className="panel door-attention" role="region" aria-label={t('door.access.vacancies.title')}>
      {short && <p className="door-warn">{t('door.access.vacancies.admins', { count: String(admins?.count ?? 0), minimum: String(admins?.minimum ?? 0) })}</p>}
      {conflicts.map((c) => (
        <p key={`${c.unitId}|${c.office}`} className="door-warn">{t('door.access.vacancies.conflict', { office: t(`door.office.${c.office}` as const), unit: c.unitName })}</p>
      ))}
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
