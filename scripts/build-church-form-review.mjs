import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../tools/google-forms/',import.meta.url);
const source=readFileSync(new URL('ChoirReview.gs',root),'utf8');
const start=source.indexOf('const CHOIR_V2 = ')+'const CHOIR_V2 = '.length;
const schema=JSON.parse(source.slice(start,source.indexOf(';\n\n',start)));
// One church questionnaire; retain the established English import headers/codes.
schema.columns=schema.columns.filter(col=>col.section!=='MARRIAGE'&&col.key!=='BAPTISM.baptisedBy');
schema.columns.find(col=>col.key==='EDUCATION.level').choices=schema.columns.find(col=>col.key==='EDUCATION.level').choices.filter(choice=>choice.code!=='OTHER');
const orgs=readFileSync(new URL('../../server/src/lib/ministryOrgs.ts',root),'utf8').split('export const CHOIR_ORGS = [')[1].split('] as const')[0];
schema.choirs=[...orgs.matchAll(/orgId: '([^']+)', name: ("[^"]+"|'[^']+')/g)].map(match=>({id:match[1],name:match[2].slice(1,-1)}));
if(!schema.choirs.length)throw Error('Choir register choices missing');
schema.callings=schema.callings.map(role=>role==='Teach Sunday school'?'Children ministry':role);
if(!schema.headers.includes('CONTACT'))schema.headers.push('CONTACT');
writeFileSync(new URL('church-schema.json',root),JSON.stringify(schema,null,2)+'\n');
console.log('Church-wide review schema prepared. No Google calls.');
