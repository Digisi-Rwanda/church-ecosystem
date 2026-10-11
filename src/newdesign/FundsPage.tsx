import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchFunds, fetchMoneyQueue, fetchTransfersReview, markTransferReviewed, incomeCancel, incomeReceived, recordIncome, type FundsView } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';
import { PageHeader, StatusChip } from './kit';

type Kind = 'OTHER' | 'CONTRIBUTION' | 'DONATION';

/** Funds: the unit's pots with secured, pledged, set-aside and available money, the income the treasurer records, and the figures waiting for a check. */
export function FundsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const allowed = lettersFor(capabilities, systemId, 'money').length > 0;
  const funds = useLoad(() => (allowed ? fetchFunds(systemId) : Promise.reject(new Error('no'))), `funds|${systemId}|${allowed}`);
  const queue = useLoad(fetchMoneyQueue, 'money-queue');
  const review = useLoad(fetchTransfersReview, 'transfers-review');
  const [kind, setKind] = useState<Kind>('OTHER');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'PLEDGED' | 'SECURED'>('SECURED');
  const [error, setError] = useState('');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;

  const act = async (job: () => Promise<unknown>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      funds.reload();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.funds.err.saveFailed'));
    }
  };
  const n = Math.floor(Number(amount) || 0);
  const mineChecks = (queue.data?.items ?? []).filter((x) => x.systemId === systemId);

  const view = (d: FundsView) => (
    <>
      <div className="door-row">
        <StatusChip tone="success">{t('door.funds.secured')}: {formatRwf(d.totals.secured)}</StatusChip>
        <StatusChip tone="info">{t('door.funds.earmarked')}: {formatRwf(d.totals.earmarked)}</StatusChip>
        <StatusChip tone="success">{t('door.funds.available')}: {formatRwf(d.totals.available)}</StatusChip>
        <StatusChip tone="warn">{t('door.funds.pledged')}: {formatRwf(d.totals.pledged)}</StatusChip>
      </div>
      <div className="panel">
        <h3>{t('door.funds.pots')}</h3>
        <ul className="door-list">
          {d.pots.map((p) => (
            <li key={p.id}>
              <strong>{p.id === 'OTHER:POOL' ? t('door.funds.pool') : p.name}</strong> · {t('door.funds.secured')} {formatRwf(p.secured)} · {t('door.funds.earmarked')} {formatRwf(p.earmarked)} · {t('door.funds.available')} {formatRwf(p.available)}
              {p.pledged > 0 && <span className="muted"> · {t('door.funds.pledged')} {formatRwf(p.pledged)}</span>}
            </li>
          ))}
        </ul>
        <p className="muted">{t('door.funds.pledgedNote')}</p>
      </div>
      {d.canRecord && (
        <div className="panel door-form">
          <h3>{t('door.funds.record')}</h3>
          <SelectField label={t('door.funds.kind')} name="fd-kind" value={kind} onChange={(e) => { setKind(e.target.value as Kind); setCode(''); if (e.target.value !== 'OTHER') setStatus('PLEDGED'); }}>
            <option value="OTHER">{t('door.funds.kind.OTHER')}</option>
            {d.ownTypes.length > 0 && <option value="CONTRIBUTION">{t('door.funds.kind.CONTRIBUTION')}</option>}
            <option value="DONATION">{t('door.funds.kind.DONATION')}</option>
          </SelectField>
          {kind === 'OTHER' && <TextField label={t('door.funds.code')} name="fd-code" placeholder={t('door.funds.code.ph')} value={code} onChange={(e) => setCode(e.target.value)} />}
          {kind === 'CONTRIBUTION' && (
            <SelectField label={t('door.funds.type')} name="fd-type" value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="" />
              {d.ownTypes.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </SelectField>
          )}
          <TextField label={t('door.funds.label')} name="fd-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <TextField label={t('door.funds.amount')} name="fd-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <SelectField label={t('door.funds.status')} name="fd-status" value={status} onChange={(e) => setStatus(e.target.value as 'PLEDGED' | 'SECURED')}>
            <option value="SECURED" disabled={kind !== 'OTHER'}>{t('door.funds.status.SECURED')}</option>
            <option value="PLEDGED">{t('door.funds.status.PLEDGED')}</option>
          </SelectField>
          {kind !== 'OTHER' && <p className="muted">{t('door.funds.onlyOther')}</p>}
          {error && <p className="door-error" role="alert">{error}</p>}
          <button
            type="button"
            className="btn"
            disabled={!label.trim() || n < 1 || (kind === 'CONTRIBUTION' && !code)}
            onClick={() => void act(() => recordIncome({ systemId, kind, code: code || undefined, label: label.trim(), amount: n, status }), () => { setLabel(''); setAmount(''); setCode(''); })}
          >
            {t('door.funds.save')}
          </button>
        </div>
      )}
      <div className="panel">
        <h3>{t('door.funds.records')}</h3>
        {d.records.length === 0 ? (
          <p className="muted">{t('door.funds.none')}</p>
        ) : (
          <ul className="door-list">
            {d.records.map((r) => (
              <li key={r.id}>
                <strong>{r.label}</strong> · {formatRwf(r.amount)} · <StatusChip tone={r.status === 'PLEDGED' ? 'warn' : 'success'}>{t(`door.funds.status.${r.status}` as 'door.funds.status.PLEDGED')}</StatusChip>{' '}
                {d.canRecord && r.status === 'PLEDGED' && (
                  <>
                    <button type="button" className="btn secondary sm" onClick={() => void act(() => incomeReceived(r.id))}>{t('door.funds.received')}</button>{' '}
                    <button type="button" className="btn ghost sm" onClick={() => void act(() => incomeCancel(r.id))}>{t('door.funds.cancel')}</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <section className="door-block" aria-labelledby="door-funds-title">
      <PageHeader id="door-funds-title" title={t('door.funds.title')} purpose={t('door.funds.purpose')} />
      {mineChecks.length > 0 && (
        <div className="panel">
          <h3>{t('door.money.queue.title')}</h3>
          <ul className="door-list">
            {mineChecks.map((x) => (
              <li key={x.id}>
                <strong>{x.title}</strong> · {formatRwf(x.planned)} <Link className="btn ghost sm" to={`/s/${x.systemId}/work/plans/${x.id}`}>{t('door.money.queue.open')}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(review.data?.items ?? []).length > 0 && (
        <div className="panel">
          <h3>{t('door.pm.review.title')}</h3>
          <ul className="door-list">
            {(review.data?.items ?? []).map((x) => (
              <li key={x.id}>
                <strong>{x.title}</strong> · {formatRwf(x.oldTotal)} → {formatRwf(x.newTotal)} · {x.decidedByName} — {x.justification}{' '}
                <Link className="btn ghost sm" to={`/s/${x.systemId}/work/plans/${x.planId}`}>{t('door.money.queue.open')}</Link>{' '}
                <button type="button" className="btn secondary sm" onClick={() => void markTransferReviewed(x.id).then(() => review.reload())}>{t('door.pm.review.done')}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <LoadState loading={funds.loading} failed={funds.failed} retry={funds.reload}>
        {funds.data && view(funds.data)}
      </LoadState>
    </section>
  );
}
