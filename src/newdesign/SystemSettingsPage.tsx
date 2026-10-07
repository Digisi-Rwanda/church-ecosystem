import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  PAYMENT_METHODS,
  fetchPreferences,
  fetchSystemSettings,
  savePreferences,
  saveSystemDetails,
  saveSystemMoney,
  type PaymentMethod,
  type SystemDetails,
  type SystemMoneyOptions,
} from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { ENABLED_LOCALES, LOCALE_NAMES, isEnabledLocale } from '../i18n/locales';
import { useTheme } from '../theme/theme';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { MAX_TYPES, cleanMoney, suggestTypeCode, toDraft, typesProblem, type TypeDraft } from './systemSettings';
import { useLoad } from './useLoad';

/**
 * Settings of ONE system: how it looks for me, which of its news I hear, and (for those who
 * hold the office) the unit's details and its contribution goals. A section a person cannot
 * change is not shown. Central Administration's church-wide settings are a different page.
 */
export function SystemSettingsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const sys = useLoad(() => fetchSystemSettings(systemId), `sset-${systemId}`);
  return (
    <section className="door-block" aria-labelledby="door-sset-title">
      <div>
        <h2 id="door-sset-title">{t('door.sset.title')}</h2>
        <p className="muted">{t('door.sset.intro')}</p>
      </div>
      <LoadState loading={sys.loading} failed={sys.failed} retry={sys.reload}>
        {sys.data && (
          <>
            <DisplaySection systemId={systemId} />
            {sys.data.canEditDetails && <DetailsSection systemId={systemId} initial={sys.data.details} />}
            {sys.data.canEditMoney && <MoneySection systemId={systemId} initial={sys.data.money} />}
          </>
        )}
      </LoadState>
    </section>
  );
}

/** Saving state shared by the sections: one message line each. */
function useSaver() {
  const t = useT();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (work: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: t('door.sset.saved') });
    } catch (e) {
      setMessage({ ok: false, text: errorCode(e) === 'NOT_ALLOWED' ? t('door.sset.err.notAllowed') : t('door.sset.err.failed') });
    }
  };
  const line = message && (
    <p className={message.ok ? 'door-ok' : 'door-error'} role={message.ok ? 'status' : 'alert'}>
      {message.text}
    </p>
  );
  return { run, line };
}

function DisplaySection({ systemId }: { systemId: string }) {
  const t = useT();
  const { setLocale } = useI18n();
  const { setTheme } = useTheme();
  const prefs = useLoad(fetchPreferences, 'sset-prefs');
  const [language, setLanguage] = useState('');
  const [theme, setThemeChoice] = useState<'' | 'light' | 'dark'>('');
  const [muted, setMuted] = useState(false);
  const saver = useSaver();

  useEffect(() => {
    if (!prefs.data) return;
    setLanguage(prefs.data.language ?? '');
    setThemeChoice(prefs.data.theme ?? '');
    setMuted(prefs.data.mutedSystems.includes(systemId));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const others = (prefs.data?.mutedSystems ?? []).filter((id) => id !== systemId);
    void saver.run(async () => {
      await savePreferences({ language: language || null, theme: theme || null, mutedSystems: muted ? [...others, systemId] : others });
      if (isEnabledLocale(language)) setLocale(language);
      if (theme) setTheme(theme);
      prefs.reload();
    });
  };

  return (
    <form className="panel door-form" onSubmit={submit} aria-labelledby="door-sset-display">
      <h3 id="door-sset-display">{t('door.sset.display')}</h3>
      <LoadState loading={prefs.loading} failed={prefs.failed} retry={prefs.reload}>
        <SelectField label={t('door.prefs.language')} name="sset-language" value={language} onChange={(e) => setLanguage(e.target.value)} hint={t('door.prefs.languageHint')}>
          <option value="">{t('door.prefs.languageDefault')}</option>
          {ENABLED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('door.sset.theme')} name="sset-theme" value={theme} onChange={(e) => setThemeChoice(e.target.value as '' | 'light' | 'dark')} hint={t('door.sset.themeHint')}>
          <option value="">{t('door.sset.theme.device')}</option>
          <option value="light">{t('door.sset.theme.light')}</option>
          <option value="dark">{t('door.sset.theme.dark')}</option>
        </SelectField>
        <fieldset className="door-fieldset">
          <legend>{t('door.sset.notices')}</legend>
          <label className="door-check">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            {t('door.sset.mute')}
          </label>
          <p className="muted">{t('door.sset.muteHint')}</p>
        </fieldset>
        {saver.line}
        <button type="submit" className="btn">
          {t('door.prefs.save')}
        </button>
      </LoadState>
    </form>
  );
}

function DetailsSection({ systemId, initial }: { systemId: string; initial: SystemDetails }) {
  const t = useT();
  const [form, setForm] = useState<SystemDetails>(initial);
  const saver = useSaver();
  const set = (k: keyof SystemDetails) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="panel door-form"
      aria-labelledby="door-sset-details"
      onSubmit={(e) => {
        e.preventDefault();
        void saver.run(() => saveSystemDetails(systemId, form));
      }}
    >
      <h3 id="door-sset-details">{t('door.sset.details')}</h3>
      <p className="muted">{t('door.sset.detailsHint')}</p>
      <TextField label={t('door.sset.displayName')} name="sset-name" maxLength={80} value={form.displayName} onChange={set('displayName')} />
      <TextField label={t('door.sset.meeting')} name="sset-meeting" maxLength={60} value={form.meetingDay} onChange={set('meetingDay')} />
      <TextField label={t('door.sset.place')} name="sset-place" maxLength={120} value={form.place} onChange={set('place')} />
      <TextField label={t('door.sset.contact')} name="sset-contact" maxLength={120} value={form.contactLine} onChange={set('contactLine')} />
      {saver.line}
      <button type="submit" className="btn">
        {t('door.sset.saveDetails')}
      </button>
    </form>
  );
}

