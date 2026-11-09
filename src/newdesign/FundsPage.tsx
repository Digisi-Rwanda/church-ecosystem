import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  fetchFunds, fetchMoneyQueue, fetchTransfersReview, markTransferReviewed, incomeApprove, incomeCancel, incomeDecline, incomeReceived, recordIncome,
  type FundPot, type FundsView, type IncomeRecordView, type SourceTag,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';
import { PageHeader, SidePanel, StatusChip, Tabs } from './kit';
import { ContributionsPage } from './ContributionsPage';
import { PurposeField } from './PurposeField';
import { potTitle, purposeName } from './fundLabels';

const TAGS: SourceTag[] = ['DONATION', 'CONTRIBUTION', 'GRANT', 'SPONSOR', 'OTHER'];
type Tab = 'pots' | 'income' | 'contributions';
const today = () => new Date().toISOString().slice(0, 10);
const tone = (st: string) => (st === 'SECURED' || st === 'FULFILLED' ? 'success' : st === 'AWAITING' ? 'info' : st === 'PLEDGED' ? 'warn' : 'neutral');

const FUND_ERRORS: Record<string, string> = {
  BAD_PURPOSE: 'door.funds.err.purpose', OWN_ENTRY: 'door.funds.err.ownEntry', REASON_REQUIRED: 'door.funds.err.reason', AMOUNT: 'door.funds.err.badAmount',
};

