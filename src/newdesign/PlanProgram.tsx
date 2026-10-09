import { useState } from 'react';
import { addIndicator, addReading, addReview, removeIndicator, setSteering, type PlanDetail, type ReviewDecision } from '../api/frontDoorApi';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { PersonPicker } from './PersonPicker';
import { ListRow, RowList } from './kit';

type Run = (job: () => Promise<PlanDetail | void>, after?: () => void) => Promise<void>;
const DECISIONS: ReviewDecision[] = ['CONTINUE', 'ADJUST', 'CONCLUDE'];

/** A program's governance: who steers it, and the reviews that decide whether it goes on. */
export function PlanGovernance({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const { locale } = useI18n();
  const g = p.program;
  const [role, setRole] = useState('');
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState('');
  const [decision, setDecision] = useState<ReviewDecision>('CONTINUE');
  if (!g) return null;
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const members = g.steering.map((m) => ({ personId: m.personId, role: m.role }));
  return (
    <>
      <div className="panel">
        <h3>{t('door.plan.gov.steering')}</h3>
        {g.steering.length === 0 ? (
          <p className="muted">{t('door.plan.gov.noSteering')}</p>
        ) : (
          <RowList label={t('door.plan.gov.steering')}>
            {g.steering.map((m) => (
              <ListRow
                key={m.personId}
                avatarName={m.name}
                title={m.name}
                detail={m.role}
                action={
                  p.canGovern ? (
                    <button type="button" className="btn ghost sm" onClick={() => void run(() => setSteering(p.id, members.filter((x) => x.personId !== m.personId)))}>
                      {t('door.sched.unassign')}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </RowList>
        )}
        {p.canGovern && (
          <>
            <TextField label={t('door.plan.form.role')} name="p-steer-role" value={role} onChange={(e) => setRole(e.target.value)} />
            <PersonPicker
              label={t('door.plan.gov.addMember')}
              name="p-steer"
              onPick={(person) => {
                if (!role.trim() || members.some((x) => x.personId === person.id)) return;
                void run(() => setSteering(p.id, [...members, { personId: person.id, role: role.trim() }]), () => setRole(''));
              }}
            />
            <p className="muted">{t('door.plan.gov.roleFirst')}</p>
          </>
        )}
      </div>
      <div className="panel">
        <h3>{t('door.plan.gov.reviews')}</h3>
        {g.reviews.length === 0 ? <p className="muted">{t('door.plan.gov.noReviews')}</p> : null}
        <ul className="door-list">
          {g.reviews.map((r) => (
            <li key={r.id}>
              <strong>{day(r.heldOn)}</strong> · {t(`door.plan.gov.decision.${r.decision}` as const)} — {r.summary} <span className="muted">({r.byName})</span>
            </li>
          ))}
        </ul>
        {p.canReview && (
          <>
            <TextField label={t('door.plan.gov.heldOn')} name="p-rev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <TextAreaField label={t('door.plan.gov.found')} name="p-rev-sum" value={summary} onChange={(e) => setSummary(e.target.value)} />
            <SelectField label={t('door.plan.gov.decided')} name="p-rev-dec" value={decision} onChange={(e) => setDecision(e.target.value as ReviewDecision)}>
              {DECISIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`door.plan.gov.decision.${d}` as const)}
                </option>
              ))}
            </SelectField>
            <button
              type="button"
              className="btn secondary sm"
              disabled={!date || !summary.trim()}
              onClick={() => void run(() => addReview(p.id, { heldOn: `${date}T09:00:00.000Z`, summary: summary.trim(), decision }), () => { setDate(''); setSummary(''); })}
            >
              {t('door.plan.gov.record')}
            </button>
          </>
        )}
        {!p.canReview && p.canGovern && <p className="muted">{t('door.plan.gov.whenRunning')}</p>}
      </div>
    </>
  );
}

/** What the program measures: each indicator has a target and readings; the latest reading is where it stands. */
export function PlanIndicators({ p, run }: { p: PlanDetail; run: Run }) {
  const t = useT();
  const { locale } = useI18n();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [reading, setReading] = useState<Record<string, string>>({});
  const g = p.program;
  if (!g) return null;
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  return (
    <div className="panel">
      <h3>{t('door.plan.ind.title')}</h3>
      {g.indicators.length === 0 && <p className="muted">{t('door.plan.ind.none')}</p>}
      <ul className="door-list">
        {g.indicators.map((i) => (
          <li key={i.id}>
            <strong>{i.name}</strong>
            <div>
              {i.current === null ? t('door.plan.ind.noReading') : t('door.plan.ind.line', { current: num(i.current), target: num(i.target), unit: i.unit, percent: i.percent ?? 0 })}
            </div>
            {i.percent !== null && <progress max={100} value={Math.min(100, i.percent)} aria-label={`${i.name} ${i.percent}%`} />}
            {i.readings.length > 1 && <div className="muted">{i.readings.map((r) => num(r.value)).join(' → ')}</div>}
            {p.canMeasure && (
              <div className="door-row">
                <TextField label={t('door.plan.ind.reading')} name={`p-read-${i.id}`} inputMode="decimal" value={reading[i.id] ?? ''} onChange={(e) => setReading({ ...reading, [i.id]: e.target.value.replace(/[^\d.]/g, '') })} />
                <button
                  type="button"
                  className="btn secondary sm"
                  disabled={!reading[i.id]}
                  onClick={() => void run(() => addReading(p.id, i.id, Number(reading[i.id]), ''), () => setReading({ ...reading, [i.id]: '' }))}
                >
                  {t('door.plan.ind.addReading')}
                </button>
                {p.canGovern && (
                  <button type="button" className="btn ghost sm" onClick={() => void run(() => removeIndicator(p.id, i.id))}>
                    {t('door.sched.unassign')}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {p.canGovern && (
        <div className="door-row">
          <TextField label={t('door.plan.ind.name')} name="p-ind-name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label={t('door.plan.ind.unit')} name="p-ind-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <TextField label={t('door.plan.ind.target')} name="p-ind-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} />
          <button
            type="button"
            className="btn secondary sm"
            disabled={!name.trim() || !(Number(target) > 0)}
            onClick={() => void run(() => addIndicator(p.id, { name: name.trim(), unit: unit.trim(), target: Number(target) }), () => { setName(''); setUnit(''); setTarget(''); })}
          >
            {t('door.plan.ind.add')}
          </button>
        </div>
      )}
    </div>
  );
}
