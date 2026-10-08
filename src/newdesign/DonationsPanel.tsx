import { ImportLink } from './imports/ImportLink';
import { useState, type FormEvent } from 'react';
import { decideDonation, fetchDonations, fetchMoneyAccounts, recordDonation } from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { formatRwf, moneyErrorKey, parseAmount } from './money';
import { donationStatusKey } from './moneyBlock';
import { useLoad } from './useLoad';

/** Donations: the treasurer or vice president records, the president approves, and only then it counts as income. */
export function DonationsPanel({ systemId }: { systemId: string }) {
  const t = useT();
  const { loading, failed, data, reload } = useLoad(() => fetchDonations(systemId), `donations|${systemId}`);
  const accounts = useLoad(() => fetchMoneyAccounts(systemId), `donation-acc|${systemId}`);
  const open = (accounts.data?.accounts ?? []).filter((a) => a.status === 'ACTIVE');
  const [form, setForm] = useState(false);
  const [donor, setDonor] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [ask, setAsk] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setForm(false);
      setAsk(null);
      reload();
    } catch (e) {
      setError(t(moneyErrorKey(errorCode(e)) as 'door.people.actionFailed'));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = parseAmount(amount);
    const acc = accountId || (open.length === 1 ? open[0].id : '');
    if (!donor.trim() || n === null || !acc) return setError(t('door.money.form.incomplete'));
    void run(() => recordDonation({ systemId, accountId: acc, donorName: donor.trim(), amount: n, receivedOn: day }));
  };
  return (
    <div className="door-form" style={{ maxWidth: 'none' }}>
      <h3>{t('door.money.donations')}</h3>
      <p className="muted">{t('door.money.donations.intro')}</p>
      <LoadState loading={loading} failed={failed} retry={reload}>
        {data?.canRecord && !form && (
          <div className="door-row">
            <button type="button" className="btn" onClick={() => setForm(true)}>
              {t('door.money.donations.new')}
            </button>
            <ImportLink systemId={systemId} target="donations" />
          </div>
        )}
        {form && (
          <form className="panel door-form" onSubmit={submit} noValidate>
            <TextField label={t('door.money.donations.donor')} name="d-donor" maxLength={80} value={donor} onChange={(e) => setDonor(e.target.value)} />
            <TextField label={t('door.money.entry.amount')} name="d-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <TextField label={t('door.money.donations.day')} name="d-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            {open.length > 1 && (
              <SelectField label={t('door.money.entry.account')} name="d-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">{t('door.gov.meeting.choose')}</option>
                {open.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </SelectField>
            )}
            <div className="door-row">
              <button type="submit" className="btn">
                {t('door.money.donations.record')}
              </button>
              <button type="button" className="btn ghost" onClick={() => setForm(false)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
        {data && data.donations.length === 0 && <p className="muted">{t('door.money.donations.none')}</p>}
        <ul className="door-notices">
          {(data?.donations ?? []).map((d) => (
            <li key={d.id} className="panel door-notice">
              <div className="door-notice-main">
                <div className="door-row">
                  <strong>{d.donorName}</strong>
                  <span>{formatRwf(d.amount)}</span>
                  <span className={`door-chip${d.status === 'PENDING' ? ' warn' : ''}`}>{t(donationStatusKey(d.status))}</span>
                </div>
                <p className="muted">
                  {d.receivedOn} · {t('door.money.entry.by', { name: d.recordedByName })}
                </p>
                {d.decisionNote && <p className="muted">{d.decisionNote}</p>}
                {ask === d.id && (
                  <div className="door-form">
                    <TextAreaField label={t('door.money.reason')} name={`d-reason-${d.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button type="button" className="btn" onClick={() => void run(() => decideDonation(d.id, false, reason))}>
                      {t('door.money.entry.decline')}
                    </button>
                  </div>
                )}
                {d.canDecide && ask !== d.id && (
                  <div className="door-row">
                    <button type="button" className="btn sm" onClick={() => void run(() => decideDonation(d.id, true))}>
                      {t('door.money.entry.approve')}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setAsk(d.id)}>
                      {t('door.money.entry.decline')}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </LoadState>
    </div>
  );
}
