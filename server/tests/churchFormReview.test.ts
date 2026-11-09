import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {T,choices,registrationRow,csv,dateValue,workFields,educationFields} from '../../tools/google-forms/church-registration.mjs';
import {mapImport} from '../../src/newdesign/peopleImportMapping';
import {parseCsv} from '../../src/newdesign/peopleTools';
import {registrationRecords,importProfileRecords,cleanRegistrationRecords} from '../src/person360/registration';
import {SECTIONS} from '../src/person360/rules';
const schema=JSON.parse(readFileSync(new URL('../../tools/google-forms/church-schema.json',import.meta.url),'utf8'));
const basic={fullName:'Review person',preferredName:'Review',nationalId:'0012345678901234',dateOfBirth:'03-11-2000',gender:'FEMALE',address:'Review address','EMPLOYMENT.status':'STUDENT',married:'NO',hasChildren:'NO',baptised:'NO'};
const family={father:{name:'Father'},mother:{name:'Mother'}};
describe('church-wide bilingual questionnaire',()=>{
 it('compiles the browser questionnaire script',()=>{
  const html=readFileSync(new URL('../../tools/google-forms/church-review.html',import.meta.url),'utf8');
  const code=html.split('<script type="module">')[1].split('</script>')[0].replace(/^import .*;$/m,'');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  expect(()=>new AsyncFunction(code)).not.toThrow();
 });
 it('requires own ID and spouse phone/ID, retaining their leading zeros on import',()=>{
  expect(()=>registrationRow(schema,{...basic,nationalId:''},family)).toThrow(/National ID/);
  const answer={...basic,married:'YES',spouseName:'Spouse',spousePhone:'0780000002',spouseNationalId:'0011223344556677'};
  for(const key of ['spousePhone','spouseNationalId'])expect(()=>registrationRow(schema,{...answer,[key]:''},family)).toThrow(/Spouse/);
  const row=registrationRow(schema,answer,family),mapped=mapImport(parseCsv(csv(schema,row)));
  const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
  expect(records.find(r=>r.data.relation==='SPOUSE')?.data).toMatchObject({phone:'0780000002',nationalId:'0011223344556677'});
 });
 it('requires the other ADEPR location and recommendation answer, excluding stale other-church reception',()=>{
  const answer={...basic,baptised:'YES','BAPTISM.date':'01-01-2020',baptismChurch:'ADEPR',adeprCongregation:'OTHER',otherAdepr:'Review congregation',broughtRecommendation:'NO',receivedInAdepr:'YES'};
  for(const key of ['adeprCongregation','otherAdepr','broughtRecommendation'])expect(()=>registrationRow(schema,{...answer,[key]:''},family)).toThrow();
  const row=registrationRow(schema,answer,family),mapped=mapImport(parseCsv(csv(schema,row)));
  const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
  expect(records.find(r=>r.section==='BAPTISM')?.data.place).toBe('ADEPR Review congregation');
  expect(records.filter(r=>r.section==='CONTACT').map(r=>r.data)).toEqual([{label:'Baptism - Recommendation letter brought',value:'No'}]);
 });
 it('has both languages for every question and choice',()=>{
  for(const column of schema.columns){expect(T[column.key]).toHaveLength(2);for(const option of column.choices||[])expect(choices[option.code]).toBeTruthy();}
 });
 it('requires both parents, while their identifiers and own contact fields are optional',()=>{
  expect(()=>registrationRow(schema,basic,{...family,father:{}})).toThrow(/family/);
  expect(()=>registrationRow(schema,basic,{...family,mother:{}})).toThrow(/family/);
  expect(JSON.parse(registrationRow(schema,basic,family).FAMILY)).toEqual([{relation:'PARENT',name:'Father',gender:'MALE'},{relation:'PARENT',name:'Mother',gender:'FEMALE'}]);
 });
 it('requires all baptism follow-ups only after Yes and rejects invalid dates',()=>{
  expect(()=>registrationRow(schema,{...basic,baptised:'YES'},family)).toThrow();
  const answers={...basic,baptised:'YES','BAPTISM.date':'02-11-2020',baptismChurch:'OTHER',otherChurch:'Review Church',receivedInAdepr:'YES'};
  expect(registrationRow(schema,answers,family)['Baptism - Date']).toBe('2020-11-02');
  for(const key of ['BAPTISM.date','baptismChurch','otherChurch','receivedInAdepr'])expect(()=>registrationRow(schema,{...answers,[key]:''},family)).toThrow();
  expect(()=>dateValue('31-02-2026')).toThrow();
  expect(registrationRow(schema,{...answers,baptised:'NO'},family)['Baptism - Date']).toBeUndefined();
 });
 it('requires a registered choir for Singer and preserves it as a calling note through import',()=>{
  expect(()=>registrationRow(schema,{...basic,callings:['Singer']},family)).toThrow(/choir/);
  const row=registrationRow(schema,{...basic,callings:['Singer','Children ministry'],choir:'ou-choir-elim'},family);
  const mapped=mapImport(parseCsv(csv(schema,row)));
  const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
  expect(records.find(r=>r.section==='CALLING'&&r.data.name==='Singer')?.data.note).toBe('Choir / Korali: Elim');
  expect(records.find(r=>r.data.name==='Children ministry')).toBeTruthy();
 });
 it('hides inapplicable education answers, omits stale finish years, and excludes Other',()=>{
  expect(educationFields('NONE','NO')).toEqual([]);
  expect(educationFields('PRIMARY','YES')).toEqual(['startYear']);
  expect(educationFields('SECONDARY_O','NO')).toEqual(['school','startYear','endYear']);
  expect(schema.columns.find(c=>c.key==='EDUCATION.level').choices.some(c=>c.code==='OTHER')).toBe(false);
  const row=registrationRow(schema,{...basic,'EDUCATION.level':'PRIMARY',studying:'YES','EDUCATION.field':'Stale','EDUCATION.school':'Stale','EDUCATION.endYear':'2020'},family);
  expect(row['Education - Field of study']).toBeUndefined();expect(row['Education - School']).toBeUndefined();expect(row['Education - End year']).toBeUndefined();
  expect(JSON.parse(row.CONTACT)).toContainEqual({label:'Education - Still studying',value:'Yes'});
 });
 it('round-trips other-church reception and excludes it when ADEPR is chosen',()=>{
  const answers={...basic,baptised:'YES','BAPTISM.date':'01-01-2020',baptismChurch:'OTHER',otherChurch:'Review Church',receivedInAdepr:'NO'};
  const row=registrationRow(schema,answers,family), mapped=mapImport(parseCsv(csv(schema,row)));
  expect(mapped.unknown).toEqual([]);
  const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
  expect(records.find(r=>r.section==='CONTACT')?.data).toEqual({label:'Baptism - Officially received in ADEPR',value:'No'});
  expect(records.find(r=>r.section==='BAPTISM')?.data).toEqual({date:'2020-01-01',place:'Review Church'});
  const adepr=registrationRow(schema,{...answers,baptismChurch:'ADEPR',adeprCongregation:'KACYIRU'},family);expect(adepr.CONTACT).toBe('');expect(adepr['Baptism - Place']).toBe('ADEPR Kacyiru');
 });
 it('requires the applicable employed/self-employed fields, never a hidden employer/business',()=>{
  for(const status of ['EMPLOYED','SELF_EMPLOYED']){
   const answer={...basic,'EMPLOYMENT.status':status,...Object.fromEntries(workFields(status).map(key=>['EMPLOYMENT.'+key,key==='sector'?'OTHER':key==='since'?'01-01-2020':'Review']))};
   expect(()=>registrationRow(schema,answer,family)).not.toThrow();
   for(const key of workFields(status))expect(()=>registrationRow(schema,{...answer,['EMPLOYMENT.'+key]:''},family)).toThrow();
  }
 });
 it('only asks business details for Business and trade and current job role for Employed',()=>{
  expect(workFields('SELF_EMPLOYED','HEALTH')).not.toContain('business');
  expect(workFields('SELF_EMPLOYED','BUSINESS')).toContain('business');
  expect(workFields('SELF_EMPLOYED','BUSINESS')).not.toContain('role');
  expect(workFields('EMPLOYED','HEALTH')).toContain('role');
  const answer={...basic,'EMPLOYMENT.status':'SELF_EMPLOYED','EMPLOYMENT.sector':'HEALTH','EMPLOYMENT.since':'01-01-2020','EMPLOYMENT.business':'Stale','EMPLOYMENT.role':'Stale'};
  const row=registrationRow(schema,answer,family);expect(row['Work - Business']).toBeUndefined();expect(row['Work - Role']).toBeUndefined();
  expect(()=>registrationRow(schema,{...answer,'EMPLOYMENT.sector':'BUSINESS','EMPLOYMENT.business':''},family)).toThrow();
 });
 it('asks only retirement date and excludes stale previous-work answers from import',()=>{
  expect(workFields('RETIRED','BUSINESS')).toEqual(['since']);
  const answer={...basic,'EMPLOYMENT.status':'RETIRED','EMPLOYMENT.since':'01-01-2020','EMPLOYMENT.role':'Stale','EMPLOYMENT.employer':'Stale','EMPLOYMENT.business':'Stale','EMPLOYMENT.sector':'BUSINESS',previousWorkType:'EMPLOYED',previousWork:'Stale',previousWorkSince:'01-01-1990'};
  expect(()=>registrationRow(schema,{...answer,'EMPLOYMENT.since':''},family)).toThrow();
  const row=registrationRow(schema,answer,family),mapped=mapImport(parseCsv(csv(schema,row)));
  const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
  expect(records.find(r=>r.section==='EMPLOYMENT')?.data).toEqual({status:'RETIRED',since:'2020-01-01'});
  expect(records.some(r=>r.section==='CONTACT')).toBe(false);
 });
 it('requires spouse/child names conditionally and keeps all sibling/child contact identifiers through import',()=>{
  expect(()=>registrationRow(schema,{...basic,married:'YES'},family)).toThrow();
  expect(()=>registrationRow(schema,{...basic,hasChildren:'YES'},family)).toThrow();
  const relatives={...family,siblings:[{name:'Sibling',phone:'0780000001',nationalId:'001234'}],children:Array.from({length:25},(_,i)=>({name:'Child '+i,phone:'0780000000',nationalId:'000'+i}))};
  const row=registrationRow(schema,{...basic,married:'YES',spouseName:'Spouse',spousePhone:'0780000002',spouseNationalId:'0011223344556677',hasChildren:'YES'},relatives);
  const mapped=mapImport(parseCsv(csv(schema,row)));expect(mapped.unknown).toEqual([]);
  const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
  expect(records.filter(r=>r.section==='FAMILY')).toHaveLength(29);
  expect(records.find(r=>r.data.name==='Child 0')?.data).toMatchObject({phone:'0780000000',nationalId:'0000'});
  expect(records.some(r=>r.section==='MARRIAGE')).toBe(false);
 });
 it('keeps collection unrestricted but blocks an export the current importer would reject',()=>{
  const row=registrationRow(schema,{...basic,hasChildren:'YES'},{...family,children:Array.from({length:60},(_,i)=>({name:'Child '+i}))});
  expect(JSON.parse(row.FAMILY)).toHaveLength(62);
  expect(()=>csv(schema,row)).toThrow(/50 records/);
 });
});
