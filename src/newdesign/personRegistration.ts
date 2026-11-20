import type { P360Section } from '../api/frontDoorApi';
import { fieldsFor, SECTION_ORDER, type FieldDef } from './person360';

const SECTION_NAMES: Record<P360Section,string> = {CONTACT:'Contact',EMPLOYMENT:'Work',EDUCATION:'Education',CALLING:'Calling',FAMILY:'Family',BAPTISM:'Baptism',MARRIAGE:'Marriage'};
const LABELS: Record<string,string> = {date:'Date',label:'Label',value:'Value',status:'Situation',sector:'Sector',employer:'Employer',business:'Business',role:'Role',school:'School',field:'Field of study',since:'Since',level:'Level',startYear:'Start year',endYear:'End year',name:'Name',note:'Notes',phone:'Phone',nationalId:'National ID',relation:'Relationship',dateOfBirth:'Date of birth',gender:'Gender',place:'Place',baptisedBy:'Baptised by',spouseName:'Spouse name',blessedBy:'Blessed by',certificateRef:'Certificate reference',endedBy:'Marriage ended by',endedOn:'Marriage ended on'};

/** All fields that may appear after choosing a work situation, education level or family relationship. */
export function registrationFields(section:P360Section): FieldDef[] {
  const variants: Record<string,string>[] = [{},{status:'EMPLOYED'},{status:'SELF_EMPLOYED'},{status:'STUDENT'},{status:'UNEMPLOYED'},{status:'RETIRED'},{level:'BACHELOR'},{relation:'CHILD'},{endedBy:'DEATH'}];
  return [...new Map(variants.flatMap(values=>fieldsFor(section,values)).filter(field=>field.type!=='person' && field.type!=='unit').map(field=>[field.key,field])).values()];
}
export const PROFILE_COLUMNS = SECTION_ORDER.flatMap(section=>registrationFields(section).map(field=>({key:`${section}.${field.key}`,header:`${SECTION_NAMES[section]} - ${LABELS[field.key] ?? field.key}`,section,field})));
export const BASIC_COLUMNS = [{key:'fullName',header:'Full name'},{key:'preferredName',header:'Preferred name'},{key:'phone',header:'Phone'},{key:'email',header:'Email'},{key:'dateOfBirth',header:'Date of birth'},{key:'nationalId',header:'National ID'},{key:'gender',header:'Gender'},{key:'status',header:'Status'},{key:'joinedChurchOn',header:'Joined church on'},{key:'address',header:'Address'}];

export function peopleImportTemplate(write:P360Section[]): string {
  return '\uFEFF'+[...BASIC_COLUMNS,...PROFILE_COLUMNS.filter(column=>write.includes(column.section))].map(column=>column.header).join(',')+'\r\n';
}
