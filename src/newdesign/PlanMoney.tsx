import { bucketName } from './fundLabels';
import { useState } from 'react';
import {
  addMoneyLine, answerMoneyCheck, editMoneyLine, removeMoneyLine, setMoneySources, verifyMoneyLine,
  type ActivityMoney, type PlanDetail,
} from '../api/frontDoorApi';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { formatRwf } from './money';
import { planErrorKey } from './plans';
import { AmendForm, CyclePanel, PendingAmendment, SpendingVsPlan } from './PlanAmend';
import { FundraisingLine, SettlementPanel } from './PlanSettle';
import { StatusChip } from './kit';
import { BurnPanel, PhasePick, PhaseTable } from './PlanViews';

/** "Planned spending X · Money set aside Y · Gap Z": the live line that decides whether Submit is on. */
export function GapLine({ m }: { m: ActivityMoney }) {
  const t = useT();
  return (
    <p className={m.gap === 0 ? 'muted' : 'door-error'} role="status">
      {t('door.pm.line', { planned: formatRwf(m.planned), aside: formatRwf(m.earmarked), gap: formatRwf(m.gap) })}
    </p>
  );
}

const tone = (s: 'VERIFIED' | 'MODIFIED' | null) => (s === 'VERIFIED' ? 'success' : s === 'MODIFIED' ? 'warn' : 'neutral');

