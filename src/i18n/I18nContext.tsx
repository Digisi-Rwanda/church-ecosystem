import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCALE, ENABLED_LOCALES, isEnabledLocale, type Locale } from './locales';
import { makeFormat, type Format } from './format';
import { translate, translatePlural, type MessageKey, type MessageParams } from './translate';

const STORAGE_KEY = 'adepr-locale';

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
  /** A text that changes with a count: pass the base key (`x` for `x.one` / `x.other`). */
  tn: (key: string, count: number, params?: MessageParams) => string;
  fmt: Format;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isEnabledLocale(raw)) return raw;
  } catch {
    /* storage can be blocked; use the default language */
  }
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isEnabledLocale(next)) return;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      fmt: makeFormat(locale),
      tn: (key, count, params) => translatePlural(locale, key, count, makeFormat(locale).plural(count), params),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Shorthand for screens that only need the lookup. */
export function useT() {
  return useI18n().t;
}

/** Languages the person may choose (more than one means the picker is shown). */
export function useEnabledLocales(): readonly Locale[] {
  return ENABLED_LOCALES;
}

/** Dates, numbers and francs in the person's language. */
export function useFormat(): Format {
  return useI18n().fmt;
}
