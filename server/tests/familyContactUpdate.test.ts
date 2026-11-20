import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {expect,it} from 'vitest';

it('keeps the saved collection registry stable while retaining new export fields',()=>{
  const scope=createContext({familyContactCsv_:()=> 'with contacts'});
  runInContext(readFileSync(new URL('../../tools/google-forms/RevisedUnitForms-existing-collection.gs',import.meta.url),'utf8'),scope);
  expect(runInContext('revisedUnitKey_("sys-test")',scope)).toBe('MORIAH_PERSON360_REVISED:044d5db099adcd2d:sys-test');
  expect(runInContext('choirCollectionCsv_({familyContactsReady:true},[])',scope)).toBe('with contacts');
});

it('resumes optional additions using numeric positions without replacing answers, sheets or existing questions',()=>{
  const items:any[]=[],properties=new Map<string,string>();let nextId=0;
  const item=(title:string)=>{const row:any={id:++nextId,title,required:false,getId:()=>row.id,getIndex:()=>items.indexOf(row),asTextItem:()=>row,setTitle:(value:string)=>{row.title=value;return row;},setRequired:(value:boolean)=>{row.required=value;return row;},setValidation:()=>row};items.push(row);return row;};
  const mapping:Record<string,string>={};for(let index=0;index<20;index++)mapping[String(item('gender').id)]='family.'+index+'.gender';
  // The first interrupted run saved a question mapping before Google rejected its placement.
  mapping[String(item('What is this family member’s phone number?').id)]='family.0.phone';
  properties.set('unit',JSON.stringify({state:'READY',formId:'form',items:mapping}));
  const answers=[{response:'existing synthetic response'}];
  const form={getItemById:(id:number)=>items.find(row=>row.id===id),getResponses:()=>answers,getDestinationId:()=> 'original-sheet',isPublished:()=>false,addTextItem:()=>item(''),moveItem:(from:number,to:number)=>{if(!Number.isInteger(from)||!Number.isInteger(to))throw new Error('Numeric indexes required');items.splice(to,0,items.splice(from,1)[0]);}};
  const validation:any={requireTextLengthLessThanOrEqualTo:()=>validation,build:()=>({})};
  const scope=createContext({FAMILY_CONTACT_FORMS:[{id:'sys-test',formId:'form',registryKey:'unit'}],console:{log:()=>{}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>properties.get(key),setProperty:(key:string,value:string)=>properties.set(key,value)})},FormApp:{openById:()=>form,createTextValidation:()=>validation}});
  runInContext(readFileSync(new URL('../../tools/google-forms/family-contact-runtime.gs',import.meta.url),'utf8'),scope);
  runInContext('addFamilyContactQuestions()',scope);runInContext('addFamilyContactQuestions()',scope);
  expect(items).toHaveLength(60);expect(answers).toEqual([{response:'existing synthetic response'}]);
  const state=JSON.parse(properties.get('unit')!);expect(state.familyContactsReady).toBe(true);expect(state.familyContactsBefore).toEqual({responses:1,sheetId:'original-sheet'});
  for(let index=0;index<20;index++){
    const gender=items.findIndex(row=>state.items[String(row.id)]==='family.'+index+'.gender');
    expect(state.items[String(items[gender+1].id)]).toBe('family.'+index+'.phone');
    expect(state.items[String(items[gender+2].id)]).toBe('family.'+index+'.nationalId');
    expect(items[gender+1].required).toBe(false);expect(items[gender+2].required).toBe(false);
  }
});
