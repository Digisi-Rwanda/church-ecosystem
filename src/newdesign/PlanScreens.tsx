import { useState, type FormEvent } from 'react';
import { createPlan, editPlan, savePlanDetails, type PlanDetail, type PlanInput, type PlanOptions } from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { PersonPicker } from './PersonPicker';
import { PlanBudget } from './PlanBudget';
import { planErrorKey } from './plans';
import { dueToInput, inputToDue } from './work';

const EVENT_KINDS = ['WORSHIP', 'CONFERENCE', 'CONCERT', 'TRAINING', 'FELLOWSHIP', 'OUTREACH', 'OTHER'] as const;

/** The plan as the edit call wants it, with the changes laid over it. */
const inputOf = (p: PlanDetail, change: Partial<PlanInput>): PlanInput => ({
  title: p.title, aim: p.aim, needs: p.needs || null, location: p.location || null, startsOn: p.startsOn, endsOn: p.endsOn, leaderId: p.leaderId,
  team: p.team.map((m) => ({ personId: m.personId, role: m.role })), beyondUnit: p.beyondUnit, visibility: p.visibility, planType: p.planType, ...change,
});

/** One named screen: its fields, one Save. A plan that is no longer a draft shows the answers and nothing to change. */
function useScreen(p: PlanDetail, onSaved: (p: PlanDetail) => void) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async (e: FormEvent, job: () => Promise<PlanDetail>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      onSaved(await job());
      setSaved(true);
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, saved, save, locked: !p.canEdit };
}

/** Define the event: name, purpose, type, organizer, expected outcomes. */
export function EventDefine({ p, onSaved }: { p: PlanDetail; onSaved: (p: PlanDetail) => void }) {
  const t = useT();
  const s = useScreen(p, onSaved);
  const [title, setTitle] = useState(p.title);
  const [aim, setAim] = useState(p.aim);
  const [kind, setKind] = useState((p.details ?? {}).eventKind ?? '');
  const [outcomes, setOutcomes] = useState((p.details ?? {}).outcomes ?? '');
  const [leader, setLeader] = useState({ id: p.leaderId, name: p.leaderName });
  return (
    <form className="panel door-form" onSubmit={(e) => void s.save(e, async () => {
      if (!title.trim()) throw { code: 'BAD_INPUT' };
      await editPlan(p.id, inputOf(p, { title: title.trim(), aim: aim.trim(), leaderId: leader.id }));
      return savePlanDetails(p.id, { eventKind: kind, outcomes });
    })} noValidate>
      <h3>{t('door.plan.screen.define')}</h3>
      <TextField label={t('door.plan.screen.name')} name="ev-name" value={title} maxLength={120} disabled={s.locked} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField label={t('door.plan.screen.purpose')} name="ev-purpose" rows={3} value={aim} disabled={s.locked} onChange={(e) => setAim(e.target.value)} />
      <SelectField label={t('door.plan.screen.kind')} name="ev-kind" value={kind} disabled={s.locked} onChange={(e) => setKind(e.target.value)}>
        <option value="">{t('door.gov.meeting.choose')}</option>
        {EVENT_KINDS.map((k) => (<option key={k} value={k}>{t(`door.plan.screen.kind.${k}` as 'door.plan.screen.kind.OTHER')}</option>))}
      </SelectField>
      <p><strong>{t('door.plan.screen.organizer')}:</strong> {leader.name}</p>
      {!s.locked && <PersonPicker label={t('door.plan.form.pickLeader')} name="ev-organizer" onPick={(x) => setLeader({ id: x.id, name: x.fullName })} />}
      <TextAreaField label={t('door.plan.screen.outcomes')} name="ev-outcomes" rows={3} value={outcomes} disabled={s.locked} onChange={(e) => setOutcomes(e.target.value)} />
      {s.error && <p className="door-error" role="alert">{s.error}</p>}
      {s.saved && <p className="muted" role="status">{t('door.plan.screen.saved')}</p>}
      {s.locked ? <p className="muted">{t('door.plan.screen.locked')}</p> : <div className="door-row"><button type="submit" className="btn" disabled={s.busy}>{t('door.work.form.save')}</button></div>}
    </form>
  );
}

