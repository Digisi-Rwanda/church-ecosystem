import { PlanTeam } from './PlanTeam';
import { useState } from 'react';
import { addPlanCheck, addPlanNote, editPlanCheck, markAttended, removePlanCheck, saveReport, planStep, tickPlanCheck, type PlanDetail } from '../api/frontDoorApi';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { PlanGuests } from './PlanGuests';
import { PlanLinks } from './PlanLinks';
import { PlanMilestones } from './PlanMilestones';
import { PlanGovernance, PlanIndicators } from './PlanProgram';
import { ListRow, RowList } from './kit';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;
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
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const done = p.checks.filter((k) => k.done).length;
  return (
    <section className="panel">
      <div className="door-row"><h3>{title}</h3>{p.checks.length > 0 && <span className="muted">{done} / {p.checks.length}</span>}</div>
      {p.checks.length === 0 && <p className="muted">{t('door.plan.checklist.none')}</p>}
      {p.checks.length > 0 && (
        <ul className="door-list">
          {p.checks.map((k) => (
            <li key={k.id}>
              {editing?.id === k.id ? (
                <div className="door-row">
                  <TextField label={t('door.plan.checkEdit', { label: k.label })} name={`run-check-edit-${k.id}`} value={editing.label} onChange={(e) => setEditing({ id: k.id, label: e.target.value })} />
                  <button type="button" className="btn secondary sm" disabled={!editing.label.trim()} onClick={() => void run(() => editPlanCheck(p.id, k.id, editing.label.trim()), () => setEditing(null))}>{t('door.plan.checkEditGo')}</button>
                  <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>{t('door.plan.checkEditCancel')}</button>
                </div>
              ) : (
                <>
                  <label className="door-check">
                    <input type="checkbox" checked={k.done} disabled={!p.canCheck} onChange={(e) => void run(() => tickPlanCheck(p.id, k.id, e.target.checked))} /> {k.label}
                  </label>
                  {p.canAddCheck && <button type="button" className="btn ghost sm" onClick={() => setEditing({ id: k.id, label: k.label })}>{t('door.plan.checkEditOpen')}</button>}
                  {p.canAddCheck && !k.done && <button type="button" className="btn ghost sm" onClick={() => void run(() => removePlanCheck(p.id, k.id))}>{t('door.sched.unassign')}</button>}
                </>
              )}
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
function Notes({ p, run, title }: { p: PlanDetail; run: Run; title: string }) {
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

function Team({ p, run }: { p: PlanDetail; run: Run }) {
  return (
    <>
      <PlanTeam p={p} onChange={(next) => void run(async () => next)} />
      {p.details?.responsibilities && <p className="muted">{p.details.responsibilities}</p>}
    </>
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


/** The first tab of an approved activity: what has to be done, in the shape of its kind of work. */
export function WorkTab({ p, run, systemId }: { p: PlanDetail; run: Run; systemId: string }) {
  const t = useT();
  const tasks = <Checklist p={p} run={run} title={t('door.run.h.tasks')} />;
  if (p.planType === 'EVENT') {
    return (
      <div className="run">
        {tasks}
        <Team p={p} run={run} />
        <PlanGuests p={p} run={run} />
        <Attendance p={p} run={run} />
        <Schedule p={p} />
      </div>
    );
  }
  if (p.planType === 'PROJECT') {
    return (
      <div className="run">
        <PlanMilestones p={p} run={run} />
        {tasks}
        <Team p={p} run={run} />
      </div>
    );
  }
  return (
    <div className="run">
      <PlanIndicators p={p} run={run} />
      <PlanGovernance p={p} run={run} />
      <PlanLinks p={p} systemId={systemId} run={run} />
      {tasks}
      <Team p={p} run={run} />
    </div>
  );
}

/** Notes from the team while the work runs, and the closing report where there is one. */
export function NotesTab({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const hasReport = !!(p.report.outcome || p.report.planningSummary || p.report.executionSummary);
  return (
    <div className="run">
      <Notes p={p} run={run} title={t('door.plan.tab.notes')} />
      {(p.status === 'CLOSING' || hasReport) && <Report p={p} run={run} />}
    </div>
  );
}
