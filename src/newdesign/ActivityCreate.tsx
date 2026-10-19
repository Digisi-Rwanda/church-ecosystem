import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { addMilestone, createPlan, editPlan, fetchActivityMoney, fetchPlan, fetchPlanOptions, planStep, type ActivityMoney, type KindInput, type PlanDetail, type PlanInput, type CaseType, type ProgramKind, type PurposeTag } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { CreateMoney } from './CreateMoney';
import { bucketName } from './fundLabels';
import { errorCode } from './governance';
import { PageHeader, Segmented } from './kit';
import { LoadState } from './LoadState';
import { formatRwf } from './money';
import { PendingFiles, uploadPending } from './PendingFiles';
import { PersonPicker } from './PersonPicker';
import { planErrorKey } from './plans';
import { ProgramFields } from './ProgramFields';
import { useLoad } from './useLoad';
import { dueToInput, inputToDue } from './work';

export const ACTIVITY_KINDS = ['event', 'project', 'program', 'fundraising'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
const STEPS = ['details', 'money', 'review'] as const;
const NO_MONEY_STEPS = ['details', 'review'] as const;
const kindOfPlan = (p: PlanDetail): ActivityKind => (p.fundraising ? 'fundraising' : p.planType === 'PROJECT' ? 'project' : p.planType === 'PROGRAM' ? 'program' : 'event');
const year = new Date().getFullYear();

/**
 * New activity in three steps: Details, Money, Files & Review. The draft is saved as it goes and holds no money;
 * the funds are reserved only when the activity is submitted, and Submit stays off until total cost equals total set-aside.
 */
export function ActivityCreate() {
  const t = useT();
  const navigate = useNavigate();
  const { systemId = '', kind: kindParam = '' } = useParams();
  const [query] = useSearchParams();
  const resumeId = query.get('plan');
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const resume = useLoad(() => (resumeId ? fetchPlan(resumeId) : Promise.resolve(null as PlanDetail | null)), `ac-resume|${resumeId ?? ''}`);
  const [kind, setKind] = useState<ActivityKind>((ACTIVITY_KINDS as readonly string[]).includes(kindParam) ? (kindParam as ActivityKind) : 'event');
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [money, setMoney] = useState<ActivityMoney | null>(null);
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [aim, setAim] = useState('');
  const [needs, setNeeds] = useState('');
  const [venue, setVenue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [target, setTarget] = useState('');
  const [leader, setLeader] = useState<{ id: string; name: string } | null>(null);
  const [ms, setMs] = useState<Array<{ title: string; due: string }>>([]);
  const [msTitle, setMsTitle] = useState('');
  const [msDue, setMsDue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [pkind, setPkind] = useState<ProgramKind>('ONGOING');
  const [purpose, setPurpose] = useState<PurposeTag | ''>('');
  const [hasMoney, setHasMoney] = useState(true);
  const [startYear, setStartYear] = useState(String(year));
  const [endYear, setEndYear] = useState(String(year + 2));
  const [schedule, setSchedule] = useState('');
  const [cFreq, setCFreq] = useState('');
  const [cDuration, setCDuration] = useState('');
  const [cSchedule, setCSchedule] = useState('');
  const [cTarget, setCTarget] = useState('');
  const [month, setMonth] = useState('12');
  const [caseType, setCaseType] = useState<CaseType>('SICK_CARE');

  useEffect(() => {
    const p = resume.data;
    if (!p || plan) return;
    setPlan(p);
    setKind(kindOfPlan(p));
    setTitle(p.title);
    setAim(p.aim);
    setNeeds(p.needs);
    setVenue(p.location);
    setStart(dueToInput(p.startsOn));
    setEnd(dueToInput(p.endsOn));
    setTarget(p.fundTarget ? String(p.fundTarget) : '');
    setLeader({ id: p.leaderId, name: p.leaderName });
    if (p.programKind) setPkind(p.programKind);
    setPurpose(p.purposeTag ?? '');
    setHasMoney(p.hasMoney);
    const k = p.kind;
    if (k) {
      if (k.startYear) setStartYear(String(k.startYear));
      if (k.endYear) setEndYear(String(k.endYear));
      setSchedule(k.schedule);
      setCFreq(k.cohort?.frequency ?? '');
      setCDuration(k.cohort?.duration ?? '');
      setCSchedule(k.cohort?.schedule ?? '');
      setCTarget(k.cohort?.target ? String(k.cohort.target) : '');
      if (k.annualMonth) setMonth(String(k.annualMonth));
      if (k.caseType) setCaseType(k.caseType);
    }
  }, [resume.data, plan]);

  const units = (options.data?.units ?? []).filter((u) => u.systemId === systemId);
  const unit = unitId || (units.length === 1 ? units[0].id : '');
  const targetN = Math.floor(Number(target) || 0);
  const sy = Math.floor(Number(startYear) || 0);
  const ey = Math.floor(Number(endYear) || 0);
  const defaults = kind === 'program' ? { start: `${sy}-01-01`, end: `${pkind === 'FIXED_TERM' ? ey : sy}-12-31` } : { start, end: end || start };
  const yearsOk = kind !== 'program' || (sy >= 2000 && (pkind !== 'FIXED_TERM' || ey >= sy));
  const detailsOk = !!title.trim() && (!plan ? !!unit : true) && !!defaults.start && yearsOk && (kind !== 'fundraising' || targetN > 0);
  const steps = kind === 'program' && !hasMoney && pkind !== 'CASE' ? NO_MONEY_STEPS : STEPS;
  const stepName = steps[step];
  const kindInput = (): KindInput => ({
    startYear: sy, endYear: pkind === 'FIXED_TERM' ? ey : null, schedule: pkind === 'ONGOING' ? schedule.trim() : '',
    cohort: pkind === 'COHORT' ? { frequency: cFreq.trim(), duration: cDuration.trim(), schedule: cSchedule.trim(), target: Math.floor(Number(cTarget) || 0) || null } : null,
    annualMonth: pkind === 'SEASONAL' ? Math.floor(Number(month) || 12) : null,
    caseType: pkind === 'CASE' ? caseType : null,
  });
  const back = `/s/${systemId}/work/${kind === 'program' ? 'programs' : kind === 'project' ? 'projects' : 'events'}`;

  const fail = (err: unknown) => setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
  const guard = async (job: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await job();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /** Save the details as a draft; new milestones are added after the draft exists. */
  const saveDetails = async (): Promise<PlanDetail> => {
    const input: PlanInput = {
      title: title.trim(), aim: aim.trim(), needs: needs.trim() || null, location: kind === 'project' || kind === 'program' ? null : venue.trim() || null,
      startsOn: inputToDue(defaults.start), endsOn: defaults.end ? inputToDue(defaults.end) : null,
      leaderId: leader?.id ?? plan?.leaderId, team: plan ? plan.team.map((m) => ({ personId: m.personId, role: m.role })) : [],
      beyondUnit: plan?.beyondUnit ?? false, visibility: plan?.visibility ?? 'SYSTEM',
      planType: kind === 'project' ? 'PROJECT' : kind === 'program' ? 'PROGRAM' : 'EVENT',
      fundraising: kind === 'fundraising', fundTarget: kind === 'fundraising' ? targetN : null,
      ...(kind === 'program' ? { programKind: pkind, purposeTag: purpose || null, hasMoney: pkind === 'CASE' ? true : hasMoney, kind: kindInput() } : {}),
    };
    let saved = plan ? await editPlan(plan.id, input) : await createPlan(unit, input);
    if (kind === 'project') {
      for (const x of ms) saved = await addMilestone(saved.id, x.title, x.due ? inputToDue(x.due) : null);
      setMs([]);
    }
    setPlan(saved);
    return saved;
  };
  const loadMoney = async (id: string) => setMoney(await fetchActivityMoney(id));

  const nextFromDetails = () => void guard(async () => {
    const saved = await saveDetails();
    if (kind !== 'program' || hasMoney) await loadMoney(saved.id);
    setStep(1);
    window.scrollTo?.({ top: 0 });
  });
  const draft = () => void guard(async () => {
    const saved = await saveDetails();
    if (stepName === 'money' || (stepName === 'review' && (kind !== 'program' || hasMoney))) await loadMoney(saved.id);
    setNote(t('door.ap.draftSaved'));
  });
  const submit = () => void guard(async () => {
    if (!plan) return;
    if (files.length > 0) {
      const failed = await uploadPending(plan.id, files);
      setFiles(failed);
      if (failed.length > 0) return setNote(t('door.plan.files.partial'));
    }
    await planStep(plan.id, 'submit');
    navigate(`/s/${systemId}/work/plans/${plan.id}`);
  });

  if (resumeId && resume.failed) return <EmptyState variant="error" title={t('door.work.err.gone')} />;
  const noMoney = kind === 'program' && !hasMoney && pkind !== 'CASE';
  const cannotSubmit = noMoney ? false : !money || money.planned <= 0 || money.gap !== 0;
  const lines = money?.lines ?? [];

  return (
    <section className="door-block ap" aria-labelledby="door-ac-title">
      <PageHeader id="door-ac-title" title={t('door.ac.title')} back={<Link to={back}>← {t('door.ac.backToList')}</Link>} purpose={t('door.ac.purpose')} />
      <LoadState loading={options.loading || (!!resumeId && resume.loading)} failed={options.failed} retry={options.reload}>
        <div className="panel ap-card">
          <div className="ap-top">
            <ol className="ap-steps" aria-label={t('door.ac.title')}>
              {steps.map((s, i) => (
                <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
                  <span className="ap-dot">{i < step ? '✓' : i + 1}</span>
                  <span className="ap-step-name">{t(`door.ac.step.${s}` as 'door.ac.step.details')}</span>
                </li>
              ))}
            </ol>
            <span className="muted ap-count">{t('door.ap.step', { n: step + 1, total: steps.length })}</span>
          </div>

          {stepName === 'details' && (
            <div className="ap-grid">
              <div className="ap-full">
                <Segmented
                  label={t('door.ac.type')}
                  value={kind}
                  onChange={(k) => setKind(k as ActivityKind)}
                  items={ACTIVITY_KINDS.map((k) => ({ key: k, label: t(`door.ac.type.${k}` as 'door.ac.type.event') }))}
                />
                <p className="muted">{t(`door.ac.type.${kind}.hint` as 'door.ac.type.event.hint')}</p>
              </div>
              {!plan && units.length > 1 && (
                <div className="ap-full">
                  <SelectField label={`${t('door.ap.unit')} *`} name="ac-unit" value={unit} onChange={(e) => setUnitId(e.target.value)}>
                    <option value="">{t('door.gov.meeting.choose')}</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </SelectField>
                </div>
              )}
              <div className="ap-full"><TextField label={`${t('door.ac.name')} *`} name="ac-name" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="ap-full"><TextAreaField label={t(kind === 'program' ? 'door.ac.mission' : 'door.ac.aim')} name="ac-aim" rows={3} value={aim} onChange={(e) => setAim(e.target.value)} /></div>
              {kind === 'program' ? (
                <ProgramFields
                  v={{ pkind, purpose, hasMoney, startYear, endYear, schedule, cFreq, cDuration, cSchedule, cTarget, month, caseType }}
                  set={{ pkind: (k) => { setPkind(k); if (k === 'CASE') setHasMoney(true); }, purpose: setPurpose, hasMoney: setHasMoney, startYear: setStartYear, endYear: setEndYear, schedule: setSchedule, cFreq: setCFreq, cDuration: setCDuration, cSchedule: setCSchedule, cTarget: setCTarget, month: setMonth, caseType: setCaseType }}
                />
              ) : (
                <>
                  <div className="ap-half"><TextField label={`${t('door.ac.start')} *`} name="ac-start" type="date" value={defaults.start} onChange={(e) => setStart(e.target.value)} /></div>
                  <div className="ap-half"><TextField label={t('door.ac.end')} name="ac-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
                </>
              )}
              {(kind === 'event' || kind === 'fundraising') && <div className="ap-full"><TextField label={t('door.ac.venue')} name="ac-venue" value={venue} onChange={(e) => setVenue(e.target.value)} /></div>}
              {kind === 'fundraising' && <div className="ap-full"><TextField label={`${t('door.ac.target')} *`} name="ac-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} /></div>}
              <div className="ap-full">
                <PersonPicker label={t('door.ac.leader')} name="ac-leader" onPick={(p) => setLeader({ id: p.id, name: p.fullName })} />
                <p className="muted">{leader?.name || t('door.ap.me')}</p>
              </div>
              <div className="ap-full"><TextAreaField label={t('door.ac.needs')} name="ac-needs" rows={2} value={needs} onChange={(e) => setNeeds(e.target.value)} /></div>
              {kind === 'project' && (
                <div className="ap-full">
                  <h4>{t('door.ac.milestones')}</h4>
                  <p className="muted">{t('door.ac.milestones.hint')}</p>
                  <ul className="door-list">
                    {(plan?.milestones ?? []).map((x) => <li key={x.id}>{x.title}{x.dueOn && <span className="muted"> · {dueToInput(x.dueOn)}</span>}</li>)}
                    {ms.map((x, i) => (
                      <li key={`${x.title}-${i}`}>{x.title}{x.due && <span className="muted"> · {x.due}</span>} <button type="button" className="btn ghost sm" onClick={() => setMs(ms.filter((_, j) => j !== i))}>{t('door.pm.remove')}</button></li>
                    ))}
                  </ul>
                  <div className="door-row">
                    <TextField label={t('door.ac.milestoneName')} name="ac-ms-title" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} />
                    <TextField label={t('door.ac.milestoneDue')} name="ac-ms-due" type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} />
                    <button type="button" className="btn secondary sm" disabled={!msTitle.trim()} onClick={() => { setMs([...ms, { title: msTitle.trim(), due: msDue }]); setMsTitle(''); setMsDue(''); }}>{t('door.ac.addMilestone')}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {stepName === 'money' && plan && money && <CreateMoney p={plan} m={money} kind={kind} onChange={(next) => { setMoney(next); void fetchPlan(plan.id).then(setPlan); }} />}

          {stepName === 'review' && plan && (
            <div className="ap-grid">
              <div className="ap-full panel-inset">
                <h4>{plan.title}</h4>
                <p className="muted">{t(`door.ac.type.${kind}` as 'door.ac.type.event')} · {dueToInput(plan.startsOn)}{plan.endsOn && plan.endsOn !== plan.startsOn ? ` → ${dueToInput(plan.endsOn)}` : ''} · {plan.leaderName}</p>
                {plan.aim && <p>{plan.aim}</p>}
                {kind === 'fundraising' && <p>{t('door.ac.target')}: <strong>{formatRwf(plan.fundTarget ?? 0)}</strong> · {t('door.ac.net')}: <strong>{formatRwf((plan.fundTarget ?? 0) - (money?.planned ?? 0))}</strong></p>}
                {noMoney ? <p className="muted">{t('door.ac.noMoneyNote')}</p> : <p>{t('door.ac.totalCost')}: <strong>{formatRwf(money?.planned ?? 0)}</strong> · {t('door.ac.totalAside')}: <strong>{formatRwf(money?.earmarked ?? 0)}</strong></p>}
                <ul className="door-list">
                  {lines.map((l) => <li key={l.id}>{l.title} · {formatRwf(l.amount)}</li>)}
                </ul>
                {(money?.sources.length ?? 0) > 0 && (
                  <ul className="door-list">
                    {money!.sources.map((s) => { const pot = money!.pots.find((x) => x.id === s.potId); return <li key={s.potId}>{pot ? bucketName(t, pot) : s.potId} · {formatRwf(s.amount)}</li>; })}
                  </ul>
                )}
              </div>
              <div className="ap-full panel-inset">
                <h4>{t('door.ac.chain')}</h4>
                <ol className="door-list">
                  {(noMoney ? (['UNIT', 'CATECHIST', 'CHURCH'] as const) : (['TREASURER', 'UNIT', 'CATECHIST', 'CHURCH'] as const)).map((k) => <li key={k}><strong>{t(`door.ac.chain.${k}` as 'door.ac.chain.UNIT')}</strong> <span className="muted">— {t(`door.ac.chain.${k}.note` as 'door.ac.chain.UNIT.note')}</span></li>)}
                </ol>
                {!noMoney && <p className="muted">{t('door.ac.reserveNote')}</p>}
              </div>
              <div className="ap-full">
                <h4>{t('door.plan.files.heading')}</h4>
                <p className="muted">{t('door.plan.files.optional')}</p>
                <PendingFiles files={files} onChange={setFiles} disabled={busy} />
              </div>
              {!noMoney && cannotSubmit && <p className="door-error ap-full" role="status">{t('door.ac.blocked')}</p>}
            </div>
          )}

          {error && <p className="door-error" role="alert">{error}</p>}
          {note && <p className="muted" role="status">{note}</p>}
          <div className="ap-actions">
            {stepName === 'details' ? <Link className="btn ghost" to={back}>{t('door.settings.cancel')}</Link> : <button type="button" className="btn ghost" onClick={() => { setError(''); setStep(step - 1); }}>← {t('door.ap.back')}</button>}
            <span className="ap-spacer" />
            <button type="button" className="btn ghost" disabled={busy || !detailsOk} onClick={draft}>{t('door.ap.draft')}</button>
            {stepName === 'details' && <button type="button" className="btn" disabled={busy || !detailsOk} onClick={nextFromDetails}>{t('door.ap.next')} →</button>}
            {stepName === 'money' && <button type="button" className="btn" disabled={busy} onClick={() => { setStep(2); window.scrollTo?.({ top: 0 }); }}>{t('door.ap.next')} →</button>}
            {stepName === 'review' && <button type="button" className="btn" disabled={busy || cannotSubmit} onClick={submit}>{t('door.ac.submit')}</button>}
          </div>
        </div>
      </LoadState>
    </section>
  );
}
