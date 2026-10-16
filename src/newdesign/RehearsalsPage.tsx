import { useState, type FormEvent } from 'react';
import { fetchRehearsals, recordRehearsal } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { AttendanceChart } from './AttendanceChart';
import { shortDay } from './charts';
import { choirWorkErrorKey, missingSingers } from './choirWork';
import { ChoirSelect } from './ChoirSelect';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

const today = () => new Date().toISOString().slice(0, 10);

function Rehearsals({ choirId }: { choirId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const data = useLoad(() => fetchRehearsals(choirId), `rehearsals|${choirId}`);
  const [form, setForm] = useState(false);
  const [day, setDay] = useState(today());
  const [ticked, setTicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const members = data.data?.members ?? [];
  const start = () => { setDay(today()); setTicked(members.map((m) => m.personId)); setNote(''); setForm(true); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await recordRehearsal({ choirId, heldOn: day, presentIds: ticked, note: note.trim() || null });
      setForm(false);
      data.reload();
    } catch (err) {
      setError(t(choirWorkErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const follow = missingSingers(members);
  return (
    <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
      {data.data?.canWrite && !form && (
        <div className="door-row"><button type="button" className="btn" onClick={start} disabled={members.length === 0}>{t('door.choirwork.reh.new')}</button></div>
      )}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.choirwork.reh.new')}</h3>
          <TextField label={t('door.groups.session.day')} name="r-day" type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
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
          <TextAreaField label={t('door.choirwork.reh.note')} name="r-note" rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="door-error" role="alert">{error}</p>}
          <div className="door-row">
            <button type="submit" className="btn">{t('door.groups.session.save', { count: String(ticked.length) })}</button>
            <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      {members.length === 0 ? (
        <EmptyState title={t('door.choirwork.reh.noSingers')} detail={t('door.choirwork.reh.noSingersDetail')} />
      ) : (
        <>
          <AttendanceChart points={[...(data.data?.rehearsals ?? [])].reverse().map((r) => ({ label: shortDay(r.heldOn, locale), value: r.present }))} total={members.length} />
          {follow.length > 0 && (
            <div className="panel">
              <h3>{t('door.groups.followUp')}</h3>
              <p className="muted">{t('door.groups.followUpHint')}</p>
              <ul className="door-list">{follow.map((m) => <li key={m.personId}>{m.name} · {t('door.groups.came', { came: String(m.came), of: String(m.of) })}</li>)}</ul>
            </div>
          )}
          <div className="panel">
            <h3>{t('door.choirwork.reh.recent')}</h3>
            {(data.data?.rehearsals ?? []).length === 0 ? (
              <p className="muted">{t('door.choirwork.reh.none')}</p>
            ) : (
              <ul className="door-list">
                {(data.data?.rehearsals ?? []).map((r) => (
                  <li key={r.id}><strong>{fmt(r.heldOn)}</strong> · {t('door.groups.present', { count: String(r.present) })}{r.note && <p className="muted">{r.note}</p>}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel">
            <h3>{t('door.choirwork.reh.singers')}</h3>
            <ul className="door-list">
              {members.map((m) => <li key={m.personId} className="door-row"><span>{m.name}</span><span className="muted">{m.of > 0 ? t('door.groups.came', { came: String(m.came), of: String(m.of) }) : ''}</span></li>)}
            </ul>
          </div>
        </>
      )}
    </LoadState>
  );
}

/** Choir rehearsals: record who came, see attendance over the recent rehearsals. */
export function RehearsalsPage() {
  const t = useT();
  const [choir, setChoir] = useState('');
  return (
    <section className="door-block" aria-labelledby="door-reh-title">
      <div>
        <PageHeader id="door-reh-title" title={t('door.own.rehearsals')} />
        <p className="muted">{t('door.choirwork.reh.intro')}</p>
      </div>
      <ChoirSelect value={choir} onChange={setChoir}>{(id) => <Rehearsals key={id} choirId={id} />}</ChoirSelect>
    </section>
  );
}