function MoneySection({ systemId, initial }: { systemId: string; initial: SystemMoneyOptions }) {
  const t = useT();
  const [types, setTypes] = useState<TypeDraft[]>(() => initial.types.map(toDraft));
  const [methods, setMethods] = useState<PaymentMethod[]>(initial.methods);
  const [problem, setProblem] = useState<string | null>(null);
  const saver = useSaver();
  const edit = (i: number, patch: Partial<TypeDraft>) => setTypes((all) => all.map((d, n) => (n === i ? { ...d, ...patch } : d)));

  return (
    <form
      className="panel door-form"
      aria-labelledby="door-sset-money"
      onSubmit={(e) => {
        e.preventDefault();
        const bad = typesProblem(types);
        setProblem(bad);
        if (!bad) void saver.run(() => saveSystemMoney(systemId, cleanMoney(types, methods)));
      }}
    >
      <h3 id="door-sset-money">{t('door.sset.money')}</h3>
      <p className="muted">{t('door.sset.moneyHint')}</p>
      <fieldset className="door-fieldset">
        <legend>{t('door.sset.methods')}</legend>
        {PAYMENT_METHODS.map((m) => (
          <label key={m} className="door-check">
            <input type="checkbox" checked={methods.includes(m)} onChange={(e) => setMethods((all) => (e.target.checked ? [...all, m] : all.filter((x) => x !== m)))} />
            {t(`door.sset.method.${m}` as 'door.sset.method.CASH')}
          </label>
        ))}
      </fieldset>
      {types.length === 0 && <p className="muted">{t('door.sset.noTypes')}</p>}
      {types.map((d, i) => (
        <fieldset key={i} className="door-fieldset">
          <legend>{t('door.sset.typeN', { n: String(i + 1) })}</legend>
          <TextField label={t('door.sset.typeName')} name={`sset-type-name-${i}`} maxLength={60} value={d.name} onChange={(e) => edit(i, { name: e.target.value })} onBlur={() => !d.code && d.name && edit(i, { code: suggestTypeCode(d.name) })} />
          <TextField label={t('door.sset.typeCode')} name={`sset-type-code-${i}`} maxLength={24} value={d.code} onChange={(e) => edit(i, { code: e.target.value.toUpperCase() })} hint={t('door.sset.typeCodeHint')} />
          <TextField label={t('door.sset.goal')} name={`sset-type-goal-${i}`} inputMode="numeric" value={d.goalAmount} onChange={(e) => edit(i, { goalAmount: e.target.value })} hint={t('door.sset.goalHint')} />
          <SelectField label={t('door.sset.goalPer')} name={`sset-type-per-${i}`} value={d.goalPer} onChange={(e) => edit(i, { goalPer: e.target.value as TypeDraft['goalPer'] })}>
            <option value="">{t('door.sset.goalNone')}</option>
            <option value="MEMBER">{t('door.sset.per.MEMBER')}</option>
            <option value="TEAM">{t('door.sset.per.TEAM')}</option>
          </SelectField>
          <button type="button" className="btn ghost sm" onClick={() => setTypes((all) => all.filter((_, n) => n !== i))}>
            {t('door.sset.removeType')}
          </button>
        </fieldset>
      ))}
      {types.length < MAX_TYPES && (
        <button type="button" className="btn ghost" onClick={() => setTypes((all) => [...all, { code: '', name: '', goalAmount: '', goalPer: '' }])}>
          {t('door.sset.addType')}
        </button>
      )}
      {problem && (
        <p className="door-error" role="alert">
          {t(problem as 'door.sset.err.name')}
        </p>
      )}
      {saver.line}
      <button type="submit" className="btn">
        {t('door.sset.saveMoney')}
      </button>
    </form>
  );
}
