import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {T,choices,workQuestion} from '../tools/google-forms/church-registration.mjs';
const root=new URL('../tools/google-forms/',import.meta.url);
const schema=JSON.parse(readFileSync(new URL('church-schema.json',root),'utf8'));
const nodes=[];
const node=(id,title,next)=>{const n={id,title,questions:[],next};nodes.push(n);return n;};
const q=(n,key,title,{required=false,type='text',options,max=120}={})=>{const item={key,title,required,type,options,max};n.questions.push(item);return item;};
const col=(n,key,required=false)=>{const c=schema.columns.find(c=>c.key===key);if(!c)throw Error(key);return q(n,key,T[key].join('\n'),{required,type:c.type,max:c.max,options:c.choices?.map(o=>({code:o.code,label:o.label+' / '+choices[o.code]}))});};
const yesNo=(n,key,title,yes,no)=>q(n,key,title,{required:true,type:'branch',options:[{code:'YES',label:'Yes / Yego',go:yes},{code:'NO',label:'No / Oya',go:no}]});
const basics=node('about','About you / Umwirondoro','work');
schema.columns.filter(c=>c.section==='BASICS').forEach(c=>col(basics,c.key,!['phone','email','joinedChurchOn'].includes(c.key)));
const work=node('work','Work / Akazi');
const status=col(work,'EMPLOYMENT.status',true);status.type='branch';status.options.forEach(o=>o.go=({EMPLOYED:'employed',SELF_EMPLOYED:'self-employed',RETIRED:'retired'})[o.code]||'education');
for(const type of ['employed','self-employed']){
 const n=node(type,type==='employed'?'Employed / Mfite umukoresha':'Self-employed / Ndikorera');
 for(const key of type==='employed'?['employer','role','since']:['since'])col(n,'EMPLOYMENT.'+key,true);
 const sector=col(n,'EMPLOYMENT.sector',true);sector.type='branch';sector.options.forEach(o=>o.go=o.code==='BUSINESS'?'business':'education');
}
col(node('business','Business and trade / Ubucuruzi','education'),'EMPLOYMENT.business',true);
const retired=node('retired','Retired / Ikiruhuko cy’izabukuru','education');col(retired,'EMPLOYMENT.since',true).title=workQuestion('since','RETIRED').join('\n');
const education=node('education','Education / Amashuri');const level=col(education,'EDUCATION.level');level.required=true;level.type='branch';level.options.forEach(o=>o.go=o.code==='NONE'?'serving':o.code==='PRIMARY'?'primary':o.code==='SECONDARY_O'?'secondary-o':'advanced');
for(const type of ['primary','secondary-o','advanced']){
 const n=node(type,'Education details / Amakuru y’amashuri');
 if(type!=='primary')col(n,'EDUCATION.school');if(type==='advanced')col(n,'EDUCATION.field');col(n,'EDUCATION.startYear');
 yesNo(n,'studying','Are you still studying?\nUracyiga?','serving','education-finish');
}
col(node('education-finish','Education completion / Kurangiza amashuri','serving'),'EDUCATION.endYear');
const serving=node('serving','Serving in the church / Gukorera mu itorero');
const rolePairs=[['Evangelist','Umuvugabutumwa'],['Intercessor','Umwinginzi'],['Children ministry',"minisiteri y' abana"],['Deacon','Umudiyakoni'],['Protocol','Ushinzwe kwakira abantu'],['Instrumentalist','Umucuranzi'],['Media','Ufata amashusho'],['Youth ministry','Minisiteri y’urubyiruko'],['Men ministry','Minisiteri y’abagabo'],['Women ministry','Minisiteri y’abagore'],['Elderly ministry','Minisiteri y’abageze mu zabukuru'],['Family ministry','Minisiteri y’umuryango']];
q(serving,'callings','How do you serve in the church?\nUkora uwuhe murimo mu itorero?',{type:'checkbox',options:rolePairs.map(([code,rw])=>({code,label:code+' / '+rw}))});
yesNo(serving,'singer','Do you sing in a choir?\nUririmba muri korali?','choir','parents');
q(node('choir','Choir / Korali','parents'),'choir','Which choir do you sing in?\nUririmba muri iyihe korali?',{required:true,type:'select',options:schema.choirs.map(c=>({code:c.id,label:c.name}))});
const parents=node('parents','Family / Umuryango');
function familyFields(n,prefix,requiredContacts=false){q(n,prefix+'.name','Full name\nAmazina yose',{required:true});q(n,prefix+'.phone','Phone number\nNimero ya telefone',{required:requiredContacts,max:30});q(n,prefix+'.nationalId','National ID number\nNimero y’indangamuntu',{required:requiredContacts,max:30});}
q(parents,'father.name','Father’s full name / Amazina ya Papa wawe',{required:true});q(parents,'father.phone','Father’s phone number / Nimero ya telefone ya Papa wawe',{max:30});q(parents,'father.nationalId','Father’s National ID / Nimero y’indangamuntu ya Papa wawe',{max:30});
q(parents,'mother.name','Mother’s full name / Amazina ya Mama wawe',{required:true});q(parents,'mother.phone','Mother’s phone number / Nimero ya telefone ya Mama wawe',{max:30});q(parents,'mother.nationalId','Mother’s National ID / Nimero y’indangamuntu ya Mama wawe',{max:30});
yesNo(parents,'addSibling','Add a sibling?\nOngeraho uwo muvukana?','sibling-0','marriage');
for(const [kind,title,next] of [['sibling','Sibling / Uwo muvukana','marriage'],['child','Child / Umwana','baptism']]){
 for(let i=0;i<20;i++){const n=node(kind+'-'+i,title+' '+(i+1),i===19?next:undefined);familyFields(n,kind+'.'+i);if(i<19)yesNo(n,'more.'+kind+'.'+i,kind==='sibling'?'Add another sibling?\nOngeraho undi muvukana?':'Add another child?\nOngeraho undi mwana?',kind+'-'+(i+1),next);}
}
yesNo(node('marriage','Marriage / Gushyingirwa'),'married','Are you married?\nUrubatse?','spouse','children');
const spouse=node('spouse','Spouse / Uwo mwashakanye','children');
q(spouse,'spouseName','What is your spouse’s full name?\nAmazina yose y’uwo mwashakanye ni ayahe?',{required:true});q(spouse,'spousePhone','Phone number\nNimero ya telefone',{required:true,max:30});q(spouse,'spouseNationalId','National ID number\nNimero y’indangamuntu',{required:true,max:30});
yesNo(node('children','Children / Abana'),'hasChildren','Do you have children?\nUfite abana?','child-0','baptism');
yesNo(node('baptism','Baptism / Umubatizo'),'baptised','Are you baptised?\nWarabatijwe?','baptism-details','finish');
const baptism=node('baptism-details','Baptism details / Amakuru y’umubatizo');col(baptism,'BAPTISM.date',true);
q(baptism,'baptismChurch','Where were you baptised?\nWabatirijwe he?',{required:true,type:'branch',options:[{code:'ADEPR',label:'ADEPR',go:'adepr'},{code:'OTHER',label:'Other church / Irindi torero',go:'other-church'}]});
q(node('adepr','ADEPR'),'adeprCongregation','Which ADEPR congregation?\nNi uwuhe mudugudu wa ADEPR?',{required:true,type:'branch',options:[{code:'KACYIRU',label:'ADEPR Kacyiru',go:'finish'},{code:'OTHER',label:'Other ADEPR congregation / Undi mudugudu wa ADEPR',go:'other-adepr'}]});
const otherAdepr=node('other-adepr','Other ADEPR congregation / Undi mudugudu wa ADEPR','finish');q(otherAdepr,'otherAdepr','What is the ADEPR congregation’s name?\nIzina ry’umudugudu wa ADEPR ni irihe?',{required:true,max:110});yesNo(otherAdepr,'broughtRecommendation','Did you bring a recommendation letter?\nWazanye icyemezo cy’icyimuko?','finish','finish');
const otherChurch=node('other-church','Other church / Irindi torero','finish');q(otherChurch,'otherChurch','What is the church’s name?\nIzina ry’itorero ni irihe?',{required:true});yesNo(otherChurch,'receivedInAdepr','Have you been officially received in ADEPR?\nWarakiriwe muri ADEPR?','finish','finish');
node('finish','Review and submit / Suzuma maze wohereze');
const version=createHash('sha256').update(JSON.stringify(nodes)).digest('hex').slice(0,16);
const spec={version,title:'Church — Person 360 registration / Itorero — Kwandikisha amakuru y’umuntu',siblingLimit:20,childLimit:20,nodes};
writeFileSync(new URL('church-google-spec.json',root),JSON.stringify(spec,null,2)+'\n');
const pure=readFileSync(new URL('church-registration.mjs',root),'utf8').replaceAll('export ','');
const runtime=readFileSync(new URL('church-google-runtime.gs',root),'utf8');
writeFileSync(new URL('ChurchWideForm.gs',root),'// Add as a NEW Apps Script file. Creates only a new unpublished collection.\nconst MORIAH_CHURCH_WIDE = (function(){\nconst SPEC = '+JSON.stringify(spec)+';\nconst SCHEMA = '+JSON.stringify(schema)+';\n'+pure+'\n'+runtime+'\nreturn {create:create,verify:verify,exportCsv:exportCsv};\n})();\nfunction createChurchWideForm(){MORIAH_CHURCH_WIDE.create();}\nfunction verifyChurchWideForm(){MORIAH_CHURCH_WIDE.verify();}\nfunction exportChurchWideCsv(){MORIAH_CHURCH_WIDE.exportCsv();}\n');
console.log(JSON.stringify({version,sections:nodes.length,questions:nodes.reduce((sum,n)=>sum+n.questions.length,0)}));
