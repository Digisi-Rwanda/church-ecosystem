import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
import {mapImport} from '../../src/newdesign/peopleImportMapping';
import {parseCsv} from '../../src/newdesign/peopleTools';
import {BASIC_COLUMNS,PROFILE_COLUMNS} from '../../src/newdesign/personRegistration';
// The generator imports only pure unit constants, never seed.ts or a Prisma client.
import '../../scripts/build-person360-google-forms';

const source=()=>readFileSync(new URL('../../tools/google-forms/Person360.gs',import.meta.url),'utf8');
function fixture() {
  const properties:Record<string,string>={};
  const forms:any[]=[]; const files:any[]=[]; const sheets:any[]=[];
  let itemId=0;
  const context=createContext({
    console:{log:vi.fn()},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>properties[key],setProperty:(key:string,value:string)=>{properties[key]=value;}})},
    SpreadsheetApp:{create:(name:string)=>{const id=String(sheets.length);const sheet={name,getId:()=>id,getUrl:()=>`https://sheet.invalid/${id}`};sheets.push(sheet);return sheet;},openById:(id:string)=>sheets[Number(id)]},
    DriveApp:{createFile:(name:string,data:string,mime:string)=>{files.push({name,data,mime});return{getUrl:()=>`https://file.invalid/${files.length}`};},getFileById:(id:string)=>({makeCopy:(title:string)=>{
      const original=forms[Number(id)];
      const copy=(context.FormApp as any).create(title,false);
      copy.items=original.items.map((item:any)=>{const clone={...item,id:++itemId};clone.getId=()=>clone.id;clone.getTitle=()=>clone.Title;for(const method of ['asListItem','asTextItem','asSectionHeaderItem','asPageBreakItem'])clone[method]=()=>clone;for(const method of ['setTitle','setRequired','setHelpText','setValidation','setChoiceValues'])clone[method]=(value:unknown)=>{clone[method.slice(3)]=value;return clone;};return clone;});
      return {getId:()=>copy.getId()};
    }})},
    Utilities:{formatDate:()=> '2026-11-02-120000'},
    FormApp:{DestinationType:{SPREADSHEET:'SPREADSHEET'},ItemType:{TEXT:'Text',LIST:'List',SECTION_HEADER:'SectionHeader',PAGE_BREAK:'PageBreak'},
      createTextValidation:()=>{const builder:any={};for(const method of ['requireTextMatchesPattern','setHelpText','requireTextIsEmail','requireTextLengthLessThanOrEqualTo']) builder[method]=()=>builder;builder.build=()=>({});return builder;},
      create:(title:string,published:boolean)=>{
        const form:any={title,published,items:[],responses:[],getTitle:()=>form.title,isPublished:()=>form.published,getDestinationId:()=>{if(!form.destination)throw new Error('The form currently has no response destination.');return form.destination;},getId:()=>String(forms.indexOf(form)),getEditUrl:()=>`https://form.invalid/${forms.indexOf(form)}/edit`,getPublishedUrl:()=>`https://form.invalid/${forms.indexOf(form)}/view`,getItems:()=>form.items,getResponses:()=>form.responses};
        form.setTitle=(value:string)=>{form.title=value;return form;};
        for(const method of ['setDescription','setCollectEmail','setPublishingSummary','setProgressBar','setShuffleQuestions','setConfirmationMessage','setDestination','setPublished']) form[method]=vi.fn(()=>form);
        form.setDestination=vi.fn((_type:string,id:string)=>{form.destination=id;return form;});
        for(const type of ['Text','List','SectionHeader','PageBreak']) form[`add${type}Item`]=()=>{
          const item:any={id:++itemId,type,getId:()=>item.id,getType:()=>type,getTitle:()=>item.Title};
          for(const method of ['asListItem','asTextItem','asSectionHeaderItem','asPageBreakItem'])item[method]=()=>item;
          for(const method of ['setTitle','setRequired','setHelpText','setValidation','setChoiceValues']) item[method]=(value:unknown)=>{item[method.slice(3)]=value;return item;};
          form.items.push(item);return item;
        };
        forms.push(form);return form;
      },openById:(id:string)=>forms[Number(id)],
    },
  });
  runInContext(source(),context);
  return{context,forms,files,sheets,properties};
}

