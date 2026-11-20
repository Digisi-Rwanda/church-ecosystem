// Review-only questionnaire. No submissions, Google calls or persistence.
export const T = {
  fullName:['What is your full name?','Amazina yawe yose ni ayahe?'],
  preferredName:['What name do you prefer to be called?','Wifuza ko bakwita irihe zina?'],
  phone:['What is your phone number?','Nimero ya telefone yawe ni iyihe?'],
  email:['What is your email address?','Aderesi ya imeli yawe ni iyihe?'],
  dateOfBirth:['What is your date of birth?','Wavutse ryari?'],
  nationalId:['What is your National ID number?','Nimero y’indangamuntu yawe ni iyihe?'],
  gender:['What is your gender?','Igitsina cyawe ni ikihe?'],
  joinedChurchOn:['When did you join the church?','Winjiye mu itorero ryari?'],
  address:['Where do you live?','Utuye he?'],
  'EMPLOYMENT.status':['What is your current work situation?','Ubu ukora iki?'],
  'EMPLOYMENT.sector':['Which field do you work in?','Ukora mu ruhe rwego?'],
  'EMPLOYMENT.employer':['Which organisation employs you?','Ni ikihe kigo kigukoresha?'],
  'EMPLOYMENT.role':["What’s your job title/role?",'Icyo ushinzwe mu kazi?'],
  'EMPLOYMENT.business':['What business do you run?','Ukora ubuhe bucuruzi cyangwa mwuga?'],
  'EMPLOYMENT.since':['When did this work begin?','Watangiye uyu murimo ryari?'],
  'EDUCATION.level':['What is your education level?','Amashuri wize ni ayahe?'],
  'EDUCATION.school':['Where did you study?','Wize he?'],
  'EDUCATION.field':['What did you study?','Wize iki?'],
  'EDUCATION.startYear':['In which year did you start?','Watangiye mu wuhe mwaka?'],
  'EDUCATION.endYear':['In which year did you finish?','Warangije mu wuhe mwaka?'],
  'BAPTISM.date':['When were you baptised?','Wabatijwe ryari?'],
  'BAPTISM.place':['Where were you baptised?','Wabatirijwe he?'],
  'BAPTISM.baptisedBy':['Who baptised you?','Ni nde wakubatije?'],
};
export const choices = {
  MALE:'Gabo', FEMALE:'Gore', EMPLOYED:'Mfite umukoresha', SELF_EMPLOYED:'Ndikorera',
  STUDENT:'Ndi umunyeshuri', UNEMPLOYED:'Ndashaka akazi', RETIRED:'Ndi mu kiruhuko cy’izabukuru',
  FINANCE:'Imari', EDUCATION:'Uburezi', HEALTH:'Ubuzima', AGRICULTURE:'Ubuhinzi', TECHNOLOGY:'Ikoranabuhanga', BUSINESS:'Ubucuruzi', CONSTRUCTION:'Ubwubatsi', TRANSPORT:'Ubwikorezi', GOVERNMENT:'Leta', CHURCH:'Itorero', OTHER:'Ibindi',
  NONE:'Nta mashuri', PRIMARY:'Amashuri abanza', SECONDARY:'Amashuri yisumbuye', SECONDARY_O:'Icyiciro rusange cy’amashuri yisumbuye', SECONDARY_A:'Icyiciro cya kabiri cy’amashuri yisumbuye', ASSOCIATE:'Amashuri makuru y’imyuga', VOCATIONAL:'Amashuri y’imyuga', DIPLOMA:'Impamyabumenyi', BACHELOR:'Icyiciro cya mbere cya kaminuza', MASTER:'Icyiciro cya kabiri cya kaminuza', DOCTORATE:'Impamyabumenyi y’ikirenga',
};
export function workFields(status,sector) {
  if(status==='RETIRED')return ['since'];
  return status==='EMPLOYED'?['sector','employer','role','since',...(sector==='BUSINESS'?['business']:[])]:status==='SELF_EMPLOYED'?['sector','since',...(sector==='BUSINESS'?['business']:[])]:[];
}
export function workQuestion(key,status){
  if(status!=='RETIRED')return T['EMPLOYMENT.'+key];
  return ({since:['Since when have you been retired?','Wagiye mu kiruhuko cy’izabukuru ryari?'],sector:['In which field did you work?','Wakoraga mu ruhe rwego?'],employer:['Which organisation employed you?','Ni ikihe kigo cyagukoresheje?'],business:['What business did you run?','Wakoraga ubuhe bucuruzi?'],role:['What was your job title/role?','Wari ushinzwe iki mu kazi?']})[key];
}
export function educationFields(level,studying) {
  if(!level||level==='NONE')return [];
  return [...(!['PRIMARY'].includes(level)?['school']:[]),...(!['PRIMARY','SECONDARY_O'].includes(level)?['field']:[]),'startYear',...(studying==='NO'?['endYear']:[])];
}
export function dateValue(value) {
  const match=/^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if(!match)throw new Error('Use DD-MM-YYYY / Koresha DD-MM-YYYY.');
  const iso=`${match[3]}-${match[2]}-${match[1]}`, date=new Date(iso+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw new Error('Enter a real date / Andika itariki ibaho.');
  return iso;
}
export function registrationRow(schema, answers, members) {
  const row={};
  for(const col of schema.columns) {
    if(col.section==='MARRIAGE')continue;
    const work=workFields(answers['EMPLOYMENT.status'],answers['EMPLOYMENT.sector']);
    if(col.section==='EMPLOYMENT'&&col.key!=='EMPLOYMENT.status'&&!work.includes(col.key.split('.')[1]))continue;
    if(col.section==='BAPTISM'&&answers.baptised!=='YES')continue;
    if(col.section==='EDUCATION'&&col.key!=='EDUCATION.level'&&!educationFields(answers['EDUCATION.level'],answers.studying).includes(col.key.split('.')[1]))continue;
    if(col.key==='BAPTISM.place')continue;
    const required=col.section==='BASICS'&&!['phone','email','joinedChurchOn'].includes(col.key)
      ||col.key==='EMPLOYMENT.status'||col.section==='BAPTISM'||col.section==='EMPLOYMENT'&&work.length>0;
    let value=String(answers[col.key]||'').trim();
    if(!value){if(required)throw new Error((T[col.key]||[col.question]).join(' / '));continue;}
    if(col.max&&value.length>col.max)throw new Error('Answer too long / Igisubizo ni kirekire cyane.');
    if(col.choices&&!col.choices.some(c=>c.code===value))throw new Error('Choose an available answer / Hitamo igisubizo kiri ku rutonde.');
    if(col.type==='date')value=dateValue(value);
    if(col.type==='number'&&(!/^\d{4}$/.test(value)||+value<1930||+value>2100))throw new Error('Enter a valid year / Andika umwaka ukwiye.');
    row[col.header]=value;
  }
  for(const key of ['married','hasChildren','baptised'])if(!['YES','NO'].includes(answers[key]))throw new Error('Answer Yes or No / Subiza Yego cyangwa Oya.');
  const contacts=[];
  // The current importer strips these fields for these work statuses.
  if(answers['EMPLOYMENT.status']==='EMPLOYED'&&row['Work - Business']){
    contacts.push({label:'Work - Business and trade activity',value:row['Work - Business']});delete row['Work - Business'];
  }
  if(answers['EDUCATION.level']&&answers['EDUCATION.level']!=='NONE'){
    if(!['YES','NO'].includes(answers.studying))throw new Error('Are you still studying? / Uracyiga?');
    contacts.push({label:'Education - Still studying',value:answers.studying==='YES'?'Yes':'No'});
  }
  if(row['Education - Start year']&&row['Education - End year']&&+row['Education - End year']<+row['Education - Start year'])throw new Error('Check education years / Reba imyaka y’amashuri.');
  if(answers.baptised==='YES'){
    if(!['ADEPR','OTHER'].includes(answers.baptismChurch))throw new Error('Choose baptism church / Hitamo aho wabatirijwe.');
    if(answers.baptismChurch==='ADEPR'){
      if(!['KACYIRU','OTHER'].includes(answers.adeprCongregation))throw new Error('Choose the ADEPR congregation / Hitamo umudugudu wa ADEPR.');
      if(answers.adeprCongregation==='KACYIRU')row['Baptism - Place']='ADEPR Kacyiru';
      else{
        const name=String(answers.otherAdepr||'').trim();
        if(!name||name.length>110)throw new Error('Name the ADEPR congregation / Andika izina ry’umudugudu wa ADEPR.');
        if(!['YES','NO'].includes(answers.broughtRecommendation))throw new Error('Did you bring a recommendation letter? / Wazanye icyemezo cy’icyimuko?');
        row['Baptism - Place']='ADEPR '+name;
        contacts.push({label:'Baptism - Recommendation letter brought',value:answers.broughtRecommendation==='YES'?'Yes':'No'});
      }
    }
    else{
      const name=String(answers.otherChurch||'').trim();
      if(!name||name.length>120)throw new Error('Name the church / Andika izina ry’itorero.');
      if(!['YES','NO'].includes(answers.receivedInAdepr))throw new Error('Have you been officially received in ADEPR? / Warakiriwe muri ADEPR?');
      row['Baptism - Place']=name;
      contacts.push({label:'Baptism - Officially received in ADEPR',value:answers.receivedInAdepr==='YES'?'Yes':'No'});
    }
  }
  row.CONTACT=contacts.length?JSON.stringify(contacts):'';
  const family=[];
  function member(relation, value, gender) {
    const name=String(value.name||'').trim();
    if(!name||name.length>120)throw new Error('Enter the family member’s full name / Andika amazina yose y’uwo mu muryango.');
    const item={relation,name,...(gender?{gender}:{})};
    for(const key of ['phone','nationalId']){const val=String(value[key]||'').trim();if(val.length>30)throw new Error('Phone / ID: maximum 30 characters.');if(val)item[key]=val;}
    family.push(item);
  }
  member('PARENT',members.father||{},'MALE');member('PARENT',members.mother||{},'FEMALE');
  for(const sibling of members.siblings||[])member('SIBLING',sibling);
  if(answers.married==='YES'){
    for(const key of ['spousePhone','spouseNationalId'])if(!String(answers[key]||'').trim())throw new Error('Spouse phone and National ID are required / Telefone n’indangamuntu by’uwo mwashakanye birakenewe.');
    member('SPOUSE',{name:answers.spouseName,phone:answers.spousePhone,nationalId:answers.spouseNationalId});
  }
  if(answers.hasChildren==='YES') {
    if(!members.children?.length)throw new Error('Add a child / Ongeraho umwana.');
    for(const child of members.children)member('CHILD',child);
  }
  row.FAMILY=JSON.stringify(family);
  const roles=[...new Set(answers.callings||[])];
  if(roles.some(name=>!String(name).trim()||name.length>80))throw new Error('Check serving roles / Reba imirimo ukora mu itorero.');
  const choir=roles.includes('Singer')?schema.choirs.find(choir=>choir.id===answers.choir):null;
  if(roles.includes('Singer')&&!choir)throw new Error('Choose your choir / Hitamo korali yawe.');
  row.CALLING=roles.length?JSON.stringify(roles.map(name=>({name,...(name==='Singer'?{note:'Choir / Korali: '+choir.name}:{})}))):'';
  return row;
}
export function csv(schema,row) {
  // Keep all collected answers on the page rather than exporting a known-invalid import.
  const records=['CALLING','FAMILY','CONTACT'].reduce((sum,key)=>sum+(row[key]?JSON.parse(row[key]).length:0),0)
    +['EMPLOYMENT','EDUCATION','BAPTISM'].filter(section=>schema.columns.some(c=>c.section===section&&row[c.header])).length;
  if(records>50)throw new Error('Your answers are still on this page. This profile exceeds the current import limit of 50 records; ask the administrator before importing. / Ibisubizo biracyari kuri iyi paji. Aya makuru arenze urugero rwa 50 rwemewe mu kwinjiza amakuru; banza ubaze umuyobozi.');
  const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  return '\uFEFF'+[schema.headers,schema.headers.map(key=>row[key]||'')].map(line=>line.map(quote).join(',')).join('\r\n')+'\r\n';
}
