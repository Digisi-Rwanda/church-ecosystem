/** Build a standalone Apps Script without importing or executing any database/seed code. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASIC_COLUMNS, PROFILE_COLUMNS } from '../src/newdesign/personRegistration';
import { en } from '../src/i18n/messages/en';
import { CHOIR_ORGS, CHOIR_PARENT_ORG, choirSystemId, MINISTRY_KIT_ORGS, SPECIAL_MINISTRY_ORGS } from '../server/src/lib/ministryOrgs';

const units = [
  ...MINISTRY_KIT_ORGS.map(unit=>({id:unit.systemId,name:unit.orgName})),
  ...SPECIAL_MINISTRY_ORGS.filter(unit=>unit.link).map(unit=>({id:unit.systemId,name:unit.orgName})),
  {id:CHOIR_PARENT_ORG.systemId,name:CHOIR_PARENT_ORG.name},
  ...CHOIR_ORGS.map(unit=>({id:choirSystemId(unit.orgId),name:unit.name})),
];
const questions:Record<string,string> = {
  fullName:'What is your full name?',preferredName:'What name do you prefer to be called?',phone:'What is your phone number?',email:'What is your email address?',dateOfBirth:'What is your date of birth?',nationalId:'What is your National ID number?',gender:'What is your gender?',status:'What is your membership status?',joinedChurchOn:'When did you join the church?',address:'Where do you live?',
  'CONTACT.label':'Who or what is this additional contact?','CONTACT.value':'What is their phone number or address?',
  'EMPLOYMENT.status':'What is your current work situation?','EMPLOYMENT.sector':'Which field do you work in?','EMPLOYMENT.employer':'Who is your employer?','EMPLOYMENT.role':'What work do you do?','EMPLOYMENT.since':'When did this work situation begin?','EMPLOYMENT.business':'What business do you run?','EMPLOYMENT.school':'Where are you studying?','EMPLOYMENT.field':'What are you studying?',
  'EDUCATION.level':'What is your education level?','EDUCATION.field':'What is your field of study?','EDUCATION.school':'Which school or institution did you attend?','EDUCATION.startYear':'In which year did you start?','EDUCATION.endYear':'In which year did you finish?',
  'CALLING.name':'How do you serve in the church?','CALLING.since':'When did you begin serving?','CALLING.note':'What else should we know about this calling?',
  'FAMILY.relation':'How is this person related to you?','FAMILY.name':'What is this relative’s full name?','FAMILY.dateOfBirth':'What is this child’s date of birth?','FAMILY.gender':'What is this child’s gender?','FAMILY.note':'What else should we know about this family record?',
  'BAPTISM.date':'When were you baptised?','BAPTISM.place':'Where were you baptised?','BAPTISM.baptisedBy':'Who baptised you?',
  'MARRIAGE.date':'What is your marriage date?','MARRIAGE.spouseName':'What is your spouse’s full name?','MARRIAGE.place':'Where was the marriage held?','MARRIAGE.blessedBy':'Who blessed the marriage?','MARRIAGE.certificateRef':'What is the marriage certificate reference?','MARRIAGE.endedBy':'Has your spouse passed away?','MARRIAGE.endedOn':'When did your spouse pass away?',
};
const basics:Record<string,{type:string;options?:string[];max?:number}> = {
  fullName:{type:'text',max:120},preferredName:{type:'text',max:120},phone:{type:'text',max:30},email:{type:'email'},dateOfBirth:{type:'date'},nationalId:{type:'text',max:30},gender:{type:'select',options:['MALE','FEMALE']},status:{type:'select',options:['ACTIVE','INACTIVE','VISITOR']},joinedChurchOn:{type:'date'},address:{type:'text',max:200},
};
const label = (code:string) => (en as Record<string,string>)[`door.p360.v.${code}`] ?? (en as Record<string,string>)[`door.status.${code}`] ?? code;
const columns = [
  ...BASIC_COLUMNS.map(column=>({...column,section:'BASICS',...basics[column.key]})),
  // Preserve the original 43-question forms/export contract; revised forms use FAMILY JSON.
  ...PROFILE_COLUMNS.filter(column=>!['FAMILY.phone','FAMILY.nationalId'].includes(column.key)).map(column=>({key:column.key,header:column.header,section:column.section,type:column.field.type,max:column.field.max,options:column.field.options})),
].map(column=>({key:column.key,header:column.header,section:column.section,type:column.type,max:column.max,question:questions[column.key],choices:column.options?.map(code=>({code,label:column.key==='MARRIAGE.endedBy' ? 'Yes' : label(code)}))}));
if (columns.some(column=>!column.question)) throw new Error('Missing Google Form question');
const schema = {version:createHash('sha256').update(JSON.stringify(columns)).digest('hex').slice(0,16),columns};
const directory=fileURLToPath(new URL('../tools/google-forms/',import.meta.url));
mkdirSync(directory,{recursive:true});
const runtime=readFileSync(new URL('../tools/google-forms/runtime.gs',import.meta.url),'utf8');
writeFileSync(directory+'/Person360.gs',`// Generated from the current Person 360 template. Rebuild using scripts/build-person360-google-forms.ts.\n// Paste this entire file into a new standalone Google Apps Script project.\nconst UNITS = ${JSON.stringify(units,null,2)};\nconst EXPORT_UNIT_ID = ''; // Set this to exactly one unit ID before exporting.\nconst PERSON360_SCHEMA = ${JSON.stringify(schema,null,2)};\n\n${runtime}`);
writeFileSync(directory+'/units.json',JSON.stringify(units,null,2)+'\n');
console.log(`Prepared ${units.length} English unit forms with ${columns.length} template-matched questions each. No Google or database calls made.`);