/** Plan the event: date, time, venue, agenda, budget, resources and who is responsible for what. */
export function EventPlan({ p, systemId, onSaved }: { p: PlanDetail; systemId: string; onSaved: (p: PlanDetail) => void }) {
  const t = useT();
  const s = useScreen(p, onSaved);
  const [day, setDay] = useState(dueToInput(p.startsOn));
  const [from, setFrom] = useState((p.details ?? {}).startTime ?? '');
  const [to, setTo] = useState((p.details ?? {}).endTime ?? '');
  const [venue, setVenue] = useState(p.location);
  const [agenda, setAgenda] = useState((p.details ?? {}).agenda ?? '');
  const [resources, setResources] = useState(p.needs);
  const [team, setTeam] = useState(p.team);
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const addMember = (x: { id: string; fullName: string }) => {
    if (!role.trim()) return setError(t('door.plan.form.roleFirst'));
    setError('');
    if (!team.some((m) => m.personId === x.id)) setTeam([...team, { personId: x.id, name: x.fullName, role: role.trim() }]);
    setRole('');
  };
  return (
    <>
      <form className="panel door-form" onSubmit={(e) => void s.save(e, async () => {
        const date = day ? inputToDue(day) : null;
        await editPlan(p.id, inputOf(p, { startsOn: date, endsOn: date, location: venue.trim() || null, needs: resources.trim() || null, team: team.map((m) => ({ personId: m.personId, role: m.role })) }));
        return savePlanDetails(p.id, { startTime: from, endTime: to, agenda });
      })} noValidate>
        <h3>{t('door.plan.screen.plan')}</h3>
        <TextField label={t('door.plan.screen.date')} name="ev-date" type="date" value={day} disabled={s.locked} onChange={(e) => setDay(e.target.value)} />
        <div className="door-row">
          <TextField label={t('door.plan.screen.from')} name="ev-from" type="time" value={from} disabled={s.locked} onChange={(e) => setFrom(e.target.value)} />
          <TextField label={t('door.plan.screen.to')} name="ev-to" type="time" value={to} disabled={s.locked} onChange={(e) => setTo(e.target.value)} />
        </div>
        <TextField label={t('door.plan.screen.venue')} name="ev-venue" value={venue} maxLength={120} disabled={s.locked} onChange={(e) => setVenue(e.target.value)} />
        <TextAreaField label={t('door.plan.screen.agenda')} name="ev-agenda" rows={5} value={agenda} disabled={s.locked} onChange={(e) => setAgenda(e.target.value)} />
        <TextAreaField label={t('door.plan.screen.resources')} name="ev-res" rows={2} value={resources} disabled={s.locked} onChange={(e) => setResources(e.target.value)} />
        <h4>{t('door.plan.screen.responsibilities')}</h4>
        {team.length === 0 && <p className="muted">{t('door.work.form.nobody')}</p>}
        <ul className="door-chips">
          {team.map((m) => (
            <li key={m.personId}>
              {s.locked ? <span className="door-chip">{m.name} · {m.role}</span> : (
                <button type="button" className="door-chip" onClick={() => setTeam(team.filter((x) => x.personId !== m.personId))} aria-label={t('door.work.form.removeHelper', { name: m.name })}>{m.name} · {m.role} ×</button>
              )}
            </li>
          ))}
        </ul>
        {!s.locked && (
          <>
            <TextField label={t('door.plan.form.role')} name="ev-role" value={role} maxLength={60} onChange={(e) => setRole(e.target.value)} />
            <PersonPicker label={t('door.plan.form.pickMember')} name="ev-member" onPick={addMember} />
          </>
        )}
        {(error || s.error) && <p className="door-error" role="alert">{error || s.error}</p>}
        {s.saved && <p className="muted" role="status">{t('door.plan.screen.saved')}</p>}
        {s.locked ? <p className="muted">{t('door.plan.screen.locked')}</p> : <div className="door-row"><button type="submit" className="btn" disabled={s.busy}>{t('door.work.form.save')}</button></div>}
      </form>
      <PlanBudget systemId={systemId} planId={p.id} startsOn={p.startsOn} />
    </>
  );
}

/** Start an event: just a name (and the unit when there are several). The two screens, Define and Plan, then open on the event itself. */
export function EventStart({ options, systemId, onDone, onCancel }: { options: PlanOptions; systemId: string; onDone: (p: PlanDetail) => void; onCancel: () => void }) {
  const t = useT();
  const units = options.units.filter((u) => u.systemId === systemId);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !unitId) return setError(t('door.plan.form.incomplete'));
    setBusy(true);
    setError('');
    try {
      onDone(await createPlan(unitId, { title: title.trim(), aim: '', needs: null, location: null, startsOn: null, endsOn: null, team: [], beyondUnit: false, visibility: 'SYSTEM', planType: 'EVENT' }));
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      {units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="ev-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
        </SelectField>
      )}
      <TextField label={t('door.plan.screen.name')} name="ev-start-name" value={title} maxLength={options.limits.titleMax} onChange={(e) => setTitle(e.target.value)} />
      {error && <p className="door-error" role="alert">{error}</p>}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>{t('door.plan.screen.start')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('door.settings.cancel')}</button>
      </div>
    </form>
  );
}
