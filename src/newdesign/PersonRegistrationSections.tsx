import type { P360Section } from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { fieldsFor, labelKey, sectionKey, SINGLE_SECTIONS, valueKey } from './person360';

export type RegistrationRecord = {id:number;section:P360Section;values:Record<string,string>};

/** Optional profile facts are collected before the person is saved. */
export function PersonRegistrationSections({write,records,onChange}: {write:P360Section[];records:RegistrationRecord[];onChange:(records:RegistrationRecord[])=>void}) {
  const t = useT();
  const set = (id:number,key:string,value:string) => onChange(records.map(row=>row.id===id ? {...row,values:{...row.values,[key]:value}} : row));
  return <>{write.map(section=><details key={section} className="panel">
    <summary>{t(sectionKey(section))}{records.some(row=>row.section===section) ? ` (${records.filter(row=>row.section===section).length})` : ''}</summary>
    {records.filter(row=>row.section===section).map((row,index)=><fieldset key={row.id} className="door-form">
      <legend>{t(sectionKey(section))} {index+1}</legend>
      {fieldsFor(section,row.values).filter(field=>field.type!=='person' && field.type!=='unit').map(field=>field.type==='select'
        ? <SelectField key={field.key} label={t(labelKey(section,field.key,row.values) as 'door.p360.f.status')} name={`profile-${row.id}-${field.key}`} value={row.values[field.key] ?? ''} required={field.required} onChange={event=>set(row.id,field.key,event.target.value)}>
          <option value="">{t('door.gov.meeting.choose')}</option>{field.options?.map(value=><option key={value} value={value}>{t(valueKey(value) as 'door.p360.v.EMPLOYED')}</option>)}
        </SelectField>
        : <TextField key={field.key} label={t(labelKey(section,field.key,row.values) as 'door.p360.f.date')} name={`profile-${row.id}-${field.key}`} value={row.values[field.key] ?? ''} type={field.type==='date' ? 'date' : field.type==='number' ? 'number' : 'text'} min={field.type==='number' ? 1930 : undefined} max={field.type==='number' ? 2100 : undefined} required={field.required} maxLength={field.max} onChange={event=>set(row.id,field.key,event.target.value)} />)}
      <button type="button" className="btn ghost sm" onClick={()=>onChange(records.filter(item=>item.id!==row.id))}>{t('door.groups.remove')}</button>
    </fieldset>)}
    {(!SINGLE_SECTIONS.includes(section) || !records.some(row=>row.section===section)) && <button type="button" className="btn ghost sm" disabled={records.length>=50} onClick={()=>onChange([...records,{id:Math.max(0,...records.map(row=>row.id))+1,section,values:{}}])}>{t('door.p360.add',{section:t(sectionKey(section))})}</button>}
  </details>)}</>;
}
