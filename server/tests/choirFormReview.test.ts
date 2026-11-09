import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
import {mapImport} from '../../src/newdesign/peopleImportMapping';
import {parseCsv} from '../../src/newdesign/peopleTools';
import {importProfileRecords,registrationRecords,cleanRegistrationRecords} from '../src/person360/registration';
import {SECTIONS} from '../src/person360/rules';
import '../../scripts/build-choir-form-review';
const source=readFileSync(new URL('../../tools/google-forms/ChoirReview.gs',import.meta.url),'utf8');
const context=()=>{const scope=createContext({});runInContext(source,scope);return scope;};
const about={fullName:'Review person',preferredName:'Review',phone:'0780000000',email:'review@example.invalid',dateOfBirth:'03-11-1990',nationalId:'1234567890123456',gender:'Female',joinedChurchOn:'01-01-2020',address:'Review address'};
describe('choir template revision',()=>{
  it('routes updated collections through the contact-aware exporter instead of silently dropping identifiers',()=>{
    const scope=context();scope.familyContactCsv_=()=> 'with family contacts';
    expect(runInContext('choirCollectionCsv_({familyContactsReady:true},[])',scope)).toBe('with family contacts');
    scope.familyContactCsv_=undefined;
    expect(()=>runInContext('choirCollectionCsv_({familyContactsReady:true},[])',scope)).toThrow(/exporter is required/);
    expect(runInContext('choirCollectionCsv_({},[])',scope)).toContain('Full name');
  });
  it('removes the requested fields and offers yes and no for the spouse question',()=>{
    const scope=context();const schema=runInContext('CHOIR_V2',scope);
    const keys=schema.columns.map((column:any)=>column.key);
    for(const key of ['status','CONTACT.label','CONTACT.value','EMPLOYMENT.school','EMPLOYMENT.field','CALLING.since','CALLING.note','FAMILY.note'])expect(keys).not.toContain(key);
    expect(schema.callings).toEqual(['Evangelist','Intercessor','Teach Sunday school','Deacon','Protocol','Singer','Instrumentalist','Media']);
    expect(schema.columns.find((column:any)=>column.key==='MARRIAGE.endedBy').choices.map((row:any)=>row.label)).toEqual(['Yes','No']);
    expect(schema.columns.find((column:any)=>column.key==='MARRIAGE.endedOn').question).toMatch(/^If yes,/);
  });
  it('converts DD-MM-YYYY without guessing ambiguous dates and rejects invalid dates',()=>{
    const scope=context();expect(runInContext("choirReviewDate_('03-11-2026')",scope)).toBe('2026-11-03');
    expect(runInContext("choirReviewDate_('29-02-2024')",scope)).toBe('2024-02-29');
    for(const date of ['2026-11-03','31-02-2026','29-02-2025','03/11/2026'])expect(()=>runInContext(`choirReviewDate_(${JSON.stringify(date)})`,scope)).toThrow();
  });
  it('round-trips multiple callings and relatives through the current import validators',()=>{
    const scope=context();scope.answers={...about,callings:['Singer','Protocol','Custom role'],'family.0.relation':'Spouse','family.0.name':'Spouse','family.0.phone':'0780123456','family.0.nationalId':'0012345678901234','family.1.relation':'Child','family.1.name':'Child','family.1.dateOfBirth':'15-02-2015','family.1.gender':'Female','MARRIAGE.date':'12-06-2010','MARRIAGE.endedBy':'No'};
    const csv=runInContext('choirReviewCsv_([answers])',scope);const mapped=mapImport(parseCsv(csv));
    expect(mapped.unknown).toEqual([]);expect(mapped.rows[0].dateOfBirth).toBe('1990-11-03');
    const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
    expect(records.filter(row=>row.section==='CALLING')).toHaveLength(3);expect(records.filter(row=>row.section==='FAMILY')).toHaveLength(2);
    expect(records.find(row=>row.section==='MARRIAGE')?.data.endedBy).toBeUndefined();
    expect(records.find(row=>row.section==='FAMILY'&&row.data.name==='Child')?.data.dateOfBirth).toBe('2015-02-15');
    expect(records.find(row=>row.section==='FAMILY'&&row.data.name==='Spouse')?.data).toMatchObject({phone:'0780123456',nationalId:'0012345678901234'});
  });
  it('requires a named other calling and consistent widowhood dates',()=>{
    const scope=context();scope.answers={...about,callings:['Other']};expect(()=>runInContext('choirReviewRow_(answers)',scope)).toThrow(/Name/);
    scope.answers={...about,'MARRIAGE.date':'12-06-2020','MARRIAGE.endedBy':'Yes','MARRIAGE.endedOn':'10-06-2020'};expect(()=>runInContext('choirReviewRow_(answers)',scope)).toThrow(/precedes/);
    scope.answers={...about,'MARRIAGE.date':'12-06-2020','MARRIAGE.endedBy':'Yes','MARRIAGE.endedOn':'15-06-2022'};expect(runInContext('choirReviewRow_(answers)',scope)['Marriage - Marriage ended on']).toBe('2022-06-15');
  });
  it('requires every About you answer and uses the revised work questions',()=>{
    const scope=context();const schema=runInContext('CHOIR_V2',scope);
    const basics=schema.columns.filter((column:any)=>column.section==='BASICS');
    expect(basics).toHaveLength(9);expect(basics.every((column:any)=>column.required)).toBe(true);
    for(const column of basics){scope.answers={...about,[column.key]:' '};expect(()=>runInContext('choirReviewRow_(answers)',scope)).toThrow(/required/);}
    expect(schema.columns.find((column:any)=>column.key==='EMPLOYMENT.role').question).toBe("What's your job title/role?");
    expect(schema.columns.find((column:any)=>column.key==='EMPLOYMENT.since').question).toBe('When did this work begin?');
  });
  it('plans distinct unit profiles without changing existing Google resources',()=>{
    const plan=JSON.parse(readFileSync(new URL('../../tools/google-forms/template-plan.json',import.meta.url),'utf8'));
    expect(plan.find((unit:any)=>unit.id==='sys-music').collect).toBe(false);
    expect(plan.find((unit:any)=>unit.id==='sys-children')).toMatchObject({work:false,education:false,marriage:false,review:'CHILDREN_REVIEW_PREPARED'});
    expect(plan.find((unit:any)=>unit.id==='sys-youth').marriage).toBe(false);
    for(const id of ['sys-youth','sys-children','sys-choir-hope'])expect(plan.find((unit:any)=>unit.id===id).familyRelations.map((row:any)=>row.code)).not.toContain('SPOUSE');
    expect(plan.find((unit:any)=>unit.id==='sys-choir-beulah').familyRelations.map((row:any)=>row.code)).toContain('SPOUSE');
    expect(plan.every((unit:any)=>unit.familyContactFields.includes('phone')&&unit.familyContactFields.includes('nationalId'))).toBe(true);
    expect(new Set(plan.filter((unit:any)=>unit.id.startsWith('sys-choir-')).map((unit:any)=>unit.profile))).toEqual(new Set(['CHOIR']));
  });
  it('limits rollout to the approved 17 units and six named choirs',()=>{
    const scope=context();scope.UNITS=JSON.parse(readFileSync(new URL('../../tools/google-forms/units.json',import.meta.url),'utf8'));
    runInContext(readFileSync(new URL('../../tools/google-forms/revised-unit-runtime.gs',import.meta.url),'utf8'),scope);
    const units=runInContext('revisedUnits_()',scope);
    expect(units).toHaveLength(17);expect(units.filter((unit:any)=>unit.id.startsWith('sys-choir-'))).toHaveLength(6);
    for(const id of ['sys-youth','sys-children','sys-choir-hope','sys-music'])expect(units.map((unit:any)=>unit.id)).not.toContain(id);
  });
  it('prepares Youth review without marriage fields and retains the approved other sections',()=>{
    const html=readFileSync(new URL('../../tools/google-forms/youth-review.html',import.meta.url),'utf8');
    const schema=JSON.parse(html.split('const CHOIR_V2=')[1].split(';\n')[0]);
    expect(schema.columns.some((column:any)=>column.section==='MARRIAGE')).toBe(false);
    expect(schema.relations.map((relation:any)=>relation.code)).not.toContain('SPOUSE');
    expect(schema.columns.filter((column:any)=>column.section==='BASICS').every((column:any)=>column.required)).toBe(true);
    expect(schema.columns.some((column:any)=>column.section==='EMPLOYMENT')).toBe(true);
    expect(html).toContain('Youth Person 360 registration');
    expect(html).toContain('What is this family member’s phone number?');expect(html).toContain('What is this family member’s National ID number?');
  });
  it('prepares Children without work, education or marriage and only the requested five required basics',()=>{
    const html=readFileSync(new URL('../../tools/google-forms/children-review.html',import.meta.url),'utf8');
    const schema=JSON.parse(html.split('const CHOIR_V2=')[1].split(';\n')[0]);
    expect(schema.columns.some((column:any)=>['EMPLOYMENT','EDUCATION','MARRIAGE'].includes(column.section))).toBe(false);
    expect(schema.columns.filter((column:any)=>column.section==='BASICS'&&column.required).map((column:any)=>column.key).sort()).toEqual(['address','dateOfBirth','fullName','gender','preferredName']);
    for(const key of ['phone','email','nationalId','joinedChurchOn'])expect(schema.columns.find((column:any)=>column.key===key).required).toBe(false);
    expect(schema.relations.map((relation:any)=>relation.code)).not.toContain('SPOUSE');
    const scope=createContext({});runInContext(html.split('<script>')[1].split('const form=document.getElementById')[0],scope);
    scope.answers={fullName:'Review child',preferredName:'Child',dateOfBirth:'01-01-2020',gender:'Female',address:'Review address','family.0.name':'Parent','family.0.relation':'Parent','family.0.phone':'0780123456','family.0.nationalId':'0012345678901234'};
    const mapped=mapImport(parseCsv(runInContext('choirReviewCsv_([answers])',scope)));
    expect(mapped.unknown).toEqual([]);expect(mapped.rows[0].phone).toBeUndefined();
    const records=cleanRegistrationRecords(registrationRecords.parse(importProfileRecords(mapped.rows[0])),[...SECTIONS]);
    expect(records.find(row=>row.section==='FAMILY')?.data).toMatchObject({phone:'0780123456',nationalId:'0012345678901234'});
  });
  it('builds a separate Youth Google revision without marriage creation or spouse relationship choices',()=>{
    const source=readFileSync(new URL('../../tools/google-forms/YouthTemplate.gs',import.meta.url),'utf8');
    const scope=createContext({});runInContext(source,scope);const schema=runInContext('YOUTH_TEMPLATE_SCHEMA',scope);
    expect(schema.columns.some((column:any)=>column.section==='MARRIAGE')).toBe(false);
    expect(schema.relations.some((row:any)=>row.code==='SPOUSE')).toBe(false);
    expect(source).not.toContain("page('Marriage')");expect(source).not.toContain('widowed.setChoices');
    expect(source).toContain('const original=youthOriginalSnapshot_()');expect(source).toContain('original:original');
  });
  it('starts a fresh verification after completion instead of trusting an old unpublished result',()=>{
    const scope=context(),values=new Map<string,string>();let published=false;
    const basics=runInContext('CHOIR_V2.columns.filter(column=>column.section===\'BASICS\')',scope);
    const items=basics.map((column:any,index:number)=>({getId:()=>index,getType:()=> 'TEXT',getTitle:()=>column.question,asTextItem:()=>({isRequired:()=>true})}));
    const form=(id:string)=>({getItems:()=>items,getDestinationId:()=>id+'-sheet',getResponses:()=>[],isPublished:()=>id==='new'&&published,getTitle:()=> 'Test',getEditUrl:()=> 'edit',getPublishedUrl:()=> 'respond'});
    scope.UNITS=[{id:'sys-men',name:'Men Ministry'}];scope.PropertiesService={getScriptProperties:()=>({getProperty:(key:string)=>values.get(key)||null,setProperty:(key:string,value:string)=>values.set(key,value)})};
    scope.FormApp={ItemType:{TEXT:'TEXT',LIST:'LIST',MULTIPLE_CHOICE:'MULTIPLE_CHOICE'},openById:form};
    scope.Utilities={DigestAlgorithm:{SHA_256:'sha'},computeDigest:(_algorithm:string,value:string)=>value,base64Encode:(value:string)=>value};scope.console={log:()=>{}};
    runInContext(readFileSync(new URL('../../tools/google-forms/revised-unit-runtime.gs',import.meta.url),'utf8'),scope);
    const version=runInContext('CHOIR_V2.version',scope);
    values.set('MORIAH_PERSON360_UNIT:sys-men',JSON.stringify({state:'READY',formId:'legacy'}));
    values.set('MORIAH_CHOIR_REVIEW:'+version,JSON.stringify({state:'READY',formId:'master'}));
    const original=runInContext('revisedOriginal_(UNITS[0])',scope);
    values.set('MORIAH_PERSON360_REVISED:'+version+':sys-men',JSON.stringify({state:'READY',formId:'new',sheetId:'new-sheet',original,items:Object.fromEntries(basics.map((column:any,index:number)=>[index,column.key]))}));
    expect(()=>runInContext('verifyRevisedUnitForms()',scope)).not.toThrow();published=true;
    expect(()=>runInContext('verifyRevisedUnitForms()',scope)).toThrow(/Verification failed/);
  });
});
