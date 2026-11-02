import { useChoirRegister } from './useChoirRegister';
import { useContext, useState } from 'react';
import { SchedulingSetupContext } from './SchedulingSetupContext';
import { addMusicAvailability, addMusicFixedAssignment, fetchMusicAvailability, fetchMusicFixedAssignments, fetchCategoryServicePolicies, fetchSchedulingServices, removeMusicAvailability, removeMusicFixedAssignment, type ConfigVersionApi } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import { schedulingError } from './schedulingForms';
import { EmptyState } from './kit';

export function MusicParticipationEditor({ mode, version, canWrite }: { mode: 'fixed' | 'availability'; version?: ConfigVersionApi; canWrite: boolean }) {
  const t = useT(), id = version?.id ?? '';
  const setup = useContext(SchedulingSetupContext);
  const [fixedWhen,setFixedWhen] = useState('SERVICE'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const choirs = useChoirRegister(undefined, 'participation-choirs');
  const services = useLoad(() => fetchSchedulingServices('sys-music', false, mode === 'fixed' ? id : undefined), 'participation-services|' + mode + id);
  const policies = useLoad(() => fetchCategoryServicePolicies('sys-music', id), 'participation-policies|' + id);
  const fixed = useLoad(() => mode === 'fixed' && id ? fetchMusicFixedAssignments(id) : Promise.resolve({ assignments: [] }), 'participation-fixed|' + id + mode);
  const away = useLoad(() => mode === 'availability' ? fetchMusicAvailability() : Promise.resolve({ availability: [] }), 'participation-away|' + mode);
  const editable = canWrite && (mode === 'availability' || version?.status === 'DRAFT');
  const choirName = (choirId: string) => choirs.data?.choirs.find(row=>row.id===choirId)?.name ?? choirId;
  const ruleName = (ruleId: string) => { const rule = policies.data?.policies.find(row=>row.id===ruleId); return services.data?.services.find(row=>row.id===rule?.serviceId)?.name ?? t('door.config.nameUnavailable.service'); };
  const run = async (job: () => Promise<unknown>) => { if (busy) return; setError(''); setBusy(true); try { await job(); setup.saved(); fixed.reload(); away.reload(); } catch (reason) { setError(schedulingError(reason) ?? t('door.config.err.server')); } finally { setBusy(false); } };
  const loading = choirs.loading || services.loading || policies.loading || fixed.loading || away.loading;
  const failed = choirs.failed || services.failed || policies.failed || fixed.failed || away.failed;
  const retry = () => { choirs.reload(); services.reload(); policies.reload(); fixed.reload(); away.reload(); };
  return <LoadState loading={loading} failed={failed} retry={retry}>
    {error && <p className="door-error" role="alert">{error}</p>}
    <ul className="door-notices">
      {mode === 'fixed' ? (fixed.data?.assignments ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{ruleName(row.categoryServicePolicyId)} · {row.serviceDate ?? t('door.config.fixed.every')} {row.serviceTime ?? ''}</p>{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicFixedAssignment(row.id,id))}>{t('door.groups.remove')}</button>}</div></li>) : (away.data?.availability ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{row.serviceDate} → {row.endDate ?? row.serviceDate}{row.serviceCode && <> · {services.data?.services.find(service=>service.code.toLowerCase() === row.serviceCode?.toLowerCase())?.name ?? row.serviceCode}</>}</p>{row.reason && <p className="muted">{row.reason}</p>}{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicAvailability(row.id))}>{t('door.groups.remove')}</button>}</div></li>)}
    </ul>
    {(mode === 'fixed' ? !fixed.data?.assignments.length : !away.data?.availability.length) && <EmptyState title={t(mode === 'fixed' ? 'door.config.fixed.empty' : 'door.config.availability.empty')} />}
    {editable && <form className="panel door-form" onSubmit={event=>{ event.preventDefault(); const data = new FormData(event.currentTarget); void run(()=>mode==='fixed' ? addMusicFixedAssignment({ configVersionId:id, choirId:String(data.get('choirId')), serviceId:String(data.get('serviceId')),serviceDate:data.get('serviceDate') || null,serviceTime:data.get('serviceTime') || null }) : addMusicAvailability({ choirId:String(data.get('choirId')), fromDate:String(data.get('fromDate')),toDate:String(data.get('toDate')), reason:String(data.get('reason')) || null })); }}>
      <label>{t('door.config.link.choir')}<select name="choirId" required><option value="">{t('door.gov.meeting.choose')}</option>{(choirs.data?.choirs ?? []).filter(row=>row.active).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {mode === 'fixed' ? <>
        <label>{t('door.config.fixed.service')}<select name="serviceId" required><option value="">{t('door.gov.meeting.choose')}</option>{(services.data?.services ?? []).filter(row=>row.active && row.musicRequired).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>{t('door.config.fixed.when')}<select value={fixedWhen} onChange={event=>setFixedWhen(event.target.value)}>{['SERVICE','DATE','TIME','DATE_TIME'].map(scope=><option key={scope} value={scope}>{t(`door.config.fixed.scope.${scope}` as Parameters<typeof t>[0])}</option>)}</select></label>
        {(fixedWhen === 'DATE' || fixedWhen === 'DATE_TIME') && <label>{t('door.config.fixed.date')}<input type="date" name="serviceDate" required /></label>}
        {(fixedWhen === 'TIME' || fixedWhen === 'DATE_TIME') && <label>{t('door.config.fixed.time')}<input type="time" name="serviceTime" required /></label>}
      </> : <>
        <label>{t('door.config.unavailability.from')}<input type="date" name="fromDate" required /></label>
        <label>{t('door.config.unavailability.to')}<input type="date" name="toDate" required /></label>
        <label>{t('door.config.availability.reason')}<input name="reason" maxLength={500} /></label>
      </>}
      <button type="submit" disabled={busy} className="btn">{t('door.settings.save')}</button>
    </form>}
  </LoadState>;
}
