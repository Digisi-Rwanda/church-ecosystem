import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createGroup, fetchGroupOptions, fetchGroups, type DirectoryPerson, type GroupOptions } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { errorCode } from './governance';
import { agesLabel, groupErrorKey, kindKey, sortGroups, wholeOrNull } from './groups';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The fields of a group, shared by the create form here and the edit form on the group's own page. */
export function GroupFields({ values, onChange, nameMax, meetsMax }: {
  values: { name: string; ageFrom: string; ageTo: string; meetsOn: string };
  onChange: (next: { name: string; ageFrom: string; ageTo: string; meetsOn: string }) => void;
  nameMax: number;
  meetsMax: number;
}) {
  const t = useT();
  return (
    <>
      <TextField label={t('door.groups.field.name')} name="g-name" value={values.name} maxLength={nameMax} onChange={(e) => onChange({ ...values, name: e.target.value })} />
      <TextField label={t('door.groups.field.ageFrom')} name="g-from" inputMode="numeric" value={values.ageFrom} maxLength={3} onChange={(e) => onChange({ ...values, ageFrom: e.target.value })} />
      <TextField label={t('door.groups.field.ageTo')} name="g-to" inputMode="numeric" value={values.ageTo} maxLength={3} onChange={(e) => onChange({ ...values, ageTo: e.target.value })} />
      <TextField label={t('door.groups.field.meetsOn')} name="g-meets" value={values.meetsOn} maxLength={meetsMax} onChange={(e) => onChange({ ...values, meetsOn: e.target.value })} />
    </>
  );
}

function NewGroupForm({ options, systemId, onDone, onCancel }: { options: GroupOptions; systemId: string; onDone: (id: string) => void; onCancel: () => void }) {
  const t = useT();
  const units = options.units.filter((u) => u.systemId === systemId);
  const [unitId, setUnitId] = useState(units.length === 1 ? units[0].id : '');
  const [values, setValues] = useState({ name: '', ageFrom: '', ageTo: '', meetsOn: '' });
  const [leader, setLeader] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const from = wholeOrNull(values.ageFrom);
    const to = wholeOrNull(values.ageTo);
    if (!unitId || !values.name.trim()) return setError(t('door.groups.err.input'));
    if (Number.isNaN(from) || Number.isNaN(to)) return setError(t('door.groups.err.ages'));
    setBusy(true);
    setError('');
    try {
      const made = await createGroup(unitId, { name: values.name.trim(), leaderId: leader?.id ?? null, ageFrom: from, ageTo: to, meetsOn: values.meetsOn.trim() || null });
      onDone(made.id);
    } catch (err) {
      setError(t(groupErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  const kind = units[0]?.kind ?? 'FELLOWSHIP';
  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t(kindKey(kind, 'new'))}</h3>
      {units.length > 1 && (
        <SelectField label={t('door.work.form.unit')} name="g-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </SelectField>
      )}
      <GroupFields values={values} onChange={setValues} nameMax={options.limits.nameMax} meetsMax={options.limits.meetsMax} />
      {leader && (
        <p>
          {t('door.groups.leader', { name: leader.name })}{' '}
          <button type="button" className="btn ghost" onClick={() => setLeader(null)}>
            {t('door.work.form.removeHelper', { name: leader.name })}
          </button>
        </p>
      )}
      <PersonPicker label={t('door.groups.pickLeader')} name="g-leader" onPick={(p: DirectoryPerson) => setLeader({ id: p.id, name: p.fullName })} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {t('door.groups.create')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}

/** The Groups block of a system: fellowship groups, Sunday School classes or age groups, by system. */
export function GroupsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [form, setForm] = useState(false);
  const allowed = !!capabilities?.systems.find((s) => s.id === systemId)?.own?.some((o) => o.key === 'groups');
  const list = useLoad(() => fetchGroups(systemId), `groups|${systemId}`);
  const options = useLoad(fetchGroupOptions, 'group-options');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const kind = list.data?.kind ?? 'FELLOWSHIP';
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <section className="door-block" aria-labelledby="door-groups-title">
      <div>
        <PageHeader id="door-groups-title" title={t(kindKey(kind, 'title'))} />
        <p className="muted">{t(kindKey(kind, 'intro'))}</p>
      </div>
      {list.data?.canWrite && options.data && !form && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => setForm(true)}>
            {t(kindKey(kind, 'new'))}
          </button>
        </div>
      )}
      {form && options.data && (
        <NewGroupForm
          options={options.data}
          systemId={systemId}
          onDone={() => {
            setForm(false);
            list.reload();
          }}
          onCancel={() => setForm(false)}
        />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {list.data && list.data.groups.length === 0 ? (
          <EmptyState title={t(kindKey(kind, 'none'))} detail={t(kindKey(kind, 'noneDetail'))} />
        ) : (
          <ul className="door-notices">
            {sortGroups(list.data?.groups ?? []).map((g) => {
              const ages = agesLabel(g.ageFrom, g.ageTo, t as never);
              return (
                <li key={g.id} className="panel door-notice">
                  <div className="door-notice-main">
                    <div className="door-row">
                      <strong>
                        <Link to={`/s/${systemId}/groups/${g.id}`}>{g.name}</Link>
                      </strong>
                      {g.status === 'CLOSED' && <span className="door-chip">{t('door.groups.closed')}</span>}
                    </div>
                    <p className="muted">{[g.unitName, ages, g.meetsOn].filter(Boolean).join(' · ')}</p>
                    <p className="muted">
                      {t('door.groups.members', { count: String(g.members) })}
                      {g.leaderName ? ` · ${t('door.groups.leader', { name: g.leaderName })}` : ''}
                      {g.lastSessionOn ? ` · ${t('door.groups.lastMet', { day: day(g.lastSessionOn) })}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
