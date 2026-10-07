import { useState, type FormEvent } from 'react';
import { createPlan, editPlan, type DirectoryPerson, type PlanDetail, type PlanOptions, type WorkVisibility } from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { PersonPicker } from './PersonPicker';
import { planErrorKey } from './plans';
import { dueToInput, inputToDue } from './work';

/** Write a plan, or (with `existing`) change a draft. The leader and the team are picked by name. */
export function PlanForm({
  options,
  systemId,
  existing,
  onDone,
  onCancel,
}: {
  options: PlanOptions;
  systemId: string;
  existing?: PlanDetail;
  onDone: (plan: PlanDetail) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const units = options.units.filter((u) => u.systemId === systemId);
  const [unitId, setUnitId] = useState(existing?.orgUnitId ?? (units.length === 1 ? units[0].id : ''));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [aim, setAim] = useState(existing?.aim ?? '');
  const [needs, setNeeds] = useState(existing?.needs ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [starts, setStarts] = useState(dueToInput(existing?.startsOn ?? null));
  const [ends, setEnds] = useState(dueToInput(existing?.endsOn ?? null));
  const [leader, setLeader] = useState<{ id: string; name: string } | null>(existing ? { id: existing.leaderId, name: existing.leaderName } : null);
  const [team, setTeam] = useState<Array<{ personId: string; name: string; role: string }>>(existing?.team ?? []);
  const [role, setRole] = useState('');
  const [beyond, setBeyond] = useState(existing?.beyondUnit ?? false);
  const [visibility, setVisibility] = useState<WorkVisibility>(existing?.visibility ?? 'SYSTEM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const addMember = (p: DirectoryPerson) => {
    if (!role.trim()) return setError(t('door.plan.form.roleFirst'));
    setError('');
    if (!team.some((m) => m.personId === p.id) && team.length < options.limits.teamMax) setTeam([...team, { personId: p.id, name: p.fullName, role: role.trim() }]);
    setRole('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !leader || (!existing && !unitId)) return setError(t('door.plan.form.incomplete'));
    const input = {
      title: title.trim(), aim: aim.trim(), needs: needs.trim() || null, location: location.trim() || null,
      startsOn: starts ? inputToDue(starts) : null, endsOn: ends ? inputToDue(ends) : null, leaderId: leader.id,
      team: team.map((m) => ({ personId: m.personId, role: m.role })), beyondUnit: beyond, visibility,
    };
    setBusy(true);
    setError('');
    try {
      onDone(existing ? await editPlan(existing.id, input) : await createPlan(unitId, input));
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{existing ? t('door.plan.form.edit') : t('door.plan.form.new')}</h3>
      {!existing && units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="p-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label={t('door.plan.form.title')} name="p-title" value={title} maxLength={options.limits.titleMax} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField label={t('door.plan.form.aim')} name="p-aim" rows={3} value={aim} maxLength={options.limits.textMax} onChange={(e) => setAim(e.target.value)} />
      <TextAreaField label={t('door.plan.form.needs')} name="p-needs" rows={2} value={needs} maxLength={options.limits.textMax} onChange={(e) => setNeeds(e.target.value)} />
      <TextField label={t('door.plan.form.location')} name="p-loc" value={location} maxLength={options.limits.titleMax} onChange={(e) => setLocation(e.target.value)} />
      <TextField label={t('door.plan.form.starts')} name="p-starts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
      <TextField label={t('door.plan.form.ends')} name="p-ends" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
      <p>
        <strong>{t('door.plan.leader')}:</strong> {leader ? leader.name : <span className="muted">{t('door.work.form.nobody')}</span>}
      </p>
      <PersonPicker label={t('door.plan.form.pickLeader')} name="p-leader" onPick={(p) => setLeader({ id: p.id, name: p.fullName })} />
      {team.length > 0 && (
        <ul className="door-chips">
          {team.map((m) => (
            <li key={m.personId}>
              <button type="button" className="door-chip" onClick={() => setTeam(team.filter((x) => x.personId !== m.personId))} aria-label={t('door.work.form.removeHelper', { name: m.name })}>
                {m.name} · {m.role} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <TextField label={t('door.plan.form.role')} name="p-role" value={role} maxLength={options.limits.roleMax} placeholder={t('door.sched.rolePlaceholder')} onChange={(e) => setRole(e.target.value)} />
      <PersonPicker label={t('door.plan.form.pickMember')} name="p-member" onPick={addMember} />
      <label className="door-check">
        <input type="checkbox" checked={beyond} onChange={(e) => setBeyond(e.target.checked)} /> {t('door.plan.form.beyond')}
      </label>
      <SelectField label={t('door.work.form.visibility')} name="p-vis" hint={t(`door.work.visibility.${visibility}.hint` as const)} value={visibility} onChange={(e) => setVisibility(e.target.value as WorkVisibility)}>
        {options.visibilities.map((v) => (
          <option key={v} value={v}>
            {t(`door.work.visibility.${v}` as const)}
          </option>
        ))}
      </SelectField>
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {existing ? t('door.work.form.save') : t('door.plan.form.create')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}
