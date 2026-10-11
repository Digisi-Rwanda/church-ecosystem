import { useState } from 'react';
import { reviewSeen, setPlanTiming, type PlanDetail } from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { WhenFields } from './WhenFields';
import { whenChanged, whenOf, whenProblem, whenSummary, whenToInput } from './when';
import { planErrorKey } from './plans';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;

/** The red-flag line: the activity moved, from when to when. Shown to everyone who sees the activity until it moves again. */
export function DateChangeBanner({ p }: { p: PlanDetail }) {
  const t = useT();
  const { locale } = useI18n();
  const c = p.dateChange;
  if (!c || p.state === 'DRAFT') return null;
  const day = (d: string | null) => (d ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)) : t('door.when.undated'));
  return (
    <div className="panel door-banner" role="status">
      <strong>{t('door.when.moved')}</strong>{' '}
      {t('door.when.movedFromTo', { from: day(c.fromStart), to: day(c.toStart) })}
    </div>
  );
}

/** Asked of the Church Leader when an activity is postponed by more than six months: does its money stay reserved? */
export function ReviewPrompt({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  if (!p.reviewDue) return null;
  return (
    <div className="panel door-banner" role="status">
      <p>{t('door.when.review')}</p>
      {p.canClearReview && <button type="button" className="btn secondary sm" onClick={() => void run(() => reviewSeen(p.id))}>{t('door.when.reviewDone')}</button>}
    </div>
  );
}

/** When and where, with the change form for the people who may move an approved activity (its manager, the Secretary). */
export function TimePanel({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => whenOf(p));
  const [place, setPlace] = useState(p.location ?? '');
  const [error, setError] = useState('');
  const changeable = p.canSetTiming && p.state !== 'DRAFT';
  const start = () => { setWhen(whenOf(p)); setPlace(p.location ?? ''); setError(''); setOpen(true); };
  const save = () => {
    const bad = whenProblem(when, { needDate: true });
    if (bad) return setError(t(planErrorKey(bad) as 'door.people.actionFailed'));
    if (!whenChanged(when, whenOf(p)) && place.trim() === (p.location ?? '')) return setOpen(false);
    void run(() => setPlanTiming(p.id, { ...whenToInput(when), location: place.trim() || null }), () => setOpen(false));
  };
  return (
    <div className="panel">
      <h3>{t('door.when.title')}</h3>
      <p>{whenSummary(p, t, locale)}</p>
      {p.location && <p><strong>{t('door.plan.place')}:</strong> {p.location}</p>}
      {changeable && !open && <button type="button" className="btn secondary sm" onClick={start}>{t('door.when.change')}</button>}
      {changeable && open && (
        <div className="door-form">
          <WhenFields value={when} onChange={setWhen} idPrefix="t-when" />
          <TextField label={t('door.plan.form.location')} name="t-place" value={place} maxLength={160} onChange={(e) => setPlace(e.target.value)} />
          <p className="muted">{t('door.when.notice')}</p>
          {error && <p className="door-error" role="alert">{error}</p>}
          <div className="door-row">
            <button type="button" className="btn" onClick={save}>{t('door.when.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t('door.settings.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
