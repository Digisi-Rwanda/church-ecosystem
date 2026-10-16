import { useState, type FormEvent } from 'react';
import { fetchSettings, resetSetting, saveSetting, type ChurchProfile, type MoveRules, type SettingKey, type SettingRow, type TypeItem } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { ENABLED_LOCALES, LOCALE_NAMES } from '../i18n/locales';
import { govErrorKey, errorCode } from './governance';
import { LoadState } from './LoadState';
import { RANGES, cleanTypeList, daysProblem, moveRulesProblem, orderSettings, sameValue, suggestCode, typeListProblem } from './settings';
import { dayLabel } from './notices';
import { useLoad } from './useLoad';
import { fetchDeletedWork } from '../api/frontDoorApi';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from './kit';

/** Central Administration's six settings. Everyone who may read them sees all six; three offices change them. */
export function SettingsPage() {
  const t = useT();
  const { data, loading, failed, reload } = useLoad(fetchSettings, 'settings');
  const [message, setMessage] = useState('');
  const { systemId = '' } = useParams();
  // Only an Administrator gets an answer here; for everyone else the link stays hidden.
  const deleted = useLoad(fetchDeletedWork, 'settings-deleted-probe');
  const rows = orderSettings(data?.settings ?? []);
  const canChange = !!data?.canChange;
  return (
    <section className="door-block" aria-labelledby="door-settings-title">
      <div>
        <PageHeader id="door-settings-title" title={t('door.settings.title')} purpose={t('door.purpose.settings')} />
        <p className="muted">{t('door.settings.intro')}</p>
        {data && !canChange && <p className="muted">{t('door.settings.readOnly')}</p>}
      </div>
      {message && (
        <p className="door-ok" role="status">
          {message}
        </p>
      )}
      <LoadState loading={loading} failed={failed} retry={reload}>
        <ul className="door-settings">
          {rows.map((row) => (
            <li key={row.key}>
              <SettingCard
                row={row}
                canChange={canChange}
                onDone={(text) => {
                  setMessage(text);
                  reload();
                }}
              />
            </li>
          ))}
        </ul>
        {deleted.data && (
          <p>
            <Link to={`/s/${systemId}/deleted-work`}>{t('door.work.deleted.link')}</Link>
          </p>
        )}
      </LoadState>
    </section>
  );
}

function summary(row: SettingRow, t: ReturnType<typeof useT>): string {
  switch (row.key) {
    case 'church.profile': {
      const p = row.value as ChurchProfile;
      return [p.name, p.address, p.phone, p.email].filter(Boolean).join(' · ');
    }
    case 'church.language':
      return LOCALE_NAMES[row.value as 'en' | 'rw' | 'fr'] ?? String(row.value);
    case 'letters.types':
    case 'meetings.types':
      return (row.value as TypeItem[]).map((i) => i.name).join(', ');
    case 'moves.rules': {
      const m = row.value as MoveRules;
      return t('door.settings.moves.rules.summary', { child: String(m.childMaxAge), youth: String(m.youthMaxAge), elderly: String(m.elderlyFromAge), trigger: t(`door.settings.moves.trigger.${m.adultTrigger}` as const) });
    }
    default:
      return t('door.settings.days', { count: String(row.value) });
  }
}

