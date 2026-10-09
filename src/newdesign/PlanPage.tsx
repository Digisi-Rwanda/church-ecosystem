import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addPlanCheck, addPlanNote, cancelPlan, deletePlan, fetchPlan, fetchPlanOptions, planStep, rejectPlan, removePlanCheck, saveReport, tickPlanCheck,
  type PlanDetail,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { fetchMoneyPlan, fetchPlanMoney } from '../api/frontDoorApi';
import { ActivityForm, fundingLabel } from './ActivityForm';
import { useFrontDoor } from './FrontDoorContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { categoryKey, formatRwf } from './money';
import { PlanForm } from './PlanForm';
import { PlanGuests } from './PlanGuests';
import { PlanLinks } from './PlanLinks';
import { PlanMilestones } from './PlanMilestones';
import { PlanGovernance, PlanIndicators } from './PlanProgram';
import { PLAN_STEPS, actionKey, needsApproval, phaseOf, planActions, planErrorKey, planStatusKey, stagesOf, stepIndex } from './plans';
import { useLoad } from './useLoad';
import { ListRow, PageHeader, RowList, StatusChip, Tabs } from './kit';

type Ask = 'reject' | 'cancel' | 'delete' | null;
type Tab = 'overview' | 'team' | 'guests' | 'milestones' | 'governance' | 'indicators' | 'checklist' | 'money' | 'report' | 'history';

