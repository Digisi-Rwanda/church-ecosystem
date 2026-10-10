import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addPlanNote, cancelPlan, deletePlan, fetchPlan, fetchPlanOptions, planStep, rejectPlan,
  type PlanDetail,
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
import { actionKey, planActions, planErrorKey, planStatusKey } from './plans';
import { useLoad } from './useLoad';
import { PageHeader, StatusChip, Tabs } from './kit';

type Ask = 'reject' | 'cancel' | 'delete' | null;
type Tab = 'overview' | 'details' | 'history' | Stage;

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
              ...STAGES[p.planType].map((st) => ({ key: st, label: t(`door.run.${p.planType}.${st}.name` as 'door.run.EVENT.s1.name') })),
              { key: 'details', label: t('door.ap.details') },
              { key: 'history', label: t('door.plan.tab.history') },
            ]}
          />
          {tab === 'details' && <PlanDetailsView p={p} />}
          {tab === 'overview' && (
            <>
          <PlanLinks p={p} systemId={systemId} run={run} />

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
                  <strong>{t('door.plan.place')}:</strong> {p.location}
                </p>
              )}
            </div>
          )}
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
