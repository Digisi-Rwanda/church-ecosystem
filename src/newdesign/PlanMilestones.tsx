import { useState } from 'react';
import { addMilestone, removeMilestone, tickMilestone, type PlanDetail } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;

/** A project's milestones: dated steps the team ticks off. */
export function PlanMilestones({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const { locale } = useI18n();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const done = p.milestones.filter((m) => m.done).length;
  return (
    <div className="panel">
      <h3>{t('door.plan.ms.title')}</h3>
      {p.milestones.length > 0 && <p className="muted">{t('door.plan.ms.progress', { done, total: p.milestones.length })}</p>}
      {p.milestones.length === 0 && <p className="muted">{t('door.plan.ms.none')}</p>}
      <ul className="door-list">
        {p.milestones.map((m) => (
          <li key={m.id}>
            <label className="door-check">
              <input type="checkbox" checked={m.done} disabled={!p.canTickMilestone} onChange={(e) => void run(() => tickMilestone(p.id, m.id, e.target.checked))} /> {m.title}
              {m.dueOn ? <span className="muted"> · {day(m.dueOn)}</span> : null}
            </label>
            {p.canMilestone && (
              <button type="button" className="btn ghost sm" onClick={() => void run(() => removeMilestone(p.id, m.id))}>
                {t('door.sched.unassign')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {p.canMilestone && (
        <div className="door-row">
          <TextField label={t('door.plan.ms.add')} name="p-ms" value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField label={t('door.plan.ms.due')} name="p-ms-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <button
            type="button"
            className="btn secondary sm"
            disabled={!title.trim()}
            onClick={() => void run(() => addMilestone(p.id, title.trim(), due ? `${due}T00:00:00.000Z` : null), () => { setTitle(''); setDue(''); })}
          >
            {t('door.plan.ms.addGo')}
          </button>
        </div>
      )}
    </div>
  );
}
