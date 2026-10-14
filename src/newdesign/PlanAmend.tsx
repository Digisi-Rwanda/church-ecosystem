import { useState } from 'react';
import {
  decideAmendment, requestAmendment, setBudgetCycle,
  type ActivityMoney, type AmendChanges, type AmendmentView, type BudgetCycle, type PlanDetail,
} from '../api/frontDoorApi';
import { ApiError } from '../api/client';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { PersonPicker } from './PersonPicker';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { StatusChip } from './kit';

const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
type Go = (job: () => Promise<ActivityMoney>, after?: () => void) => Promise<void>;

/** Spending against plan: the whole activity for a one-off, each cycle against its own allowance for a repeat. Red when over. */
export function SpendingVsPlan({ m }: { m: ActivityMoney }) {
  const t = useT();
  if (m.actual === 0 && m.perCycle.length === 0) return null;
  return (
    <div>
      <h4>{t('door.pm.actual')}</h4>
      <p className={m.over > 0 ? 'door-error' : 'muted'}>
        {t('door.pm.actualLine', { spent: formatRwf(m.actual), planned: formatRwf(m.planned) })}
        {m.over > 0 ? ` · ${t('door.pm.overBy', { over: formatRwf(m.over) })}` : ''}
      </p>
      {m.perCycle.length > 0 && (
        <ul className="door-list">
          {m.perCycle.map((c) => (
            <li key={c.key} className={c.over > 0 ? 'door-error' : undefined}>
              {c.key} · {t('door.pm.cycleLine', { spent: formatRwf(c.spent), allowance: formatRwf(c.allowance) })}
              {c.over > 0 ? ` · ${t('door.pm.overPlan')}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CYCLES: BudgetCycle[] = ['PER_OCCURRENCE', 'MONTHLY', 'QUARTERLY'];

/** How a repeat's allowance is counted and for how long; shortening an approved repeat asks first. */
export function CyclePanel({ p, m, onChange }: { p: PlanDetail; m: ActivityMoney; onChange: (next: ActivityMoney) => void }) {
  const t = useT();
  const [cycle, setCycle] = useState<BudgetCycle>(m.cycle.kind ?? (m.cycle.ongoing || p.planType === 'PROGRAM' ? 'MONTHLY' : 'PER_OCCURRENCE'));
  const [cycles, setCycles] = useState(m.cycle.explicit ? String(m.cycle.explicit) : '');
  const [error, setError] = useState('');
  const [release, setRelease] = useState<number | null>(null);
  if (!m.canSetCycle && !m.cycle.kind) return null;
  const save = async (confirm = false) => {
    setError('');
    try {
      onChange(await setBudgetCycle(p.id, { cycle, cycles: cycles ? num(cycles) : null, confirm }));
      setRelease(null);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { code?: string; release?: number } | undefined) : undefined;
      if (body?.code === 'CONFIRM_REQUIRED') setRelease(body.release ?? 0);
      else setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <div className="door-form">
      <h4>{t('door.pm.cycle.title')}</h4>
      {m.cycle.problem && <p className="muted">{t(`door.pm.cycle.${m.cycle.problem}` as 'door.pm.cycle.CYCLE_REQUIRED')}</p>}
      {m.cycle.cycles && m.cycle.kind && <p className="muted">{t('door.pm.cycle.total', { allowance: formatRwf(m.cycle.allowance), cycles: String(m.cycle.cycles), total: formatRwf(m.planned) })}</p>}
      {m.cycle.ongoing && <p className="muted">{t('door.pm.cycle.ongoing')}</p>}
      {m.canSetCycle && (
        <>
          <SelectField label={t('door.pm.cycle.how')} name="pm-cycle" value={cycle} onChange={(e) => setCycle(e.target.value as BudgetCycle)}>
            {CYCLES.map((c) => <option key={c} value={c}>{t(`door.pm.cycle.${c}` as 'door.pm.cycle.MONTHLY')}</option>)}
          </SelectField>
          <TextField label={t('door.pm.cycle.length')} name="pm-cycles" inputMode="numeric" hint={t('door.pm.cycle.lengthHint')} value={cycles} onChange={(e) => setCycles(e.target.value)} />
          {error && <p className="door-error" role="alert">{error}</p>}
          {release === null ? (
            <button type="button" className="btn secondary sm" onClick={() => void save()}>{t('door.pm.cycle.save')}</button>
          ) : (
            <div className="panel" role="alertdialog" aria-label={t('door.pm.cycle.shorten')}>
              <p>{t('door.pm.cycle.shortenWarn', { release: formatRwf(release) })}</p>
              <div className="door-row">
                <button type="button" className="btn sm" onClick={() => void save(true)}>{t('door.pm.cycle.shortenGo')}</button>
                <button type="button" className="btn ghost sm" onClick={() => setRelease(null)}>{t('door.pm.cancel')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The open amendment: what is asked, and for those who decide, Approve or Decline with a reason. */
export function PendingAmendment({ p, a, m, go }: { p: PlanDetail; a: AmendmentView; m: ActivityMoney; go: Go }) {
  const t = useT();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div className="panel">
      <StatusChip tone="warn">{t('door.pm.amend.pending')}</StatusChip>
      <p>
        <strong>{t(`door.pm.amend.scope.${a.scope}` as 'door.pm.amend.scope.MONEY')}</strong>
        {a.kind !== 'CHANGE' && <> · {t(`door.pm.amend.kind.${a.kind}` as 'door.pm.amend.kind.TRANSFER')} · {formatRwf(a.oldTotal)} → {formatRwf(a.newTotal)}</>} · {a.requestedByName}
      </p>
      <p className="muted">{a.justification}</p>
      {a.levels.length > 0 && (
        <ol className="door-list">
          {a.levels.map((l) => (
            <li key={l.levelKey}>
              <StatusChip tone={l.status === 'APPROVED' ? 'success' : 'warn'}>{l.label}</StatusChip>{' '}
              {l.status === 'APPROVED' ? t('door.pm.amend.approvedBy', { name: l.byName ?? '' }) : t('door.pm.amend.waiting')}
            </li>
          ))}
        </ol>
      )}
      {a.changes && a.changes.keys.length > 0 && (
        <p className="muted">{t('door.pm.amend.changes', { fields: a.changes.keys.map((k) => t(`door.pm.amend.field.${k}` as 'door.pm.amend.field.title')).join(', ') })}</p>
      )}
      {a.kind !== 'CHANGE' && (
        <ul className="door-list">
          {a.lines.map((l, i) => <li key={l.id ?? `n${i}`}>{l.title} · {formatRwf(l.amount)}</li>)}
        </ul>
      )}
      <div className="door-row">
        {a.canDecide && <button type="button" className="btn sm" onClick={() => void go(() => decideAmendment(p.id, a.id, 'approve'))}>{t('door.plan.action.approve')}</button>}
        {a.canDecide && <button type="button" className="btn secondary sm" onClick={() => setDeclining(true)}>{t('door.pm.amend.decline')}</button>}
        {m.canWithdrawAmendment && <button type="button" className="btn ghost sm" onClick={() => void go(() => decideAmendment(p.id, a.id, 'withdraw'))}>{t('door.pm.amend.withdraw')}</button>}
      </div>
      {declining && (
        <div className="door-form">
          <TextAreaField label={t('door.plan.rejectAsk')} name="pm-decline" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn sm" disabled={!reason.trim()} onClick={() => void go(() => decideAmendment(p.id, a.id, 'reject', { reason: reason.trim() }), () => { setDeclining(false); setReason(''); })}>{t('door.pm.amend.decline')}</button>
        </div>
      )}
    </div>
  );
}

/** "Request budget amendment": new lines and new money set aside, with the same live gap line and a reason. */
export function AmendForm({ p, m, go, onCancel }: { p: PlanDetail; m: ActivityMoney; go: Go; onCancel: () => void }) {
  const t = useT();
  const [lines, setLines] = useState(m.lines.map((l) => ({ id: l.id as string | null, title: l.title, amount: String(l.amount), category: l.category ?? '' })));
  const [leader, setLeader] = useState<{ id: string; name: string } | null>(null);
  const [aside, setAside] = useState<Record<string, string>>(Object.fromEntries(m.sources.map((s) => [s.potId, String(s.amount)])));
  const [why, setWhy] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState(p.title);
  const [aim, setAim] = useState(p.aim);
  const [needs, setNeeds] = useState(p.needs);
  const mult = m.cycle.multiplier || 1;
  const planned = lines.reduce((n, l) => n + num(l.amount), 0) * mult;
  const set = m.pots.reduce((n, pot) => n + num(aside[pot.id] ?? ''), 0);
  const gap = planned - set;
  const kind = planned > m.planned ? 'INCREASE' : 'TRANSFER';
  const moneyChanged = lines.length !== m.lines.length || lines.some((l) => { const old = m.lines.find((x) => x.id === l.id); return !old || old.title !== l.title.trim() || old.amount !== num(l.amount); })
    || m.pots.some((pot) => num(aside[pot.id] ?? '') !== (m.sources.find((s) => s.potId === pot.id)?.amount ?? 0));
  const changes: AmendChanges = {
    ...(name.trim() !== p.title ? { title: name.trim() } : {}),
    ...(aim.trim() !== p.aim ? { aim: aim.trim() } : {}),
    ...(needs.trim() !== p.needs ? { needs: needs.trim() || null } : {}),
  };
  if (leader && leader.id !== p.leaderId) changes.leaderId = leader.id;
  const detailsChanged = Object.keys(changes).filter((k) => k !== 'leaderId').length > 0;
  const leaderChanged = !!changes.leaderId;
  const catChanged = lines.some((l) => { const old = m.lines.find((x) => x.id === l.id); return !!old && (old.category ?? '') !== l.category.trim(); });
  const moneyOk = !moneyChanged || (gap === 0 && lines.every((l) => l.title.trim() && num(l.amount) > 0) && lines.length > 0);
  const ready = !!why.trim() && (moneyChanged || detailsChanged || leaderChanged || catChanged) && moneyOk && !!name.trim();
  const route = detailsChanged || catChanged || (leaderChanged && moneyChanged) ? 'GENERAL' : leaderChanged ? 'TEAM' : 'MONEY';
  const send = () =>
    go(
      () => requestAmendment(p.id, {
        justification: why.trim(),
        ...(moneyChanged || catChanged ? { lines: lines.map((l) => ({ id: l.id, title: l.title.trim(), amount: num(l.amount), category: l.category.trim() || null })) } : {}),
        ...(moneyChanged ? { sources: m.pots.map((pot) => ({ kind: pot.kind, code: pot.code, amount: num(aside[pot.id] ?? '') })).filter((s) => s.amount > 0) } : {}),
        ...(detailsChanged || leaderChanged ? { changes } : {}),
      }),
      onCancel,
    );
  return (
    <div className="panel door-form">
      <h4>{t('door.pm.amend.title')}</h4>
      <p className="muted">{t(`door.pm.amend.hint.${kind}` as 'door.pm.amend.hint.TRANSFER')}</p>
      <p className="muted" role="status">{t(`door.pm.amend.route.${route}` as 'door.pm.amend.route.MONEY')}</p>
      <h4>{t('door.pm.amend.mission')}</h4>
      <TextField label={t('door.plan.form.title')} name="am-name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextAreaField label={t('door.plan.form.aim')} name="am-aim" rows={2} value={aim} onChange={(e) => setAim(e.target.value)} />
      <TextAreaField label={t('door.plan.form.needs')} name="am-needs" rows={2} value={needs} onChange={(e) => setNeeds(e.target.value)} />
      <p>
        <strong>{t('door.plan.leader')}:</strong> {leader ? leader.name : p.leaderName}
      </p>
      <PersonPicker label={t('door.pm.amend.leader')} name="am-leader" onPick={(x) => setLeader({ id: x.id, name: x.fullName })} />
      <h4>{t('door.pm.amend.moneyPart')}</h4>
      <ul className="door-list">
        {lines.map((l, i) => (
          <li key={l.id ?? `n${i}`}>
            <TextField label={t('door.pm.for')} name={`am-t-${i}`} value={l.title} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <TextField label={t('door.pm.amount')} name={`am-a-${i}`} inputMode="numeric" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <TextField label={t('door.pm.amend.category')} name={`am-c-${i}`} value={l.category} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} />
            {!l.id && <button type="button" className="btn ghost sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>{t('door.pm.remove')}</button>}
          </li>
        ))}
      </ul>
      <div className="door-form">
        <TextField label={t('door.pm.for')} name="am-new-t" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label={t('door.pm.amount')} name="am-new-a" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" className="btn secondary sm" disabled={!title.trim() || num(amount) < 1} onClick={() => { setLines([...lines, { id: null, title: title.trim(), amount: String(num(amount)), category: '' }]); setTitle(''); setAmount(''); }}>{t('door.pm.add')}</button>
      </div>
      <h4>{t('door.pm.sources')}</h4>
      <ul className="door-list">
        {m.pots.map((pot) => {
          const mine = m.sources.find((s) => s.potId === pot.id)?.amount ?? 0;
          return (
            <li key={pot.id}>
              <strong>{pot.name}</strong> · {t('door.pm.available')}: {formatRwf(pot.available + mine)}
              <TextField label={t('door.pm.setAside')} name={`am-s-${pot.id}`} inputMode="numeric" value={aside[pot.id] ?? ''} onChange={(e) => setAside({ ...aside, [pot.id]: e.target.value })} />
            </li>
          );
        })}
      </ul>
      <p className={gap === 0 ? 'muted' : 'door-error'} role="status">{t('door.pm.line', { planned: formatRwf(planned), aside: formatRwf(set), gap: formatRwf(gap) })}</p>
      <TextAreaField label={t('door.pm.amend.why')} name="am-why" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} />
      <div className="door-row">
        <button type="button" className="btn" disabled={!ready} onClick={() => void send()}>{t('door.pm.amend.send')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('door.pm.cancel')}</button>
      </div>
    </div>
  );
}
