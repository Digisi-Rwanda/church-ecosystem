import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { type WhenValue } from './when';

const NTHS = [1, 2, 3, 4, 5] as const;
const KINDS = ['DATE', 'RANGE', 'REPEAT'] as const;

/** The "When" block: one day, from a day to a day, or a repeat; optional start and end times. Used by the one-page form and the time change. */
export function WhenFields({ value, onChange, idPrefix = 'when' }: { value: WhenValue; onChange: (next: WhenValue) => void; idPrefix?: string }) {
  const t = useT();
  const { locale } = useI18n();
  const set = (patch: Partial<WhenValue>) => onChange({ ...value, ...patch });
  // 2023-01-01 was a Sunday, so day 0 is Sunday.
  const weekday = (d: number, style: 'short' | 'long' = 'short') => new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + d)));
  const toggle = (d: number) => set({ days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort() });
  return (
    <fieldset className="door-fieldset">
      <legend>{t('door.when.title')}</legend>
      <SelectField label={t('door.when.kind')} name={`${idPrefix}-kind`} value={value.kind} onChange={(e) => set({ kind: e.target.value as WhenValue['kind'] })}>
        {KINDS.map((k) => (<option key={k} value={k}>{t(`door.when.kind.${k}` as 'door.when.kind.DATE')}</option>))}
      </SelectField>
      <div className="door-row">
        <TextField label={value.kind === 'DATE' ? t('door.when.date') : t('door.when.from')} name={`${idPrefix}-start`} type="date" value={value.start} onChange={(e) => set({ start: e.target.value })} />
        {value.kind !== 'DATE' && <TextField label={value.kind === 'REPEAT' ? t('door.when.until') : t('door.when.to')} name={`${idPrefix}-end`} type="date" value={value.end} onChange={(e) => set({ end: e.target.value })} />}
      </div>
      {value.kind === 'REPEAT' && (
        <>
          <SelectField label={t('door.when.every')} name={`${idPrefix}-repeat`} value={value.repeat} onChange={(e) => set({ repeat: e.target.value as WhenValue['repeat'] })}>
            <option value="WEEKLY">{t('door.when.weekly')}</option>
            <option value="MONTHLY">{t('door.when.monthly')}</option>
          </SelectField>
          {value.repeat === 'WEEKLY' ? (
            <div className="door-row" role="group" aria-label={t('door.when.days')}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <label key={d} className="door-check">
                  <input type="checkbox" checked={value.days.includes(d)} onChange={() => toggle(d)} /> {weekday(d)}
                </label>
              ))}
            </div>
          ) : (
            <div className="door-row">
              <SelectField label={t('door.when.nth')} name={`${idPrefix}-nth`} value={String(value.nth)} onChange={(e) => set({ nth: Number(e.target.value) })}>
                {NTHS.map((n) => (<option key={n} value={n}>{t(`door.when.nth.${n}` as 'door.when.nth.1')}</option>))}
              </SelectField>
              <SelectField label={t('door.when.weekday')} name={`${idPrefix}-day`} value={String(value.day)} onChange={(e) => set({ day: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (<option key={d} value={d}>{weekday(d, 'long')}</option>))}
              </SelectField>
            </div>
          )}
        </>
      )}
      <div className="door-row">
        <TextField label={t('door.when.startTime')} name={`${idPrefix}-st`} type="time" value={value.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        <TextField label={t('door.when.endTime')} name={`${idPrefix}-et`} type="time" value={value.endTime} onChange={(e) => set({ endTime: e.target.value })} />
      </div>
      <p className="muted">{t('door.when.hint')}</p>
    </fieldset>
  );
}
