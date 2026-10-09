import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublicEvent, registerPublic } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The page behind an event's public link: an invitation and a name-and-phone form. Nothing else is reachable from here. */
export function PublicEventPage() {
  const t = useT();
  const { locale } = useI18n();
  const { token = '' } = useParams();
  const load = useLoad(() => fetchPublicEvent(token), `public-event|${token}`);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [trap, setTrap] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const e = load.data;
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');

  if (load.failed) return <EmptyState variant="error" title={t('door.plan.public.gone')} />;
  const send = async () => {
    setError('');
    try {
      await registerPublic(token, { name: name.trim(), phone: phone.trim(), website: trap });
      setDone(true);
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  return (
    <main className="door-block" aria-labelledby="door-public-title">
      <LoadState loading={load.loading || !e} failed={false} retry={load.reload}>
        {e && (
          <>
            <PageHeader id="door-public-title" title={e.title} purpose={[when(e.startsOn), e.location].filter(Boolean).join(' · ')} />
            {e.aim && <p>{e.aim}</p>}
            {done ? (
              <p role="status">{t('door.plan.public.done')}</p>
            ) : e.open ? (
              <form
                className="panel"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  void send();
                }}
              >
                <TextField label={t('door.plan.guests.name')} name="pub-name" value={name} onChange={(x) => setName(x.target.value)} required />
                <TextField label={t('door.plan.guests.phone')} name="pub-phone" inputMode="tel" value={phone} onChange={(x) => setPhone(x.target.value)} required />
                <input className="door-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={trap} onChange={(x) => setTrap(x.target.value)} />
                {error && <p role="alert" className="door-error">{error}</p>}
                <button type="submit" className="btn primary" disabled={name.trim().length < 2 || phone.trim().length < 6}>
                  {t('door.plan.public.go')}
                </button>
              </form>
            ) : (
              <p role="status">{e.full ? t('door.plan.public.full') : t('door.plan.public.closed')}</p>
            )}
          </>
        )}
      </LoadState>
    </main>
  );
}
