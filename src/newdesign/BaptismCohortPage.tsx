import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchP360Cohorts, recordBaptismCohort } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { p360ErrorKey } from './person360';
import { useLoad } from './useLoad';

/** Baptism is usually done in a programme: pick the cohort, tick who was baptised, set the day. */
export function BaptismCohortPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const load = useLoad(fetchP360Cohorts, 'p360-cohorts');
  const [programId, setProgramId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [place, setPlace] = useState('');
  const [by, setBy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const cohort = load.data?.find((c) => c.id === programId);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!programId || picked.size === 0 || !date) return setError(t('door.p360.err.input'));
    setError('');
    try {
      setResult(await recordBaptismCohort({ programId, date, place: place.trim() || undefined, baptisedBy: by.trim() || undefined, personIds: [...picked] }));
      setPicked(new Set());
      load.reload();
    } catch (err) {
      setError(t(p360ErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <div className="door-block">
      <Link className="btn ghost sm door-back" to={`/s/${systemId}/people`}>
        {t('door.people.back')}
      </Link>
      <h2>{t('door.p360.cohort.title')}</h2>
      <p className="muted">{t('door.p360.cohort.intro')}</p>
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {(load.data ?? []).length === 0 ? (
          <EmptyState title={t('door.p360.cohort.none')} detail={t('door.p360.cohort.noneDetail')} />
        ) : (
          <form className="panel door-form" onSubmit={submit} noValidate>
            <SelectField label={t('door.p360.cohort.pick')} name="bc-prog" value={programId} onChange={(e) => { setProgramId(e.target.value); setPicked(new Set()); setResult(null); }}>
              <option value="">{t('door.gov.meeting.choose')}</option>
              {load.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.cohortLabel ? ` · ${c.cohortLabel}` : ''}
                </option>
              ))}
            </SelectField>
            {cohort && (
              <fieldset className="door-list">
                <legend>{t('door.p360.cohort.learners')}</legend>
                {cohort.learners.map((l) => (
                  <label key={l.personId} className="door-check">
                    <input type="checkbox" checked={picked.has(l.personId)} disabled={l.baptised} onChange={() => toggle(l.personId)} />
                    {l.name} {l.baptised && <span className="door-chip">{t('door.p360.cohort.already')}</span>}
                  </label>
                ))}
              </fieldset>
            )}
            <TextField label={t('door.p360.f.date')} name="bc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <TextField label={t('door.p360.f.place')} name="bc-place" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} />
            <TextField label={t('door.p360.f.baptisedBy')} name="bc-by" value={by} maxLength={120} onChange={(e) => setBy(e.target.value)} />
            {error && (
              <p className="door-error" role="alert">
                {error}
              </p>
            )}
            {result && <p role="status">{t('door.p360.cohort.done', { created: String(result.created), skipped: String(result.skipped) })}</p>}
            <button type="submit" className="btn" disabled={picked.size === 0}>
              {t('door.p360.cohort.record', { count: String(picked.size) })}
            </button>
          </form>
        )}
      </LoadState>
    </div>
  );
}
