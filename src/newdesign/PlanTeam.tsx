import { useState } from 'react';
import { setPlanTeam, type PlanDetail } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { ListRow, RowList } from './kit';
import { PersonPicker } from './PersonPicker';
import { planErrorKey } from './plans';

/** The team of an activity. While it is live, the President changes it directly and the Church Leader is told. */
export function PlanTeam({ p, onChange }: { p: PlanDetail; onChange: (next: PlanDetail) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(p.team.map((m) => ({ personId: m.personId, name: m.name, role: m.role })));
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try {
      onChange(await setPlanTeam(p.id, rows.map((r) => ({ personId: r.personId, role: r.role }))));
      setOpen(false);
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <div className="panel">
      <h3>{t('door.run.h.team')}</h3>
      {p.team.length === 0 ? <p className="muted">{t('door.plan.team.none')}</p> : <RowList label={t('door.run.h.team')}>{p.team.map((m) => <ListRow key={m.personId} avatarName={m.name} title={m.name} detail={m.role} />)}</RowList>}
      {p.canEditTeam && !open && <button type="button" className="btn secondary sm" onClick={() => { setRows(p.team.map((m) => ({ personId: m.personId, name: m.name, role: m.role }))); setOpen(true); }}>{t('door.plan.team.edit')}</button>}
      {open && (
        <div className="door-form">
          <p className="muted">{t('door.plan.team.note')}</p>
          <ul className="door-list">
            {rows.map((r, i) => <li key={r.personId}>{r.name} · {r.role} <button type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>{t('door.pm.remove')}</button></li>)}
          </ul>
          <PersonPicker label={t('door.plan.team.add')} name="team-pick" onPick={(x) => setPick({ id: x.id, name: x.fullName })} />
          {pick && <p className="muted">{pick.name}</p>}
          <TextField label={t('door.plan.team.role')} name="team-role" maxLength={40} value={role} onChange={(e) => setRole(e.target.value)} />
          <button type="button" className="btn secondary sm" disabled={!pick || !role.trim() || rows.some((r) => r.personId === pick.id)} onClick={() => { setRows([...rows, { personId: pick!.id, name: pick!.name, role: role.trim() }]); setPick(null); setRole(''); }}>{t('door.plan.team.addBtn')}</button>
          {error && <p className="door-error" role="alert">{error}</p>}
          <div className="door-row">
            <button type="button" className="btn" onClick={() => void save()}>{t('door.pm.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('door.settings.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
