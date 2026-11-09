import { useI18n, useT } from '../i18n/I18nContext';
import { ENABLED_LOCALES, LOCALE_NAMES, type Locale } from '../i18n/locales';

/**
 * Chooses the language. It draws nothing until a second language has been reviewed and switched on
 * (see i18n/locales.ts), so it is safe to leave in the shell and on sign-in from day one.
 */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const t = useT();
  if (ENABLED_LOCALES.length < 2) return null;
  return (
    <label className={`lang-switch ${className}`.trim()}>
      <span className="visually-hidden">{t('door.lang.label')}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t('door.lang.label')}>
        {ENABLED_LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
        ))}
      </select>
    </label>
  );
}
