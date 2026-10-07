import { useState, type FormEvent } from 'react';
import { addCouple, endCouple, fetchCouples, type DirectoryPerson } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { caringErrorKey } from './caring';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useLoad } from './useLoad';

/** The Couples block: married couples shown as pairs. */
export function CouplesPage() {
  const t = useT();
  const { locale } = useI18n();
  const list = useLoad(fetchCouples, 'caring-couples');
  const [form, setForm] = useState(false);
  const [a, setA] = useState<{ id: string; name: string } | null>(null);
  const [b, setB] = useState<{ id: string; name: string } | null>(null);
  const [day, setDay] = useState('');
  const [error, setError] = useState('');
  const reset = () => { setForm(false); setA(null); setB(null); setDay(''); };
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      list.reload();
    } catch (err) {
      setError(t(caringErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!a || !b) return setError(t('door.caring.couples.choose'));
    void run(() => addCouple({ aId: a.id, bId: b.id, marriedOn: day || null }), reset);
  };
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  return (
    <section className="door-block" aria-labelledby="door-couples-title">
      <div>
        <h2 id="door-couples-title">{t('door.own.couples')}</h2>
        <p className="muted">{t('door.caring.couples.intro')}</p>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      {list.data?.canWrite && !form && (
        <div className="door-row">
          <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.caring.couples.new')}</button>
        </div>
      )}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.caring.couples.new')}</h3>
          <p>{a ? a.name : t('door.caring.couples.first')}</p>
          <PersonPicker label={t('door.caring.couples.pickFirst')} name="c-a" onPick={(p: DirectoryPerson) => setA({ id: p.id, name: p.fullName })} />
          <p>{b ? b.name : t('door.caring.couples.second')}</p>
          <PersonPicker label={t('door.caring.couples.pickSecond')} name="c-b" onPick={(p: DirectoryPerson) => setB({ id: p.id, name: p.fullName })} />
          <TextField label={t('door.caring.couples.marriedOn')} name="c-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          <div className="door-row">
            <button type="submit" className="btn">{t('door.caring.couples.save')}</button>
            <button type="button" className="btn ghost" onClick={reset}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {list.data && list.data.pairs.length === 0 ? (
          <EmptyState title={t('door.caring.couples.none')} detail={t('door.caring.couples.noneDetail')} />
        ) : (
          <ul className="door-notices">
            {(list.data?.pairs ?? []).map((p) => (
              <li key={p.id} className="panel door-notice">
                <div className="door-notice-main">
                  <strong>{p.aName} &amp; {p.bName}</strong>
                  {p.marriedOn && <p className="muted">{t('door.caring.couples.since', { day: fmt(p.marriedOn) })}</p>}
                  {list.data?.canWrite && (
                    <button type="button" className="btn ghost" onClick={() => void run(() => endCouple(p.id))}>{t('door.caring.couples.remove')}</button>
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
