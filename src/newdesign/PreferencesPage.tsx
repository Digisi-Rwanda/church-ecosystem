import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPreferences, savePreferences } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { ENABLED_LOCALES, LOCALE_NAMES, isEnabledLocale } from '../i18n/locales';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

/** Preferences: kept on the server, so they follow the person to every device. */
export function PreferencesPage() {
  const t = useT();
  const { setLocale } = useI18n();
  const { portal } = useFrontDoor();
  const { loading, failed, data, reload } = useLoad(fetchPreferences, 'preferences');
  const [language, setLanguage] = useState('');
  const [muted, setMuted] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) {
      setLanguage(data.language ?? '');
      setMuted(data.mutedSystems);
      // A language chosen on another device applies here too.
      if (isEnabledLocale(data.language)) setLocale(data.language);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = async () => {
    setError('');
    setSaved(false);
    try {
      await savePreferences({ language: language || null, mutedSystems: muted });
      if (isEnabledLocale(language)) setLocale(language);
      setSaved(true);
    } catch {
      setError(t('door.people.actionFailed'));
    }
  };

  return (
    <section className="door-block" aria-labelledby="door-prefs-title">
      <Link className="btn ghost sm door-back" to="/portal/notifications">
        {t('door.notices.back')}
      </Link>
      <h2 id="door-prefs-title">{t('door.prefs.title')}</h2>
      <LoadState loading={loading} failed={failed} retry={reload}>
        <div className="panel door-form">
          <SelectField label={t('door.prefs.language')} name="language" value={language} onChange={(e) => setLanguage(e.target.value)} hint={t('door.prefs.languageHint')}>
            <option value="">{t('door.prefs.languageDefault')}</option>
            {ENABLED_LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </SelectField>
          <fieldset className="door-fieldset">
            <legend>{t('door.prefs.muted')}</legend>
            <p className="muted">{t('door.prefs.mutedHint')}</p>
            {portal.map((s) => (
              <label key={s.id} className="door-check">
                <input
                  type="checkbox"
                  checked={muted.includes(s.id)}
                  onChange={(e) => setMuted((m) => (e.target.checked ? [...m, s.id] : m.filter((x) => x !== s.id)))}
                />
                {s.shortName}
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="door-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="door-ok" role="status">
              {t('door.prefs.saved')}
            </p>
          )}
          <button type="button" className="btn" onClick={() => void save()}>
            {t('door.prefs.save')}
          </button>
        </div>
      </LoadState>
    </section>
  );
}
