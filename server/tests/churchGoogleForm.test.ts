import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
import '../../scripts/build-church-google-form.mjs';
const spec=JSON.parse(readFileSync(new URL('../../tools/google-forms/church-google-spec.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../../tools/google-forms/ChurchWideForm.gs',import.meta.url),'utf8');
describe('church Google questionnaire',()=>{
 it('has no dangling branches or cycles and every section can reach submission',()=>{
  const nodes=new Map(spec.nodes.map(n=>[n.id,n]));
  // Per-node traversal avoids enumerating every combination of 40 repeaters.
  const finished=new Set<string>();
  function check(id:string,path:string[]=[]){if(finished.has(id))return;expect(path).not.toContain(id);const n:any=nodes.get(id);expect(n).toBeTruthy();const targets=n.questions.flatMap(q=>(q.options||[]).map(o=>o.go).filter(Boolean));if(n.next)targets.push(n.next);if(!targets.length)expect(id).toBe('finish');for(const target of new Set(targets))check(target as string,[...path,id]);finished.add(id);}
  check('about');expect(finished.size).toBe(spec.nodes.length);
 });
 it('includes 20 of each relative and only retirement date in the retired branch',()=>{
  for(const kind of ['sibling','child'])expect(spec.nodes.filter(n=>n.id.startsWith(kind+'-'))).toHaveLength(20);
  expect(spec.nodes.find(n=>n.id==='retired').questions.map(q=>q.key)).toEqual(['EMPLOYMENT.since']);
  expect(spec.nodes.find(n=>n.id==='spouse').questions.every(q=>q.required)).toBe(true);
 });
 it('compiles independently of old scripts without calling Google services on load',()=>{
  const context=createContext({});expect(()=>runInContext(source,context)).not.toThrow();
  expect(runInContext('typeof createChurchWideForm',context)).toBe('function');
  expect(source).not.toContain('setPublished(true)');expect(source).not.toContain('deleteResponse');
  expect(source).toContain('FormApp.create(SPEC.title,false)');
 });
 it('exports only answers on the selected route, excluding stale relatives and work fields',()=>{
  const context=createContext({});runInContext(source.replace('return {create:create,verify:verify,exportCsv:exportCsv};','return {responseRow:responseRow};'),context);
  const values:any={about:{fullName:'Review',preferredName:'Review',nationalId:'001234',dateOfBirth:'01-01-1990',gender:'FEMALE',address:'Review'},work:{'EMPLOYMENT.status':'RETIRED'},retired:{'EMPLOYMENT.since':'01-01-2020'},education:{'EDUCATION.level':'NONE'},serving:{singer:'NO'},parents:{'father.name':'Father','mother.name':'Mother',addSibling:'NO'},marriage:{married:'NO'},children:{hasChildren:'NO'},baptism:{baptised:'NO'},employed:{'EMPLOYMENT.role':'Stale'},'sibling-0':{'sibling.0.name':'Stale sibling'}};
  const state={items:{}},responses:any[]=[];
  for(const n of spec.nodes)for(const q of n.questions){const value=values[n.id]?.[q.key];if(value===undefined)continue;const id=String(responses.length);state.items[id]={node:n.id,key:q.key,options:q.options};const raw=q.options?.find(o=>o.code===value)?.label||value;responses.push({getItem:()=>({getId:()=>id}),getResponse:()=>raw});}
  context.response={getItemResponses:()=>responses};context.state=state;
  const row=runInContext('MORIAH_CHURCH_WIDE.responseRow(response,state)',context);
  expect(row['Work - Role']).toBeUndefined();expect(JSON.parse(row.FAMILY)).toHaveLength(2);expect(row['Work - Since']).toBe('2020-01-01');
 });
 it('creates one new unpublished collection, leaves existing collections inaccessible, and verifies every branch',()=>{
  const items:any[]=[],properties=new Map<string,string>(),logs:string[]=[];let creations=0,sheets=0;
  function item(){const value:any={id:items.length,title:'',required:false,options:[],destination:null};items.push(value);
   for(const method of ['setTitle','setRequired','setChoiceValues','setChoices','setGoToPage'])value[method]=(arg:any)=>{if(method==='setTitle')value.title=arg;if(method==='setRequired')value.required=arg;if(method==='setChoiceValues')value.options=arg.map(v=>({getValue:()=>v}));if(method==='setChoices')value.options=arg;if(method==='setGoToPage')value.destination=arg;return value;};
   for(const method of ['setValidation','setHelpText','showOtherOption'])value[method]=()=>value;
   Object.assign(value,{getId:()=>value.id,getTitle:()=>value.title,isRequired:()=>value.required,getChoices:()=>value.options,getGoToPage:()=>value.destination,createChoice:(label,target)=>({getValue:()=>label,getGotoPage:()=>target})});
   for(const cast of ['asPageBreakItem','asTextItem','asListItem','asMultipleChoiceItem','asCheckboxItem'])value[cast]=()=>value;return value;
  }
  const form:any={getId:()=> 'new-church',getTitle:()=>spec.title,getEditUrl:()=> 'https://example.invalid/edit',getPublishedUrl:()=> 'https://example.invalid/unpublished',isPublished:()=>false,getItems:()=>items,getResponses:()=>[],getDestinationId:()=> 'new-sheet',setDestination:()=>form};
  for(const method of ['setTitle','setDescription','setCollectEmail','setPublishingSummary','setProgressBar','setShuffleQuestions'])form[method]=()=>form;
  for(const method of ['addSectionHeaderItem','addPageBreakItem','addTextItem','addListItem','addMultipleChoiceItem','addCheckboxItem'])form[method]=item;
  const validation:any={build:()=>({})};for(const method of ['requireTextMatchesPattern','requireTextIsEmail','requireTextLengthLessThanOrEqualTo'])validation[method]=()=>validation;
  const context=createContext({console:{log:(s:string)=>logs.push(s)},PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>properties.get(key),setProperty:(key:string,value:string)=>properties.set(key,value)})},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},FormApp:{create:(title:string,published:boolean)=>{expect(published).toBe(false);creations++;return form;},openById:(id:string)=>{expect(id).toBe('new-church');return form;},createTextValidation:()=>validation,DestinationType:{SPREADSHEET:'sheet'}},SpreadsheetApp:{create:()=>{sheets++;return {getId:()=> 'new-sheet',getUrl:()=> 'https://example.invalid/sheet'};}}});
  runInContext(source,context);runInContext('createChurchWideForm();verifyChurchWideForm();createChurchWideForm();',context);
  expect(creations).toBe(1);expect(sheets).toBe(1);expect(items).toHaveLength(273);expect(logs.some(log=>log.startsWith('CHURCH_VERIFIED'))).toBe(true);
  expect([...properties.values()].every(value=>Buffer.byteLength(value,'utf8')<9000)).toBe(true);
 });
});
