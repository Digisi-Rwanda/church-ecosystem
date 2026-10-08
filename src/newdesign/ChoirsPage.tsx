import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createChoir, fetchChoirs, setChoirActive, type ChoirRole } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { musicErrorKey, ROLES } from './music';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The choir register: every choir the person may see, and a way into each one's singers. */
export function ChoirsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const list = useLoad(fetchChoirs, 'music-choirs');
  const [form, setForm] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ChoirRole>('PRIMARY');
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      list.reload();
    } catch (err) {
      setError(t(musicErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('door.caring.err.input'));
    void run(() => createChoir({ name: name.trim(), role }), () => { setForm(false); setName(''); });
  };
  return (
    <section className="door-block" aria-labelledby="door-choirs-title">
      <div>
        <PageHeader id="door-choirs-title" title={t('door.own.choirs')} purpose={t('door.purpose.choirs')} />
        <p className="muted">{t('door.music.choirs.intro')}</p>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      {list.data?.canManage && !form && (
        <div className="door-row"><button type="button" className="btn" onClick={() => setForm(true)}>{t('door.music.choirs.new')}</button></div>
      )}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.music.choirs.new')}</h3>
          <TextField label={t('door.music.choirs.name')} name="ch-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <SelectField label={t('door.music.choirs.role')} name="ch-role" value={role} onChange={(e) => setRole(e.target.value as ChoirRole)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`door.music.role.${r}` as 'door.music.role.PRIMARY')}</option>)}
          </SelectField>
          <div className="door-row">
            <button type="submit" className="btn">{t('door.music.choirs.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {list.data && list.data.choirs.length === 0 ? (
          <EmptyState title={t('door.music.choirs.none')} detail={t('door.music.choirs.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {(list.data?.choirs ?? []).map((c) => (
              <li key={c.id} className="panel door-notice">
                <div className="door-notice-main">
                  <div className="door-row">
                    <strong><Link to={`/s/${systemId}/choirs/${c.id}`}>{c.name}</Link></strong>
                    {!c.active && <span className="door-chip">{t('door.music.retired')}</span>}
                  </div>
                  <p className="muted">{t(`door.music.role.${c.role}` as 'door.music.role.PRIMARY')} · {t('door.music.members', { count: String(c.members) })}</p>
                  {list.data?.canManage && (
                    <button type="button" className="btn ghost" onClick={() => void run(() => setChoirActive(c.id, !c.active))}>
                      {c.active ? t('door.music.retire') : t('door.music.restore')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