function SettingCard({ row, canChange, onDone }: { row: SettingRow; canChange: boolean; onDone: (message: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const when = row.updatedAt ? dayLabel(row.updatedAt).date : '';
  const hintVars = row.key.startsWith('access.') ? RANGES[row.key as keyof typeof RANGES] : undefined;

  const save = async (value: unknown) => {
    setBusy(true);
    setError('');
    try {
      await saveSetting(row.key, value);
      setEditing(false);
      onDone(t('door.settings.saved'));
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    setBusy(true);
    setError('');
    try {
      await resetSetting(row.key);
      onDone(t('door.settings.resetDone'));
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel door-setting">
      <div className="door-row">
        <h3>{t(`door.settings.${row.key}.title` as const)}</h3>
        {canChange && !editing && (
          <div className="door-row">
            <button type="button" className="btn secondary sm" onClick={() => setEditing(true)}>
              {t('door.settings.edit')}
            </button>
            {!row.isDefault && (
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void reset()}>
                {t('door.settings.reset')}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="muted">{t(`door.settings.${row.key}.hint` as const, { min: String(hintVars?.min ?? ''), max: String(hintVars?.max ?? '') })}</p>
      {!editing && <p className="door-setting-value">{summary(row, t) || '—'}</p>}
      {!editing && (
        <p className="muted door-notice-meta">
          {row.isDefault ? t('door.settings.default') : row.updatedByName ? t('door.settings.changed', { name: row.updatedByName, date: when }) : t('door.settings.changedNoName', { date: when })}
        </p>
      )}
      {editing && <Editor row={row} busy={busy} onSave={save} onCancel={() => { setEditing(false); setError(''); }} setError={setError} />}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Editor({ row, busy, onSave, onCancel, setError }: { row: SettingRow; busy: boolean; onSave: (v: unknown) => void; onCancel: () => void; setError: (m: string) => void }) {
  const t = useT();
  const key = row.key as SettingKey;
  const [profile, setProfile] = useState<ChurchProfile>(row.value as ChurchProfile);
  const [language, setLanguage] = useState(String(row.value));
  const [types, setTypes] = useState<TypeItem[]>(Array.isArray(row.value) ? (row.value as TypeItem[]) : []);
  const [days, setDays] = useState(typeof row.value === 'number' ? String(row.value) : '');
  const mv = key === 'moves.rules' ? (row.value as MoveRules) : null;
  const [moves, setMoves] = useState({ childMaxAge: String(mv?.childMaxAge ?? ''), youthMaxAge: String(mv?.youthMaxAge ?? ''), elderlyFromAge: String(mv?.elderlyFromAge ?? ''), adultTrigger: mv?.adultTrigger ?? 'EITHER' });
  const [newName, setNewName] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (key === 'church.profile') {
      const okMail = profile.email.trim() === '' || /^\S+@\S+\.\S+$/.test(profile.email.trim());
      if (profile.name.trim().length < 2 || profile.shortName.trim().length < 2 || !okMail) return setError(t('door.settings.err.profile'));
      return onSave({ name: profile.name.trim(), shortName: profile.shortName.trim(), address: profile.address.trim(), phone: profile.phone.trim(), email: profile.email.trim() });
    }
    if (key === 'church.language') return onSave(language);
    if (key === 'letters.types' || key === 'meetings.types') {
      const problem = typeListProblem(types);
      if (problem) return setError(t(`door.settings.err.${problem}` as const));
      return onSave(cleanTypeList(types));
    }
    if (key === 'moves.rules') {
      const r = moveRulesProblem(moves);
      if (!r.ok) return setError(t(`door.settings.err.moves.${r.problem}` as const));
      return onSave(r.value);
    }
    const k = key as 'access.termReminderDays' | 'access.delegationMaxDays';
    const n = daysProblem(k, days);
    if (n === null) return setError(t('door.settings.err.days', { min: String(RANGES[k].min), max: String(RANGES[k].max) }));
    return onSave(n);
  };

  const unchanged = sameValue(
    key === 'church.profile' ? profile : key === 'church.language' ? language : key === 'letters.types' || key === 'meetings.types' ? cleanTypeList(types) : key === 'moves.rules' ? { childMaxAge: Number(moves.childMaxAge), youthMaxAge: Number(moves.youthMaxAge), elderlyFromAge: Number(moves.elderlyFromAge), adultTrigger: moves.adultTrigger } : Number(days),
    row.value,
  );

  return (
    <form className="door-form" onSubmit={submit} noValidate>
      {key === 'church.profile' && (
        <>
          <TextField label={t('door.settings.church.profile.name')} name="p-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <TextField label={t('door.settings.church.profile.shortName')} name="p-short" value={profile.shortName} onChange={(e) => setProfile({ ...profile, shortName: e.target.value })} />
          <TextField label={t('door.settings.church.profile.address')} name="p-address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
          <TextField label={t('door.settings.church.profile.phone')} name="p-phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          <TextField label={t('door.settings.church.profile.email')} name="p-email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
        </>
      )}
      {key === 'church.language' && (
        <SelectField label={t('door.settings.church.language.title')} name="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {ENABLED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </SelectField>
      )}
      {(key === 'letters.types' || key === 'meetings.types') && (
        <>
          <ul className="door-types">
            {types.map((item, i) => (
              <li key={i} className="door-type-row">
                <TextField label={t('door.settings.types.code')} name={`code-${i}`} value={item.code} onChange={(e) => setTypes(types.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))} />
                <TextField label={t('door.settings.types.name')} name={`name-${i}`} value={item.name} onChange={(e) => setTypes(types.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <button type="button" className="btn ghost sm" onClick={() => setTypes(types.filter((_, j) => j !== i))}>
                  {t('door.settings.types.remove')}
                </button>
              </li>
            ))}
          </ul>
          <div className="door-type-row">
            <TextField label={t('door.settings.types.newName')} name="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button
              type="button"
              className="btn secondary sm"
              disabled={newName.trim().length < 2}
              onClick={() => {
                setTypes([...types, { code: suggestCode(newName), name: newName.trim() }]);
                setNewName('');
              }}
            >
              {t('door.settings.types.add')}
            </button>
          </div>
        </>
      )}
      {key === 'moves.rules' && (
        <>
          <TextField label={t('door.settings.moves.childMaxAge')} name="mv-child" type="number" inputMode="numeric" value={moves.childMaxAge} onChange={(e) => setMoves({ ...moves, childMaxAge: e.target.value })} />
          <TextField label={t('door.settings.moves.youthMaxAge')} name="mv-youth" type="number" inputMode="numeric" value={moves.youthMaxAge} onChange={(e) => setMoves({ ...moves, youthMaxAge: e.target.value })} />
          <TextField label={t('door.settings.moves.elderlyFromAge')} name="mv-elderly" type="number" inputMode="numeric" value={moves.elderlyFromAge} onChange={(e) => setMoves({ ...moves, elderlyFromAge: e.target.value })} />
          <SelectField label={t('door.settings.moves.adultTrigger')} name="mv-trigger" value={moves.adultTrigger} onChange={(e) => setMoves({ ...moves, adultTrigger: e.target.value as MoveRules['adultTrigger'] })}>
            {(['EITHER', 'AGE', 'MARRIAGE'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`door.settings.moves.trigger.${v}` as const)}
              </option>
            ))}
          </SelectField>
        </>
      )}
      {(key === 'access.termReminderDays' || key === 'access.delegationMaxDays') && (
        <TextField
          label={t(`door.settings.${key}.title` as const)}
          name="days"
          type="number"
          inputMode="numeric"
          value={days}
          min={RANGES[key].min}
          max={RANGES[key].max}
          onChange={(e) => setDays(e.target.value)}
        />
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy || unchanged}>
          {busy ? t('door.settings.saving') : t('door.settings.save')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.settings.cancel')}
        </button>
      </div>
    </form>
  );
}
