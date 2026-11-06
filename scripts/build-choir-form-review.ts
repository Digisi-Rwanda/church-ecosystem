/** Choir-first revision. Existing Google forms/legacy exporters are preserved. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BASIC_COLUMNS,PROFILE_COLUMNS} from '../src/newdesign/personRegistration';
import {en} from '../src/i18n/messages/en';
import {MINISTRY_KIT_ORGS,SPECIAL_MINISTRY_ORGS,CHOIR_PARENT_ORG,CHOIR_ORGS,choirSystemId} from '../server/src/lib/ministryOrgs';

const legacy=readFileSync(new URL('../tools/google-forms/Person360.gs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=legacy.indexOf('const PERSON360_SCHEMA = ')+'const PERSON360_SCHEMA = '.length;
const end=legacy.indexOf(';\n\n',start);
const original=JSON.parse(legacy.slice(start,end)) as {columns:Array<{key:string;header:string;section:string;type:string;max?:number;question:string;choices?:Array<{code:string;label:string}>}>};
const excluded=new Set(['status','EMPLOYMENT.school','EMPLOYMENT.field','CALLING.name','CALLING.since','CALLING.note','FAMILY.relation','FAMILY.name','FAMILY.dateOfBirth','FAMILY.gender','FAMILY.note']);
const columns=original.columns.filter(column=>column.section!=='CONTACT' && !excluded.has(column.key)).map(column=>({...column,
  required:column.section==='BASICS',
  question:column.key==='MARRIAGE.endedOn'?'If yes, when did your spouse pass away?':column.key==='EMPLOYMENT.role'?"What's your job title/role?":column.key==='EMPLOYMENT.since'?'When did this work begin?':column.question,
  ...(column.key==='MARRIAGE.endedBy'?{choices:[{code:'DEATH',label:'Yes'},{code:'',label:'No'}]}:{}),
}));
const schema={version:'',columns,headers:[...BASIC_COLUMNS,...PROFILE_COLUMNS].map(column=>column.header).concat(['CALLING','FAMILY']),
  callings:['Evangelist','Intercessor','Teach Sunday school','Deacon','Protocol','Singer','Instrumentalist','Media'],
  familyLimit:20,relations:['SPOUSE','PARENT','CHILD','SIBLING','GUARDIAN','OTHER'].map(code=>({code,label:(en as Record<string,string>)['door.p360.v.'+code]})),
};
schema.version=createHash('sha256').update(JSON.stringify(schema)).digest('hex').slice(0,16);
const runtime=readFileSync(new URL('../tools/google-forms/choir-review-runtime.gs',import.meta.url),'utf8');
writeFileSync(new URL('../tools/google-forms/ChoirReview.gs',import.meta.url),'// Choir-first review version; does not edit, delete or publish any existing form.\nconst CHOIR_V2 = '+JSON.stringify(schema,null,2)+';\n\n'+runtime);
const preview=readFileSync(new URL('../tools/google-forms/choir-review-preview.template.html',import.meta.url),'utf8');
writeFileSync(new URL('../tools/google-forms/choir-review.html',import.meta.url),preview.replace('__CHOIR_SCHEMA__',JSON.stringify(schema)).replace('__CHOIR_RUNTIME__',()=>runtime));
const youthSchema={...schema,columns:schema.columns.filter(column=>column.section!=='MARRIAGE'),relations:schema.relations.filter(relation=>relation.code!=='SPOUSE')};
youthSchema.version=createHash('sha256').update(JSON.stringify({...youthSchema,version:''})).digest('hex').slice(0,16);
const youthPreview=preview.replaceAll('Choir Person 360','Youth Person 360').replace('Choir template · Review','Youth template · Review').replace("MARRIAGE:'Marriage'",'').replace('BAPTISM:\'Baptism\',}',"BAPTISM:'Baptism'}")
  .replace("const passing=form.elements['MARRIAGE.endedBy'].value", "if(!form.elements['MARRIAGE.endedBy'])return;const passing=form.elements['MARRIAGE.endedBy'].value")
  .replace("document.getElementById('passing-date').hidden=true;", "if(document.getElementById('passing-date'))document.getElementById('passing-date').hidden=true;")
  .replace("form.elements['MARRIAGE.endedOn'].required=false;", "if(form.elements['MARRIAGE.endedOn'])form.elements['MARRIAGE.endedOn'].required=false;");
writeFileSync(new URL('../tools/google-forms/youth-review.html',import.meta.url),youthPreview.replace("link.download='choir-person-360.csv'","link.download='youth-person-360.csv'").replace('__CHOIR_SCHEMA__',JSON.stringify(youthSchema)).replace('__CHOIR_RUNTIME__',()=>runtime));
const childOptional=new Set(['phone','email','nationalId','joinedChurchOn']);
const childrenSchema={...youthSchema,columns:youthSchema.columns.filter(column=>!['EMPLOYMENT','EDUCATION'].includes(column.section)).map(column=>({...column,required:column.required&&!childOptional.has(column.key)}))};
childrenSchema.version=createHash('sha256').update(JSON.stringify({...childrenSchema,version:''})).digest('hex').slice(0,16);
const childrenPreview=youthPreview.replaceAll('Youth','Children Ministry').replace("EMPLOYMENT:'Work',",'').replace("EDUCATION:'Education',",'').replace("link.download='choir-person-360.csv'","link.download='children-person-360.csv'");
writeFileSync(new URL('../tools/google-forms/children-review.html',import.meta.url),childrenPreview.replace('__CHOIR_SCHEMA__',JSON.stringify(childrenSchema)).replace('__CHOIR_RUNTIME__',()=>runtime));
const legacyForms=JSON.parse(readFileSync(new URL('../tools/google-forms/created-unit-forms.json',import.meta.url),'utf8')) as Array<{id:string;editUrl:string}>;
const originalYouth=legacyForms.find(unit=>unit.id==='sys-youth')!;
let youthCreator=runtime.slice(0,runtime.indexOf('function choirReviewDate_'));
const marriageStart=youthCreator.indexOf("  page('Marriage');fields('MARRIAGE');");
const marriageEnd=youthCreator.indexOf('  startFamily.setChoices',marriageStart);
if(marriageStart<0||marriageEnd<0)throw new Error('Youth template transformation anchor missing');
youthCreator=youthCreator.slice(0,marriageStart)+youthCreator.slice(marriageEnd);
youthCreator=youthCreator.split('\n').filter(line=>!line.includes('widowed.setChoices')).join('\n')
  .replaceAll('createChoirReview','createYouthFormRevision').replaceAll('CHOIR_V2','YOUTH_TEMPLATE_SCHEMA')
  .replaceAll('MORIAH_CHOIR_REVIEW:','MORIAH_YOUTH_REVISED:')
  .replaceAll('Choir Person 360 — Revised template review','Youth Ministry — Person 360 registration · Revised')
  .replaceAll('Choir registration','Youth Ministry registration').replaceAll('Choir revised template — Review responses','Youth Ministry — Revised Person 360 responses')
  .replace('const form=FormApp.create(', 'const original=youthOriginalSnapshot_();\n  const form=FormApp.create(')
  .replace("items:{},version:YOUTH_TEMPLATE_SCHEMA.version", "items:{},original:original,version:YOUTH_TEMPLATE_SCHEMA.version")
  .replaceAll('CHOIR_REVIEW ','YOUTH_REVISION ');
const youthPure=runtime.slice(runtime.indexOf('function choirReviewDate_'),runtime.indexOf('function exportChoirReviewCsv')).replaceAll('CHOIR_V2','YOUTH_TEMPLATE_SCHEMA').replaceAll('choirReview','youth');
writeFileSync(new URL('../tools/google-forms/YouthTemplate.gs',import.meta.url),'// New unpublished Youth revision; preserves the original form and response sheet.\nconst YOUTH_ORIGINAL_FORM_ID = '+JSON.stringify(originalYouth.editUrl.split('/d/')[1].split('/')[0])+';\nconst YOUTH_TEMPLATE_SCHEMA = '+JSON.stringify(youthSchema,null,2)+';\n'+youthCreator+'\n'+youthPure+'\n'+readFileSync(new URL('../tools/google-forms/youth-template-runtime.gs',import.meta.url),'utf8'));
const rollout=readFileSync(new URL('../tools/google-forms/revised-unit-runtime.gs',import.meta.url),'utf8');
writeFileSync(new URL('../tools/google-forms/RevisedUnitForms.gs',import.meta.url),'// Add alongside the existing Code.gs. Leaves all originals intact.\nconst REVISED_EXPORT_UNIT_ID = \"\";\nconst CHOIR_V2 = '+JSON.stringify(schema,null,2)+';\n\n'+runtime+'\n'+rollout);
const existingForms=JSON.parse(readFileSync(new URL('../tools/google-forms/revised-unit-forms.json',import.meta.url),'utf8')) as Array<{id:string;name:string;editUrl:string}>;
const contactForms=existingForms.map(unit=>({...unit,formId:unit.editUrl.split('/d/')[1].split('/')[0],registryKey:'MORIAH_PERSON360_REVISED:044d5db099adcd2d:'+unit.id}));
const contactPure=runtime.slice(runtime.indexOf('function choirReviewDate_'),runtime.indexOf('function exportChoirReviewCsv')).replaceAll('CHOIR_V2','FAMILY_CONTACT_SCHEMA').replaceAll('choirReview','familyContact');
writeFileSync(new URL('../tools/google-forms/FamilyContactUpdate.gs',import.meta.url),'// Add this file alongside the existing saved Google scripts. Do not replace their registries.\nconst FAMILY_CONTACT_EXPORT_UNIT_ID = "";\nconst FAMILY_CONTACT_FORMS = '+JSON.stringify(contactForms,null,2)+';\nconst FAMILY_CONTACT_SCHEMA = '+JSON.stringify(schema,null,2)+';\n'+contactPure+'\n'+readFileSync(new URL('../tools/google-forms/family-contact-runtime.gs',import.meta.url),'utf8'));
const units=[...MINISTRY_KIT_ORGS.map(unit=>({id:unit.systemId,name:unit.orgName})),...SPECIAL_MINISTRY_ORGS.filter(unit=>unit.link).map(unit=>({id:unit.systemId,name:unit.orgName})),{id:CHOIR_PARENT_ORG.systemId,name:CHOIR_PARENT_ORG.name},...CHOIR_ORGS.map(unit=>({id:choirSystemId(unit.orgId),name:unit.name}))];
writeFileSync(new URL('../tools/google-forms/template-plan.json',import.meta.url),JSON.stringify(units.map(unit=>({...unit,familyRelations:schema.relations.filter(relation=>relation.code!=='SPOUSE'||!['sys-youth','sys-children','sys-choir-hope'].includes(unit.id)),familyContactFields:['phone','nationalId'],optionalBasicFields:unit.id==='sys-children'?[...childOptional]:[],education:!['sys-children','sys-music'].includes(unit.id),collect:unit.id!=='sys-music',profile:unit.id==='sys-music'?'AGGREGATED_FROM_CHOIRS':unit.id==='sys-children'?'CHILDREN':unit.id==='sys-youth'?'YOUTH':unit.id.startsWith('sys-choir')?'CHOIR':'ADULT_UNIT',work:unit.id!=='sys-children'&&unit.id!=='sys-music',marriage:!['sys-youth','sys-children','sys-music'].includes(unit.id),review:unit.id==='sys-youth'?'YOUTH_APPROVED_FOR_GOOGLE':unit.id==='sys-children'?'CHILDREN_REVIEW_PREPARED':['sys-choir-hope','sys-children','sys-music'].includes(unit.id)?'NOT_YET_REVISED':'APPROVED_FOR_ROLLOUT'})),null,2)+'\n');
console.log('Prepared choir review: DD-MM-YYYY, multiple callings and up to 20 family members. No Google calls made.');
