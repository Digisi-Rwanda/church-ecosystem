/** Creates exactly one unpublished review template. Existing unit forms are not modified. */
function createChoirReview() {
  const properties=PropertiesService.getScriptProperties();
  const property='MORIAH_CHOIR_REVIEW:'+CHOIR_V2.version;
  const prior=JSON.parse(properties.getProperty(property)||'null');
  if(prior) {
    if(prior.state!=='READY')throw new Error('The review form is unfinished. Inspect it before retrying.');
    console.log('CHOIR_REVIEW '+JSON.stringify(prior));return;
  }
  const form=FormApp.create('Choir Person 360 — Revised template review',false);
  const state={state:'CREATING',formId:form.getId(),items:{},version:CHOIR_V2.version};
  properties.setProperty(property,JSON.stringify(state));
  form.setTitle('Choir Person 360 — Revised template review').setDescription('Choir registration').setCollectEmail(false).setPublishingSummary(false).setProgressBar(false);
  const map=function(item,key){state.items[String(item.getId())]=key;return item;};
  const page=function(title){return form.addPageBreakItem().setTitle(title);};
  const fields=function(section){CHOIR_V2.columns.filter(function(column){return column.section===section && column.key!=='MARRIAGE.endedOn' && column.key!=='MARRIAGE.endedBy';}).forEach(function(column){
    const item=column.choices?form.addListItem():form.addTextItem();item.setTitle(column.question).setRequired(!!column.required);
    if(column.choices)item.setChoiceValues(column.choices.map(function(choice){return choice.label;}));
    else {
      const validation=FormApp.createTextValidation();
      if(column.type==='date'){item.setHelpText('DD-MM-YYYY');validation.requireTextMatchesPattern('^\\d{2}-\\d{2}-\\d{4}$').setHelpText('Use DD-MM-YYYY.');}
      else if(column.type==='email')validation.requireTextIsEmail();
      else if(column.type==='number')validation.requireTextMatchesPattern('^(19[3-9][0-9]|20[0-9]{2}|2100)$');
      else validation.requireTextLengthLessThanOrEqualTo(column.max||200);
      item.setValidation(validation.build());
    }
    map(item,column.key);
  });};
  form.addSectionHeaderItem().setTitle('About you');fields('BASICS');
  page('Work');fields('EMPLOYMENT');
  page('Education');fields('EDUCATION');
  page('Serving in the church');
  map(form.addCheckboxItem().setTitle('How do you serve in the church?').setChoiceValues(CHOIR_V2.callings).showOtherOption(true),'callings');
  page('Family');
  const startFamily=form.addMultipleChoiceItem().setTitle('Would you like to record a family member?').setRequired(true);
  const familyPages=[];const more=[];
  for(let index=0;index<CHOIR_V2.familyLimit;index++){
    familyPages.push(page('Family member '+(index+1)));
    map(form.addListItem().setTitle('How is this person related to you?').setChoiceValues(CHOIR_V2.relations.map(function(row){return row.label;})).setRequired(true),'family.'+index+'.relation');
    map(form.addTextItem().setTitle('What is this family member’s full name?').setRequired(true).setValidation(FormApp.createTextValidation().requireTextLengthLessThanOrEqualTo(120).build()),'family.'+index+'.name');
    map(form.addTextItem().setTitle('What is this family member’s date of birth?').setHelpText('DD-MM-YYYY').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\d{2}-\\d{2}-\\d{4}$').build()),'family.'+index+'.dateOfBirth');
    map(form.addListItem().setTitle('What is this family member’s gender?').setChoiceValues(['Male','Female']),'family.'+index+'.gender');
    ['phone','nationalId'].forEach(function(key){map(form.addTextItem().setTitle(key==='phone'?'What is this family member’s phone number?':'What is this family member’s National ID number?').setValidation(FormApp.createTextValidation().requireTextLengthLessThanOrEqualTo(30).build()),'family.'+index+'.'+key);});
    if(index<CHOIR_V2.familyLimit-1)more.push(form.addMultipleChoiceItem().setTitle('Add another family member?').setRequired(true));
  }
  const baptism=page('Baptism');fields('BAPTISM');
  page('Marriage');fields('MARRIAGE');
  const widowed=map(form.addMultipleChoiceItem().setTitle('Has your spouse passed away?').setRequired(true),'MARRIAGE.endedBy');
  const widowPage=page('Spouse’s passing');
  const ended=CHOIR_V2.columns.find(function(column){return column.key==='MARRIAGE.endedOn';});
  map(form.addTextItem().setTitle(ended.question).setHelpText('DD-MM-YYYY').setRequired(true).setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\d{2}-\\d{2}-\\d{4}$').build()),ended.key);
  startFamily.setChoices([startFamily.createChoice('Yes',familyPages[0]),startFamily.createChoice('No',baptism)]);
  more.forEach(function(item,index){item.setChoices([item.createChoice('Yes',familyPages[index+1]),item.createChoice('No',baptism)]);});
  widowed.setChoices([widowed.createChoice('Yes',widowPage),widowed.createChoice('No',FormApp.PageNavigationType.SUBMIT)]);
  const sheet=SpreadsheetApp.create('Choir revised template — Review responses');form.setDestination(FormApp.DestinationType.SPREADSHEET,sheet.getId());
  Object.assign(state,{state:'READY',editUrl:form.getEditUrl(),responderUrl:form.getPublishedUrl(),sheetUrl:sheet.getUrl()});properties.setProperty(property,JSON.stringify(state));
  console.log('CHOIR_REVIEW '+JSON.stringify(state));
}

function choirReviewDate_(raw){
  if(!raw)return '';
  const match=/^(\d{2})-(\d{2})-(\d{4})$/.exec(String(raw).trim());
  if(!match)throw new Error('Use DD-MM-YYYY.');
  const iso=match[3]+'-'+match[2]+'-'+match[1];const date=new Date(iso+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw new Error('Enter a real date.');
  return iso;
}

/** Converts form answers into the existing import contract; no database or Google calls. */
function choirReviewRow_(answers){
  const row={};
  CHOIR_V2.columns.forEach(function(column){
    let value=answers[column.key];if(value==null||String(value).trim()===''){if(column.required)throw new Error(column.question+' is required.');return;}
    if(typeof value!=='string')throw new Error('Expected text for '+column.header);
    value=value.trim();if(!value)return;
    if(column.choices){const choice=column.choices.find(function(item){return item.label===value||item.code===value;});if(!choice)throw new Error('Invalid choice for '+column.header);value=choice.code;}
    else if(column.type==='date')value=choirReviewDate_(value);
    else if(column.type==='number'&&(!/^\d{4}$/.test(value)||Number(value)<1930||Number(value)>2100))throw new Error('Enter a year from 1930 to 2100.');
    if(column.max&&value.length>column.max)throw new Error('Answer too long: '+column.header);
    row[column.header]=value;
  });
  if(!row['Full name'])throw new Error('Full name is required.');
  const choices=answers.callings||[];if(!Array.isArray(choices))throw new Error('Select one or more serving roles.');
  const callings=[...new Set(choices.map(function(value){return String(value).trim();}).filter(Boolean))];
  if(callings.some(function(value){return value.length>80||value==='Other';}))throw new Error('Name the other serving role (80 characters maximum).');
  row.CALLING=callings.length?JSON.stringify(callings.map(function(name){return {name:name};})):'';
  const family=[];
  for(let index=0;index<CHOIR_V2.familyLimit;index++){
    const prefix='family.'+index+'.';const name=String(answers[prefix+'name']||'').trim();const relation=String(answers[prefix+'relation']||'').trim();
    const dob=answers[prefix+'dateOfBirth'];const gender=answers[prefix+'gender'];
    const phone=String(answers[prefix+'phone']||'').trim(),nationalId=String(answers[prefix+'nationalId']||'').trim();
    if(!name&&!relation&&!dob&&!gender&&!phone&&!nationalId)continue;
    const rel=CHOIR_V2.relations.find(function(item){return item.code===relation||item.label===relation;});
    if(!name||name.length>120||!rel)throw new Error('Complete the name and relationship for family member '+(index+1)+'.');
    const member={name:name,relation:rel.code};
    if(phone.length>30||nationalId.length>30)throw new Error('Family phone and National ID must be 30 characters or fewer.');
    if(phone)member.phone=phone;if(nationalId)member.nationalId=nationalId;
    if(dob)member.dateOfBirth=choirReviewDate_(dob);
    if(gender){const code=String(gender).toUpperCase();if(['MALE','FEMALE'].indexOf(code)<0)throw new Error('Invalid family gender.');member.gender=code;}
    family.push(member);
  }
  row.FAMILY=family.length?JSON.stringify(family):'';
  if(row['Marriage - Marriage ended by']==='DEATH'){
    if(!row['Marriage - Date']||!row['Marriage - Marriage ended on'])throw new Error('Record the marriage date and spouse’s passing date.');
    if(row['Marriage - Marriage ended on']<row['Marriage - Date'])throw new Error('Spouse’s passing date precedes the marriage date.');
  }else{
    if(row['Marriage - Marriage ended on'])throw new Error('Select Yes if recording the spouse’s passing date.');
    delete row['Marriage - Marriage ended by'];
  }
  return row;
}

function choirReviewCsv_(answers){
  const rows=[CHOIR_V2.headers].concat(answers.map(function(answer){const row=choirReviewRow_(answer);return CHOIR_V2.headers.map(function(header){return row[header]||'';});}));
  return '\uFEFF'+rows.map(function(row){return row.map(function(value){return '"'+String(value).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n')+'\r\n';
}

function exportChoirReviewCsv(){
  const state=JSON.parse(PropertiesService.getScriptProperties().getProperty('MORIAH_CHOIR_REVIEW:'+CHOIR_V2.version)||'null');
  if(!state||state.state!=='READY')throw new Error('Create the choir review form first.');
  const form=FormApp.openById(state.formId);const responses=form.getResponses();if(!responses.length)throw new Error('No responses to export.');
  const rows=responses.map(function(response){const answers={};response.getItemResponses().forEach(function(item){const key=state.items[String(item.getItem().getId())];if(key)answers[key]=item.getResponse();});return answers;});
  const file=DriveApp.createFile('choir-revised-person-360.csv',choirCollectionCsv_(state,rows),'text/csv');console.log('CHOIR_CSV '+file.getUrl());
}

/** An older saved collection must not silently lose newly added family contact fields. */
function choirCollectionCsv_(state,rows){
  if(state.familyContactsReady){
    if(typeof familyContactCsv_!=='function')throw new Error('The family-contact exporter is required for this updated collection.');
    return familyContactCsv_(rows);
  }
  return choirReviewCsv_(rows);
}
