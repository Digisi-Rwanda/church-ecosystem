import { useState } from 'react';
import { addPlanCheck, addPlanNote, fetchPlanMoney, markAttended, planStep, removePlanCheck, saveReport, tickPlanCheck, type PlanDetail } from '../api/frontDoorApi';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { lettersFor } from './menu';
import { formatRwf } from './money';
import { PlanBudget } from './PlanBudget';
import { PlanGuests } from './PlanGuests';
import { PlanLinks } from './PlanLinks';
import { PlanMilestones } from './PlanMilestones';
import { PlanGovernance, PlanIndicators } from './PlanProgram';
import { actionKey, planActions, planStatusKey } from './plans';
import { useLoad } from './useLoad';
import { ListRow, RowList, StatusChip } from './kit';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;
export type Stage = 's1' | 's2' | 's3' | 's4';
/** How many run screens each kind of work has, as the church designed them. */
export const STAGES: Record<PlanDetail['planType'], Stage[]> = { EVENT: ['s1', 's2', 's3', 's4'], PROJECT: ['s1', 's2', 's3'], PROGRAM: ['s1', 's2', 's3', 's4'] };

type Tile = { label: string; value: string; hint?: string; warn?: boolean };
/** A row of the numbers that matter on a screen. */
function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="run-tiles">
      {tiles.map((x) => (
        <li key={x.label} className={x.warn ? 'warn' : ''}>
          <span className="muted">{x.label}</span>
          <strong>{x.value}</strong>
          {x.hint && <small className="muted">{x.hint}</small>}
        </li>
      ))}
    </ul>
  );
}

/** The plan's money, for those who may read the system's money; nobody else sees these tiles. */
function useMoney(systemId: string, planId: string) {
  const { capabilities } = useFrontDoor();
  const allowed = lettersFor(capabilities, systemId, 'money').length > 0;
  const m = useLoad(() => (allowed ? fetchPlanMoney(systemId, planId) : Promise.reject(new Error('no'))), `run-money|${systemId}|${planId}|${allowed}`);
  return allowed && m.data ? m.data : null;
}

