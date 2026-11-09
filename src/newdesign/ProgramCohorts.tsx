import { useState } from 'react';
import { closeCohort, fetchCohorts, setCohortEnrolled, startCohort, type CohortsView, type PlanDetail } from '../api/frontDoorApi';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { SidePanel } from './kit';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';

type Ask = 'start' | 'close' | null;
const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/** The cohorts of a cohort-based program: the one running now, how it is going, and the ones behind. */
export function ProgramCohorts({ p, onChange }: { p: PlanDetail; onChange: () => void }) {
  const t = useT();
  const load = useLoad(() => fetchCohorts(p.id), `cohorts|${p.id}`);
  const [view, setView] = useState<CohortsView | null>(null);
  const v = view ?? load.data;
  const [ask, setAsk] = useState<Ask>(null);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [target, setTarget] = useState('');
  const [budget, setBudget] = useState('');
  const [graduated, setGraduated] = useState('');
  const [notes, setNotes] = useState('');
  const [enrolled, setEnrolled] = useState<string | null>(null);
  const [error, setError] = useState('');

  const go = async (job: () => Promise<CohortsView>, after?: () => void) => {
    setError('');
    try {
      setView(await job());
      after?.();
      onChange();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  if (!v) return <LoadState loading={load.loading} failed={load.failed} retry={load.reload}><span /></LoadState>;
  const cur = v.current;
  const openStart = () => { setName(''); setStartsOn(''); setEndsOn(''); setTarget(v.pattern.target ? String(v.pattern.target) : ''); setBudget(''); setError(''); setAsk('start'); };
  return (
    <>
      <div className="panel" aria-label={t('door.co.current')}>
        <h3>{t('door.co.current')}</h3>
        {cur ? (
          <>
            <p><strong>{cur.name}</strong> · {cur.startsOn} → {cur.endsOn}{cur.ended && <span className="door-error"> · {t('door.co.ended')}</span>}</p>
            <div className="stat-tiles">
              <div className="stat-tile"><span className="muted">{t('door.co.enrolled')}</span><strong>{cur.enrolled}{cur.target ? ` / ${cur.target}` : ''}</strong></div>
              <div className="stat-tile"><span className="muted">{t('door.co.progress')}</span><strong>{cur.progress}%</strong></div>
              {v.hasMoney && <div className="stat-tile"><span className="muted">{t('door.co.budget')}</span><strong>{formatRwf(cur.spent)} / {formatRwf(cur.budget)}</strong></div>}
            </div>
            <progress max={100} value={cur.progress} aria-label={t('door.co.progress')} />
            {v.canManage && (
              <div className="door-row">
                <TextField label={t('door.co.enrolled')} name="co-enrolled" inputMode="numeric" value={enrolled ?? String(cur.enrolled)} onChange={(e) => setEnrolled(e.target.value)} />
                <button type="button" className="btn secondary sm" disabled={enrolled === null || num(enrolled) === cur.enrolled} onClick={() => void go(() => setCohortEnrolled(p.id, cur.id, num(enrolled ?? '0')), () => setEnrolled(null))}>{t('door.co.saveEnrolled')}</button>
                <button type="button" className="btn" onClick={() => { setGraduated(String(cur.enrolled)); setNotes(''); setError(''); setAsk('close'); }}>{t('door.co.close')}</button>
              </div>
            )}
          </>
        ) : (
          <p className="muted">{t('door.co.none')}{v.pattern.frequency && ` ${t('door.co.next', { pattern: [v.pattern.frequency, v.pattern.duration].filter(Boolean).join(' · ') })}`}</p>
        )}
        {v.canStart && <button type="button" className="btn" onClick={openStart}>{t('door.co.start')}</button>}
        {error && !ask && <p className="door-error" role="alert">{error}</p>}
      </div>

      {v.past.length > 0 && (
        <div className="panel">
          <div className="door-table-wrap">
            <table className="door-table door-stack">
              <caption className="muted">{t('door.co.past')}</caption>
              <thead><tr><th scope="col">{t('door.co.col.cohort')}</th><th scope="col">{t('door.co.col.dates')}</th><th scope="col">{t('door.co.enrolled')}</th><th scope="col">{t('door.co.graduated')}</th></tr></thead>
              <tbody>
                {v.past.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{c.name}</th>
                    <td data-label={t('door.co.col.dates')}>{c.startsOn} → {c.endsOn}</td>
                    <td data-label={t('door.co.enrolled')}>{c.enrolled}</td>
                    <td data-label={t('door.co.graduated')}>{c.graduated ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SidePanel open={ask === 'start'} title={t('door.co.start')} purpose={t('door.co.startPurpose')} onClose={() => setAsk(null)} saveLabel={t('door.co.start')} canSave={!!name.trim() && !!startsOn && !!endsOn} onSave={() => void go(() => startCohort(p.id, { name: name.trim(), startsOn, endsOn, target: num(target) || null, budget: v.hasMoney ? num(budget) : 0 }), () => setAsk(null))}>
        <div className="door-form">
          <TextField label={`${t('door.co.name')} *`} name="co-name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label={`${t('door.ac.start')} *`} name="co-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          <TextField label={`${t('door.ac.end')} *`} name="co-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          <TextField label={t('door.ac.cohort.target')} name="co-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
          {v.hasMoney && (
            <>
              <TextField label={t('door.co.budget')} name="co-budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <p className="muted">{t('door.co.unallocated', { amount: formatRwf(v.unallocated) })}</p>
            </>
          )}
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>
      <SidePanel open={ask === 'close'} title={t('door.co.close')} purpose={t('door.co.closePurpose')} onClose={() => setAsk(null)} saveLabel={t('door.co.close')} canSave={graduated !== ''} onSave={() => cur && void go(() => closeCohort(p.id, cur.id, { graduated: num(graduated), notes: notes.trim() || null }), () => setAsk(null))}>
        <div className="door-form">
          <TextField label={`${t('door.co.graduated')} *`} name="co-grad" inputMode="numeric" value={graduated} onChange={(e) => setGraduated(e.target.value)} />
          <TextAreaField label={t('door.ar.note')} name="co-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {v.hasMoney && cur && <p className="muted">{t('door.co.returnNote', { amount: formatRwf(Math.max(0, cur.budget - cur.spent)) })}</p>}
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>
    </>
  );
}
