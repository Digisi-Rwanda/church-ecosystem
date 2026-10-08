import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addChoirMember, fetchChoir, removeChoirMember, type DirectoryPerson } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { musicErrorKey } from './music';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** One choir's register: who sings in it. */
export function ChoirPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '', choirId = '' } = useParams();
  const data = useLoad(() => fetchChoir(choirId), `choir|${choirId}`);
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      data.reload();
    } catch (err) {
      setError(t(musicErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const c = data.data?.choir;
  const fmt = (iso: string) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '');
  return (
    <section className="door-block" aria-labelledby="door-choir-title">
      <p><Link to={`/s/${systemId}/choirs`}>{t('door.music.back')}</Link></p>
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {c && (
          <>
            <div>
              <PageHeader id="door-choir-title" title={<>{c.name} {!c.active && <span className="door-chip">{t('door.music.retired')}</span>}</>} />
              <p className="muted">{t(`door.music.role.${c.role}` as 'door.music.role.PRIMARY')} · {t('door.music.members', { count: String(data.data!.members.length) })}</p>
            </div>
            {error && <p className="door-error" role="alert">{error}</p>}
            {c.canWrite && c.active && <PersonPicker label={t('door.music.addMember')} name="m-add" onPick={(p: DirectoryPerson) => void run(() => addChoirMember(choirId, p.id))} />}
            {data.data!.members.length === 0 ? (
              <EmptyState title={t('door.music.noMembers')} />
            ) : (
              <ul className="door-list panel">
                {data.data!.members.map((m) => (
                  <li key={m.personId} className="door-row">
                    <span>{m.name}{m.joinedOn ? <span className="muted"> · {t('door.music.joined', { day: fmt(m.joinedOn) })}</span> : null}</span>
                    {c.canWrite && <button type="button" className="btn ghost" onClick={() => void run(() => removeChoirMember(choirId, m.personId))}>{t('door.groups.remove')}</button>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}