const lines = (text: string | undefined) => (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const TIME = /^(\d{1,2}[:.]\d{2}(?:\s*[-–]\s*\d{1,2}[:.]\d{2})?)\s+(.*)$/;

/** The agenda written in Action plan, one line per slot; a leading time is shown as the time. */
function Schedule({ p }: { p: PlanDetail }) {
  const t = useT();
  const rows = lines(p.details?.agenda);
  return (
    <section className="panel">
      <h3>{t('door.run.h.agenda')}</h3>
      {rows.length === 0 ? <p className="muted">{t('door.run.none')}</p> : (
        <ol className="run-schedule">
          {rows.map((r, i) => {
            const m = TIME.exec(r);
            return (<li key={i}>{m ? <><time>{m[1]}</time><span>{m[2]}</span></> : <span>{r}</span>}</li>);
          })}
        </ol>
      )}
    </section>
  );
}

/** Tasks and logistics: a checklist the team ticks off. */
function Checklist({ p, run, title }: { p: PlanDetail; run: Run; title: string }) {
  const t = useT();
  const [item, setItem] = useState('');
  const done = p.checks.filter((k) => k.done).length;
  return (
    <section className="panel">
      <div className="door-row"><h3>{title}</h3>{p.checks.length > 0 && <span className="muted">{done} / {p.checks.length}</span>}</div>
      {p.checks.length === 0 && <p className="muted">{t('door.plan.checklist.none')}</p>}
      {p.checks.length > 0 && (
        <ul className="door-list">
          {p.checks.map((k) => (
            <li key={k.id}>
              <label className="door-check">
                <input type="checkbox" checked={k.done} disabled={!p.canCheck} onChange={(e) => void run(() => tickPlanCheck(p.id, k.id, e.target.checked))} /> {k.label}
              </label>
              {p.canAddCheck && !k.done && <button type="button" className="btn ghost sm" onClick={() => void run(() => removePlanCheck(p.id, k.id))}>{t('door.sched.unassign')}</button>}
            </li>
          ))}
        </ul>
      )}
      {p.canAddCheck && (
        <div className="door-row">
          <TextField label={t('door.plan.checkAdd')} name="run-check" value={item} onChange={(e) => setItem(e.target.value)} />
          <button type="button" className="btn secondary sm" disabled={!item.trim()} onClick={() => void run(() => addPlanCheck(p.id, item.trim()), () => setItem(''))}>{t('door.plan.checkAddGo')}</button>
        </div>
      )}
    </section>
  );
}

/** Notes by the team while the work runs: updates, incidents, improvements. */
export function Notes({ p, run, title }: { p: PlanDetail; run: Run; title: string }) {
  const t = useT();
  const { locale } = useI18n();
  const [note, setNote] = useState('');
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  return (
    <section className="panel">
      <h3>{title}</h3>
      {p.notes.length === 0 && <p className="muted">{t('door.plan.history.none')}</p>}
      {p.notes.length > 0 && (
        <ul className="door-list">
          {p.notes.map((n) => (<li key={n.id}><strong>{n.authorName}</strong> <span className="muted">{day(n.at)}</span> — {n.text}</li>))}
        </ul>
      )}
      {p.canNote && (
        <div className="door-form">
          <TextAreaField label={t('door.plan.noteAdd')} name={`run-note-${title}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn secondary sm" disabled={!note.trim()} onClick={() => void run(() => addPlanNote(p.id, note.trim()), () => setNote(''))}>{t('door.plan.noteGo')}</button>
        </div>
      )}
    </section>
  );
}

/** The closing report: what was planned, what happened, the outcome; published once, then frozen. */
function Report({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const { locale } = useI18n();
  const [report, setReport] = useState<{ planningSummary: string; executionSummary: string; outcome: string } | null>(null);
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const open = p.status === 'CLOSING' || p.status === 'ENDED';
  return (
    <section className="panel">
      <h3>{t('door.plan.report')}</h3>
      {!open ? <p className="muted">{t('door.plan.report.notYet')}</p> : p.canCompose ? (
        <div className="door-form">
          {(['planningSummary', 'executionSummary', 'outcome'] as const).map((f) => (
            <TextAreaField key={f} label={t(`door.plan.report.${f}` as const)} name={`r-${f}`} rows={3} value={(report ?? p.report)[f]} onChange={(e) => setReport({ ...(report ?? p.report), [f]: e.target.value })} />
          ))}
          <div className="door-row">
            <button type="button" className="btn secondary" disabled={!report} onClick={() => void run(() => saveReport(p.id, report!), () => setReport(null))}>{t('door.plan.report.save')}</button>
            {p.canPublish && <button type="button" className="btn" disabled={!!report} onClick={() => void run(() => planStep(p.id, 'publish'))}>{t('door.plan.action.publish')}</button>}
          </div>
          {p.canPublish && <p className="muted">{t('door.plan.publishHint')}</p>}
        </div>
      ) : p.report.outcome || p.report.planningSummary || p.report.executionSummary ? (
        <>
          {p.report.frozen && <p className="muted">{t('door.plan.report.frozen', { when: day(p.report.publishedAt) })}</p>}
          {(['planningSummary', 'executionSummary', 'outcome'] as const).map((f) => (<p key={f}><strong>{t(`door.plan.report.${f}` as const)}:</strong> {p.report[f]}</p>))}
          {p.canPublish && <button type="button" className="btn" onClick={() => void run(() => planStep(p.id, 'publish'))}>{t('door.plan.action.publish')}</button>}
        </>
      ) : <p className="muted">{t('door.plan.report.notYet')}</p>}
    </section>
  );
}

function Team({ p }: { p: PlanDetail }) {
  const t = useT();
  return (
    <section className="panel">
      <h3>{t('door.run.h.team')}</h3>
      {p.team.length === 0 ? <p className="muted">{t('door.plan.team.none')}</p> : (
        <RowList label={t('door.run.h.team')}>{p.team.map((m) => (<ListRow key={m.personId} avatarName={m.name} title={m.name} detail={m.role} />))}</RowList>
      )}
      {p.details?.responsibilities && <p className="muted">{p.details.responsibilities}</p>}
    </section>
  );
}

/** Only the buttons that close or renew the work, shown where the design puts them: on its last screen. */
function Finish({ p, run, which }: { p: PlanDetail; run: Run; which: Array<'close' | 'renew' | 'start' | 'resume' | 'pause'> }) {
  const t = useT();
  const acts = planActions(p).filter((a) => (which as string[]).includes(a));
  if (acts.length === 0) return null;
  return (
    <div className="run-finish">
      <StatusChip>{t(planStatusKey(p.status, p.planType))}</StatusChip>
      <span className="ap-spacer" />
      {acts.map((a) => (<button key={a} type="button" className={a === 'pause' || a === 'renew' ? 'btn ghost' : 'btn'} onClick={() => void run(() => planStep(p.id, a))}>{t(actionKey(a, p.planType, p.beyondUnit) as 'door.plan.action.close')}</button>))}
    </div>
  );
}

/** Attendance on the day: who is here, ticked off. */
function Attendance({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const r = p.registration;
  if (!r) return null;
  return (
    <section className="panel">
      <h3>{t('door.run.h.checkin')}</h3>
      {r.items.length === 0 ? <p className="muted">{t('door.plan.guests.none')}</p> : (
        <RowList label={t('door.run.h.checkin')}>
          {r.items.map((g) => (
            <ListRow key={g.id} avatarName={g.name} title={g.name} detail={t(`door.plan.guests.src.${g.source}` as const)}
              action={p.canMarkAttendance ? (
                <label className="door-check"><input type="checkbox" checked={g.attended} onChange={(e) => void run(() => markAttended(p.id, g.id, e.target.checked))} /> {t('door.plan.guests.here')}</label>
              ) : g.attended ? <span className="muted">{t('door.plan.guests.here')}</span> : undefined} />
          ))}
        </RowList>
      )}
    </section>
  );
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((100 * n) / d));
const dateOnly = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/** One run screen of an event, a project or a program. */
export function PlanRunScreen({ p, stage, systemId, run }: { p: PlanDetail; stage: Stage; systemId: string; run: Run }) {
  const t = useT();
  const { locale } = useI18n();
  const money = useMoney(systemId, p.id);
  const n = (x: number) => new Intl.NumberFormat(locale).format(x);
  const reg = p.registration;
  const tasksDone = p.checks.filter((k) => k.done).length;
  const msDone = p.milestones.filter((m) => m.done).length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = p.milestones.filter((m) => !m.done && m.dueOn && dateOnly(m.dueOn) < today);
  const head = (
    <div className="run-head">
      <h3>{t(`door.run.${p.planType}.${stage}.name` as 'door.run.EVENT.s1.name')}</h3>
      <p className="muted">{t(`door.run.${p.planType}.${stage}.d` as 'door.run.EVENT.s1.d')}</p>
    </div>
  );
  const moneyTiles = (money
    ? [{ label: t('door.run.tile.income'), value: formatRwf(money.income) }, { label: t('door.run.tile.spending'), value: formatRwf(money.spending) }, { label: t('door.run.tile.net'), value: formatRwf(money.income - money.spending), warn: money.income - money.spending < 0 }]
    : []) as Tile[];

  if (p.planType === 'EVENT') {
    if (stage === 's1') return (
      <div className="run">
        {head}
        <Tiles tiles={[
          { label: t('door.run.tile.registered'), value: n(reg?.count ?? 0), hint: reg?.capacity ? t('door.run.tile.of', { n: reg.capacity }) : undefined },
          { label: t('door.run.tile.spotsLeft'), value: reg?.spotsLeft === null || reg?.spotsLeft === undefined ? '—' : n(reg.spotsLeft) },
          { label: t('door.run.tile.attended'), value: n(reg?.attended ?? 0) },
        ]} />
        <PlanGuests p={p} run={run} />
      </div>
    );
    if (stage === 's2') return (
      <div className="run">
        {head}
        <Tiles tiles={[
          { label: t('door.run.tile.tasks'), value: `${tasksDone} / ${p.checks.length}` },
          { label: t('door.run.tile.team'), value: n(p.team.length) },
          ...(money ? [{ label: t('door.run.tile.planned'), value: formatRwf(money.planned) }] : []),
        ]} />
        <Checklist p={p} run={run} title={t('door.run.h.tasks')} />
        <Team p={p} />
        <PlanBudget systemId={systemId} planId={p.id} startsOn={p.startsOn} />
      </div>
    );
    if (stage === 's3') return (
      <div className="run">
        {head}
        <Tiles tiles={[
          { label: t('door.run.tile.registered'), value: n(reg?.count ?? 0) },
          { label: t('door.run.tile.checkedIn'), value: n(reg?.attended ?? 0) },
          { label: t('door.run.tile.toArrive'), value: n(Math.max(0, (reg?.count ?? 0) - (reg?.attended ?? 0))) },
          { label: t('door.run.tile.notes'), value: n(p.notes.length) },
        ]} />
        <div className="run-two">
          <Schedule p={p} />
          <Attendance p={p} run={run} />
        </div>
        <Notes p={p} run={run} title={t('door.run.h.incidents')} />
      </div>
    );
    return (
      <div className="run">
        {head}
        <Tiles tiles={[{ label: t('door.run.tile.attended'), value: n(reg?.attended ?? 0), hint: reg ? t('door.run.tile.of', { n: reg.count }) : undefined }, ...moneyTiles]} />
        <Report p={p} run={run} />
        <Finish p={p} run={run} which={['close']} />
      </div>
    );
  }

  if (p.planType === 'PROJECT') {
    if (stage === 's1') return (
      <div className="run">
        {head}
        <Tiles tiles={[
          { label: t('door.run.tile.milestones'), value: `${msDone} / ${p.milestones.length}` },
          { label: t('door.run.tile.tasks'), value: `${tasksDone} / ${p.checks.length}` },
          { label: t('door.run.tile.team'), value: n(p.team.length) },
        ]} />
        <PlanMilestones p={p} run={run} />
        <Checklist p={p} run={run} title={t('door.run.h.tasks')} />
        <Team p={p} />
        <PlanBudget systemId={systemId} planId={p.id} startsOn={p.startsOn} />
        <Finish p={p} run={run} which={['start', 'pause', 'resume']} />
      </div>
    );
    if (stage === 's2') {
      const sorted = [...p.milestones].sort((a, b) => (a.dueOn ?? '9').localeCompare(b.dueOn ?? '9'));
      const progress = pct(msDone, p.milestones.length);
      return (
        <div className="run">
          {head}
          <Tiles tiles={[
            { label: t('door.run.tile.progress'), value: `${progress}%`, hint: `${msDone} / ${p.milestones.length}` },
            ...(money ? [{ label: t('door.run.tile.spent'), value: formatRwf(money.spending), hint: t('door.run.tile.ofPlanned', { amount: formatRwf(money.planned) }) }] : []),
            { label: t('door.run.tile.overdue'), value: n(overdue.length), warn: overdue.length > 0 },
            { label: t('door.run.tile.openTasks'), value: n(p.checks.length - tasksDone) },
          ]} />
          <section className="panel">
            <h3>{t('door.run.h.timeline')}</h3>
            <progress max={100} value={progress} aria-label={t('door.run.tile.progress')} />
            {sorted.length === 0 ? <p className="muted">{t('door.plan.ms.none')}</p> : (
              <ol className="run-schedule">
                {sorted.map((m) => (
                  <li key={m.id} className={m.done ? 'done' : overdue.includes(m) ? 'late' : ''}>
                    <time>{m.dueOn ? dateOnly(m.dueOn) : '—'}</time>
                    <span>{m.title}</span>
                    <StatusChip tone={m.done ? 'success' : overdue.includes(m) ? 'danger' : 'neutral'}>{m.done ? t('door.run.status.done') : overdue.includes(m) ? t('door.run.status.late') : t('door.run.status.open')}</StatusChip>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <Notes p={p} run={run} title={t('door.run.h.updates')} />
        </div>
      );
    }
    const deliverables = lines(p.details?.deliverables);
    const openItems = p.checks.filter((k) => !k.done).length + p.milestones.filter((m) => !m.done).length;
    return (
      <div className="run">
        {head}
        <div className="run-two">
          <section className="panel">
            <h3>{t('door.run.h.deliverables')}</h3>
            {deliverables.length === 0 ? <p className="muted">{t('door.run.none')}</p> : <ul className="door-list">{deliverables.map((d, i) => (<li key={i}>{d}</li>))}</ul>}
          </section>
          <section className="panel">
            <h3>{t('door.run.h.closure')}</h3>
            <Tiles tiles={[{ label: t('door.run.tile.openItems'), value: n(openItems), warn: openItems > 0 }, ...(money ? [{ label: t('door.run.tile.spent'), value: formatRwf(money.spending) }, { label: t('door.run.tile.pending'), value: formatRwf(money.pending) }] : [])]} />
          </section>
        </div>
        <Report p={p} run={run} />
        <Finish p={p} run={run} which={['close']} />
      </div>
    );
  }

  // Program
  const indicators = p.program?.indicators ?? [];
  const average = indicators.length ? Math.round(indicators.reduce((s, i) => s + (i.percent ?? 0), 0) / indicators.length) : 0;
  if (stage === 's1') return (
    <div className="run">
      {head}
      <Tiles tiles={[{ label: t('door.run.tile.team'), value: n(p.team.length) }, { label: t('door.run.tile.steering'), value: n(p.program?.steering.length ?? 0) }, { label: t('door.run.tile.status'), value: t(planStatusKey(p.status, p.planType)) }]} />
      <section className="panel">
        <h3>{t('door.run.h.purpose')}</h3>
        <dl className="door-facts">
          {(['need', 'mission', 'population', 'impact'] as const).filter((k) => p.details?.[k]).map((k) => (<div key={k}><dt>{t(`door.ap.f.program.${k}` as 'door.ap.f.program.need')}</dt><dd>{p.details[k]}</dd></div>))}
        </dl>
        {!['need', 'mission', 'population', 'impact'].some((k) => p.details?.[k]) && <p className="muted">{t('door.run.none')}</p>}
      </section>
      <Team p={p} />
      <Finish p={p} run={run} which={['start', 'pause', 'resume']} />
    </div>
  );
  if (stage === 's2') return (
    <div className="run">
      {head}
      <Tiles tiles={[{ label: t('door.run.tile.linked'), value: n(p.children.length) }, { label: t('door.run.tile.tasks'), value: `${tasksDone} / ${p.checks.length}` }]} />
      <PlanLinks p={p} systemId={systemId} run={run} />
      <Checklist p={p} run={run} title={t('door.run.h.tasks')} />
      <PlanBudget systemId={systemId} planId={p.id} startsOn={p.startsOn} />
    </div>
  );
  if (stage === 's3') return (
    <div className="run">
      {head}
      <Tiles tiles={[{ label: t('door.run.tile.indicators'), value: n(indicators.length) }, { label: t('door.run.tile.average'), value: `${average}%` }, { label: t('door.run.tile.reviews'), value: n(p.program?.reviews.length ?? 0) }]} />
      <PlanIndicators p={p} run={run} />
      <Notes p={p} run={run} title={t('door.run.h.improve')} />
    </div>
  );
  return (
    <div className="run">
      {head}
      <PlanGovernance p={p} run={run} />
      <section className="panel">
        <h3>{t('door.run.h.results')}</h3>
        {indicators.length === 0 ? <p className="muted">{t('door.run.none')}</p> : (
          <ul className="door-list">{indicators.map((i) => (<li key={i.id}><strong>{i.name}</strong> · {i.current === null ? t('door.plan.ind.noReading') : `${i.percent ?? 0}%`}</li>))}</ul>
        )}
      </section>
      <Report p={p} run={run} />
      <Finish p={p} run={run} which={['renew', 'close']} />
    </div>
  );
}

