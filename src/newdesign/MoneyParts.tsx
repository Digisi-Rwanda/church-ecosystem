import { useState, type FormEvent } from 'react';
import {
  closeMoneyAccount, decideMoneyEntry, openMoneyAccount, recordMoneyEntry, voidMoneyEntry,
  type MoneyAccountItem, type MoneyEntryItem, type MoneyEntryKind, type MoneyOptions,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { categoryKey, formatRwf, moneyErrorKey, moneyStatusKey, parseAmount } from './money';

/** Open a money account for a unit the treasurer serves. */
export function AccountForm({ options, systemId, onDone, onCancel }: { options: MoneyOptions; systemId: string; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const units = options.units.filter((u) => u.systemId === systemId);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!unitId || !name.trim()) return setError(t('door.money.form.incomplete'));
    setBusy(true);
    setError('');
    try {
      await openMoneyAccount(unitId, name.trim());
      onDone();
    } catch (err) {
      setError(t(moneyErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.money.account.new')}</h3>
      {units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="m-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label={t('door.money.account.name')} name="m-name" value={name} maxLength={options.limits.nameMax} onChange={(e) => setName(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.money.account.open')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Record income (kept at once) or spending (waits for the president's approval). */
export function EntryForm({ options, accounts, onDone, onCancel }: { options: MoneyOptions; accounts: MoneyAccountItem[]; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const open = accounts.filter((a) => a.status === 'ACTIVE');
  const [accountId, setAccountId] = useState(open.length === 1 ? open[0].id : '');
  const [kind, setKind] = useState<MoneyEntryKind>('INCOME');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(options.categories[0] ?? 'OTHER');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseAmount(amount);
    if (!accountId || !day) return setError(t('door.money.form.incomplete'));
    if (n === null || n > options.limits.amountMax) return setError(t('door.money.err.amount'));
    setBusy(true);
    setError('');
    try {
      await recordMoneyEntry({ accountId, kind, amount: n, occurredOn: day, category, note: note.trim() || null });
      onDone();
    } catch (err) {
      setError(t(moneyErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.money.entry.new')}</h3>
      <SelectField label={t('door.money.entry.account')} name="m-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {open.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </SelectField>
      <SelectField label={t('door.money.entry.kind')} name="m-kind" hint={kind === 'SPENDING' ? t('door.money.entry.spendingHint') : t('door.money.entry.incomeHint')} value={kind} onChange={(e) => setKind(e.target.value as MoneyEntryKind)}>
        <option value="INCOME">{t('door.money.kind.INCOME')}</option>
        <option value="SPENDING">{t('door.money.kind.SPENDING')}</option>
      </SelectField>
      <TextField label={t('door.money.entry.amount')} name="m-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <TextField label={t('door.money.entry.day')} name="m-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <SelectField label={t('door.money.entry.category')} name="m-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
        {options.categories.map((c) => (
          <option key={c} value={c}>
            {t(categoryKey(c) as 'door.money.cat.OTHER')}
          </option>
        ))}
      </SelectField>
      <TextAreaField label={t('door.money.entry.note')} name="m-note" rows={2} value={note} maxLength={options.limits.noteMax} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {kind === 'SPENDING' ? t('door.money.entry.askApproval') : t('door.money.entry.record')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** One entry with the steps this person may take. Declining and voiding ask for a reason. */
export function EntryRow({ entry, onChange }: { entry: MoneyEntryItem; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [ask, setAsk] = useState<'reject' | 'void' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setAsk(null);
      setReason('');
      onChange();
    } catch (err) {
      setError(t(moneyErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${entry.occurredOn}T00:00:00Z`));
  const sign = entry.kind === 'INCOME' ? '+' : '−';
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>
            {sign} {formatRwf(entry.amount)}
          </strong>
          <span className={`door-chip${entry.status === 'PENDING_APPROVAL' ? ' warn' : ''}`}>{t(moneyStatusKey(entry.status))}</span>
        </div>
        <p className="muted">
          {day} · {entry.accountName} · {t(categoryKey(entry.category) as 'door.money.cat.OTHER')} · {t('door.money.entry.by', { name: entry.recordedByName })}
        </p>
        {entry.note && <p>{entry.note}</p>}
        {entry.decidedByName && (
          <p className="muted">
            {t('door.money.entry.decidedBy', { name: entry.decidedByName })}
            {entry.decisionNote ? ` — ${entry.decisionNote}` : ''}
          </p>
        )}
        {ask ? (
          <div className="door-form">
            <TextField label={t('door.money.reason')} name={`m-reason-${entry.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="door-row">
              <button
                type="button"
                className="btn"
                disabled={!reason.trim()}
                onClick={() => void run(() => (ask === 'reject' ? decideMoneyEntry(entry.id, false, reason.trim()) : voidMoneyEntry(entry.id, reason.trim())))}
              >
                {ask === 'reject' ? t('door.money.entry.decline') : t('door.money.entry.void')}
              </button>
              <button type="button" className="btn ghost" onClick={() => setAsk(null)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="door-row">
            {entry.canDecide && (
              <>
                <button type="button" className="btn sm" onClick={() => void run(() => decideMoneyEntry(entry.id, true))}>
                  {t('door.money.entry.approve')}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setAsk('reject')}>
                  {t('door.money.entry.decline')}
                </button>
              </>
            )}
            {entry.canVoid && (
              <button type="button" className="btn ghost sm" onClick={() => setAsk('void')}>
                {t('door.money.entry.void')}
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

export function AccountCard({ account, canClose, onChange }: { account: MoneyAccountItem; canClose: boolean; onChange: () => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const close = async () => {
    setError('');
    try {
      await closeMoneyAccount(account.id);
      onChange();
    } catch (err) {
      setError(t(moneyErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{account.name}</strong>
          {account.status === 'CLOSED' && <span className="door-chip">{t('door.money.account.closed')}</span>}
        </div>
        <p className="muted">{account.unitName}</p>
        <p>
          <strong>{t('door.money.balance')}:</strong> {formatRwf(account.balance)}
        </p>
        <p className="muted">
          {t('door.money.income')} {formatRwf(account.income)} · {t('door.money.spent')} {formatRwf(account.spent)}
          {account.pending > 0 ? ` · ${t('door.money.pending')} ${formatRwf(account.pending)}` : ''}
        </p>
        {canClose && account.status === 'ACTIVE' && (
          <button type="button" className="btn ghost sm" onClick={() => void close()}>
            {t('door.money.account.close')}
          </button>
        )}
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
