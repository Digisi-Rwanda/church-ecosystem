import { useState } from 'react';
import { doAnnualReview, fetchActivityMoney, fundNextYear, type AnnualReviewView, type PlanDetail, type ReviewDecision2 } from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { bucketName } from './fundLabels';
import { errorCode } from './governance';
import { Segmented } from './kit';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { fetchAnnualReview } from '../api/frontDoorApi';
import { useLoad } from './useLoad';

type Row = { potId: string; amount: string };
const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/** The yearly review of a program: the Church Leader's decision, then the President's funding of the year that follows, and the years behind. */
export function AnnualReview({ p, onChange }: { p: PlanDetail; onChange: () => void }) {
  const t = useT();
  const load = useLoad(() => fetchAnnualReview(p.id), `ar|${p.id}`);
  const [view, setView] = useState<AnnualReviewView | null>(null);
  const v = view && view.year >= (load.data?.year ?? 0) ? view : load.data;
  const [decision, setDecision] = useState<ReviewDecision2 | ''>('');
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [attendance, setAttendance] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const money = useLoad(() => (v?.canFund ? fetchActivityMoney(p.id) : Promise.resolve(null)), `ar-money|${p.id}|${v?.needsFunding?.year ?? ''}|${v?.canFund ? 1 : 0}`);
  const pots = (money.data?.pots ?? []).filter((x) => x.available > 0 || rows.some((r) => r.potId === x.id));

  const go = async (job: () => Promise<AnnualReviewView>) => {
    setBusy(true);
    setError('');
    try {
      setView(await job());
      setDecision('');
      setNext('');
      setNote('');
      setRows([]);
      onChange();
      load.reload();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!v) return <LoadState loading={load.loading} failed={load.failed} retry={load.reload}><span /></LoadState>;
  const chosen = decision || (v.options[0] ?? '');
  const carries = chosen === 'CONTINUE' || chosen === 'PREPARE';
  const need = v.needsFunding;
  const aside = rows.reduce((n, r) => n + num(r.amount), 0);
  return (
    <div className="panel" aria-label={t('door.ar.title', { year: v.year })}>
      <h3>{t('door.ar.title', { year: v.year })}</h3>
      {v.hasMoney && (
        <dl className="door-facts">
          <div><dt className="muted">{t('door.ar.budget')}</dt><dd>{formatRwf(v.actuals.budget)}</dd></div>
          <div><dt className="muted">{t('door.ar.spent')}</dt><dd>{formatRwf(v.actuals.spent)}</dd></div>
          <div><dt className="muted">{v.actuals.overspent > 0 ? t('door.ar.overspent') : t('door.ar.unspent')}</dt><dd>{formatRwf(v.actuals.overspent > 0 ? v.actuals.overspent : v.actuals.unspent)}</dd></div>
          {v.yearsRemaining !== null && <div><dt className="muted">{t('door.pk.yearsRemaining')}</dt><dd>{v.yearsRemaining}</dd></div>}
        </dl>
      )}
      {need && <p role="status"><strong>{t('door.ar.needsFunding', { year: need.year, amount: formatRwf(need.amount) })}</strong></p>}
      {need && v.canFund && (
        <div className="panel-inset">
          <h4>{t('door.ar.fundTitle', { year: need.year })}</h4>
          <p className="muted">{t('door.ar.fundHint')}</p>
          {rows.map((r, i) => (
            <div className="door-row" key={`${r.potId}-${i}`}>
              <SelectField label={t('door.ac.fund')} name={`ar-pot-${i}`} value={r.potId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, potId: e.target.value } : x)))}>
                {pots.filter((x) => x.id === r.potId || !rows.some((o) => o.potId === x.id)).map((x) => <option key={x.id} value={x.id}>{bucketName(t, x)} — {t('door.funds.available')} {formatRwf(x.available)}</option>)}
              </SelectField>
              <TextField label={t('door.pm.setAside')} name={`ar-amt-${i}`} inputMode="numeric" value={r.amount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t('door.pm.remove')}</button>
            </div>
          ))}
          <div className="door-row">
            {pots.some((x) => !rows.some((r) => r.potId === x.id)) && (
              <button type="button" className="btn secondary sm" onClick={() => setRows([...rows, { potId: pots.find((x) => !rows.some((r) => r.potId === x.id))!.id, amount: rows.length === 0 ? String(need.amount) : '' }])}>{t('door.ac.addAside')}</button>
            )}
            <span className="muted">{t('door.ar.asideOf', { aside: formatRwf(aside), need: formatRwf(need.amount) })}</span>
          </div>
          <button type="button" className="btn" disabled={busy || aside !== need.amount} onClick={() => void go(() => fundNextYear(p.id, rows.map((r) => { const pot = pots.find((x) => x.id === r.potId)!; return { kind: pot.kind, code: pot.code, amount: num(r.amount) }; }).filter((x) => x.amount > 0)))}>
            {t('door.ar.fundGo', { year: need.year })}
          </button>
        </div>
      )}
      {v.canReview && (
        <div className="panel-inset">
          <h4>{t('door.ar.decide')}</h4>
          <Segmented label={t('door.ar.decide')} value={chosen} onChange={(k) => setDecision(k as ReviewDecision2)} items={v.options.map((o) => ({ key: o, label: t(`door.ar.decision.${o}` as 'door.ar.decision.CLOSE') }))} />
          <p className="muted">{t(`door.ar.decision.${chosen}.hint` as 'door.ar.decision.CLOSE.hint')}</p>
          {carries && v.hasMoney && <TextField label={`${t('door.ar.nextBudget')} *`} name="ar-next" inputMode="numeric" value={next} onChange={(e) => setNext(e.target.value)} />}
          {v.kind === 'SEASONAL' && <TextField label={t('door.ar.attendance')} name="ar-attendance" inputMode="numeric" value={attendance} onChange={(e) => setAttendance(e.target.value)} />}
          <TextAreaField label={t('door.ar.note')} name="ar-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          {v.hasMoney && v.actuals.unspent > 0 && <p className="muted">{t('door.ar.returnNote', { amount: formatRwf(v.actuals.unspent) })}</p>}
          <button type="button" className="btn" disabled={busy || !chosen || (carries && v.hasMoney && num(next) <= 0)} onClick={() => void go(() => doAnnualReview(p.id, { decision: chosen as ReviewDecision2, nextBudget: carries && v.hasMoney ? num(next) : null, note: note.trim() || null, attendance: attendance ? num(attendance) : null }))}>
            {t('door.ar.submit')}
          </button>
        </div>
      )}
      {error && <p className="door-error" role="alert">{error}</p>}
      {v.years.length > 0 && (
        <div className="door-table-wrap">
          <table className="door-table door-stack">
            <caption className="muted">{t('door.ar.years')}</caption>
            <thead><tr><th scope="col">{t('door.ar.col.year')}</th><th scope="col">{t('door.ar.budget')}</th><th scope="col">{t('door.ar.spent')}</th><th scope="col">{t('door.ar.returned')}</th>{v.kind === 'SEASONAL' && <th scope="col">{t('door.ar.attendance')}</th>}<th scope="col">{t('door.ar.col.decision')}</th></tr></thead>
            <tbody>
              {v.years.map((y) => (
                <tr key={y.year}>
                  <th scope="row">{y.year}</th>
                  <td data-label={t('door.ar.budget')}>{formatRwf(y.budget)}</td>
                  <td data-label={t('door.ar.spent')}>{y.spent === null ? '—' : formatRwf(y.spent)}</td>
                  <td data-label={t('door.ar.returned')}>{y.returned === null ? '—' : formatRwf(y.returned)}</td>
                  {v.kind === 'SEASONAL' && <td data-label={t('door.ar.attendance')}>{y.attendance ?? '—'}</td>}
                  <td data-label={t('door.ar.col.decision')}>{y.status === 'SKIPPED' ? t('door.ar.decision.SKIP') : y.decision ? t(`door.ar.decision.${y.decision}` as 'door.ar.decision.CLOSE') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
