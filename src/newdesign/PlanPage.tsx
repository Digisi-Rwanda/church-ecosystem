import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addPlanNote, cancelPlan, deletePlan, fetchActivityMoney, fetchPlan, fetchPlanOptions, planStep, rejectPlan,
  type ActivityMoney, type PlanDetail,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PlanDetailsView } from './PlanScreens';
import { PlanRunScreen, STAGES, type Stage } from './PlanRun';
import { PlanForm } from './PlanForm';
import { PlanLinks } from './PlanLinks';
import { GapLine, PlanMoney } from './PlanMoney';
import { actionKey, planActions, planErrorKey, planStatusKey, stateTone } from './plans';
import { DateChangeBanner, ReviewPrompt, TimePanel } from './PlanTime';
import { whenSummary } from './when';
import { useLoad } from './useLoad';
import { PageHeader, StatusChip, Tabs } from './kit';

type Ask = 'reject' | 'cancel' | 'delete' | 'done' | 'approve' | null;
type Tab = 'overview' | 'money' | 'details' | 'history' | Stage;

/** One plan: where it stands in the six steps, its planning record, the execution record and the report. */
export function PlanPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { systemId = '', planId = '' } = useParams();
  const load = useLoad(() => fetchPlan(planId), `plan|${planId}`);
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const moneyLoad = useLoad(() => fetchActivityMoney(planId), `plan-money|${planId}`);
  const [money, setMoney] = useState<ActivityMoney | null>(null);
  const m = money && money.planId === planId ? money : moneyLoad.data;
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [tab0, setTab0] = useState<Tab | null>(null);

  const p = plan && plan.id === planId ? plan : load.data;
  const tab: Tab = tab0 ?? 'overview';
  const setTab = (k: Tab) => setTab0(k);
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');

  const run = async (job: () => Promise<PlanDetail | void>, after?: () => void) => {
    setError('');
    try {
      const next = await job();
      if (next) setPlan(next);
      moneyLoad.reload();
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
            purpose={`${p.unitName} · ${t('door.plan.leader')}: ${p.leaderName}${p.startsOn ? ` · ${whenSummary(p, t, locale)}` : ''}`}
            meta={
              <>
                <StatusChip tone={stateTone(p.state)}>{p.state === 'WAITING' && p.waitingLevel ? t('door.state.waitingFor', { who: t(`door.level.${p.waitingLevel === 'Church Leader' ? 'CHURCH' : p.waitingLevel === 'Treasurer' ? 'TREASURER' : 'UNIT'}` as 'door.level.UNIT') }) : t(`door.state.${p.state}` as 'door.state.DRAFT')}</StatusChip>
                {p.state === 'APPROVED' && <StatusChip>{t(planStatusKey(p.status, p.planType))}</StatusChip>}
                {m?.pendingAmendment && <StatusChip tone="warn">{t('door.pm.amend.pending')}</StatusChip>}
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
              ...(m ? [{ key: 'money' as const, label: t('door.plan.tab.money') }] : []),
              ...STAGES[p.planType].map((st) => ({ key: st, label: t(`door.run.${p.planType}.${st}.name` as 'door.run.EVENT.s1.name') })),
              { key: 'details', label: t('door.ap.details') },
              { key: 'history', label: t('door.plan.tab.history') },
            ]}
          />
          {tab === 'details' && <PlanDetailsView p={p} />}
          {tab === 'money' && m && <PlanMoney p={p} m={m} onChange={(next) => { if (next) setMoney(next); moneyLoad.reload(); load.reload(); }} />}
          {tab === 'overview' && (
            <>
          <DateChangeBanner p={p} />
          <ReviewPrompt p={p} run={run} />
          <PlanLinks p={p} systemId={systemId} run={run} />
          {m && (m.planned > 0 || m.earmarked > 0) && <GapLine m={m} />}

          {p.rejectedReason && p.status === 'DRAFT' && <p className="door-error">{t('door.plan.sentBack', { reason: p.rejectedReason })}</p>}
          {p.cancelReason && <p className="door-error">{t('door.plan.cancelled', { reason: p.cancelReason })}</p>}
          {error && (
            <p className="door-error" role="alert">
              {error}
            </p>
          )}

          <div className="door-row">
            {planActions(p).filter((a) => a !== 'close').map((a) => (
              <button key={a} type="button" disabled={a === 'submit' && !!m && m.gap !== 0} className={a === 'withdraw' || a === 'reopen' || a === 'pause' ? 'btn ghost' : 'btn'} onClick={() => void run(() => planStep(p.id, a))}>
                {t(actionKey(a, p.planType, p.beyondUnit) as 'door.plan.action.submit')}
              </button>
            ))}
            {p.canApprove && (
              <>
                <button type="button" className="btn" disabled={!!m && m.gap !== 0} onClick={() => (m?.check?.result === 'FLAGGED' ? setAsk('approve') : void run(() => planStep(p.id, 'approve')))}>
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
            {p.canClose && (
              <button type="button" className="btn" onClick={() => setAsk('done')}>
                {t('door.state.markDone')}
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
          {ask === 'done' && (
            <div className="panel door-form">
              <TextAreaField label={t('door.state.doneAsk')} name="p-outcome" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="door-row">
                <button type="button" className="btn" disabled={!reason.trim()} onClick={() => void run(() => planStep(p.id, 'close', { outcome: reason.trim() }))}>
                  {t('door.state.markDone')}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAsk(null)}>
                  {t('door.settings.cancel')}
                </button>
              </div>
            </div>
          )}
          {ask === 'approve' && (
            <div className="panel door-form">
              <p className="door-error">{t('door.pm.flagged.warn')}</p>
              <TextAreaField label={t('door.pm.approveNote')} name="p-approve-note" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="door-row">
                <button type="button" className="btn" disabled={!reason.trim()} onClick={() => void run(() => planStep(p.id, 'approve', { note: reason.trim() }))}>
                  {t('door.plan.action.approve')}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAsk(null)}>
                  {t('door.settings.cancel')}
                </button>
              </div>
            </div>
          )}
          {ask && ask !== 'delete' && ask !== 'done' && ask !== 'approve' && (
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
            </div>
          )}
          {!editing && <TimePanel key={`${p.startsOn}|${p.endsOn}|${p.startTime}|${p.endTime}|${p.location}`} p={p} run={run} />}
            </>
          )}

          {(tab === 's1' || tab === 's2' || tab === 's3' || tab === 's4') && STAGES[p.planType].includes(tab) && <PlanRunScreen p={p} stage={tab} systemId={systemId} run={run} />}
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
        </section>
      )}
    </LoadState>
  );
}
