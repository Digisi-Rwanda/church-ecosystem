import { useState, type FormEvent } from 'react';
import {
  addMusicService, assignChoir, fetchMusicPlan, publishMusicPlan, removeMusicService, startMusicPlan, unassignChoir,
  type MusicPlanView, type MusicServiceKind,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { mayServe, musicErrorKey, SERVICE_KINDS, shiftMonth, thisMonth } from './music';
import { useLoad } from './useLoad';

type PlanData = Awaited<ReturnType<typeof fetchMusicPlan>>;

function ServiceCard({ service, choirs, canWrite, onChange, onError }: {
  service: MusicPlanView['services'][number]; choirs: PlanData['choirs']; canWrite: boolean; onChange: () => void; onError: (e: unknown) => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const run = (job: () => Promise<void>) => void job().then(onChange).catch(onError);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${service.serviceOn}T00:00:00Z`));
  const free = choirs.filter((c) => mayServe(c.role, service.kind) && !service.choirs.some((x) => x.choirId === c.id));
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{day}</strong>
          <span className="door-chip">{t(`door.music.kind.${service.kind}` as 'door.music.kind.SS1')}</span>
        </div>
        {service.label && <p className="muted">{service.label}</p>}
        {service.choirs.length === 0 ? (
          <p className="muted">{t('door.music.noChoirYet')}</p>
        ) : (
          <ul className="door-chips">
            {service.choirs.map((c) => (
              <li key={c.choirId}>
                {canWrite ? (
                  <button type="button" className="door-chip" onClick={() => run(() => unassignChoir(service.id, c.choirId))} aria-label={t('door.work.form.removeHelper', { name: c.name })}>{c.name} ×</button>
                ) : (
                  <span className="door-chip">{c.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div className="door-row">
            {free.length > 0 && (
              <SelectField label={t('door.music.addChoir')} name={`a-${service.id}`} value="" onChange={(e) => e.target.value && run(() => assignChoir(service.id, e.target.value))}>
                <option value="">{t('door.gov.meeting.choose')}</option>
                {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
            )}
            <button type="button" className="btn ghost" onClick={() => run(() => removeMusicService(service.id))}>{t('door.music.removeService')}</button>
          </div>
        )}
      </div>
    </li>
  );
}

/** The month plan: which choir serves at which service, as a draft until it is published. */
export function MonthPlanPage() {
  const t = useT();
  const { locale } = useI18n();
  const [month, setMonth] = useState(thisMonth());
  const data = useLoad(() => fetchMusicPlan(month), `music-plan|${month}`);
  const [form, setForm] = useState(false);
  const [day, setDay] = useState('');
  const [kind, setKind] = useState<MusicServiceKind>('SS2');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const fail = (err: unknown) => setError(t(musicErrorKey(errorCode(err)) as 'door.people.actionFailed'));
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      data.reload();
    } catch (err) {
      fail(err);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!day || !data.data?.plan) return setError(t('door.caring.err.date'));
    void run(() => addMusicService(data.data!.plan!.id, { serviceOn: day, kind, label: label.trim() || null }), () => { setForm(false); setDay(''); setLabel(''); });
  };
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const plan = data.data?.plan;
  const canWrite = !!data.data?.canWrite;
  return (
    <section className="door-block" aria-labelledby="door-plan-title">
      <div>
        <h2 id="door-plan-title">{t('door.own.monthplan')}</h2>
        <p className="muted">{t('door.music.plan.intro')}</p>
      </div>
      <div className="door-row">
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('door.music.plan.prev')}>‹</button>
        <strong>{monthName}</strong>
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('door.music.plan.next')}>›</button>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {!plan ? (
          <EmptyState
            title={canWrite ? t('door.music.plan.noneYet') : t('door.music.plan.notPublished')}
            detail={canWrite ? t('door.music.plan.noneDetail') : undefined}
            action={canWrite ? <button type="button" className="btn" onClick={() => void run(() => startMusicPlan(month))}>{t('door.music.plan.start')}</button> : undefined}
          />
        ) : (
          <>
            <div className="door-row">
              <span className={`door-chip${plan.status === 'DRAFT' ? ' warn' : ''}`}>{t(`door.music.plan.status.${plan.status}` as 'door.music.plan.status.DRAFT')}</span>
              {canWrite && !form && <button type="button" className="btn" onClick={() => setForm(true)}>{t('door.music.plan.addService')}</button>}
              {canWrite && plan.status === 'DRAFT' && <button type="button" className="btn secondary" onClick={() => void run(() => publishMusicPlan(plan.id))}>{t('door.music.plan.publish')}</button>}
            </div>
            {form && (
              <form className="panel door-form" onSubmit={submit} noValidate>
                <h3>{t('door.music.plan.addService')}</h3>
                <TextField label={t('door.music.plan.day')} name="s-day" type="date" min={`${month}-01`} max={`${month}-31`} value={day} onChange={(e) => setDay(e.target.value)} />
                <SelectField label={t('door.music.plan.kind')} name="s-kind" value={kind} onChange={(e) => setKind(e.target.value as MusicServiceKind)}>
                  {SERVICE_KINDS.map((k) => <option key={k} value={k}>{t(`door.music.kind.${k}` as 'door.music.kind.SS1')}</option>)}
                </SelectField>
                <TextField label={t('door.music.plan.label')} name="s-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
                <div className="door-row">
                  <button type="submit" className="btn">{t('door.music.plan.saveService')}</button>
                  <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
                </div>
              </form>
            )}
            {plan.services.length === 0 ? (
              <EmptyState title={t('door.music.plan.noServices')} />
            ) : (
              <ul className="door-notices">
                {plan.services.map((s) => <ServiceCard key={s.id} service={s} choirs={data.data!.choirs} canWrite={canWrite} onChange={data.reload} onError={fail} />)}
              </ul>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}
