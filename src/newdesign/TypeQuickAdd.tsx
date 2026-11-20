import { useState, type FormEvent } from 'react';
import { fetchSystemSettings, saveSystemMoney } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { useLoad } from './useLoad';
import { suggestTypeCode } from './systemSettings';

/**
 * Add a contribution type or a donation type without leaving the page that needs it.
 * Shown only to people who may change the unit's money options (the treasurer and the president).
 */
export function TypeQuickAdd({ systemId, kind, onAdded }: { systemId: string; kind: 'contribution' | 'donation'; onAdded: () => void }) {
  const t = useT();
  const { data } = useLoad(() => fetchSystemSettings(systemId), `sset-quick|${systemId}`);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data?.canEditMoney) return null;
  const list = kind === 'contribution' ? data.money.types : data.money.donationTypes ?? [];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    const code = suggestTypeCode(clean);
    if (!clean || !code) return setError(t('door.sset.err.name'));
    if (list.some((x) => x.code === code)) return setError(t('door.sset.err.duplicate'));
    setBusy(true);
    setError('');
    try {
      const money = kind === 'contribution'
        ? { ...data.money, donationTypes: data.money.donationTypes ?? [], types: [...data.money.types, { code, name: clean }] }
        : { ...data.money, donationTypes: [...(data.money.donationTypes ?? []), { code, name: clean }] };
      await saveSystemMoney(systemId, money);
      setName('');
      onAdded();
    } catch {
      setError(t('door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel door-form" onSubmit={(e) => void submit(e)} noValidate>
      <TextField
        label={t(kind === 'contribution' ? 'door.money.quick.contribution' : 'door.money.quick.donation')}
        name={`quick-${kind}`}
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        hint={t('door.money.quick.hint')}
      />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy}>
        {t('door.money.quick.add')}
      </button>
    </form>
  );
}