/** One plan: where it stands in the six steps, its planning record, the execution record and the report. */
export function PlanPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { systemId = '', planId = '' } = useParams();
  const load = useLoad(() => fetchPlan(planId), `plan|${planId}`);
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [item, setItem] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [report, setReport] = useState<{ planningSummary: string; executionSummary: string; outcome: string } | null>(null);

  const p = plan && plan.id === planId ? plan : load.data;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');

  const run = async (job: () => Promise<PlanDetail | void>, after?: () => void) => {
    setError('');
    try {
      const next = await job();
      if (next) setPlan(next);
      setAsk(null);
      setReason('');
      after?.();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };

  if (load.failed) return <EmptyState variant="error" title={t('door.work.err.gone')} />;
  return (
    <LoadState loading={load.loading || !p} failed={false} retry={load.reload}>
      {p && (
        <section className="door-block" aria-labelledby="door-plan-title">
          <PageHeader
            id="door-plan-title"
            title={p.title}
            back={<Link to={`/s/${systemId}/work`}>← {t('door.block.work')}</Link>}
            purpose={`${p.unitName} · ${t('door.plan.leader')}: ${p.leaderName}${p.startsOn ? ` · ${day(p.startsOn)}${p.endsOn ? ` – ${day(p.endsOn)}` : ''}` : ''}`}
            meta={
              <>
                <StatusChip tone={p.status === 'PENDING_APPROVAL' || p.status === 'CLOSING' ? 'warn' : p.status === 'RUNNING' ? 'info' : p.status === 'PAUSED' ? 'warn' : p.status === 'ENDED' ? 'success' : p.status === 'CANCELLED' ? 'danger' : 'neutral'}>{t(planStatusKey(p.status, p.planType))}</StatusChip>
                <StatusChip>{t(`door.work.visibility.${p.visibility}` as const)}</StatusChip>
              </>
            }
          />
          <Tabs
            label={t('door.plan.tabs')}
            value={tab}
            onChange={setTab}
            items={[
              { key: 'overview', label: t('door.plan.tab.overview') },
              { key: 'team', label: t('door.plan.tab.team'), count: p.team.length },
              ...(p.planType === 'EVENT' && p.registration ? [{ key: 'guests' as const, label: t('door.plan.tab.guests'), count: p.registration.count }] : []),
              ...(p.planType === 'PROJECT' ? [{ key: 'milestones' as const, label: t('door.plan.tab.milestones'), count: p.milestones.filter((m) => !m.done).length }] : []),
              ...(p.planType === 'PROGRAM' ? [{ key: 'governance' as const, label: t('door.plan.tab.governance'), count: p.program?.reviews.length }, { key: 'indicators' as const, label: t('door.plan.tab.indicators'), count: p.program?.indicators.length }] : []),
              { key: 'checklist', label: t('door.plan.tab.checklist'), count: p.checks.filter((k) => !k.done).length },
              { key: 'money', label: t('door.plan.tab.money') },
              { key: 'report', label: t('door.plan.tab.report') },
              { key: 'history', label: t('door.plan.tab.history') },
            ]}
          />
          {tab === 'overview' && (
            <>
          <PlanLinks p={p} systemId={systemId} run={run} />

          <ol className="door-steps" aria-label={t(`door.plan.steps.${p.planType}` as const)}>
            {PLAN_STEPS.filter((s) => !(s === 'PENDING_APPROVAL' && !needsApproval(p.planType, p.beyondUnit) && p.status !== 'PENDING_APPROVAL')).map((s) => (
              <li key={s} className={stepIndex(p.status) >= stepIndex(s) && p.status !== 'CANCELLED' ? 'done' : ''} aria-current={p.status === s || (p.status === 'PAUSED' && s === 'RUNNING') ? 'step' : undefined}>
                {t(planStatusKey(s === 'RUNNING' && p.status === 'PAUSED' ? 'PAUSED' : s, p.planType))}
              </li>
            ))}
          </ol>
          <p className="muted">{t(`door.plan.phase.${phaseOf(p.status)}` as const)}</p>
          {p.planType === 'EVENT' && !needsApproval(p.planType, p.beyondUnit) && p.status === 'DRAFT' && <p className="muted">{t('door.plan.noApproval')}</p>}
          {p.planType === 'PROGRAM' && <p className="muted">{t('door.plan.programOpen')}</p>}
          <details className="door-guide">
            <summary>{t('door.plan.guide')}</summary>
            <ol>
              {stagesOf(p.planType, p.status).map((st) => (
                <li key={st.n} className={st.state} aria-current={st.state === 'current' ? 'step' : undefined}>
                  <strong>{t(st.labelKey as 'door.plan.stage.EVENT.1')}</strong>
                  <span className="muted"> · {t(st.descKey as 'door.plan.stage.EVENT.1.d')}</span>
                </li>
              ))}
            </ol>
          </details>
          {p.rejectedReason && p.status === 'DRAFT' && <p className="door-error">{t('door.plan.sentBack', { reason: p.rejectedReason })}</p>}
          {p.cancelReason && <p className="door-error">{t('door.plan.cancelled', { reason: p.cancelReason })}</p>}
          {error && (
            <p className="door-error" role="alert">
              {error}
            </p>
          )}

          <div className="door-row">
            {planActions(p).map((a) => (
              <button key={a} type="button" className={a === 'withdraw' || a === 'reopen' || a === 'pause' ? 'btn ghost' : 'btn'} onClick={() => void run(() => planStep(p.id, a))}>
                {t(actionKey(a, p.planType, p.beyondUnit) as 'door.plan.action.submit')}
              </button>
            ))}
            {p.canApprove && (
              <>
                <button type="button" className="btn" onClick={() => void run(() => planStep(p.id, 'approve'))}>
                  {t('door.plan.action.approve')}
                </button>
                <button type="button" className="btn secondary" onClick={() => setAsk('reject')}>
                  {t('door.plan.action.reject')}
                </button>
              </>
            )}
            {p.canEdit && !editing && options.data && (
              <button type="button" className="btn secondary" onClick={() => setEditing(true)}>
                {t('door.plan.form.edit')}
              </button>
            )}
            {p.canCancel && (
              <button type="button" className="btn ghost" onClick={() => setAsk('cancel')}>
                {t('door.plan.action.cancel')}
              </button>
            )}
            {p.canDelete && (
              <button type="button" className="btn ghost" onClick={() => setAsk('delete')}>
                {t('door.work.delete')}
              </button>
            )}
          </div>
          {ask && ask !== 'delete' && (
            <div className="panel door-form">
              <TextAreaField label={ask === 'reject' ? t('door.plan.rejectAsk') : t('door.plan.cancelAsk')} name="p-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="door-row">
                <button type="button" className="btn" disabled={!reason.trim()} onClick={() => void run(() => (ask === 'reject' ? rejectPlan(p.id, reason.trim()) : cancelPlan(p.id, reason.trim())))}>
                  {ask === 'reject' ? t('door.plan.action.reject') : t('door.plan.action.cancel')}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAsk(null)}>
                  {t('door.settings.cancel')}
                </button>
              </div>
            </div>
          )}
          {ask === 'delete' && (
            <div className="panel door-form" role="alertdialog" aria-label={t('door.work.delete')}>
              <p>{t('door.work.deleteWarn')}</p>
              <div className="door-row">
                <button type="button" className="btn" onClick={() => void run(async () => { await deletePlan(p.id); }, () => navigate(`/s/${systemId}/work`))}>
                  {t('door.work.deleteConfirm')}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAsk(null)}>
                  {t('door.settings.cancel')}
                </button>
              </div>
            </div>
          )}

          {editing && options.data ? (
            <PlanForm options={options.data} systemId={systemId} existing={p} onDone={(next) => { setPlan(next); setEditing(false); }} onCancel={() => setEditing(false)} />
          ) : (
            <div className="panel">
              <h3>{t('door.plan.record.planning')}</h3>
              {p.aim && <p>{p.aim}</p>}
              {p.needs && (
                <p>
                  <strong>{t('door.plan.form.needs')}:</strong> {p.needs}
                </p>
              )}
              {p.location && (
                <p>
                  <strong>{t('door.plan.form.location')}:</strong> {p.location}
                </p>
              )}
            </div>
          )}
            </>
          )}

          {tab === 'team' &&
            (p.team.length === 0 ? (
              <p className="muted">{t('door.plan.team.none')}</p>
            ) : (
              <RowList label={t('door.plan.tab.team')}>
                {p.team.map((m) => (
                  <ListRow key={m.personId} avatarName={m.name} title={m.name} detail={m.role} />
                ))}
              </RowList>
            ))}

          {tab === 'governance' && <PlanGovernance p={p} run={run} />}
          {tab === 'indicators' && <PlanIndicators p={p} run={run} />}
          {tab === 'guests' && <PlanGuests p={p} run={run} />}
          {tab === 'milestones' && <PlanMilestones p={p} run={run} />}

          {tab === 'money' && <PlanMoney systemId={systemId} planId={p.id} startsOn={p.startsOn} />}

          {tab === 'checklist' && (
            <div className="panel">
              <h3>{t('door.plan.tab.checklist')}</h3>
              {p.checks.length === 0 && <p className="muted">{t('door.plan.checklist.none')}</p>}
              {p.checks.length > 0 && (
                <ul className="door-list">
                  {p.checks.map((k) => (
                    <li key={k.id}>
                      <label className="door-check">
                        <input type="checkbox" checked={k.done} disabled={!p.canCheck} onChange={(e) => void run(() => tickPlanCheck(p.id, k.id, e.target.checked))} /> {k.label}
                      </label>
                      {p.canAddCheck && !k.done && (
                        <button type="button" className="btn ghost sm" onClick={() => void run(() => removePlanCheck(p.id, k.id))}>
                          {t('door.sched.unassign')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {p.canAddCheck && (
                <div className="door-row">
                  <TextField label={t('door.plan.checkAdd')} name="p-check" value={item} onChange={(e) => setItem(e.target.value)} />
                  <button type="button" className="btn secondary sm" disabled={!item.trim()} onClick={() => void run(() => addPlanCheck(p.id, item.trim()), () => setItem(''))}>
                    {t('door.plan.checkAddGo')}
                  </button>
                </div>
              )}
            </div>
          )}
          {tab === 'history' && (
            <>
          {p.levels.length > 0 && (
            <div className="panel">
              <h3>{t('door.plan.approvals')}</h3>
              <ul className="door-list">
                {p.levels.map((l) => (
                  <li key={l.levelKey}>
                    <strong>{l.label}</strong> ·{' '}
                    {l.status === 'APPROVED' ? t('door.plan.approvedBy', { who: l.byName ?? '', when: day(l.at) }) : t('door.plan.levelWaiting')}
                    {l.note ? ` — ${l.note}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}


              <div className="panel">
                <h3>{t('door.plan.record.execution')}</h3>
                {p.notes.length === 0 && <p className="muted">{t('door.plan.history.none')}</p>}
              {p.notes.length > 0 && (
                <ul className="door-list">
                  {p.notes.map((n) => (
                    <li key={n.id}>
                      <strong>{n.authorName}</strong> <span className="muted">{day(n.at)}</span> — {n.text}
                    </li>
                  ))}
                </ul>
              )}
              {p.canNote && (
                <div className="door-form">
                  <TextAreaField label={t('door.plan.noteAdd')} name="p-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" className="btn secondary sm" disabled={!note.trim()} onClick={() => void run(() => addPlanNote(p.id, note.trim()), () => setNote(''))}>
                    {t('door.plan.noteGo')}
                  </button>
                </div>
              )}
              </div>
            </>
          )}
          {tab === 'report' && !(p.status === 'CLOSING' || p.status === 'ENDED') && <p className="muted">{t('door.plan.report.notYet')}</p>}
          {tab === 'report' && (p.status === 'CLOSING' || p.status === 'ENDED') && (
            <div className="panel">
              <h3>{t('door.plan.report')}</h3>
              {p.canCompose ? (
                <div className="door-form">
                  {(['planningSummary', 'executionSummary', 'outcome'] as const).map((f) => (
                    <TextAreaField
                      key={f}
                      label={t(`door.plan.report.${f}` as const)}
                      name={`r-${f}`}
                      rows={3}
                      value={(report ?? p.report)[f]}
                      onChange={(e) => setReport({ ...(report ?? p.report), [f]: e.target.value })}
                    />
                  ))}
                  <div className="door-row">
                    <button type="button" className="btn secondary" disabled={!report} onClick={() => void run(() => saveReport(p.id, report!), () => setReport(null))}>
                      {t('door.plan.report.save')}
                    </button>
                    {p.canPublish && (
                      <button type="button" className="btn" disabled={!!report} onClick={() => void run(() => planStep(p.id, 'publish'))}>
                        {t('door.plan.action.publish')}
                      </button>
                    )}
                  </div>
                  {p.canPublish && <p className="muted">{t('door.plan.publishHint')}</p>}
                </div>
              ) : p.report.outcome || p.report.planningSummary || p.report.executionSummary ? (
                <>
                  {p.report.frozen && <p className="muted">{t('door.plan.report.frozen', { when: day(p.report.publishedAt) })}</p>}
                  {(['planningSummary', 'executionSummary', 'outcome'] as const).map((f) => (
                    <p key={f}>
                      <strong>{t(`door.plan.report.${f}` as const)}:</strong> {p.report[f]}
                    </p>
                  ))}
                  {p.canPublish && (
                    <button type="button" className="btn" onClick={() => void run(() => planStep(p.id, 'publish'))}>
                      {t('door.plan.action.publish')}
                    </button>
                  )}
                </>
              ) : (
                <p className="muted">{t('door.plan.report.notYet')}</p>
              )}
            </div>
          )}
        </section>
      )}
    </LoadState>
  );
}

/** What this program, project or event costs and earns; shown only to people who may read the system's money. */
function PlanMoney({ systemId, planId, startsOn }: { systemId: string; planId: string; startsOn: string | null }) {
  const t = useT();
  const year = startsOn ? new Date(new Date(startsOn).getTime() + 2 * 3600 * 1000).getUTCFullYear() : new Date().getUTCFullYear();
  const { capabilities } = useFrontDoor();
  const allowed = lettersFor(capabilities, systemId, 'money').length > 0;
  const money = useLoad(() => (allowed ? fetchPlanMoney(systemId, planId) : Promise.reject(new Error('no'))), `plan-money|${systemId}|${planId}|${allowed}`);
  const budget = useLoad(() => (allowed ? fetchMoneyPlan(systemId, year) : Promise.reject(new Error('no'))), `plan-budget|${systemId}|${year}|${allowed}`);
  if (!allowed || !money.data) return null;
  const mine = (budget.data?.items ?? []).filter((i) => i.planId === planId);
  const live = mine.filter((i) => i.status !== 'DROPPED');
  const budgetTotal = live.reduce((n, i) => n + i.amount, 0);
  const m = money.data;
  const empty = m.activities === 0 && m.entries === 0;
  return (
    <>
    <div className="panel">
      <h3>{t('door.plan.money.title')}</h3>
      {empty ? (
        <p className="muted">{t('door.plan.money.none')}</p>
      ) : (
        <p>{t('door.plan.money.line', { planned: formatRwf(m.planned), income: formatRwf(m.income), spending: formatRwf(m.spending), pending: formatRwf(m.pending) })}</p>
      )}
      {m.linked && <p>{t('door.plan.money.linked', { plans: m.linked.plans, planned: formatRwf(m.linked.planned), income: formatRwf(m.linked.income), spending: formatRwf(m.linked.spending), pending: formatRwf(m.linked.pending) })}</p>}
      <Link className="btn ghost sm" to={`/s/${systemId}/money/plan`}>
        {t('door.plan.money.open')}
      </Link>
    </div>
    <div className="panel">
      <h3>{t('door.plan.budget.title')}</h3>
      <p className="muted">{t('door.plan.budget.hint', { year })}</p>
      {mine.length === 0 ? (
        <p className="muted">{t('door.plan.budget.none')}</p>
      ) : (
        <>
          <ul className="door-list">
            {mine.map((i) => (
              <li key={i.id}>
                <strong>{i.title}</strong> · {formatRwf(i.amount)} · {t(categoryKey(i.category) as 'door.money.cat.OTHER')} · {t('door.money.activity.paidFrom')}:{' '}
                {fundingLabel(t, i.fundingKind || null, i.fundingCode ? budget.data?.fundingTypes.find((x) => x.code === i.fundingCode)?.name ?? i.fundingCode : null, i.fundingNote)}
                {i.status === 'DROPPED' ? ` · ${t('door.money.plan.status.DROPPED')}` : ''}
              </li>
            ))}
          </ul>
          <p><strong>{t('door.plan.budget.total')}</strong> {formatRwf(budgetTotal)}</p>
        </>
      )}
      {budget.data?.canWrite && <ActivityForm systemId={systemId} year={year} view={budget.data} fixedPlanId={planId} onSaved={() => { budget.reload(); money.reload(); }} />}
      {budget.data && !budget.data.canWrite && <p className="muted">{t('door.plan.budget.readOnly')}</p>}
      <Link className="btn ghost sm" to={`/s/${systemId}/money/budget`}>
        {t('door.plan.budget.open')}
      </Link>
    </div>
    </>
  );
}
