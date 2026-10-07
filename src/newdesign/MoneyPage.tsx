import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchAccounting, fetchMoneyAccounts, fetchMoneyEntries, fetchMoneyOptions } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { currentMonth, queueFirst } from './money';
import { PlanVsActual, YearSelect } from './MoneyBlockParts';
import { AccountCard, AccountForm, EntryForm, EntryRow } from './MoneyParts';
import { useLoad } from './useLoad';

/** The Money block: accounts with balances, entries, and the president's approval queue. */
export function MoneyPage() {
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
  const plan = useLoad(() => fetchAccounting(systemId, year), `money-pva|${systemId}|${year}`);
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const reload = () => {
    accounts.reload();
    entries.reload();
    plan.reload();
  };
  const canRecord = !!accounts.data?.canRecord && !!options.data;
  const list = queueFirst(entries.data ?? []);
  return (
    <section className="door-block" aria-labelledby="door-money-title">
      <div>
        <h2 id="door-money-title">{t('door.money.accounting')}</h2>
        <p className="muted">{accounts.data?.canRecord ? t('door.money.intro.treasurer') : t('door.money.intro.view')}</p>
        <p className="muted">{t('door.money.apart')}</p>
      </div>
      <YearSelect year={year} onChange={setYear} />
      <LoadState loading={plan.loading} failed={plan.failed} retry={plan.reload}>
        {plan.data && <PlanVsActual view={plan.data} />}
      </LoadState>
      {canRecord && !form && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => setForm('entry')}>
            {t('door.money.entry.new')}
          </button>
          <button type="button" className="btn ghost" onClick={() => setForm('account')}>
            {t('door.money.account.new')}
          </button>
        </div>
      )}
      {form === 'account' && options.data && (
        <AccountForm options={options.data} systemId={systemId} onDone={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
      )}
      {form === 'entry' && options.data && accounts.data && (
        <EntryForm options={options.data} accounts={accounts.data.accounts} onDone={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
      )}
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
