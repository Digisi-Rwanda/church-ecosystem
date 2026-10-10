import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createPlan, editPlan, fetchPlan, fetchPlanOptions, savePlanDetails, type PlanDetail, type PlanInput } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { FLOWS, OPTIONS, type FlowField, type FlowKind } from './actionPlanFlows';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { categoryKey } from './money';
import { PageHeader } from './kit';
import { PersonPicker } from './PersonPicker';
import { planErrorKey } from './plans';
import { useLoad } from './useLoad';
import { dueToInput, inputToDue } from './work';

const BUDGET_TAGS = ['EVENT', 'SUPPLIES', 'SERVICES', 'TRANSPORT', 'AID', 'DONATION', 'OTHER'];
type Val = string | { id: string; name: string };
const str = (v: Val | undefined) => (typeof v === 'string' ? v : v?.name ?? '');

const ICON: Record<FlowKind, string> = {
  event: 'M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  project: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  program: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
};
const Icon = ({ kind }: { kind: FlowKind }) => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[kind]} /></svg>
);

/** Create an event, a project or a program: the screens of the church's design, a step at a time, saved as a draft the whole way. */
export function ActionPlanCreate() {
  const t = useT();
  const navigate = useNavigate();
  const { systemId = '', kind: kindParam = '' } = useParams();
  const [query] = useSearchParams();
  const kind = (['event', 'project', 'program'].includes(kindParam) ? kindParam : 'event') as FlowKind;
  const flow = FLOWS[kind];
  const options = useLoad(fetchPlanOptions, 'plan-options');
  const resumeId = query.get('plan');
  const resume = useLoad(() => (resumeId ? fetchPlan(resumeId) : Promise.resolve(null as PlanDetail | null)), `ap-resume|${resumeId ?? ''}`);
  const [step, setStep] = useState(0);
  const [vals, setVals] = useState<Record<string, Val>>({});
  const [unitId, setUnitId] = useState('');
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = resume.data;
    if (!p || plan) return;
    const v: Record<string, Val> = {};
    for (const s of flow.steps) for (const f of s.fields) {
      if (f.map === 'name') v[f.key] = p.title;
      else if (f.map === 'leader') v[f.key] = { id: p.leaderId, name: p.leaderName };
      else if (f.map === 'date') v[f.key] = dueToInput(p.startsOn);
      else if (f.map === 'venue') v[f.key] = p.location;
      else if (f.map === 'needs') v[f.key] = p.needs;
      else if (p.details?.[f.key]) v[f.key] = p.details[f.key];
    }
    setVals(v);
    setPlan(p);
  }, [resume.data, plan, flow]);

  const units = (options.data?.units ?? []).filter((u) => u.systemId === systemId);
  const unit = unitId || (units.length === 1 ? units[0].id : '');
  const cur = flow.steps[step];
  const set = (k: string, v: Val) => setVals((x) => ({ ...x, [k]: v }));
  const missing = (s: typeof cur) => s.fields.some((f) => f.req && f.type !== 'person' && !str(vals[f.key]).trim()) || s.fields.some((f) => f.req && f.type === 'person' && !(typeof vals[f.key] === 'object'));
  const labelOf = (f: FlowField, v: string) => (f.opts ? t(`door.ap.o.${f.opts}.${v}` as 'door.ap.o.purpose.OTHER') : v);

  /** Write everything answered so far: the plan itself, then its details. A first save creates the draft. */
  const persist = async (): Promise<PlanDetail> => {
    const all = flow.steps.flatMap((s) => s.fields);
    const pick = (m: FlowField['map']) => all.find((f) => f.map === m);
    const text = (m: FlowField['map']) => { const f = pick(m); return f ? str(vals[f.key]).trim() : ''; };
    const aimField = pick('aim');
    const leaderField = pick('leader');
    const leader = leaderField && typeof vals[leaderField.key] === 'object' ? (vals[leaderField.key] as { id: string; name: string }).id : undefined;
    const date = text('date') ? inputToDue(text('date')) : null;
    const input: PlanInput = {
      title: text('name'), aim: aimField ? (aimField.type === 'select' ? labelOf(aimField, text('aim')) : text('aim')) : '', needs: text('needs') || null, location: text('venue') || null,
      startsOn: date, endsOn: date, leaderId: leader ?? plan?.leaderId, team: plan ? plan.team.map((m) => ({ personId: m.personId, role: m.role })) : [],
      beyondUnit: plan?.beyondUnit ?? false, visibility: plan?.visibility ?? 'SYSTEM', planType: flow.planType,
    };
    const details: Record<string, string> = {};
    for (const f of all) if ((f.map === 'detail' || f.map === 'aim') && str(vals[f.key]).trim()) details[f.key] = str(vals[f.key]).trim();
    const saved = plan ? await editPlan(plan.id, input) : await createPlan(unit, input);
    const withDetails = await savePlanDetails(saved.id, details);
    setPlan(withDetails);
    return withDetails;
  };

  const run = async (after: (p: PlanDetail) => void) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      after(await persist());
    } catch (err) {
      setError(t(planErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  const gate = () => {
    if (!plan && !unit) return setError(t('door.ap.required')), false;
    if (missing(cur)) return setError(t('door.ap.required')), false;
    return true;
  };
  const next = (e: FormEvent) => {
    e.preventDefault();
    if (!gate()) return;
    const last = step === flow.steps.length - 1;
    void run(() => (last ? setDone(true) : (setStep(step + 1), window.scrollTo?.({ top: 0 }))));
  };
  const draft = () => {
    if (!plan && (!unit || !str(vals[flow.steps[0].fields.find((f) => f.map === 'name')!.key]).trim())) return setError(t('door.ap.required'));
    void run(() => setNote(t('door.ap.draftSaved')));
  };
  const back = `/s/${systemId}/money/plan`;

  const field = (f: FlowField) => {
    const label = `${t(`door.ap.f.${kind}.${f.key}` as 'door.ap.f.event.name')}${f.req ? ' *' : ''}`;
    const ph = t(`door.ap.f.${kind}.${f.key}.ph` as 'door.ap.f.event.name');
    const name = `ap-${kind}-${f.key}`;
    const v = vals[f.key];
    let input;
    if (f.type === 'select' && f.opts) {
      input = (
        <SelectField label={label} name={name} value={str(v)} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">{ph}</option>
          {OPTIONS[f.opts].map((c) => (<option key={c} value={c}>{t(`door.ap.o.${f.opts}.${c}` as 'door.ap.o.purpose.OTHER')}</option>))}
        </SelectField>
      );
    } else if (f.type === 'tag') {
      input = (
        <SelectField label={label} name={name} value={str(v)} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">{ph}</option>
          {BUDGET_TAGS.map((c) => (<option key={c} value={c}>{t(categoryKey(c) as 'door.money.cat.OTHER')}</option>))}
        </SelectField>
      );
    } else if (f.type === 'person') {
      input = (
        <div className="ap-person">
          <PersonPicker label={label} name={name} onPick={(p) => set(f.key, { id: p.id, name: p.fullName })} />
          <p className="muted">{str(v) || (f.map === 'leader' && !f.req ? t('door.ap.me') : ph)}</p>
        </div>
      );
    } else if (f.type === 'area') {
      input = <TextAreaField label={label} name={name} rows={3} placeholder={ph} value={str(v)} onChange={(e) => set(f.key, e.target.value)} />;
    } else {
      input = <TextField label={label} name={name} type={f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'} placeholder={ph} value={str(v)} onChange={(e) => set(f.key, e.target.value)} />;
    }
    return <div key={f.key} className={f.half ? 'ap-half' : 'ap-full'}>{input}</div>;
  };

  if (resumeId && resume.failed) return <EmptyState variant="error" title={t('door.work.err.gone')} />;
  return (
    <section className="door-block ap" aria-labelledby="door-ap-title">
      <div className={`ap-banner ${flow.kind}`}>
        <span className="ap-banner-icon"><Icon kind={kind} /></span>
        <div><PageHeader id="door-ap-title" title={t(`door.ap.${kind}.title` as 'door.ap.event.title')} purpose={t(`door.ap.${kind}.sub` as 'door.ap.event.sub')} /></div>
      </div>
      <LoadState loading={options.loading || (!!resumeId && resume.loading)} failed={options.failed} retry={options.reload}>
        {done && plan ? (
          <div className={`panel ap-done ${kind}`}>
            <span className="ap-check" aria-hidden="true">✓</span>
            <div>
              <h3>{t(`door.ap.done.${kind}` as 'door.ap.done.event')}</h3>
              <p className="muted">{t(`door.ap.doneText.${kind}` as 'door.ap.doneText.event')}</p>
              <div className="door-row">
                <button type="button" className="btn ghost" onClick={() => navigate(`/s/${systemId}/work/plans/${plan.id}`)}>{t(`door.ap.view.${kind}` as 'door.ap.view.event')}</button>
                <button type="button" className="btn ap-go" onClick={() => { setDone(false); setPlan(null); setVals({}); setStep(0); setUnitId(''); navigate(`/s/${systemId}/money/plan/new/${kind}`, { replace: true }); }}>{t(`door.ap.another.${kind}` as 'door.ap.another.event')}</button>
              </div>
            </div>
          </div>
        ) : (
          <form className="panel ap-card" onSubmit={next} noValidate>
            <ol className="ap-steps" aria-label={t(`door.ap.${kind}.title` as 'door.ap.event.title')}>
              {flow.steps.map((s, i) => (
                <li key={s.id} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
                  <span className="ap-dot">{i < step ? '✓' : i + 1}</span>
                  <span>{t(`door.ap.s.${kind}.${s.id}.name` as 'door.ap.s.event.define.name')}</span>
                </li>
              ))}
              <li className="ap-count">{t('door.ap.step', { n: step + 1, total: flow.steps.length })}</li>
            </ol>
            <div className="ap-body">
              <aside className={`ap-side ${kind}`}>
                <span className="ap-side-icon"><Icon kind={kind} /></span>
                <strong>{t(`door.ap.s.${kind}.${cur.id}.side` as 'door.ap.s.event.define.side')}</strong>
                <p className="muted">{t(`door.ap.s.${kind}.${cur.id}.sideText` as 'door.ap.s.event.define.sideText')}</p>
              </aside>
              <div className="ap-fields">
                <h3>{t(`door.ap.s.${kind}.${cur.id}.heading` as 'door.ap.s.event.define.heading')}</h3>
                <div className="ap-grid">
                  {step === 0 && !plan && units.length > 1 && (
                    <div className="ap-full">
                      <SelectField label={`${t('door.ap.unit')} *`} name="ap-unit" value={unit} onChange={(e) => setUnitId(e.target.value)}>
                        <option value="">{t('door.gov.meeting.choose')}</option>
                        {units.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                      </SelectField>
                    </div>
                  )}
                  {cur.fields.map(field)}
                </div>
                {error && <p className="door-error" role="alert">{error}</p>}
                {note && <p className="muted" role="status">{note}</p>}
                <div className="ap-actions">
                  {step === 0 ? (
                    <Link className="btn ghost" to={back}>{t('door.settings.cancel')}</Link>
                  ) : (
                    <button type="button" className="btn ghost" onClick={() => { setError(''); setStep(step - 1); }}>← {t('door.ap.back')}</button>
                  )}
                  <button type="button" className="btn ghost" disabled={busy} onClick={draft}>{t('door.ap.draft')}</button>
                  <button type="submit" className="btn ap-go" disabled={busy}>{step === flow.steps.length - 1 ? t(`door.ap.create.${kind}` as 'door.ap.create.event') : `${t('door.ap.next')} →`}</button>
                </div>
              </div>
            </div>
          </form>
        )}
      </LoadState>
    </section>
  );
}
