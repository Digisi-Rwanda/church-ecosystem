import { useState, type FormEvent } from 'react';
import { addPledge, addSponsor, cancelPledge, endSponsor, fetchSponsors, receivePledge, type SponsorItem } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { choirWorkErrorKey } from './choirWork';
import { ChoirSelect } from './ChoirSelect';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { formatRwf, parseAmount } from './money';
import { useLoad } from './useLoad';

const today = () => new Date().toISOString().slice(0, 10);

function SponsorCard({ sponsor, canWrite, onChange, onError }: { sponsor: SponsorItem; canWrite: boolean; onChange: () => void; onError: (e: unknown) => void }) {
  const t = useT();
  const { locale } = useI18n();
  const [form, setForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const run = (job: () => Promise<void>, after?: () => void) => void job().then(() => { after?.(); onChange(); }).catch(onError);
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = parseAmount(amount);
    if (n === null) return onError({ code: 'AMOUNT' });
    run(() => addPledge(sponsor.id, { amount: n, pledgedOn: today(), note: note.trim() || null }), () => { setForm(false); setAmount(''); setNote(''); });
  };
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <strong>{sponsor.name}</strong>
        <p className="muted">{[t(`door.choirwork.sp.kind.${sponsor.kind}` as 'door.choirwork.sp.kind.PERSON'), sponsor.contact].filter(Boolean).join(' · ')}</p>
        <ul className="door-list">
          {sponsor.pledges.map((p) => (
            <li key={p.id} className="door-row">
              <span>
                {formatRwf(p.amount)} · {fmt(p.pledgedOn)}
                <span className={`door-chip${p.status === 'PLEDGED' ? ' warn' : ''}`}> {t(`door.choirwork.sp.status.${p.status}` as 'door.choirwork.sp.status.PLEDGED')}</span>
                {p.note && <span className="muted"> · {p.note}</span>}
              </span>
              {canWrite && p.status === 'PLEDGED' && (
                <span className="door-row">
                  <button type="button" className="btn ghost" onClick={() => run(() => receivePledge(p.id, today()))}>{t('door.choirwork.sp.received')}</button>
                  <button type="button" className="btn ghost" onClick={() => run(() => cancelPledge(p.id))}>{t('door.choirwork.sp.cancel')}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {canWrite && !form && (
          <div className="door-row">
            <button type="button" className="btn ghost" onClick={() => setForm(true)}>{t('door.choirwork.sp.addPledge')}</button>
            <button type="button" className="btn ghost" onClick={() => run(() => endSponsor(sponsor.id))}>{t('door.choirwork.sp.end')}</button>
          </div>
        )}
        {form && (
          <form className="door-form" onSubmit={submit} noValidate>
            <TextField label={t('door.money.entry.amount')} name={`p-amt-${sponsor.id}`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <TextField label={t('door.money.entry.note')} name={`p-note-${sponsor.id}`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            <div className="door-row">
              <button type="submit" className="btn">{t('door.choirwork.sp.savePledge')}</button>
              <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}

function Sponsors({ choirId }: { choirId: string }) {
  const t = useT();
  const data = useLoad(() => fetchSponsors(choirId), `sponsors|${choirId}`);
  const [form, setForm] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'PERSON' | 'ORGANISATION'>('PERSON');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const fail = (err: unknown) => setError(t(choirWorkErrorKey(errorCode(err)) as 'door.people.actionFailed'));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('door.caring.err.input'));
    setError('');
    try {
      await addSponsor({ choirId, name: name.trim(), kind, contact: contact.trim() || null });
      setForm(false);
      setName('');
      setContact('');
      data.reload();
    } catch (err) {
      fail(err);
    }
  };
  const canWrite = !!data.data?.canWrite;
  return (
    <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
      {error && <p className="door-error" role="alert">{error}</p>}
      {data.data && (
        <div className="panel">
          <p>{t('door.choirwork.sp.totals', { pledged: formatRwf(data.data.totals.pledged), received: formatRwf(data.data.totals.received) })}</p>
          <p className="muted">{t('door.choirwork.sp.apart')}</p>
        </div>
      )}
      {canWrite && !form && <div className="door-row"><button type="button" className="btn" onClick={() => setForm(true)}>{t('door.choirwork.sp.new')}</button></div>}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.choirwork.sp.new')}</h3>
          <TextField label={t('door.choirwork.sp.name')} name="sp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <SelectField label={t('door.choirwork.sp.kindLabel')} name="sp-kind" value={kind} onChange={(e) => setKind(e.target.value as 'PERSON' | 'ORGANISATION')}>
            <option value="PERSON">{t('door.choirwork.sp.kind.PERSON')}</option>
            <option value="ORGANISATION">{t('door.choirwork.sp.kind.ORGANISATION')}</option>
          </SelectField>
          <TextField label={t('door.choirwork.sp.contact')} name="sp-contact" value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} />
          <div className="door-row">
            <button type="submit" className="btn">{t('door.choirwork.sp.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      {(data.data?.sponsors ?? []).length === 0 ? (
        <EmptyState title={t('door.choirwork.sp.none')} detail={t('door.choirwork.sp.noneDetail')} />
      ) : (
        <ul className="door-notices">
          {data.data!.sponsors.map((s) => <SponsorCard key={s.id} sponsor={s} canWrite={canWrite} onChange={data.reload} onError={fail} />)}
        </ul>
      )}
    </LoadState>
  );
}

/** Sponsorship: who supports a choir and what they pledged. A log kept apart from Money. */
export function SponsorshipPage() {
  const t = useT();
  const [choir, setChoir] = useState('');
  return (
    <section className="door-block" aria-labelledby="door-sp-title">
      <div>
        <h2 id="door-sp-title">{t('door.own.sponsorship')}</h2>
        <p className="muted">{t('door.choirwork.sp.intro')}</p>
      </div>
      <ChoirSelect value={choir} onChange={setChoir}>{(id) => <Sponsors key={id} choirId={id} />}</ChoirSelect>
    </section>
  );
}
