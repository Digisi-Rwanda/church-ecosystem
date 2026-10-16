import { PROGRAM_KINDS, PURPOSE_TAGS, type ProgramKind, type PurposeTag } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { Segmented } from './kit';

export type ProgramValues = {
  pkind: ProgramKind; purpose: PurposeTag | ''; hasMoney: boolean; startYear: string; endYear: string; schedule: string;
  cFreq: string; cDuration: string; cSchedule: string; cTarget: string; month: string;
};
export type ProgramSetters = { [K in keyof ProgramValues]: (v: ProgramValues[K]) => void };

/**
 * The program-only part of the create form: the kind (which shapes the schedule fields), the purpose tag
 * (which only pre-fills indicators), and whether the program involves money (No hides the Money step).
 */
export function ProgramFields({ v, set }: { v: ProgramValues; set: ProgramSetters }) {
  const t = useT();
  const { locale } = useI18n();
  const monthName = (m: number) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1)));
  return (
    <>
      <div className="ap-full">
        <Segmented
          label={t('door.ac.programKind')}
          value={v.pkind}
          onChange={(k) => set.pkind(k as ProgramKind)}
          items={PROGRAM_KINDS.map((k) => ({ key: k, label: t(`door.ac.kind.${k}` as 'door.ac.kind.ONGOING') }))}
        />
        <p className="muted">{t(`door.ac.kind.${v.pkind}.hint` as 'door.ac.kind.ONGOING.hint')}</p>
      </div>
      <div className="ap-full">
        <SelectField label={t('door.ac.purposeTag')} name="ac-purpose" value={v.purpose} onChange={(e) => set.purpose(e.target.value as PurposeTag | '')}>
          <option value="">{t('door.ac.purposeNone')}</option>
          {PURPOSE_TAGS.map((p) => <option key={p} value={p}>{t(`door.ac.purpose.${p}` as 'door.ac.purpose.MINISTRY')}</option>)}
        </SelectField>
        <p className="muted">{t('door.ac.purposeHint')}</p>
      </div>
      <div className="ap-half"><TextField label={`${t('door.ac.startYear')} *`} name="ac-start-year" inputMode="numeric" value={v.startYear} onChange={(e) => set.startYear(e.target.value)} /></div>
      {v.pkind === 'FIXED_TERM' && <div className="ap-half"><TextField label={`${t('door.ac.endYear')} *`} name="ac-end-year" inputMode="numeric" value={v.endYear} onChange={(e) => set.endYear(e.target.value)} /></div>}
      {v.pkind === 'ONGOING' && <div className="ap-full"><TextField label={t('door.ac.recurring')} name="ac-recurring" placeholder={t('door.ac.recurring.example')} value={v.schedule} onChange={(e) => set.schedule(e.target.value)} /></div>}
      {v.pkind === 'COHORT' && (
        <>
          <div className="ap-half"><TextField label={t('door.ac.cohort.frequency')} name="ac-c-freq" placeholder={t('door.ac.cohort.frequency.example')} value={v.cFreq} onChange={(e) => set.cFreq(e.target.value)} /></div>
          <div className="ap-half"><TextField label={t('door.ac.cohort.duration')} name="ac-c-dur" placeholder={t('door.ac.cohort.duration.example')} value={v.cDuration} onChange={(e) => set.cDuration(e.target.value)} /></div>
          <div className="ap-half"><TextField label={t('door.ac.cohort.schedule')} name="ac-c-sched" value={v.cSchedule} onChange={(e) => set.cSchedule(e.target.value)} /></div>
          <div className="ap-half"><TextField label={t('door.ac.cohort.target')} name="ac-c-target" inputMode="numeric" value={v.cTarget} onChange={(e) => set.cTarget(e.target.value)} /></div>
        </>
      )}
      {v.pkind === 'SEASONAL' && (
        <div className="ap-full">
          <SelectField label={t('door.ac.annualMonth')} name="ac-month" value={v.month} onChange={(e) => set.month(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={String(m)}>{monthName(m)}</option>)}
          </SelectField>
        </div>
      )}
      <div className="ap-full">
        <Segmented
          label={t('door.ac.hasMoney')}
          value={v.hasMoney ? 'yes' : 'no'}
          onChange={(k) => set.hasMoney(k === 'yes')}
          items={[{ key: 'yes', label: t('door.ac.yes') }, { key: 'no', label: t('door.ac.no') }]}
        />
        <p className="muted">{t(v.hasMoney ? 'door.ac.hasMoney.yesHint' : 'door.ac.hasMoney.noHint')}</p>
      </div>
    </>
  );
}
