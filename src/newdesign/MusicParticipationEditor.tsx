import { useState } from 'react';
import { addMusicAvailability, addMusicFixedAssignment, fetchMusicAvailability, fetchMusicFixedAssignments, fetchCategoryServicePolicies, fetchChoirCategories, fetchChoirs, fetchSchedulingServices, removeMusicAvailability, removeMusicFixedAssignment, type ConfigVersionApi } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import { schedulingError } from './schedulingForms';
import { EmptyState } from './kit';

export function MusicParticipationEditor({ mode, version, canWrite }: { mode: 'fixed' | 'availability'; version?: ConfigVersionApi; canWrite: boolean }) {
  const t = useT(), id = version?.id ?? '';
  const [date, setDate] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const choirs = useLoad(fetchChoirs, 'participation-choirs');
  const services = useLoad(() => fetchSchedulingServices('sys-music', false, mode === 'fixed' ? id : undefined), 'participation-services|' + mode + id);
  const categories = useLoad(() => fetchChoirCategories('sys-music', false, id), 'participation-categories|' + id);
  const policies = useLoad(() => fetchCategoryServicePolicies('sys-music', id), 'participation-policies|' + id);
  const fixed = useLoad(() => mode === 'fixed' && id ? fetchMusicFixedAssignments(id) : Promise.resolve({ assignments: [] }), 'participation-fixed|' + id + mode);
  const away = useLoad(() => mode === 'availability' ? fetchMusicAvailability(date) : Promise.resolve({ availability: [] }), 'participation-away|' + mode + date);
  const editable = canWrite && (mode === 'availability' || version?.status === 'DRAFT');
  const choirName = (choirId: string) => choirs.data?.choirs.find(row=>row.id===choirId)?.name ?? choirId;
  const ruleName = (ruleId: string) => { const rule = policies.data?.policies.find(row=>row.id===ruleId); return [categories.data?.categories.find(row=>row.id===rule?.categoryId)?.name, services.data?.services.find(row=>row.id===rule?.serviceId)?.name].filter(Boolean).join(' · ') || ruleId; };
  const run = async (job: () => Promise<unknown>) => { if (busy) return; setError(''); setBusy(true); try { await job(); fixed.reload(); away.reload(); } catch (reason) { setError(schedulingError(reason) ?? t('door.config.err.server')); } finally { setBusy(false); } };
  const loading = choirs.loading || services.loading || policies.loading || categories.loading || fixed.loading || away.loading;
  const failed = choirs.failed || services.failed || policies.failed || categories.failed || fixed.failed || away.failed;
  const retry = () => { choirs.reload(); services.reload(); policies.reload(); categories.reload(); fixed.reload(); away.reload(); };
  return <LoadState loading={loading} failed={failed} retry={retry}>
    {error && <p className="door-error" role="alert">{error}</p>}
    {mode === 'availability' && <label>{t('door.config.availability.date')}<input type="date" value={date} onChange={event=>setDate(event.target.value)} /></label>}
    {mode === 'availability' && <p className="muted">{t('door.config.availability.limit')}</p>}
    <ul className="door-notices">
      {mode === 'fixed' ? (fixed.data?.assignments ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{ruleName(row.categoryServicePolicyId)}</p>{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicFixedAssignment(row.id,id))}>{t('door.groups.remove')}</button>}</div></li>) : (away.data?.availability ?? []).map(row=><li className="panel door-notice" key={row.id}><div className="door-notice-main"><strong>{choirName(row.choirId)}</strong><p>{row.serviceDate} · {row.serviceCode ?? t('door.config.availability.all')}</p>{row.reason && <p className="muted">{row.reason}</p>}{editable && <button className="btn ghost sm" disabled={busy} onClick={()=>void run(()=>removeMusicAvailability(row.id))}>{t('door.groups.remove')}</button>}</div></li>)}
    </ul>
    {(mode === 'fixed' ? !fixed.data?.assignments.length : !away.data?.availability.length) && <EmptyState title={t(mode === 'fixed' ? 'door.config.fixed.empty' : 'door.config.availability.empty')} detail={t(mode === 'fixed' ? 'door.config.intro.music.fixed' : 'door.config.intro.music.availability')} />}
    {editable && <form className="panel door-form" onSubmit={event=>{ event.preventDefault(); const data = new FormData(event.currentTarget); void run(()=>mode==='fixed' ? addMusicFixedAssignment({ configVersionId:id, choirId:String(data.get('choirId')), categoryServicePolicyId:String(data.get('policyId')) }) : addMusicAvailability({ choirId:String(data.get('choirId')), serviceDate:String(data.get('date')), serviceCode:String(data.get('serviceCode')) || null, reason:String(data.get('reason')) || null })); }}>
      <label>{t('door.config.link.choir')}<select name="choirId" required><option value="">{t('door.gov.meeting.choose')}</option>{(choirs.data?.choirs ?? []).filter(row=>row.active).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {mode === 'fixed' ? <label>{t('door.config.fixed.choose')}<select name="policyId" required><option value="">{t('door.gov.meeting.choose')}</option>{(policies.data?.policies ?? []).filter(row=>row.active && row.planningMode==='FIXED').map(row=><option key={row.id} value={row.id}>{ruleName(row.id)}</option>)}</select></label> : <>
        <label>{t('door.config.availability.date')}<input type="date" name="date" required defaultValue={date} /></label>
        <label>{t('door.config.tab.services')}<select name="serviceCode"><option value="">{t('door.config.availability.all')}</option>{(services.data?.services ?? []).filter(row=>row.active && row.musicRequired).map(row=><option key={row.id} value={row.code}>{row.name}</option>)}</select></label>
        <label>{t('door.config.availability.reason')}<input name="reason" maxLength={500} /></label>
      </>}
      <button type="submit" disabled={busy} className="btn">{t('door.settings.save')}</button>
    </form>}
  </LoadState>;
}