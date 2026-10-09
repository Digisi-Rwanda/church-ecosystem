import { useI18n } from '../i18n/I18nContext';

/** The little calendar tile at the head of a service card. */
export function DateTile({ date }: { date: string }) {
  const { locale } = useI18n();
  const d = new Date(`${date}T00:00:00Z`);
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d);
  const mon = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d);
  return <span className="pt-date" aria-hidden><small>{wd}</small><strong>{d.getUTCDate()}</strong><small>{mon}</small></span>;
}

/** A short date for lists and PDFs, in the person's language. */
export function useShortDay() {
  const { locale } = useI18n();
  return (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function useMonthName() {
  const { locale } = useI18n();
  return (key: string) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
}