describe('unit Google Forms package',()=>{
  it('preserves the original 43-column Google contract and all 21 code-defined unit systems',()=>{
    const f=fixture();
    const schema=runInContext('PERSON360_SCHEMA',f.context);
    expect(Array.from(schema.columns,(column:any)=>column.header)).toEqual([...BASIC_COLUMNS,...PROFILE_COLUMNS.filter(column=>!['FAMILY.phone','FAMILY.nationalId'].includes(column.key))].map(column=>column.header));
    const ids=Array.from(runInContext('UNITS',f.context),(unit:any)=>unit.id);
    expect(ids).toHaveLength(21); expect(new Set(ids).size).toBe(21);
    expect(ids).toContain('sys-choir-ijwi'); expect(ids).toContain('sys-protocol');
    expect(ids).not.toContain('sys-finance'); expect(ids).not.toContain('sys-main');
  });
  it('creates private unpublished forms in bounded resumable batches and preserves completed forms',()=>{
    const f=fixture();
    runInContext('let clockCalls=0; Date.now=()=> (++clockCalls>3 ? 200000 : 0);',f.context);
    runInContext('createUnitForms()',f.context);
    expect(f.forms).toHaveLength(2);expect(f.sheets).toHaveLength(2);
    expect(f.forms[0].published).toBe(false);
    expect(f.forms[0].setPublishingSummary).toHaveBeenCalledWith(false);
    expect(f.forms[0].items.filter((item:any)=>['Text','List'].includes(item.type))).toHaveLength(43);
    const original=f.forms[0].items.length;
    runInContext('Date.now=()=>0;',f.context);
    for(let i=0;i<12;i++)runInContext('createUnitForms()',f.context);
    expect(f.forms).toHaveLength(21); expect(f.sheets).toHaveLength(21);
    expect(f.forms[0].items).toHaveLength(original);
  });
  it('exports human answers as canonical import values without Google timestamps or unit-choice fields',()=>{
    const f=fixture();runInContext('createUnitForms()',f.context);
    const state=JSON.parse(f.properties['MORIAH_PERSON360_UNIT:sys-youth']);
    const answers:Record<string,string>={fullName:'Test, "Member"',phone:'0780000000',gender:'Female',status:'Active','EMPLOYMENT.status':'Self-employed','EDUCATION.level':"Bachelor's Degree",'FAMILY.relation':'Child','FAMILY.name':'Child','BAPTISM.date':'2010-05-03','MARRIAGE.date':'2020-06-12','MARRIAGE.spouseName':'Spouse'};
    f.forms[0].responses=[{getItemResponses:()=>Object.entries(state.items).filter(([,key])=>answers[key as string]).map(([id,key])=>({getItem:()=>({getId:()=>id}),getResponse:()=>answers[key as string]}))}];
    runInContext(source().replace("const EXPORT_UNIT_ID = '';","const EXPORT_UNIT_ID = 'sys-youth';")+'\nexportUnitCsv();',createContext({...f.context}));
    expect(f.files).toHaveLength(1);
    const mapped=mapImport(parseCsv(f.files[0].data));
    expect(mapped.unknown).toEqual([]);expect(mapped.rows[0]).toMatchObject({fullName:'Test, "Member"',phone:'0780000000',gender:'FEMALE',status:'ACTIVE','EMPLOYMENT.status':'SELF_EMPLOYED','FAMILY.relation':'CHILD','BAPTISM.date':'2010-05-03'});
    expect(f.files[0].name).toContain('sys-youth-person-360');
  });
  it('refuses ambiguous dates and resumes its own unpublished unanswered partial forms',()=>{
    const f=fixture();
    expect(()=>runInContext("normalizeAnswer_({type:'date'},'03/04/2020')",f.context)).toThrow(/YYYY-MM-DD/);
    expect(()=>runInContext("normalizeAnswer_({type:'date'},'2020-02-30')",f.context)).toThrow(/real date/);
    runInContext('createUnitForms()',f.context);
    const partial=JSON.parse(f.properties['MORIAH_PERSON360_UNIT:sys-music']);partial.state='CREATING';partial.items={};
    f.properties['MORIAH_PERSON360_UNIT:sys-music']=JSON.stringify(partial);
    const originalId=f.forms[1].getId();f.forms[1].items=f.forms[1].items.slice(0,12);
    f.forms[1].title='';
    f.forms[1].getDestinationId=()=>{throw new Error('The form currently has no response destination.');};
    runInContext('createUnitForms()',f.context);
    const resumed=JSON.parse(f.properties['MORIAH_PERSON360_UNIT:sys-music']);
    expect(resumed.state).toBe('READY');expect(resumed.formId).toBe(originalId);expect(Object.keys(resumed.items)).toHaveLength(43);
    expect(f.forms[1].items.filter((item:any)=>['Text','List'].includes(item.type))).toHaveLength(43);
  });
  it('does not repair a partial form that was answered or edited by a person',()=>{
    const f=fixture();runInContext('createUnitForms()',f.context);
    const state=JSON.parse(f.properties['MORIAH_PERSON360_UNIT:sys-youth']);state.state='CREATING';
    f.properties['MORIAH_PERSON360_UNIT:sys-youth']=JSON.stringify(state);
    f.forms[0].responses=[{}];
    expect(()=>runInContext('createUnitForms()',f.context)).toThrow(/answered/);
    f.forms[0].responses=[];f.forms[0].items[1].Title='User changed question';
    expect(()=>runInContext('createUnitForms()',f.context)).toThrow(/differ from the template/);
  });
  it('fills an empty generated form title but preserves a nonempty title and handles missing destinations',()=>{
    const f=fixture();runInContext('createUnitForms()',f.context);
    f.forms[0].title='';f.forms[1].title='Custom title';
    runInContext('createUnitForms()',f.context);
    expect(f.forms[0].title).toBe('Youth Ministry — Person 360 registration');
    expect(f.forms[1].title).toBe('Custom title');
    f.forms[1].getDestinationId=()=>{throw new Error('The form currently has no response destination.');};
    expect(()=>runInContext('verifyUnitForms()',f.context)).not.toThrow();
  });
  it('verifies 21 complete unpublished forms with distinct linked response sheets',()=>{
    const f=fixture();runInContext('createUnitForms();verifyUnitForms();',f.context);
    const logs=(f.context.console as any).log.mock.calls.map((args:any[])=>args[0]);
    expect(logs).toContain('VERIFICATION '+JSON.stringify({expected:21,ready:21,separateResponseSheets:21}));
  });
});
