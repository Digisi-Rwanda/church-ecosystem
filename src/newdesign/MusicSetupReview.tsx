import { fetchSchedulingServices, fetchChoirCategories, fetchChoirCategoryLinks, fetchCategoryServicePolicies, fetchMusicFixedAssignments } from '../api/frontDoorApi';
import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import { useLoad } from './useLoad';
import { useChoirRegister } from './useChoirRegister';
import { LoadState } from './LoadState';
import { policySummary, serviceSummary } from './config';

export function MusicSetupReview({versionId, edit, ready}: {versionId:string; edit:(tab:string)=>void; ready:(value:boolean)=>void}) {
  const t = useT();
  const choirs = useChoirRegister(undefined, 'setup-review-choirs');
  const [visit] = useState(() => crypto.randomUUID());
  const review = useLoad(async () => {
    const [services,categories,links,policies,fixed] = await Promise.all([
      fetchSchedulingServices('sys-music',false,versionId), fetchChoirCategories('sys-music',false,versionId),
      fetchChoirCategoryLinks('sys-music',versionId), fetchCategoryServicePolicies('sys-music',versionId),
      fetchMusicFixedAssignments(versionId),
    ]);
    return {...services,...categories,...links,...policies,...fixed};
  },'setup-review|' + versionId + '|' + visit);
  const loaded = !!review.data && !review.loading && !review.failed && !choirs.loading && !choirs.failed;
  useEffect(() => {ready(loaded);return () => ready(false);},[loaded,ready]);
  const data = review.data;
  return <LoadState loading={review.loading || choirs.loading} failed={review.failed || choirs.failed} retry={() => {review.reload();choirs.reload();}}>
    {data && <div className="scheduling-review">
      <section className="panel"><h4>{t('door.config.step.services')}</h4>
        <ul>{data.services.filter(s => s.active).map(s => <li key={s.id}>{serviceSummary(s,t)}</li>)}</ul>
        {!data.services.some(s=>s.active) && <p>{t('door.config.services.empty')}</p>}
        <button className="btn ghost sm" onClick={() => edit('services')}>{t('door.settings.edit')}</button>
      </section>
      <section className="panel"><h4>{t('door.config.step.choirs')}</h4>
        <ul>{data.links.filter(l => l.active).map(link => <li key={link.id}>
          {choirs.data?.choirs.find(c=>c.id === link.choirId)?.name ?? t('door.config.nameUnavailable.choir')} · {data.categories.find(c=>c.id === link.categoryId)?.name ?? t('door.config.nameUnavailable.category')}
        </li>)}</ul>
        {!data.links.some(l=>l.active) && <p>{t('door.config.links.empty')}</p>}
        <button className="btn ghost sm" onClick={() => edit('links')}>{t('door.settings.edit')}</button>
      </section>
      <section className="panel"><h4>{t('door.config.step.rules')}</h4>
        <ul>{data.policies.filter(p=>p.active).map(p => <li key={p.id}>
          <strong>{data.categories.find(c=>c.id === p.categoryId)?.name} · {data.services.find(s=>s.id === p.serviceId)?.name}</strong>
          <p>{p.eligible ? policySummary(p,t) : t('door.config.notAllowed')}</p>
          {(p.planningMode === 'FIXED' || data.assignments.some(a=>a.categoryServicePolicyId === p.id)) && <p>{data.assignments.filter(a=>a.categoryServicePolicyId === p.id).map(a=>[choirs.data?.choirs.find(c=>c.id === a.choirId)?.name,a.serviceDate ?? t('door.config.fixed.every'),a.serviceTime].filter(Boolean).join(' · ')).join('; ') || t('door.config.fixed.empty')}</p>}
        </li>)}</ul>
        {!data.policies.some(p=>p.active) && <p>{t('door.config.policies.empty')}</p>}
        <button className="btn ghost sm" onClick={() => edit('policies')}>{t('door.settings.edit')}</button>
      </section>
    </div>}
  </LoadState>;
}
