import { useState } from 'react';
import { finalizeSettlement, type ActivityMoney, type PlanDetail } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { StatusChip } from './kit';

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
