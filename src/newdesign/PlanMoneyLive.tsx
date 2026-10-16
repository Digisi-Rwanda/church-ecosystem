import { useState } from 'react';
import { confirmRevenue, finalizeSettlement, removeRevenue, type ActivityMoney, type PlanDetail } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { bucketName, potTitle, purposeName } from './fundLabels';
import { errorCode } from './governance';
import { StatusChip, SidePanel } from './kit';
import { categoryKey, formatRwf } from './money';
import { planErrorKey } from './plans';
import { AmendForm, CyclePanel, PendingAmendment, SpendingVsPlan } from './PlanAmend';
import { LedgerPanel, LogExpensePanel, LogRevenuePanel } from './PlanModals';
import { FundraisingLine } from './PlanSettle';
import { BurnPanel, PhaseTable } from './PlanViews';

/** The Money tab once an activity is approved: what was approved, what is spent, what is left; the set-aside sources (read-only); and the actions of the people who work with the money. */
export function PlanMoneyLive({ p, m, onChange }: { p: PlanDetail; m: ActivityMoney; onChange: (next?: ActivityMoney) => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [modal, setModal] = useState<'expense' | 'late' | 'revenue' | 'change' | 'ledger' | null>(null);
  const [error, setError] = useState('');
  const spent = m.actual;
  const remaining = Math.max(0, m.planned - spent);
  const over = Math.max(0, spent - m.planned);
  const f = m.fundraising;
  const s = m.settlement;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso));
  const go = async (job: () => Promise<unknown>, after?: () => void) => {
    setError('');
    try {
      const next = await job();
      after?.();
      onChange(next && typeof next === 'object' && 'planId' in (next as object) ? (next as ActivityMoney) : undefined);
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const done = () => { setModal(null); onChange(); };
  const returned = s?.returns ?? [];

  return (
    <div className="panel">
      <h3>{t('door.pm.title')}</h3>
      <div className="stat-tiles" aria-label={t('door.pm.title')}>
        <div className="stat-tile"><span className="muted">{t('door.pm.sum.approved')}</span><strong>{formatRwf(m.planned)}</strong></div>
        <div className="stat-tile"><span className="muted">{t('door.pm.sum.spent')}</span><strong>{formatRwf(spent)}</strong></div>
        <div className="stat-tile"><span className="muted">{t('door.pm.sum.remaining')}</span><strong>{formatRwf(remaining)}</strong></div>
      </div>
      {over > 0 && <p className="door-error" role="status">{t('door.pm.sum.over', { amount: formatRwf(over) })}</p>}
      <FundraisingLine m={m} />
      {p.suspension && <p className="door-error" role="status">{t('door.plan.suspended', { name: p.suspension.byName, note: p.suspension.note })}</p>}
      {error && <p className="door-error" role="alert">{error}</p>}
      <div className="door-row">
        {m.canLogExpense && <button type="button" className="btn" onClick={() => setModal('expense')}>{t('door.pm.btn.expense')}</button>}
        {f?.canLogRevenue && <button type="button" className="btn" onClick={() => setModal('revenue')}>{t('door.pm.btn.revenue')}</button>}
        {m.canRequestAmendment && <button type="button" className="btn secondary" onClick={() => setModal('change')}>{t('door.pm.amend.request')}</button>}
        <button type="button" className="btn ghost" onClick={() => setModal('ledger')}>{t('door.pm.ledger')}</button>
      </div>
      {m.pendingAmendment && <PendingAmendment p={p} a={m.pendingAmendment} m={m} go={go as never} />}
      <BurnPanel m={m} />
      <PhaseTable m={m} />

      <h4>{t('door.pm.spending')}</h4>
      <div className="door-table-wrap">
        <table className="door-table door-stack">
          <thead>
            <tr>
              <th scope="col">{t('door.pm.for')}</th>
              <th scope="col">{t('door.ac.category')}</th>
              <th scope="col">{t('door.pm.col.planned')}</th>
              <th scope="col">{t('door.pm.col.spent')}</th>
              <th scope="col">{t('door.pm.col.remaining')}</th>
            </tr>
          </thead>
          <tbody>
            {m.lines.map((l) => (
              <tr key={l.id}>
                <th scope="row">{l.title}</th>
                <td data-label={t('door.ac.category')}>{l.category ? t(categoryKey(l.category) as 'door.money.cat.OTHER') : '—'}</td>
                <td data-label={t('door.pm.col.planned')}>{formatRwf(l.amount)}</td>
                <td data-label={t('door.pm.col.spent')}>{formatRwf(l.spent)}</td>
                <td data-label={t('door.pm.col.remaining')}>{formatRwf(l.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>{t('door.ac.aside')}</h4>
      <p className="muted">{t('door.pm.asideLocked')}</p>
      <ul className="door-list">
        {m.sources.map((x) => {
          const pot = m.pots.find((y) => y.id === x.potId);
          return <li key={x.potId}>{pot ? bucketName(t, pot) : `${potTitle(t, x.kind)} · ${purposeName(t, { purposeKind: x.code.startsWith('A:') ? 'ACTIVITY' : x.code.startsWith('C:') ? 'CATEGORY' : 'UNRESTRICTED', label: x.code.slice(2) })}`} · <strong>{formatRwf(x.amount)}</strong></li>;
        })}
      </ul>

      {f && (
        <>
          <h4>{t('door.fr.title')}</h4>
          <p>{t('door.fr.received', { total: formatRwf(f.revenueTotal), target: formatRwf(f.target) })}</p>
          {f.revenueWaiting > 0 && <p className="muted">{t('door.fr.waiting', { amount: formatRwf(f.revenueWaiting) })}</p>}
          {f.outcome && f.net !== null && (
            <p className={f.outcome === 'DEFICIT' ? 'door-error' : 'muted'}>
              <StatusChip tone={f.outcome === 'DEFICIT' ? 'danger' : 'success'}>{t(`door.fr.outcome.${f.outcome}` as 'door.fr.outcome.PROFIT')}</StatusChip>{' '}
              {t(f.outcome === 'DEFICIT' ? 'door.fr.deficitNote' : 'door.fr.profitNote', { amount: formatRwf(Math.abs(f.net)) })}
            </p>
          )}
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
        </>
      )}

      {s && (
        <div className="panel-inset">
          <h4>{t('door.fr.settle.title')}</h4>
          <div className="stat-tiles">
            <div className="stat-tile"><span className="muted">{t('door.ac.totalAside')}</span><strong>{formatRwf(s.earmarked)}</strong></div>
            <div className="stat-tile"><span className="muted">{t('door.pm.sum.spent')}</span><strong>{formatRwf(s.spent)}</strong></div>
            <div className="stat-tile"><span className="muted">{t('door.pm.settle.unspent')}</span><strong>{formatRwf(Math.max(0, s.earmarked - s.spent))}</strong></div>
          </div>
          {s.settled ? (
            <p>
              <StatusChip tone={s.closedWithLateAdjustment ? 'warn' : 'success'}>{t(s.closedWithLateAdjustment ? 'door.fr.settle.closedLate' : 'door.fr.settle.closed')}</StatusChip>
              {s.result && s.result.released > 0 ? ` ${t('door.pm.settle.returned', { amount: formatRwf(s.result.released) })}` : ''}
            </p>
          ) : (
            <p className="muted">{t(s.open ? 'door.fr.settle.open' : 'door.fr.settle.lapsed', { due: day(s.due), days: s.days })}</p>
          )}
          {returned.length > 0 && (
            <>
              <h5>{t(s.settled ? 'door.pm.settle.returnedTo' : 'door.pm.settle.returnsTo')}</h5>
              <ul className="door-list">
                {returned.map((r) => <li key={`${r.kind}-${r.code}`}>{potTitle(t, r.kind === 'CONTRIBUTION' ? 'CONTRIBUTION' : 'DONATION')} · {purposeName(t, { purposeKind: r.code.startsWith('A:') ? 'ACTIVITY' : r.code.startsWith('C:') ? 'CATEGORY' : 'UNRESTRICTED', label: r.code.slice(2) })} · <strong>{formatRwf(r.amount)}</strong></li>)}
              </ul>
            </>
          )}
          <div className="door-row">
            {s.canLateInvoice && <button type="button" className="btn secondary" onClick={() => setModal('late')}>{t('door.pm.btn.late')}</button>}
            {s.canFinalize && <button type="button" className="btn" onClick={() => void go(() => finalizeSettlement(p.id))}>{t('door.fr.settle.finalize')}</button>}
          </div>
          {s.settled && s.canLateInvoice && <p className="muted">{t('door.pm.late.after')}</p>}
        </div>
      )}

      <SpendingVsPlan m={m} />
      <CyclePanel key={`${m.cycle.kind}|${m.cycle.explicit}|${m.status}`} p={p} m={m} onChange={(next) => onChange(next)} />

      {modal === 'expense' && <LogExpensePanel p={p} m={m} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'late' && <LogExpensePanel p={p} m={m} late onClose={() => setModal(null)} onDone={done} />}
      {modal === 'revenue' && <LogRevenuePanel p={p} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'ledger' && <LedgerPanel p={p} onClose={() => setModal(null)} />}
      <SidePanel open={modal === 'change'} title={t('door.pm.amend.request')} onClose={() => setModal(null)}>
        {modal === 'change' && <AmendForm p={p} m={m} go={go as never} onCancel={() => setModal(null)} />}
      </SidePanel>
    </div>
  );
}
