import { useState } from 'react';
import {
  allocateBlock, closeCase, fetchActivityMoney, fetchCase, fetchCases, fetchMoneyAccounts, markBatchPaid, recordMoneyEntryId, registerCase, reportCaseProgress, reviewCases,
  type CaseDetail, type CaseOutcome, type CaseRowView, type CasesView, type PlanDetail,
} from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { Segmented, SidePanel, StatusChip, type ChipTone } from './kit';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';

const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
const TONE: Record<string, ChipTone> = { PENDING: 'warn', APPROVED: 'info', FOLLOW_UP: 'info', CLOSED: 'done' };
const OUTCOMES: CaseOutcome[] = ['RESOLVED', 'RECOVERED', 'PASSED', 'CANCELLED'];
type Panel = 'register' | 'review' | null;

/** The case list of a case-based program: the budget left, the cases, and what each role does next. */
export function ProgramCases({ p, onChange }: { p: PlanDetail; onChange: () => void }) {
  const t = useT();
  const load = useLoad(() => fetchCases(p.id), `cases|${p.id}`);
  const [view, setView] = useState<CasesView | null>(null);
  const v = view ?? load.data;
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState('');
  const [statusF, setStatusF] = useState('');
  const [unitF, setUnitF] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // register
  const [unitId, setUnitId] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [issue, setIssue] = useState('');
  const [capacity, setCapacity] = useState('');
  const [need, setNeed] = useState('');
  // review
  const [mode, setMode] = useState<'PER_CASE' | 'BLOCK'>('PER_CASE');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [blockUnit, setBlockUnit] = useState('');
  const [blockAmount, setBlockAmount] = useState('');
  // allocation and payment
  const [alloc, setAlloc] = useState<{ batchId: string; unitName: string; amount: number; cases: Array<{ id: string; name: string; gap: number }> } | null>(null);
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({});
  const [pay, setPay] = useState<{ batchId: string; amount: number; unitName: string } | null>(null);
  const [accountId, setAccountId] = useState('');
  const [lineId, setLineId] = useState('');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const accounts = useLoad(() => (pay ? fetchMoneyAccounts(p.systemId) : Promise.resolve(null)), `case-acc|${p.id}|${pay ? 1 : 0}`);
  const money = useLoad(() => (pay ? fetchActivityMoney(p.id) : Promise.resolve(null)), `case-money|${p.id}|${pay ? 1 : 0}`);

  const go = async (job: () => Promise<CasesView>, after?: () => void) => {
    setError('');
    try {
      setView(await job());
      after?.();
      onChange();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  if (!v) return <LoadState loading={load.loading} failed={load.failed} retry={load.reload}><span /></LoadState>;

  const rows = v.rows.filter((r) => (!statusF || r.status === statusF) && (!unitF || r.unitId === unitF));
  const units = [...new Map(v.rows.map((r) => [r.unitId, r.unitName])).entries()];
  const group = v.pendingByUnit.find((g) => g.unitId === (blockUnit || v.pendingByUnit[0]?.unitId));
  const perTotal = v.pendingByUnit.flatMap((g) => g.cases).reduce((n, c) => n + num(amounts[c.id] ?? String(0)), 0);
  const gapTotal = v.pendingByUnit.flatMap((g) => g.cases).reduce((n, c) => n + c.gap, 0);
  const wanted = mode === 'PER_CASE' ? perTotal : num(blockAmount);
  const allocTotal = alloc ? alloc.cases.reduce((n, c) => n + num(allocAmounts[c.id] ?? '0'), 0) : 0;
  const status = (r: CaseRowView) => t(`door.cs.status.${r.status}` as 'door.cs.status.PENDING');

  return (
    <>
      <div className="panel" aria-label={t('door.cs.title')}>
        <h3>{t(`door.ac.caseType.${v.caseType}` as 'door.ac.caseType.SICK_CARE')}</h3>
        <div className="stat-tiles">
          <div className="stat-tile"><span className="muted">{t('door.cs.total')}</span><strong>{v.counts.total}</strong></div>
          <div className="stat-tile"><span className="muted">{t('door.cs.active')}</span><strong>{v.counts.active}</strong></div>
          <div className="stat-tile"><span className="muted">{t('door.cs.pending')}</span><strong>{v.counts.pending}</strong></div>
          <div className="stat-tile"><span className="muted">{t('door.cs.cap')}</span><strong>{formatRwf(v.budget.cap)}</strong></div>
          <div className="stat-tile"><span className="muted">{t('door.cs.spent')}</span><strong>{formatRwf(v.budget.spent)}</strong></div>
          <div className="stat-tile"><span className="muted">{t('door.cs.remaining')}</span><strong>{formatRwf(v.budget.remaining)}</strong></div>
        </div>
        {v.budget.committed > 0 && <p className="muted">{t('door.cs.committed', { amount: formatRwf(v.budget.committed) })}</p>}

        {v.toAllocate.map((b) => (
          <p key={b.batchId} role="status"><strong>{t('door.cs.toAllocate', { unit: b.unitName, amount: formatRwf(b.amount) })}</strong>{' '}
            <button type="button" className="btn sm" onClick={() => { setAlloc(b); setAllocAmounts({}); setError(''); }}>{t('door.cs.allocate')}</button></p>
        ))}
        {v.toPay.map((b) => (
          <p key={b.batchId} role="status"><strong>{t('door.cs.toPay', { unit: b.unitName, amount: formatRwf(b.amount) })}</strong>{' '}
            <button type="button" className="btn sm" onClick={() => { setPay(b); setAccountId(''); setLineId(''); setError(''); }}>{t('door.cs.logPaid')}</button></p>
        ))}
        <div className="door-row">
          {v.canRegister && <button type="button" className="btn" onClick={() => { setUnitId(v.myUnits.length === 1 ? v.myUnits[0]!.id : ''); setName(''); setContact(''); setIssue(''); setCapacity(''); setNeed(''); setError(''); setPanel('register'); }}>{t('door.cs.register')}</button>}
          {v.canReview && <button type="button" className="btn secondary" onClick={() => { setMode('PER_CASE'); setAmounts({}); setBlockAmount(''); setBlockUnit(''); setError(''); setPanel('review'); }}>{t('door.cs.review')}</button>}
        </div>
        {error && !panel && !alloc && !pay && <p className="door-error" role="alert">{error}</p>}

        {v.rows.length === 0 ? <p className="muted">{t('door.cs.none')}</p> : (
          <>
            <div className="door-row">
              <SelectField label={t('door.cs.filter.status')} name="cs-f-status" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
                <option value="">{t('door.cs.filter.all')}</option>
                {(['PENDING', 'APPROVED', 'FOLLOW_UP', 'CLOSED'] as const).map((s) => <option key={s} value={s}>{t(`door.cs.status.${s}` as 'door.cs.status.PENDING')}</option>)}
              </SelectField>
              {units.length > 1 && (
                <SelectField label={t('door.cs.filter.unit')} name="cs-f-unit" value={unitF} onChange={(e) => setUnitF(e.target.value)}>
                  <option value="">{t('door.cs.filter.all')}</option>
                  {units.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </SelectField>
              )}
            </div>
            <div className="door-table-wrap">
              <table className="door-table door-stack">
                <thead><tr><th scope="col">{t('door.cs.col.person')}</th><th scope="col">{t('door.cs.col.unit')}</th><th scope="col">{t('door.cs.col.issue')}</th><th scope="col">{t('door.cs.col.gap')}</th><th scope="col">{t('door.cs.col.support')}</th><th scope="col">{t('door.cs.col.status')}</th><th scope="col"><span className="visually-hidden">{t('door.cs.col.action')}</span></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{r.name}</th>
                      <td data-label={t('door.cs.col.unit')}>{r.unitName}</td>
                      <td data-label={t('door.cs.col.issue')}>{r.issue || '—'}</td>
                      <td data-label={t('door.cs.col.gap')}>{formatRwf(r.gap)}</td>
                      <td data-label={t('door.cs.col.support')}>{r.approved > 0 ? `${formatRwf(r.approved)}${r.disbursed > 0 ? ` ✓` : ''}` : '—'}</td>
                      <td data-label={t('door.cs.col.status')}><StatusChip tone={TONE[r.status] ?? 'neutral'}>{status(r)}</StatusChip></td>
                      <td><button type="button" className="btn ghost sm" onClick={() => setOpen(r.id)}>{t('door.cs.view')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <SidePanel open={panel === 'register'} title={t('door.cs.register')} purpose={t('door.cs.registerPurpose')} onClose={() => setPanel(null)} saveLabel={t('door.cs.registerSave')} canSave={!!name.trim() && !!unitId}
        onSave={() => void go(() => registerCase(p.id, { unitId, name: name.trim(), contact: contact.trim(), issue: issue.trim(), capacity: num(capacity), need: num(need) }), () => setPanel(null))}>
        <div className="door-form">
          {v.myUnits.length > 1 && (
            <SelectField label={`${t('door.ap.unit')} *`} name="cs-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">{t('door.gov.meeting.choose')}</option>
              {v.myUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </SelectField>
          )}
          <TextField label={`${t('door.cs.name')} *`} name="cs-name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label={t('door.cs.contact')} name="cs-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          <TextAreaField label={t(v.caseType === 'SICK_CARE' ? 'door.cs.sickness' : 'door.cs.narration')} name="cs-issue" rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} />
          <TextField label={t('door.cs.capacity')} name="cs-capacity" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <TextField label={t('door.cs.need')} name="cs-need" inputMode="numeric" value={need} onChange={(e) => setNeed(e.target.value)} />
          <p className="muted">{t('door.cs.gapIs', { amount: formatRwf(Math.max(0, num(need) - num(capacity))) })}</p>
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>

      <SidePanel open={panel === 'review'} title={t('door.cs.review')} purpose={t('door.cs.reviewPurpose', { gap: formatRwf(gapTotal), remaining: formatRwf(v.budget.remaining) })} onClose={() => setPanel(null)} saveLabel={t('door.cs.approve')}
        canSave={(mode === 'PER_CASE' ? v.pendingByUnit.length > 0 : !!group && blockAmount !== '') && wanted <= v.budget.remaining}
        onSave={() => void go(() => (mode === 'PER_CASE'
          ? reviewCases(p.id, { mode: 'PER_CASE', items: v.pendingByUnit.flatMap((g) => g.cases).map((c) => ({ caseId: c.id, amount: num(amounts[c.id] ?? '0') })) })
          : reviewCases(p.id, { mode: 'BLOCK', unitId: group!.unitId, caseIds: group!.cases.map((c) => c.id), amount: num(blockAmount) })), () => setPanel(null))}>
        <div className="door-form">
          <Segmented label={t('door.cs.mode')} value={mode} onChange={(k) => setMode(k as 'PER_CASE' | 'BLOCK')} items={[{ key: 'PER_CASE', label: t('door.cs.mode.PER_CASE') }, { key: 'BLOCK', label: t('door.cs.mode.BLOCK') }]} />
          <p className="muted">{t(`door.cs.mode.${mode}.hint` as 'door.cs.mode.PER_CASE.hint')}</p>
          {mode === 'PER_CASE' ? (
            v.pendingByUnit.map((g) => (
              <div key={g.unitId} className="panel-inset">
                <h4>{g.unitName}</h4>
                {g.cases.map((c, i) => (
                  <div className="door-row" key={c.id}>
                    <span>{c.name} · {t('door.cs.col.gap')} {formatRwf(c.gap)}</span>
                    <TextField label={t('door.cs.approvedSupport')} name={`cs-amt-${g.unitId}-${i}`} inputMode="numeric" value={amounts[c.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [c.id]: String(Math.min(c.gap, num(e.target.value))) })} />
                  </div>
                ))}
              </div>
            ))
          ) : (
            <>
              {v.pendingByUnit.length > 1 && (
                <SelectField label={t('door.ap.unit')} name="cs-block-unit" value={group?.unitId ?? ''} onChange={(e) => setBlockUnit(e.target.value)}>
                  {v.pendingByUnit.map((g) => <option key={g.unitId} value={g.unitId}>{g.unitName}</option>)}
                </SelectField>
              )}
              {group && <p>{group.unitName} · {t('door.cs.cases', { n: group.cases.length })} · {t('door.cs.totalGap')} {formatRwf(group.cases.reduce((n, c) => n + c.gap, 0))}</p>}
              <TextField label={t('door.cs.approvedBlock')} name="cs-block" inputMode="numeric" value={blockAmount} onChange={(e) => setBlockAmount(e.target.value)} />
            </>
          )}
          <p className={wanted > v.budget.remaining ? 'door-error' : 'muted'} role="status">{t('door.cs.wanted', { wanted: formatRwf(wanted), remaining: formatRwf(v.budget.remaining) })}</p>
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>

      <SidePanel open={!!alloc} title={t('door.cs.allocate')} purpose={alloc ? t('door.cs.allocatePurpose', { unit: alloc.unitName, amount: formatRwf(alloc.amount) }) : ''} onClose={() => setAlloc(null)} saveLabel={t('door.cs.allocateSave')} canSave={!!alloc && allocTotal === alloc.amount}
        onSave={() => alloc && void go(() => allocateBlock(p.id, alloc.batchId, alloc.cases.map((c) => ({ caseId: c.id, amount: num(allocAmounts[c.id] ?? '0') }))), () => setAlloc(null))}>
        <div className="door-form">
          {alloc?.cases.map((c, i) => (
            <div className="door-row" key={c.id}>
              <span>{c.name} · {t('door.cs.col.gap')} {formatRwf(c.gap)}</span>
              <TextField label={t('door.cs.allocated')} name={`cs-alloc-${i}`} inputMode="numeric" value={allocAmounts[c.id] ?? ''} onChange={(e) => setAllocAmounts({ ...allocAmounts, [c.id]: String(Math.min(c.gap, num(e.target.value))) })} />
            </div>
          ))}
          {alloc && <p className={allocTotal === alloc.amount ? 'muted' : 'door-error'} role="status">{t('door.cs.allocTotal', { total: formatRwf(allocTotal), block: formatRwf(alloc.amount) })}{allocTotal === alloc.amount ? ' ✓' : ''}</p>}
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>

      <SidePanel open={!!pay} title={t('door.cs.logPaid')} purpose={pay ? t('door.cs.payPurpose', { unit: pay.unitName, amount: formatRwf(pay.amount) }) : ''} onClose={() => setPay(null)} saveLabel={t('door.cs.paySave')} canSave={!!accountId && !!lineId && !!day}
        onSave={() => pay && void go(async () => {
          const entryId = await recordMoneyEntryId({ accountId, kind: 'SPENDING', amount: pay.amount, occurredOn: day, category: 'OTHER', note: t('door.cs.payNote', { unit: pay.unitName }), planId: p.id, lineId });
          return markBatchPaid(p.id, pay.batchId, entryId);
        }, () => setPay(null))}>
        <div className="door-form">
          <SelectField label={`${t('door.cs.account')} *`} name="cs-pay-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {(accounts.data?.accounts ?? []).filter((a) => a.status === 'ACTIVE').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectField>
          <SelectField label={`${t('door.cs.line')} *`} name="cs-pay-line" value={lineId} onChange={(e) => setLineId(e.target.value)}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {(money.data?.lines ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </SelectField>
          <TextField label={t('door.cs.date')} name="cs-pay-date" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          {error && <p className="door-error" role="alert">{error}</p>}
        </div>
      </SidePanel>

      {open && <CaseDetailPanel p={p} caseId={open} onClose={() => setOpen(null)} onChange={() => { load.reload(); onChange(); }} />}
    </>
  );
}

function CaseDetailPanel({ p, caseId, onClose, onChange }: { p: PlanDetail; caseId: string; onClose: () => void; onChange: () => void }) {
  const t = useT();
  const load = useLoad(() => fetchCase(p.id, caseId), `case|${caseId}`);
  const [view, setView] = useState<CaseDetail | null>(null);
  const c = view ?? load.data;
  const [text, setText] = useState('');
  const [condition, setCondition] = useState('');
  const [outcome, setOutcome] = useState<CaseOutcome>('RESOLVED');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const go = async (job: () => Promise<CaseDetail>, after?: () => void) => {
    setError('');
    try {
      setView(await job());
      after?.();
      onChange();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <SidePanel open title={c?.name ?? t('door.cs.view')} purpose={c ? `${c.unitName} · ${t(`door.cs.status.${c.status}` as 'door.cs.status.PENDING')}` : ''} onClose={onClose} saveLabel={t('door.cs.progress.save')} canSave={!!c?.canProgress && !!text.trim() && !closing}
      onSave={() => void go(() => reportCaseProgress(p.id, caseId, { text: text.trim(), condition: condition.trim() || null }), () => { setText(''); setCondition(''); })}>
      <LoadState loading={load.loading && !c} failed={load.failed} retry={load.reload}>
        {c && (
          <div className="door-form">
            <dl className="door-facts">
              <div><dt className="muted">{t('door.cs.contact')}</dt><dd>{c.contact || '—'}</dd></div>
              <div><dt className="muted">{t(c.caseType === 'SICK_CARE' ? 'door.cs.sickness' : 'door.cs.narration')}</dt><dd>{c.issue || '—'}</dd></div>
              <div><dt className="muted">{t('door.cs.capacity')}</dt><dd>{formatRwf(c.capacity)}</dd></div>
              <div><dt className="muted">{t('door.cs.need')}</dt><dd>{formatRwf(c.need)}</dd></div>
              <div><dt className="muted">{t('door.cs.col.gap')}</dt><dd>{formatRwf(c.gap)}</dd></div>
              <div><dt className="muted">{t('door.cs.churchCovered')}</dt><dd>{formatRwf(c.disbursed)}{c.approved > c.disbursed ? ` (${t('door.cs.approvedWaiting', { amount: formatRwf(c.approved - c.disbursed) })})` : ''}</dd></div>
              {c.condition && <div><dt className="muted">{t(c.caseType === 'SICK_CARE' ? 'door.cs.healing' : 'door.cs.resolution')}</dt><dd>{c.condition}</dd></div>}
              {c.outcome && <div><dt className="muted">{t('door.cs.outcome')}</dt><dd>{t(`door.cs.outcome.${c.outcome}` as 'door.cs.outcome.RESOLVED')}</dd></div>}
            </dl>
            <h4>{t('door.cs.timeline')}</h4>
            <ol className="door-list">{c.events.map((e) => <li key={e.id}>{(e.at ?? '').slice(0, 10)} · {e.text}</li>)}</ol>
            {c.canProgress && (
              <>
                <TextField label={t(c.caseType === 'SICK_CARE' ? 'door.cs.healing' : 'door.cs.resolution')} name="cs-cond" value={condition} onChange={(e) => setCondition(e.target.value)} />
                <TextAreaField label={t('door.cs.progress')} name="cs-progress" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
              </>
            )}
            {c.canClose && !closing && <button type="button" className="btn secondary" onClick={() => setClosing(true)}>{t('door.cs.close')}</button>}
            {c.canClose && closing && (
              <div className="panel-inset">
                <SelectField label={t('door.cs.outcome')} name="cs-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as CaseOutcome)}>
                  {OUTCOMES.map((o) => <option key={o} value={o}>{t(`door.cs.outcome.${o}` as 'door.cs.outcome.RESOLVED')}</option>)}
                </SelectField>
                <TextAreaField label={t('door.ar.note')} name="cs-close-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="door-row">
                  <button type="button" className="btn" onClick={() => void go(() => closeCase(p.id, caseId, { outcome, note: note.trim() || null }), () => setClosing(false))}>{t('door.cs.close')}</button>
                  <button type="button" className="btn ghost" onClick={() => setClosing(false)}>{t('door.settings.cancel')}</button>
                </div>
              </div>
            )}
            {error && <p className="door-error" role="alert">{error}</p>}
          </div>
        )}
      </LoadState>
    </SidePanel>
  );
}