/** Funds: Pots (what is held, by purpose), Income (what came in and its state) and Contributions (the members' lists that feed the Contribution pot). */
export function FundsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (['pots', 'income', 'contributions'].includes(params.get('tab') ?? '') ? params.get('tab') : 'pots') as Tab;
  const { capabilities } = useFrontDoor();
  const allowed = lettersFor(capabilities, systemId, 'money').length > 0;
  const funds = useLoad(() => (allowed ? fetchFunds(systemId) : Promise.reject(new Error('no'))), `funds|${systemId}|${allowed}`);
  const queue = useLoad(fetchMoneyQueue, 'money-queue');
  const review = useLoad(fetchTransfersReview, 'transfers-review');
  const [adding, setAdding] = useState(false);
  const [declining, setDeclining] = useState<IncomeRecordView | null>(null);
  const [why, setWhy] = useState('');
  const [tag, setTag] = useState<SourceTag>('DONATION');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [status, setStatus] = useState<'PLEDGED' | 'SECURED'>('SECURED');
  const [on, setOn] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;

  const act = async (job: () => Promise<unknown>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      funds.reload();
    } catch (err) {
      const code = errorCode(err);
      setError(t((FUND_ERRORS[code ?? ''] ?? planErrorKey(code)) as 'door.funds.err.saveFailed'));
    }
  };
  const n = Math.floor(Number(amount) || 0);
  const mineChecks = (queue.data?.items ?? []).filter((x) => x.systemId === systemId);
  const potOf = (g: SourceTag) => (g === 'CONTRIBUTION' ? 'CONTRIBUTION' : 'DONATION');
  const reset = () => { setLabel(''); setAmount(''); setPurpose(''); setNote(''); setOn(today()); setAdding(false); setError(''); };

  const bucketRow = (p: FundPot) => (
    <tr key={p.id}>
      <th scope="row">{purposeName(t, p)}</th>
      <td data-label={t('door.funds.tile.secured')}>{formatRwf(p.secured)}</td>
      <td data-label={t('door.funds.tile.reserved')}>{formatRwf(p.reserved)}</td>
      <td data-label={t('door.funds.tile.spent')}>{formatRwf(p.spent)}</td>
      <td data-label={t('door.funds.available')}><strong>{formatRwf(p.available)}</strong></td>
      <td data-label={t('door.funds.waiting')}>
        {p.awaiting > 0 && <StatusChip tone="info">{t('door.funds.awaiting')}: {formatRwf(p.awaiting)}</StatusChip>}{' '}
        {p.pledged > 0 && <StatusChip tone="warn">{t('door.funds.pledged')}: {formatRwf(p.pledged)}</StatusChip>}
      </td>
    </tr>
  );

  const potsTab = (d: FundsView) => (
    <>
      <div className="stat-tiles" aria-label={t('door.funds.home')}>
        {([['secured', d.totals.secured], ['reserved', d.totals.reserved], ['spent', d.totals.spent], ['available', d.totals.available]] as const).map(([k, v]) => (
          <div key={k} className="stat-tile">
            <span className="muted">{t(`door.funds.tile.${k}` as 'door.funds.tile.secured')}</span>
            <strong>{formatRwf(v)}</strong>
          </div>
        ))}
      </div>
      <p className="muted">{t('door.funds.homeNote')}</p>
      {d.uncovered > 0 && <p className="door-error" role="status">{t('door.funds.uncovered', { amount: formatRwf(d.uncovered) })}</p>}
      {d.groups.map((g) => (
        <section key={g.kind} className="panel" aria-label={potTitle(t, g.kind)}>
          <h3>{potTitle(t, g.kind)}</h3>
          <p className="muted">{t(`door.funds.potHint.${g.kind}` as 'door.funds.potHint.DONATION')}</p>
          <p>
            {t('door.funds.tile.secured')}: <strong>{formatRwf(g.secured)}</strong> · {t('door.funds.tile.reserved')}: <strong>{formatRwf(g.reserved)}</strong> · {t('door.funds.available')}: <strong>{formatRwf(g.available)}</strong>
          </p>
          <div className="door-table-wrap">
            <table className="door-table door-stack">
              <thead>
                <tr>
                  <th scope="col">{t('door.funds.purposeLabel')}</th>
                  <th scope="col">{t('door.funds.tile.secured')}</th>
                  <th scope="col">{t('door.funds.tile.reserved')}</th>
                  <th scope="col">{t('door.funds.tile.spent')}</th>
                  <th scope="col">{t('door.funds.available')}</th>
                  <th scope="col">{t('door.funds.waiting')}</th>
                </tr>
              </thead>
              <tbody>{g.buckets.map(bucketRow)}</tbody>
            </table>
          </div>
        </section>
      ))}
      <p className="muted">{t('door.funds.pledgedNote')}</p>
    </>
  );

  const incomeTab = (d: FundsView) => (
    <div className="panel">
      <h3>{t('door.funds.records')}</h3>
      {error && !adding && <p className="door-error" role="alert">{error}</p>}
      {d.records.length === 0 ? (
        <p className="muted">{t('door.funds.none')}</p>
      ) : (
        <div className="door-table-wrap">
          <table className="door-table door-stack">
            <thead>
              <tr>
                <th scope="col">{t('door.funds.source')}</th>
                <th scope="col">{t('door.funds.label')}</th>
                <th scope="col">{t('door.funds.goesTo')}</th>
                <th scope="col">{t('door.funds.amount')}</th>
                <th scope="col">{t('door.funds.status')}</th>
                <th scope="col">{t('door.funds.date')}</th>
                <th scope="col"><span className="sr-only">{t('door.funds.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {d.records.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{t(`door.funds.tag.${r.sourceTag}` as 'door.funds.tag.OTHER')}</th>
                  <td data-label={t('door.funds.label')}>{r.label}{r.note && <span className="muted"> — {r.note}</span>}</td>
                  <td data-label={t('door.funds.goesTo')}>{potTitle(t, r.kind)} · {purposeName(t, r)}</td>
                  <td data-label={t('door.funds.amount')}>{formatRwf(r.amount)}</td>
                  <td data-label={t('door.funds.status')}><StatusChip tone={tone(r.status)}>{t(`door.funds.status.${r.status}` as 'door.funds.status.PLEDGED')}</StatusChip></td>
                  <td data-label={t('door.funds.date')}>{r.receivedOn ?? r.expectedOn ?? '—'}</td>
                  <td data-label={t('door.funds.actions')}>
                    {d.canRecord && r.status === 'PLEDGED' && (
                      <>
                        <button type="button" className="btn secondary sm" onClick={() => void act(() => incomeReceived(r.id))}>{t('door.funds.received')}</button>{' '}
                        <button type="button" className="btn ghost sm" onClick={() => void act(() => incomeCancel(r.id))}>{t('door.funds.cancel')}</button>
                      </>
                    )}
                    {r.canApprove && (
                      <>
                        <button type="button" className="btn sm" onClick={() => void act(() => incomeApprove(r.id))}>{t('door.funds.approve')}</button>{' '}
                        <button type="button" className="btn ghost sm" onClick={() => { setWhy(''); setError(''); setDeclining(r); }}>{t('door.funds.decline')}</button>
                      </>
                    )}
                    {r.status === 'AWAITING' && !r.canApprove && <span className="muted">{t('door.funds.waitingPresident')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const view = (d: FundsView) => (
    <>
      <Tabs
        label={t('door.funds.title')}
        value={tab}
        onChange={(k) => setParams(k === 'pots' ? {} : { tab: k }, { replace: true })}
        items={[
          { key: 'pots', label: t('door.funds.tab.pots') },
          { key: 'income', label: t('door.funds.tab.income'), count: d.records.filter((r) => r.canApprove).length || undefined },
          { key: 'contributions', label: t('door.funds.tab.contributions') },
        ]}
      />
      {tab !== 'contributions' && d.canRecord && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => { setError(''); setAdding(true); }}>{t('door.funds.recordBtn')}</button>
        </div>
      )}
      {tab === 'pots' && potsTab(d)}
      {tab === 'income' && incomeTab(d)}
      {tab === 'contributions' && <ContributionsPage embedded />}
      <SidePanel
        open={adding}
        title={t('door.funds.record')}
        purpose={t('door.funds.recordPurpose')}
        onClose={reset}
        saveLabel={t('door.funds.save')}
        canSave={!!label.trim() && n >= 1 && !!on}
        onSave={() => void act(() => recordIncome({ systemId, sourceTag: tag, label: label.trim(), amount: n, purpose: purpose || undefined, status, ...(status === 'SECURED' ? { receivedOn: on } : { expectedOn: on }), note: note.trim() || undefined }), reset)}
      >
        <div className="door-form">
          <SelectField label={t('door.funds.source')} name="fd-tag" value={tag} onChange={(e) => setTag(e.target.value as SourceTag)}>
            {TAGS.map((x) => <option key={x} value={x}>{t(`door.funds.tag.${x}` as 'door.funds.tag.OTHER')}</option>)}
          </SelectField>
          <TextField label={t('door.funds.label')} name="fd-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          <TextField label={t('door.funds.amount')} name="fd-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="muted">{t('door.funds.goesTo')}: <strong>{potTitle(t, potOf(tag))}</strong></p>
          <PurposeField systemId={systemId} value={purpose} onChange={setPurpose} name="fd-purpose" />
          <SelectField label={t('door.funds.status')} name="fd-status" value={status} onChange={(e) => setStatus(e.target.value as 'PLEDGED' | 'SECURED')}>
            <option value="SECURED">{t('door.funds.status.RECEIVED')}</option>
            <option value="PLEDGED">{t('door.funds.status.PLEDGED')}</option>
          </SelectField>
          <TextField label={t(status === 'SECURED' ? 'door.funds.dateReceived' : 'door.funds.dateExpected')} name="fd-date" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
          <TextAreaField label={t('door.funds.note')} name="fd-note" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="muted">{t(tag === 'DONATION' || tag === 'CONTRIBUTION' ? 'door.funds.needsPresident' : 'door.funds.securedAtOnce')}</p>
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>
      <SidePanel
        open={!!declining}
        title={t('door.funds.declineTitle')}
        onClose={() => setDeclining(null)}
        saveLabel={t('door.funds.decline')}
        canSave={!!why.trim()}
        onSave={() => void act(() => incomeDecline(declining!.id, why.trim()), () => setDeclining(null))}
      >
        <div className="door-form">
          <p>{declining?.label} · {declining ? formatRwf(declining.amount) : ''}</p>
          <TextAreaField label={t('door.funds.declineWhy')} name="fd-why" value={why} onChange={(e) => setWhy(e.target.value)} />
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>
    </>
  );

  return (
    <section className="door-block" aria-labelledby="door-funds-title">
      <PageHeader id="door-funds-title" title={t('door.funds.title')} purpose={t('door.funds.purpose')} />
      {tab === 'pots' && mineChecks.length > 0 && (
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