/** The Money tab of an activity: spending lines, the money set aside, and the Treasurer's check. */
export function PlanMoney({ p, m, onChange }: { p: PlanDetail; m: ActivityMoney; onChange: (next?: ActivityMoney) => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eAmount, setEAmount] = useState('');
  const [aside, setAside] = useState<Record<string, string>>({});
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState('');
  const [amending, setAmending] = useState(false);
  const [phase, setPhase] = useState('');
  const [ePhase, setEPhase] = useState('');
  const phases = p.milestones.map((x) => ({ id: x.id, title: x.title }));

  const go = async (job: () => Promise<ActivityMoney>, after?: () => void) => {
    setError('');
    try {
      onChange(await job());
      after?.();
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const asideOf = (potId: string) => aside[potId] ?? String(m.sources.find((s) => s.potId === potId)?.amount ?? '');
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  return (
    <div className="panel">
      <h3>{t('door.pm.title')}</h3>
      <GapLine m={m} />
      <FundraisingLine m={m} />
      {m.gap > 0 && m.canEdit && <p className="muted">{t('door.pm.gapNote')}</p>}
      {m.gap < 0 && m.canEdit && <p className="muted">{t('door.pm.over')}</p>}
      {!m.open && <p className="muted">{t('door.pm.locked')}</p>}
      <SettlementPanel p={p} m={m} onChange={() => onChange()} />
      {m.pendingAmendment && <PendingAmendment p={p} a={m.pendingAmendment} m={m} go={go} />}
      {m.canRequestAmendment && !amending && (
        <button type="button" className="btn" onClick={() => setAmending(true)}>{t('door.pm.amend.request')}</button>
      )}
      {amending && <AmendForm p={p} m={m} go={go} onCancel={() => setAmending(false)} />}
      <BurnPanel m={m} />
      <PhaseTable m={m} />
      <SpendingVsPlan m={m} />
      <CyclePanel key={`${m.cycle.kind}|${m.cycle.explicit}|${m.status}`} p={p} m={m} onChange={onChange} />
      {!m.canEdit && m.open && <p className="muted">{t('door.pm.readOnly')}</p>}
      {m.check?.result === 'FLAGGED' && <p className="door-error">{t('door.pm.result.FLAGGED', { note: m.check.note ?? '' })}</p>}
      {m.check?.result === 'CHECKED' && <p className="muted">{t('door.pm.result.CHECKED')}</p>}
      {error && <p className="door-error" role="alert">{error}</p>}

      <h4>{t('door.pm.spending')}</h4>
      {m.lines.length === 0 ? (
        <p className="muted">{t('door.pm.spendingNone')}</p>
      ) : (
        <ul className="door-list">
          {m.lines.map((l) => (
            <li key={l.id} className={m.locked ? 'muted' : undefined}>
              {editing === l.id ? (
                <div className="door-form">
                  <TextField label={t('door.pm.for')} name={`pm-t-${l.id}`} value={eTitle} onChange={(e) => setETitle(e.target.value)} />
                  <TextField label={t('door.pm.amount')} name={`pm-a-${l.id}`} inputMode="numeric" value={eAmount} onChange={(e) => setEAmount(e.target.value)} />
                  <PhasePick m={m} name={`pm-p-${l.id}`} phases={phases} value={ePhase} onChange={setEPhase} />
                  <div className="door-row">
                    <button type="button" className="btn sm" disabled={!eTitle.trim() || num(eAmount) < 1} onClick={() => void go(() => editMoneyLine(p.id, l.id, { title: eTitle.trim(), amount: num(eAmount), ...(m.planType === 'PROJECT' ? { milestoneId: ePhase || null } : {}) }), () => setEditing(null))}>
                      {t('door.pm.save')}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>{t('door.pm.cancel')}</button>
                  </div>
                </div>
              ) : (
                <>
                  <strong>{l.title}</strong> · {formatRwf(l.amount)}{' '}
                  {m.planType === 'PROJECT' && phases.length > 0 && <span className="muted">· {t('door.pm.phase.of', { phase: phases.find((x) => x.id === l.milestoneId)?.title ?? t('door.pm.phase.general') })}{' '}</span>}
                  {(m.status === 'PENDING_APPROVAL' || l.checkState) && (
                    <StatusChip tone={tone(l.checkState)}>{t(l.checkState ? (`door.pm.check.${l.checkState}` as 'door.pm.check.VERIFIED') : 'door.pm.check.none')}</StatusChip>
                  )}{' '}
                  {m.canEdit && (
                    <>
                      <button type="button" className="btn ghost sm" onClick={() => { setEditing(l.id); setETitle(l.title); setEAmount(String(l.amount)); setEPhase(l.milestoneId ?? ''); }}>{t('door.pm.edit')}</button>{' '}
                      <button type="button" className="btn ghost sm" onClick={() => void go(() => removeMoneyLine(p.id, l.id))}>{t('door.pm.remove')}</button>
                    </>
                  )}
                  {m.canVerify && (
                    <button type="button" className="btn secondary sm" onClick={() => void go(() => verifyMoneyLine(p.id, l.id, l.checkState !== 'VERIFIED'))}>
                      {l.checkState === 'VERIFIED' ? t('door.pm.unverify') : t('door.pm.verify')}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {m.canEdit && (
        <div className="door-form">
          <TextField label={t('door.pm.for')} name="pm-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField label={t('door.pm.amount')} name="pm-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <PhasePick m={m} name="pm-phase" phases={phases} value={phase} onChange={setPhase} />
          <button type="button" className="btn secondary sm" disabled={!title.trim() || num(amount) < 1} onClick={() => void go(() => addMoneyLine(p.id, { title: title.trim(), amount: num(amount), ...(phase ? { milestoneId: phase } : {}) }), () => { setTitle(''); setAmount(''); setPhase(''); })}>
            {t('door.pm.add')}
          </button>
        </div>
      )}

      {(m.canEdit || m.sources.length > 0) && (
        <>
          <h4>{t('door.pm.sources')}</h4>
          {m.canEdit && <p className="muted">{t('door.pm.sourcesHint')}</p>}
          <ul className="door-list">
            {m.pots.map((pot) => {
              const mine = m.sources.find((s) => s.potId === pot.id)?.amount ?? 0;
              if (!m.canEdit && !mine) return null;
              return (
                <li key={pot.id}>
                  <strong>{bucketName(t, pot)}</strong> · {t('door.pm.available')}: {formatRwf(pot.available + (m.canEdit ? 0 : 0))}
                  {pot.pledged > 0 && <span className="muted"> · {t('door.funds.pledged')}: {formatRwf(pot.pledged)}</span>}
                  {m.canEdit ? (
                    <TextField label={t('door.pm.setAside')} name={`pm-s-${pot.id}`} inputMode="numeric" value={asideOf(pot.id)} onChange={(e) => setAside({ ...aside, [pot.id]: e.target.value })} />
                  ) : (
                    <> · {formatRwf(mine)}</>
                  )}
                </li>
              );
            })}
          </ul>
          {m.canEdit && (
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => void go(() => setMoneySources(p.id, m.pots.map((pot) => ({ kind: pot.kind, code: pot.code, amount: num(asideOf(pot.id)) })).filter((x) => x.amount > 0)), () => setAside({}))}
            >
              {t('door.pm.saveAside')}
            </button>
          )}
        </>
      )}

      {m.canCheck && (
        <div className="door-form">
          {!m.allVerified && <p className="muted">{t('door.pm.tickFirst')}</p>}
          <div className="door-row">
            <button type="button" className="btn" disabled={!m.allVerified} onClick={() => void go(() => answerMoneyCheck(p.id, 'CHECKED'))}>{t('door.pm.checked')}</button>
            <button type="button" className="btn secondary" onClick={() => setFlagging(true)}>{t('door.pm.flag')}</button>
          </div>
          {flagging && (
            <>
              <TextAreaField label={t('door.pm.flagNote')} name="pm-flag" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" className="btn sm" disabled={!note.trim()} onClick={() => void go(() => answerMoneyCheck(p.id, 'FLAGGED', note.trim()), () => { setFlagging(false); setNote(''); })}>{t('door.pm.flagSend')}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
