import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addGroupMember, closeGroup, editGroup, fetchGroup, fetchGroupOptions, recordGroupSession, removeGroupMember,
  type DirectoryPerson,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { AttendanceChart } from './AttendanceChart';
import { shortDay } from './charts';
import { agesLabel, groupErrorKey, needsFollowUp, wholeOrNull } from './groups';
import { GroupFields } from './GroupsPage';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

const today = () => new Date().toISOString().slice(0, 10);

/** One group: who belongs, how often they come, and the meetings recorded. */
export function GroupPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '', groupId = '' } = useParams();
  const data = useLoad(() => fetchGroup(groupId), `group|${groupId}`);
  const options = useLoad(fetchGroupOptions, 'group-options');
  const [mode, setMode] = useState<'edit' | 'session' | null>(null);
  const [values, setValues] = useState({ name: '', ageFrom: '', ageTo: '', meetsOn: '' });
  const [day, setDay] = useState(today());
  const [ticked, setTicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      data.reload();
    } catch (err) {
      setError(t(groupErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const g = data.data?.group;
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const startEdit = () => {
    if (!g) return;
    setValues({ name: g.name, ageFrom: g.ageFrom == null ? '' : String(g.ageFrom), ageTo: g.ageTo == null ? '' : String(g.ageTo), meetsOn: g.meetsOn });
    setMode('edit');
  };
  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    const from = wholeOrNull(values.ageFrom);
    const to = wholeOrNull(values.ageTo);
    if (!values.name.trim()) return setError(t('door.groups.err.input'));
    if (Number.isNaN(from) || Number.isNaN(to)) return setError(t('door.groups.err.ages'));
    void run(() => editGroup(groupId, { name: values.name.trim(), leaderId: g?.leaderId ?? null, ageFrom: from, ageTo: to, meetsOn: values.meetsOn.trim() || null }), () => setMode(null));
  };
  const startSession = () => {
    setDay(today());
    setTicked((data.data?.members ?? []).map((m) => m.personId));
    setNote('');
    setMode('session');
  };
  const saveSession = (e: FormEvent) => {
    e.preventDefault();
    void run(() => recordGroupSession(groupId, { heldOn: day, presentIds: ticked, note: note.trim() || null }), () => setMode(null));
  };
  const members = data.data?.members ?? [];
  const follow = needsFollowUp(members);
  const noteMax = options.data?.limits.noteMax ?? 500;
  return (
    <section className="door-block" aria-labelledby="door-group-title">
      <p>
        <Link to={`/s/${systemId}/groups`}>{t('door.groups.back')}</Link>
      </p>
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {g && (
          <>
            <div>
              <h2 id="door-group-title">
                {g.name} {g.status === 'CLOSED' && <span className="door-chip">{t('door.groups.closed')}</span>}
              </h2>
              <p className="muted">{[g.unitName, agesLabel(g.ageFrom, g.ageTo, t as never), g.meetsOn].filter(Boolean).join(' · ')}</p>
              {g.leaderName && <p className="muted">{t('door.groups.leader', { name: g.leaderName })}</p>}
            </div>
            {error && (
              <p className="door-error" role="alert">
                {error}
              </p>
            )}
            {g.canWrite && !mode && (
              <div className="door-row">
                <button type="button" className="btn" onClick={startSession} disabled={members.length === 0}>
                  {t('door.groups.session.new')}
                </button>
                <button type="button" className="btn ghost" onClick={startEdit}>
                  {t('door.groups.edit')}
                </button>
                {!confirmClose ? (
                  <button type="button" className="btn ghost" onClick={() => setConfirmClose(true)}>
                    {t('door.groups.close')}
                  </button>
                ) : (
                  <>
                    <span className="muted">{t('door.groups.closeAsk')}</span>
                    <button type="button" className="btn" onClick={() => void run(() => closeGroup(groupId), () => setConfirmClose(false))}>
                      {t('door.groups.closeYes')}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setConfirmClose(false)}>
                      {t('door.settings.cancel')}
                    </button>
                  </>
                )}
              </div>
            )}
            {mode === 'edit' && options.data && (
              <form className="panel door-form" onSubmit={saveEdit} noValidate>
                <GroupFields values={values} onChange={setValues} nameMax={options.data.limits.nameMax} meetsMax={options.data.limits.meetsMax} />
                <div className="door-row">
                  <button type="submit" className="btn">
                    {t('door.groups.save')}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setMode(null)}>
                    {t('door.settings.cancel')}
                  </button>
                </div>
              </form>
            )}
            {mode === 'session' && (
              <form className="panel door-form" onSubmit={saveSession} noValidate>
                <h3>{t('door.groups.session.new')}</h3>
                <TextField label={t('door.groups.session.day')} name="s-day" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
                <p className="muted">{t('door.groups.session.tick')}</p>
                <ul className="door-list">
                  {members.map((m) => (
                    <li key={m.personId}>
                      <label className="door-check">
                        <input type="checkbox" checked={ticked.includes(m.personId)} onChange={(e) => setTicked(e.target.checked ? [...ticked, m.personId] : ticked.filter((x) => x !== m.personId))} />
                        {m.name}
                      </label>
                    </li>
                  ))}
                </ul>
                <TextAreaField label={t('door.groups.session.note')} name="s-note" rows={2} value={note} maxLength={noteMax} onChange={(e) => setNote(e.target.value)} />
                <div className="door-row">
                  <button type="submit" className="btn">
                    {t('door.groups.session.save', { count: String(ticked.length) })}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setMode(null)}>
                    {t('door.settings.cancel')}
                  </button>
                </div>
              </form>
            )}
            <div className="panel">
              <h3>{t('door.groups.membersTitle', { count: String(members.length) })}</h3>
              {g.canWrite && (
                <PersonPicker label={t('door.groups.addMember')} name="g-add" onPick={(p: DirectoryPerson) => void run(() => addGroupMember(groupId, p.id))} />
              )}
              {members.length === 0 ? (
                <EmptyState title={t('door.groups.noMembers')} />
              ) : (
                <ul className="door-list">
                  {members.map((m) => (
                    <li key={m.personId} className="door-row">
                      <span>
                        {m.name}
                        {m.age != null ? ` · ${t('door.groups.age', { age: String(m.age) })}` : ''}
                        {m.of > 0 ? ` · ${t('door.groups.came', { came: String(m.came), of: String(m.of) })}` : ''}
                      </span>
                      {m.outsideAge && <span className="door-chip warn">{t('door.groups.outsideAge')}</span>}
                      {g.canWrite && (
                        <button type="button" className="btn ghost" onClick={() => void run(() => removeGroupMember(groupId, m.personId))}>
                          {t('door.groups.remove')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {follow.length > 0 && (
              <div className="panel">
                <h3>{t('door.groups.followUp')}</h3>
                <p className="muted">{t('door.groups.followUpHint')}</p>
                <ul className="door-list">
                  {follow.map((m) => (
                    <li key={m.personId}>
                      {m.name} · {t('door.groups.came', { came: String(m.came), of: String(m.of) })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <AttendanceChart points={[...data.data!.sessions].reverse().map((x) => ({ label: shortDay(x.heldOn, locale), value: x.present }))} total={members.length} />
            <div className="panel">
              <h3>{t('door.groups.sessionsTitle')}</h3>
              {data.data!.sessions.length === 0 ? (
                <EmptyState title={t('door.groups.noSessions')} />
              ) : (
                <ul className="door-list">
                  {data.data!.sessions.map((s) => (
                    <li key={s.id}>
                      <strong>{fmt(s.heldOn)}</strong> · {t('door.groups.present', { count: String(s.present) })}
                      {s.note && <p className="muted">{s.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </LoadState>
    </section>
  );
}
