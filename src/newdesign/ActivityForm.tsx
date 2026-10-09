import { useState, type FormEvent } from 'react';
import { addMoneyPlanItem, type FundingKind, type MoneyPlanView } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { categoryKey, moneyErrorKey, parseAmount } from './money';
import { PlanSelect } from './MoneyBlockParts';

const KINDS: FundingKind[] = ['CONTRIBUTION', 'DONATION', 'OTHER'];
const CATEGORIES = ['EVENT', 'SUPPLIES', 'SERVICES', 'TRANSPORT', 'AID', 'DONATION', 'OTHER'];

/**
 * One budget line item: an activity, what it costs, which kind of money it is, and where the money will come from
 * (a contribution type of the unit, a donation, or something else). The budget total adds these up by itself.
 * `fixedPlanId` ties it to the program, project or event it is written from; otherwise that link is optional.
 */
export function ActivityForm({
  systemId, year, view, fixedPlanId, onSaved,
}: { systemId: string; year: number; view: MoneyPlanView; fixedPlanId?: string; onSaved: () => void }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  const [planId, setPlanId] = useState('');
  const [kind, setKind] = useState<FundingKind | ''>('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const n = amount.trim() === '' ? 0 : parseAmount(amount);
    if (!title.trim() || n === null || n <= 0 || !category) return setError(t(!category ? 'door.money.err.categoryRequired' : 'door.money.form.incomplete'));
    if (kind === 'CONTRIBUTION' && !code) return setError(t('door.money.err.fundingType'));
    try {
      await addMoneyPlanItem({
        systemId, year, title: title.trim(), amount: n, dueMonth: month || null, category, planId: fixedPlanId ?? (planId || null),
        fundingKind: kind || null, fundingCode: kind === 'CONTRIBUTION' ? code : null, fundingNote: kind && kind !== 'CONTRIBUTION' ? note.trim() || null : null,
      });
      setTitle(''); setAmount(''); setMonth(''); setCategory(''); setPlanId(''); setKind(''); setCode(''); setNote('');
      onSaved();
    } catch (err) {
      setError(t(moneyErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };

  if (view.locked) return <p className="muted" role="status">{t('door.money.activity.locked', { status: t(`door.money.budget.status.${view.budgetStatus}` as 'door.money.budget.status.DRAFT') })}</p>;
  return (
    <form className="panel door-form" onSubmit={add} noValidate>
      <h3>{t('door.money.activity.new')}</h3>
      <p className="muted">{t('door.money.activity.hint')}</p>
      <TextField label={t('door.money.plan.title')} name="act-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextField label={t('door.money.plan.cost')} name="act-cost" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <TextField label={t('door.money.plan.month')} name="act-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      <SelectField label={t('door.money.activity.category')} name="act-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{t(categoryKey(c) as 'door.money.cat.OTHER')}</option>
        ))}
      </SelectField>
      <SelectField label={t('door.money.activity.funding')} name="act-fund" value={kind} onChange={(e) => setKind(e.target.value as FundingKind | '')}>
        <option value="">{t('door.money.activity.fundingNone')}</option>
        {KINDS.map((k) => (
          <option key={k} value={k}>{t(`door.money.funding.${k}` as 'door.money.funding.OTHER')}</option>
        ))}
      </SelectField>
      {kind === 'CONTRIBUTION' && (
        <SelectField label={t('door.money.activity.contribType')} name="act-code" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {view.fundingTypes.map((x) => (
            <option key={x.code} value={x.code}>{x.name}</option>
          ))}
        </SelectField>
      )}
      {kind === 'CONTRIBUTION' && view.fundingTypes.length === 0 && <p className="door-error" role="status">{t('door.money.activity.noTypes')}</p>}
      {(kind === 'DONATION' || kind === 'OTHER') && <TextField label={t('door.money.activity.fundingNote')} name="act-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
      {!fixedPlanId && <PlanSelect systemId={systemId} name="act-plan" value={planId} onChange={setPlanId} />}
      {error && <p className="door-error" role="alert">{error}</p>}
      <button type="submit" className="btn">{t('door.money.plan.add')}</button>
    </form>
  );
}

/** "Contribution · Building fund", "Donation", "Other: sale of cakes", or nothing yet. */
export function fundingLabel(t: (k: never, v?: Record<string, string | number>) => string, kind: string | null | undefined, name: string | null | undefined, note?: string | null): string {
  if (!kind) return t('door.money.activity.fundingNone' as never);
  const base = t(`door.money.funding.${kind}` as never);
  const extra = kind === 'CONTRIBUTION' ? name : note;
  return extra ? `${base} · ${extra}` : base;
}
