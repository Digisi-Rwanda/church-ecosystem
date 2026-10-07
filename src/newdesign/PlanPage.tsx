import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addPlanCheck, addPlanNote, cancelPlan, deletePlan, fetchPlan, fetchPlanOptions, planStep, rejectPlan, removePlanCheck, saveReport, tickPlanCheck,
  type PlanDetail,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PlanForm } from './PlanForm';
import { PLAN_STEPS, phaseOf, planActions, planErrorKey, planStatusKey, stepIndex } from './plans';
import { useLoad } from './useLoad';

type Ask = 'reject' | 'cancel' | 'delete' | null;

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
          <p>
            <Link to={`/s/${systemId}/work`}>← {t('door.block.work')}</Link>
          </p>
          <div className="door-row">
            <h2 id="door-plan-title">{p.title}</h2>
            <span className="door-chip">{t(planStatusKey(p.status))}</span>
            <span className="door-chip">{t(`door.work.visibility.${p.visibility}` as const)}</span>
          </div>
          <p className="muted">
            {p.unitName} · {t('door.plan.leader')}: {p.leaderName}
            {p.startsOn ? ` · ${day(p.startsOn)}${p.endsOn ? ` – ${day(p.endsOn)}` : ''}` : ''}
          </p>

          <ol className="door-steps" aria-label={t('door.plan.steps')}>
            {PLAN_STEPS.map((s) => (
              <li key={s} className={stepIndex(p.status) >= stepIndex(s) && p.status !== 'CANCELLED' ? 'done' : ''} aria-current={p.status === s ? 'step' : undefined}>
                {t(planStatusKey(s))}
              </li>
            ))}
          </ol>
          <p className="muted">{t(`door.plan.phase.${phaseOf(p.status)}` as const)}</p>
          {p.rejectedReason && p.status === 'DRAFT' && <p className="door-error">{t('door.plan.sentBack', { reason: p.rejectedReason })}</p>}
          {p.cancelReason && <p className="door-error">{t('door.plan.cancelled', { reason: p.cancelReason })}</p>}
          {error && (
            <p className="door-error" role="alert">
              {error}
            </p>
          )}

          <div className="door-row">
            {planActions(p).map((a) => (
              <button key={a} type="button" className={a === 'withdraw' || a === 'reopen' ? 'btn ghost' : 'btn'} onClick={() => void run(() => planStep(p.id, a))}>
                {t(`door.plan.action.${a}` as const)}
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
              {p.team.length > 0 && (
                <ul className="door-list">
                  {p.team.map((m) => (
                    <li key={m.personId}>
                      <strong>{m.name}</strong> · {m.role}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

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

          {(['RUNNING', 'CLOSING', 'ENDED'].includes(p.status) || p.notes.length > 0 || p.checks.length > 0) && (
            <div className="panel">
              <h3>{t('door.plan.record.execution')}</h3>
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
          )}

          {(p.status === 'CLOSING' || p.status === 'ENDED') && (
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
