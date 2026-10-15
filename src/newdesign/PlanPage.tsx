import { levelKeyOf } from './planLevels';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  cancelPlan, deletePlan, fetchActivityMoney, fetchPlan, fetchPlanOptions, planStep, rejectPlan, suspendPlan, unsuspendPlan,
  type ActivityMoney, type PlanDetail,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PlanDetailsView } from './PlanScreens';
import { NotesTab, WorkTab } from './PlanWork';
import { PlanMoneyLive } from './PlanMoneyLive';
import { PlanForm } from './PlanForm';
import { PlanLinks } from './PlanLinks';
import { GapLine, PlanMoney } from './PlanMoney';
import { actionKey, planActions, planErrorKey, planStatusKey, planTone } from './plans';
import { PlanFiles } from './PlanFiles';
import { DateChangeBanner, ReviewPrompt, TimePanel } from './PlanTime';
import { whenSummary } from './when';
import { useLoad } from './useLoad';
import { PageHeader, SidePanel, StatusChip, Tabs } from './kit';

type Ask = 'reject' | 'cancel' | 'delete' | 'done' | 'approve' | 'suspend' | 'unsuspend' | null;
type Tab = 'overview' | 'money' | 'work' | 'files' | 'history';

/** One activity: its overview and, once approved, three working tabs (Checklist, Money, Notes) plus Revenue for a fundraiser; details and history. */
export function PlanPage() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const loc = useLocation();
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
  const [target, setTarget] = useState<'CREATOR' | 'PREVIOUS'>('CREATOR');
  const [error, setError] = useState('');
  const [tab0, setTab0] = useState<Tab | null>(null);

  const p = plan && plan.id === planId ? plan : load.data;
  const live = !!p && (p.state === 'APPROVED' || p.state === 'DONE');
  const tab: Tab = tab0 ?? ((loc.state as { tab?: Tab } | null)?.tab ?? 'overview');
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
                <StatusChip tone={planTone(p.state, p.status)}>{p.state === 'WAITING' && p.waitingLevel ? t('door.state.waitingFor', { who: t(`door.level.${levelKeyOf(p.waitingLevel)}` as 'door.level.UNIT') }) : t(`door.state.${p.state}` as 'door.state.DRAFT')}</StatusChip>
                {p.state === 'APPROVED' && <StatusChip tone={planTone(p.state, p.status)}>{t(planStatusKey(p.status, p.planType))}</StatusChip>}
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
              ...(live ? [{ key: 'work' as const, label: t(`door.plan.tab.work.${p.planType}` as 'door.plan.tab.work.EVENT') }] : []),
              ...(m ? [{ key: 'money' as const, label: t('door.plan.tab.money') }] : []),
              { key: 'files', label: t('door.plan.tab.files') },
              { key: 'history', label: t('door.plan.tab.history') },
            ]}
          />
          {tab === 'files' && <PlanFiles planId={p.id} />}
          {tab === 'work' && live && <WorkTab p={p} run={run} systemId={systemId} />}
          {tab === 'money' && m && (m.open
            ? <PlanMoney p={p} m={m} onChange={(next) => { if (next) setMoney(next); moneyLoad.reload(); load.reload(); }} />
            : <PlanMoneyLive p={p} m={m} onChange={(next) => { if (next) setMoney(next); moneyLoad.reload(); load.reload(); }} />)}
          {tab === 'overview' && (
            <>
          <DateChangeBanner p={p} />
          <ReviewPrompt p={p} run={run} />
          <PlanLinks p={p} systemId={systemId} run={run} />
          {m && (m.planned > 0 || m.earmarked > 0) && <GapLine m={m} />}

          {p.rejectedReason && (p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL') && <p className="door-error">{t('door.plan.sentBack', { reason: p.rejectedReason })}</p>}
          {p.suspension && <p className="door-error" role="status">{t('door.plan.suspended', { name: p.suspension.byName, note: p.suspension.note })}</p>}
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
                  {t(p.waitingLevel === 'Catechist' ? 'door.plan.action.verify' : 'door.plan.action.approve')}
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
            {p.canSuspend && (
              <button type="button" className="btn secondary" onClick={() => setAsk('suspend')}>
                {t('door.plan.action.suspend')}
              </button>
            )}
            {p.canUnsuspend && (
              <button type="button" className="btn secondary" onClick={() => setAsk('unsuspend')}>
                {t('door.plan.action.unsuspend')}
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
          <SidePanel open={ask === 'suspend'} title={t('door.plan.suspendTitle')} purpose={t('door.plan.suspendPurpose')} onClose={() => setAsk(null)} saveLabel={t('door.plan.action.suspend')} canSave={!!reason.trim()} onSave={() => void run(() => suspendPlan(p.id, reason.trim()))}>
            <div className="door-form">
              <TextAreaField label={t('door.plan.suspendAsk')} name="p-suspend" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              {error && <p className="door-error" role="alert">{error}</p>}
            </div>
          </SidePanel>
          {ask && ask !== 'delete' && ask !== 'done' && ask !== 'approve' && ask !== 'suspend' && (
            <div className="panel door-form">
              <TextAreaField label={ask === 'reject' ? t('door.plan.rejectAsk') : ask === 'unsuspend' ? t('door.plan.unsuspendAsk') : t('door.plan.cancelAsk')} name="p-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              {ask === 'reject' && p.levels.some((l) => l.status === 'APPROVED') && (
                <SelectField label={t('door.plan.returnTo')} name="p-return" value={target} onChange={(e) => setTarget(e.target.value as 'CREATOR' | 'PREVIOUS')}>
                  <option value="CREATOR">{t('door.plan.returnTo.CREATOR')}</option>
                  <option value="PREVIOUS">{t('door.plan.returnTo.PREVIOUS')}</option>
                </SelectField>
              )}
              <div className="door-row">
                <button type="button" className="btn" disabled={ask !== 'unsuspend' && !reason.trim()} onClick={() => void run(() => (ask === 'reject' ? rejectPlan(p.id, reason.trim(), target) : ask === 'unsuspend' ? unsuspendPlan(p.id, reason.trim() || undefined) : cancelPlan(p.id, reason.trim())))}>
                  {ask === 'reject' ? t('door.plan.action.reject') : ask === 'unsuspend' ? t('door.plan.action.unsuspend') : t('door.plan.action.cancel')}
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
          {Object.keys(p.details ?? {}).length > 0 && <PlanDetailsView p={p} />}
          {!editing && <TimePanel key={`${p.startsOn}|${p.endsOn}|${p.startTime}|${p.endTime}|${p.location}`} p={p} run={run} />}
            </>
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

          {live && <NotesTab p={p} run={run} />}
            </>
          )}
        </section>
      )}
    </LoadState>
  );
}
