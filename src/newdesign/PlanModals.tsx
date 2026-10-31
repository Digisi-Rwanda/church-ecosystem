import { useEffect, useState } from 'react';
import { fetchMoneyAccounts, fetchMoneyEntries, logRevenue, recordMoneyEntry, type ActivityMoney, type MoneyAccountItem, type MoneyEntryItem, type PlanDetail } from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { SidePanel, StatusChip } from './kit';
import { categoryKey, formatRwf, moneyErrorKey } from './money';
import { planErrorKey } from './plans';

const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
const today = () => new Date().toISOString().slice(0, 10);

/** Log Expense: the Treasurer records what was paid against one of the activity's cost lines. Over the line it is recorded and flagged, never refused. */
export function LogExpensePanel({ p, m, late = false, onClose, onDone }: { p: PlanDetail; m: ActivityMoney; late?: boolean; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [accounts, setAccounts] = useState<MoneyAccountItem[]>([]);
  const [accountId, setAccountId] = useState('');
  const [lineId, setLineId] = useState(m.lines[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetchMoneyAccounts(p.systemId).then((r) => {
      const open = r.accounts.filter((a) => a.status === 'ACTIVE');
      setAccounts(open);
      if (open.length === 1) setAccountId(open[0].id);
    }).catch(() => setError(t('door.pm.exp.noAccount')));
  }, [p.systemId, t]);
  const line = m.lines.find((l) => l.id === lineId);
  const n = num(amount);
  const over = !!line && n > line.remaining;
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await recordMoneyEntry({ accountId, kind: 'SPENDING', amount: n, occurredOn: day, category: line?.category ?? 'OTHER', note: note.trim() || null, planId: p.id, lineId: lineId || null });
      onDone();
    } catch (err) {
      const code = errorCode(err);
      const k = moneyErrorKey(code);
      setError(t((k !== 'door.people.actionFailed' ? k : planErrorKey(code)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SidePanel open title={t(late ? 'door.pm.late.title' : 'door.pm.exp.title')} purpose={t(late ? 'door.pm.late.purpose' : 'door.pm.exp.purpose')} onClose={onClose} saveLabel={t('door.pm.exp.save')} saving={busy} canSave={!!accountId && !!lineId && n >= 1 && !!day} onSave={() => void save()}>
      <div className="door-form">
        {accounts.length !== 1 && (
          <SelectField label={t('door.money.entry.account')} name="ex-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectField>
        )}
        <SelectField label={t('door.pm.exp.line')} name="ex-line" value={lineId} onChange={(e) => setLineId(e.target.value)}>
          {m.lines.map((l) => <option key={l.id} value={l.id}>{l.title} — {t('door.pm.col.remaining')} {formatRwf(l.remaining)}</option>)}
        </SelectField>
        <TextField label={t('door.pm.amount')} name="ex-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label={t('door.pm.exp.day')} name="ex-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <TextAreaField label={t('door.funds.note')} name="ex-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        {line?.category && <p className="muted">{t('door.ac.category')}: {t(categoryKey(line.category) as 'door.money.cat.OTHER')}</p>}
        {over && <p className="door-error" role="status">{t('door.pm.exp.over')}</p>}
        {late && <p className="muted">{t('door.pm.late.hint')}</p>}
        {error && <p className="door-error" role="alert">{error}</p>}
      </div>
    </SidePanel>
  );
}

/** Log Revenue: money a fundraising event received. The Treasurer confirms it before it counts. */
export function LogRevenuePanel({ p, onClose, onDone }: { p: PlanDetail; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const n = num(amount);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await logRevenue(p.id, { label: label.trim(), amount: n, receivedOn: day });
      onDone();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SidePanel open title={t('door.fr.add')} purpose={t('door.fr.hint')} onClose={onClose} saveLabel={t('door.pm.exp.save')} saving={busy} canSave={!!label.trim() && n >= 1} onSave={() => void save()}>
      <div className="door-form">
        <TextField label={t('door.fr.label')} name="rv-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <TextField label={t('door.pm.amount')} name="rv-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label={t('door.pm.exp.day')} name="rv-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        {error && <p className="door-error" role="alert">{error}</p>}
      </div>
    </SidePanel>
  );
}

/** View Ledger: every entry recorded against this activity. */
export function LedgerPanel({ p, onClose }: { p: PlanDetail; onClose: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<MoneyEntryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void fetchMoneyEntries({ systemId: p.systemId, planId: p.id }).then(setRows).catch(() => setFailed(true));
  }, [p.id, p.systemId]);
  return (
    <SidePanel open wide title={t('door.pm.ledger')} purpose={p.title} onClose={onClose}>
      {failed && <p className="door-error" role="alert">{t('door.pm.ledger.failed')}</p>}
      {rows && rows.length === 0 && <p className="muted">{t('door.pm.ledger.none')}</p>}
      {rows && rows.length > 0 && (
        <div className="door-table-wrap">
          <table className="door-table door-stack">
            <thead><tr><th scope="col">{t('door.funds.date')}</th><th scope="col">{t('door.ac.category')}</th><th scope="col">{t('door.funds.note')}</th><th scope="col">{t('door.pm.amount')}</th><th scope="col">{t('door.funds.status')}</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{e.occurredOn.slice(0, 10)}</th>
                  <td data-label={t('door.ac.category')}>{t(categoryKey(e.category) as 'door.money.cat.OTHER')}</td>
                  <td data-label={t('door.funds.note')}>{e.note || '—'}</td>
                  <td data-label={t('door.pm.amount')}>{formatRwf(e.amount)}</td>
                  <td data-label={t('door.funds.status')}><StatusChip tone={e.status === 'REJECTED' || e.status === 'VOIDED' ? 'danger' : 'neutral'}>{e.status === 'APPROVED' && e.decisionNote?.startsWith('Over') ? t('door.pm.exp.flagged') : e.status}</StatusChip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SidePanel>
  );
}
