import { ImportLink } from './imports/ImportLink';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { MoneyEntryItem } from '../api/frontDoorApi';
import { fetchAccounting, fetchMoneyAccounts, fetchMoneyEntries, fetchMoneyOptions } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { currentMonth, entriesToCsv, queueFirst } from './money';
import { PlanVsActual, YearSelect } from './MoneyBlockParts';
import { AccountCard, AccountForm, EntryForm, EntryRow } from './MoneyParts';
import { useLoad } from './useLoad';
import { PageHeader, SidePanel } from './kit';

/** The Money block: accounts with balances, entries, and the president's approval queue. */
export function MoneyPage({ side }: { side: 'INCOME' | 'SPENDING' }) {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [show, setShow] = useState<'all' | 'PENDING_APPROVAL'>('all');
  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState<'account' | 'entry' | null>(null);
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const allowed = lettersFor(capabilities, systemId, 'money').length > 0;
  const accounts = useLoad(() => fetchMoneyAccounts(systemId), `money-acc|${systemId}`);
  const entries = useLoad(() => fetchMoneyEntries({ systemId, status: show === 'all' ? '' : show, month: show === 'all' ? month : '' }), `money-ent|${systemId}|${show}|${month}`);
  const options = useLoad(fetchMoneyOptions, 'money-options');
  const waiting = useLoad(() => fetchMoneyEntries({ systemId, status: 'PENDING_APPROVAL' }), `money-q-wait|${systemId}`);
  const declined = useLoad(() => fetchMoneyEntries({ systemId, status: 'REJECTED' }), `money-q-rej|${systemId}`);
  const toCheck = useLoad(() => fetchMoneyEntries({ systemId, status: 'RECORDED', month: currentMonth() }), `money-q-rec|${systemId}`);
  const plan = useLoad(() => fetchAccounting(systemId, year), `money-pva|${systemId}|${year}`);
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const reload = () => {
    accounts.reload();
    entries.reload();
    plan.reload();
    waiting.reload();
    declined.reload();
    toCheck.reload();
  };
  const canRecord = !!accounts.data?.canRecord && !!options.data;
  const ofSide = (rows: MoneyEntryItem[] | null | undefined) => (rows ?? []).filter((e) => e.kind === side);
  const list = queueFirst(ofSide(entries.data));
  const exportCsv = () => {
    const head = ['date', 'account', 'kind', 'category', 'amount', 'status', 'note', 'plan', 'recordedBy', 'decidedBy', 'reason'];
    const blob = new Blob(['\ufeff', entriesToCsv(list, head)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${side === 'INCOME' ? 'income' : 'expense'}-${show === 'all' ? month : 'waiting'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <section className="door-block" aria-labelledby="door-money-title">
      <div>
        <PageHeader
          id="door-money-title"
          title={t(side === 'INCOME' ? 'door.money.income' : 'door.money.expense')}
          purpose={t('door.purpose.money')}
          primary={canRecord ? <button type="button" className="btn" onClick={() => setForm('entry')}>{t(side === 'INCOME' ? 'door.money.income.new' : 'door.money.expense.new')}</button> : undefined}
          actions={
            <>
              {canRecord && <ImportLink systemId={systemId} target="moneyEntries" />}
              {canRecord && (
                <button type="button" className="btn ghost" onClick={() => setForm('account')}>
                  {t('door.money.account.new')}
                </button>
              )}
              <button type="button" className="btn ghost" onClick={exportCsv} disabled={list.length === 0}>
                {t('door.money.export')}
              </button>
            </>
          }
        />
        <p className="muted">{accounts.data?.canRecord ? t('door.money.intro.treasurer') : t('door.money.intro.view')}</p>
        <p className="muted">{t('door.money.apart')}</p>
        {accounts.data && !accounts.data.canRecord && <p className="muted">{t('door.money.hint.notTreasurer')}</p>}
      </div>
      <YearSelect year={year} onChange={setYear} />
      <LoadState loading={plan.loading} failed={plan.failed} retry={plan.reload}>
        {plan.data && <PlanVsActual view={plan.data} />}
      </LoadState>
      <SidePanel open={form === 'account' && !!options.data} title={t('door.money.account.new')} onClose={() => setForm(null)}>
        {options.data && (
          <div className="side-form">
            <AccountForm options={options.data} systemId={systemId} onDone={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
          </div>
        )}
      </SidePanel>
      <SidePanel open={form === 'entry' && !!options.data && !!accounts.data} title={t('door.money.entry.new')} purpose={t('door.money.entry.purpose')} onClose={() => setForm(null)}>
        {options.data && accounts.data && (
          <div className="side-form">
            <EntryForm fixedKind={side} options={options.data} accounts={accounts.data.accounts} systemId={systemId} onDone={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
          </div>
        )}
      </SidePanel>
      <div className="queue-grid">
        {[
          { key: 'check', load: toCheck, label: t('door.money.queue.check'), hint: t('door.money.queue.checkHint') },
          { key: 'approve', load: waiting, label: t('door.money.queue.approve'), hint: t('door.money.queue.approveHint') },
          { key: 'record', load: declined, label: t('door.money.queue.record'), hint: t('door.money.queue.recordHint') },
        ]
          .filter((q) => side === 'SPENDING' || q.key === 'check')
          .map((q) => (
          <div key={q.key} className="panel queue-card">
            <h3>
              {q.label} <span className="muted">{ofSide(q.load.data).length}</span>
            </h3>
            <p className="muted">{q.hint}</p>
            {ofSide(q.load.data).length > 0 && (
              <ul className="door-notices">
                {ofSide(q.load.data).slice(0, 5).map((e) => (
                  <EntryRow key={e.id} entry={e} onChange={reload} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <LoadState loading={accounts.loading} failed={accounts.failed} retry={accounts.reload}>
        {accounts.data && accounts.data.accounts.length === 0 ? (
          <EmptyState title={t('door.money.account.none')} detail={t('door.money.account.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {(accounts.data?.accounts ?? []).map((a) => (
              <AccountCard key={a.id} account={a} canClose={!!accounts.data?.canRecord} onChange={reload} />
            ))}
          </ul>
        )}
      </LoadState>
      <div className="door-filters">
        <SelectField label={t('door.work.show')} name="m-show" value={show} onChange={(e) => setShow(e.target.value as 'all' | 'PENDING_APPROVAL')}>
          <option value="all">{t('door.money.show.month')}</option>
          <option value="PENDING_APPROVAL">{t('door.money.show.waiting')}</option>
        </SelectField>
        {show === 'all' && <TextField label={t('door.money.month')} name="m-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}
      </div>
      <LoadState loading={entries.loading} failed={entries.failed} retry={entries.reload}>
        {list.length === 0 ? (
          <EmptyState title={t('door.money.entry.none')} />
        ) : (
          <ul className="door-notices">
            {list.map((e) => (
              <EntryRow key={e.id} entry={e} onChange={reload} />
            ))}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
