import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchActivityMoney, fetchPlan, planStep, rejectPlan, suspendPlan, type ApprovalItem, type PlanDetail } from '../api/frontDoorApi';
import { TextAreaField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { bucketName } from './fundLabels';
import { errorCode } from './governance';
import { SidePanel, StatusChip, Tabs } from './kit';
import { LoadState } from './LoadState';
import { categoryKey, formatRwf } from './money';
import { PlanFiles } from './PlanFiles';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';

type Tab = 'overview' | 'money' | 'files' | 'chain';
type Ask = 'approve' | 'return' | 'suspend' | null;

/** The review of one activity waiting for a decision: Overview, Money, Attachments and the Approval Chain, with the decision beside them. */
export function ApprovalReview({ item, onClose, onDone, canSuspendNow = false }: { item: Pick<ApprovalItem, 'id' | 'systemId' | 'title' | 'href'>; onClose: () => void; onDone: () => void; canSuspendNow?: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const [tab, setTab] = useState<Tab>('overview');
  const [ask, setAsk] = useState<Ask>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const plan = useLoad(() => fetchPlan(item.id), `rv-plan|${item.id}`);
  const money = useLoad(() => fetchActivityMoney(item.id), `rv-money|${item.id}`);
  const p: PlanDetail | null = plan.data ?? null;
  const m = money.data ?? null;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const flagged = m?.check?.result === 'FLAGGED';

  const decide = async () => {
    if (!p || !ask) return;
    setBusy(true);
    setError('');
    try {
      if (ask === 'approve') await planStep(p.id, 'approve', note.trim() ? { note: note.trim() } : {});
      else if (ask === 'return') await rejectPlan(p.id, note.trim(), 'CREATOR');
      else await suspendPlan(p.id, note.trim());
      onDone();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  const needNote = ask === 'return' || ask === 'suspend' || (ask === 'approve' && flagged);

  return (
    <SidePanel open wide title={item.title} purpose={p ? `${p.unitName} · ${t('door.plan.leader')}: ${p.leaderName}` : undefined} onClose={onClose}>
      <LoadState loading={plan.loading || !p} failed={plan.failed} retry={plan.reload}>
        {p && (
          <>
            <Tabs
              label={t('door.rv.tabs')}
              value={tab}
              onChange={setTab}
              items={[
                { key: 'overview', label: t('door.rv.tab.overview') },
                { key: 'money', label: t('door.rv.tab.money') },
                { key: 'files', label: t('door.rv.tab.files') },
                { key: 'chain', label: t('door.rv.tab.chain') },
              ]}
            />
            {tab === 'overview' && (
              <div className="panel-inset">
                <p><StatusChip tone="neutral">{t(`door.plans.${p.planType}` as 'door.plans.PROGRAM')}</StatusChip>{p.fundraising ? <> <StatusChip tone="info">{t('door.ac.type.fundraising')}</StatusChip></> : null}</p>
                {p.startsOn && <p>{day(p.startsOn)}{p.endsOn && p.endsOn !== p.startsOn ? ` → ${day(p.endsOn)}` : ''}{p.location ? ` · ${p.location}` : ''}</p>}
                {p.aim && <p>{p.aim}</p>}
                {p.needs && <p><strong>{t('door.plan.form.needs')}:</strong> {p.needs}</p>}
                {p.fundraising && <p>{t('door.ac.target')}: <strong>{formatRwf(p.fundTarget ?? 0)}</strong></p>}
                {p.milestones.length > 0 && <ul className="door-list">{p.milestones.map((x) => <li key={x.id}>{x.title}{x.dueOn && <span className="muted"> · {day(x.dueOn)}</span>}</li>)}</ul>}
                <p className="muted">{t('door.rv.by', { name: p.createdByName })}</p>
                <p><Link to={item.href}>{t('door.rv.openFull')}</Link></p>
              </div>
            )}
            {tab === 'money' && (
              <LoadState loading={money.loading || !m} failed={money.failed} retry={money.reload}>
                {m && (
                  <div className="panel-inset">
                    <div className="stat-tiles">
                      <div className="stat-tile"><span className="muted">{t('door.ac.totalCost')}</span><strong>{formatRwf(m.planned)}</strong></div>
                      <div className="stat-tile"><span className="muted">{t('door.ac.totalAside')}</span><strong>{formatRwf(m.earmarked)}</strong></div>
                      <div className="stat-tile"><span className="muted">{t('door.ac.gap')}</span><strong>{formatRwf(m.gap)}</strong></div>
                    </div>
                    {m.check?.result === 'FLAGGED' && <p className="door-error">{t('door.pm.result.FLAGGED', { note: m.check.note ?? '' })}</p>}
                    {m.check?.result === 'CHECKED' && <p className="muted">{t('door.pm.result.CHECKED')}</p>}
                    <ul className="door-list">{m.lines.map((l) => <li key={l.id}>{l.title} · {formatRwf(l.amount)}{l.category && <span className="muted"> · {t(categoryKey(l.category) as 'door.money.cat.OTHER')}</span>}</li>)}</ul>
                    <h4>{t('door.ac.aside')}</h4>
                    <ul className="door-list">{m.sources.map((x) => { const pot = m.pots.find((y) => y.id === x.potId); return <li key={x.potId}>{pot ? bucketName(t, pot) : x.potId} · <strong>{formatRwf(x.amount)}</strong></li>; })}</ul>
                  </div>
                )}
              </LoadState>
            )}
            {tab === 'files' && <PlanFiles planId={p.id} />}
            {tab === 'chain' && (
              <div className="panel-inset">
                <ol className="door-list">
                  {p.levels.map((l) => (
                    <li key={l.levelKey}>
                      <strong>{t(`door.level.${l.levelKey}` as 'door.level.UNIT')}</strong> ·{' '}
                      {l.status === 'APPROVED' ? t('door.plan.approvedBy', { who: l.byName ?? '', when: day(l.at) }) : t('door.plan.levelWaiting')}
                      {l.note ? ` — ${l.note}` : ''}
                    </li>
                  ))}
                </ol>
                {p.levels.length === 0 && <p className="muted">{t('door.rv.noChain')}</p>}
              </div>
            )}

            <div className="panel-inset">
              {ask === null ? (
                <div className="door-row">
                  {p.canApprove && <button type="button" className="btn" disabled={!!m && m.gap !== 0} onClick={() => setAsk('approve')}>{t('door.rv.approve')}</button>}
                  {p.canApprove && <button type="button" className="btn secondary" onClick={() => setAsk('return')}>{t('door.rv.return')}</button>}
                  {(canSuspendNow || p.canSuspend) && <button type="button" className="btn ghost" onClick={() => setAsk('suspend')}>{t('door.plan.suspendTitle')}</button>}
                  {!p.canApprove && !p.canSuspend && <p className="muted">{t('door.rv.notYours')}</p>}
                </div>
              ) : (
                <div className="door-form">
                  {ask === 'approve' && flagged && <p className="door-error">{t('door.pm.flagged.warn')}</p>}
                  <TextAreaField label={t(ask === 'return' ? 'door.rv.returnAsk' : ask === 'suspend' ? 'door.plan.suspendAsk' : flagged ? 'door.pm.approveNote' : 'door.rv.noteOptional')} name="rv-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                  {error && <p className="door-error" role="alert">{error}</p>}
                  <div className="door-row">
                    <button type="button" className="btn" disabled={busy || (needNote && !note.trim())} onClick={() => void decide()}>{t(ask === 'approve' ? 'door.rv.approve' : ask === 'return' ? 'door.rv.return' : 'door.plan.action.suspend')}</button>
                    <button type="button" className="btn ghost" onClick={() => { setAsk(null); setNote(''); setError(''); }}>{t('door.settings.cancel')}</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </LoadState>
    </SidePanel>
  );
}
