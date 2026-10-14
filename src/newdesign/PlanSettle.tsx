import { useState } from 'react';
import { confirmRevenue, finalizeSettlement, logRevenue, removeRevenue, type ActivityMoney, type PlanDetail } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { StatusChip } from './kit';

const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

/** "Target minus expenses equals projected net": what a fundraising event is expected to leave for the general pool. */
export function FundraisingLine({ m }: { m: ActivityMoney }) {
  const t = useT();
  const f = m.fundraising;
  if (!f) return null;
  return (
    <p className={f.projectedNet < 0 ? 'door-error' : 'muted'} role="status">
      {t('door.fr.line', { target: formatRwf(f.target), planned: formatRwf(m.planned), net: formatRwf(f.projectedNet) })}
    </p>
  );
}

/** After Done: the open period, the Finalize button for the Treasurer, and the "Closed under budget" result. */
export function SettlementPanel({ p, m, onChange }: { p: PlanDetail; m: ActivityMoney; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [error, setError] = useState('');
  const s = m.settlement;
  if (!s) return null;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso));
  const finalize = async () => {
    setError('');
    try {
      await finalizeSettlement(p.id);
      onChange();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <div>
      <h4>{t('door.fr.settle.title')}</h4>
      {s.settled ? (
        <p>
          <StatusChip tone={s.closedWithLateAdjustment ? 'warn' : 'success'}>{t(s.closedWithLateAdjustment ? 'door.fr.settle.closedLate' : 'door.fr.settle.closed')}</StatusChip>{' '}
          {s.result ? t('door.fr.settle.result', { released: formatRwf(s.result.released), spent: formatRwf(s.result.spent) }) : ''}
        </p>
      ) : (
        <>
          <p className="muted">{t(s.open ? 'door.fr.settle.open' : 'door.fr.settle.lapsed', { due: day(s.due), days: s.days })}</p>
          {s.toRelease > 0 && <p className="muted">{t('door.fr.settle.toRelease', { amount: formatRwf(s.toRelease) })}</p>}
          {s.canFinalize && <button type="button" className="btn" onClick={() => void finalize()}>{t('door.fr.settle.finalize')}</button>}
        </>
      )}
      {error && <p className="door-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Revenue tab of a fundraising event: money received, logged by the Treasurer, and what it leaves once the event is Done. */
export function RevenueTab({ p, m, onChange }: { p: PlanDetail; m: ActivityMoney; onChange: () => void }) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const f = m.fundraising;
  if (!f) return null;
  const go = async (job: () => Promise<unknown>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      onChange();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <div className="panel">
      <h3>{t('door.fr.title')}</h3>
      <FundraisingLine m={m} />
      <p>{t('door.fr.received', { total: formatRwf(f.revenueTotal), target: formatRwf(f.target) })}</p>
      {f.revenueWaiting > 0 && <p className="muted">{t('door.fr.waiting', { amount: formatRwf(f.revenueWaiting) })}</p>}
      {f.outcome && f.net !== null && (
        <p className={f.outcome === 'DEFICIT' ? 'door-error' : 'muted'}>
          <StatusChip tone={f.outcome === 'DEFICIT' ? 'danger' : 'success'}>{t(`door.fr.outcome.${f.outcome}` as 'door.fr.outcome.PROFIT')}</StatusChip>{' '}
          {t(f.outcome === 'DEFICIT' ? 'door.fr.deficitNote' : 'door.fr.profitNote', { amount: formatRwf(Math.abs(f.net)) })}
        </p>
      )}
      {error && <p className="door-error" role="alert">{error}</p>}
      {f.revenue.length === 0 ? <p className="muted">{t('door.fr.none')}</p> : (
        <ul className="door-list">
          {f.revenue.map((r) => (
            <li key={r.id}>
              <strong>{r.label}</strong> · {formatRwf(r.amount)} <span className="muted">{r.receivedOn}</span>{' '}
              {r.status === 'PENDING' && <StatusChip tone="warn">{t('door.fr.pending')}</StatusChip>}{' '}
              {r.canConfirm && <button type="button" className="btn sm" onClick={() => void go(() => confirmRevenue(p.id, r.id))}>{t('door.fr.confirm')}</button>}{' '}
              {r.canRemove && <button type="button" className="btn ghost sm" onClick={() => void go(() => removeRevenue(p.id, r.id))}>{t('door.pm.remove')}</button>}
            </li>
          ))}
        </ul>
      )}
      {f.canLogRevenue ? (
        <div className="door-form">
          <p className="muted">{t('door.fr.hint')}</p>
          <TextField label={t('door.fr.label')} name="fr-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <TextField label={t('door.pm.amount')} name="fr-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="btn secondary sm" disabled={!label.trim() || num(amount) < 1} onClick={() => void go(() => logRevenue(p.id, { label: label.trim(), amount: num(amount) }), () => { setLabel(''); setAmount(''); })}>
            {t('door.fr.add')}
          </button>
        </div>
      ) : (
        <p className="muted">{t('door.fr.readOnly')}</p>
      )}
    </div>
  );
}
