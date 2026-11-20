// Add alongside the existing Code.gs. Leaves all originals intact.
const REVISED_EXPORT_UNIT_ID = "";
const CHOIR_V2 = {
  "version": "09a60d1e5c633e2b",
  "columns": [
    {
      "key": "fullName",
      "header": "Full name",
      "section": "BASICS",
      "type": "text",
      "max": 120,
      "question": "What is your full name?",
      "required": true
    },
    {
      "key": "preferredName",
      "header": "Preferred name",
      "section": "BASICS",
      "type": "text",
      "max": 120,
      "question": "What name do you prefer to be called?",
      "required": true
    },
    {
      "key": "phone",
      "header": "Phone",
      "section": "BASICS",
      "type": "text",
      "max": 30,
      "question": "What is your phone number?",
      "required": true
    },
    {
      "key": "email",
      "header": "Email",
      "section": "BASICS",
      "type": "email",
      "question": "What is your email address?",
      "required": true
    },
    {
      "key": "dateOfBirth",
      "header": "Date of birth",
      "section": "BASICS",
      "type": "date",
      "question": "What is your date of birth?",
      "required": true
    },
    {
      "key": "nationalId",
      "header": "National ID",
      "section": "BASICS",
      "type": "text",
      "max": 30,
      "question": "What is your National ID number?",
      "required": true
    },
    {
      "key": "gender",
      "header": "Gender",
      "section": "BASICS",
      "type": "select",
      "question": "What is your gender?",
      "choices": [
        {
          "code": "MALE",
          "label": "Male"
        },
        {
          "code": "FEMALE",
          "label": "Female"
        }
      ],
      "required": true
    },
    {
      "key": "joinedChurchOn",
      "header": "Joined church on",
      "section": "BASICS",
      "type": "date",
      "question": "When did you join the church?",
      "required": true
    },
    {
      "key": "address",
      "header": "Address",
      "section": "BASICS",
      "type": "text",
      "max": 200,
      "question": "Where do you live?",
      "required": true
    },
    {
      "key": "EMPLOYMENT.status",
      "header": "Work - Situation",
      "section": "EMPLOYMENT",
      "type": "select",
      "question": "What is your current work situation?",
      "choices": [
        {
          "code": "EMPLOYED",
          "label": "Employed"
        },
        {
          "code": "SELF_EMPLOYED",
          "label": "Self-employed"
        },
        {
          "code": "STUDENT",
          "label": "Student"
        },
        {
          "code": "UNEMPLOYED",
          "label": "Looking for work"
        },
        {
          "code": "RETIRED",
          "label": "Retired"
        }
      ],
      "required": false
    },
    {
      "key": "EMPLOYMENT.sector",
      "header": "Work - Sector",
      "section": "EMPLOYMENT",
      "type": "select",
      "question": "Which field do you work in?",
      "choices": [
        {
          "code": "FINANCE",
          "label": "Finance"
        },
        {
          "code": "EDUCATION",
          "label": "Education"
        },
        {
          "code": "HEALTH",
          "label": "Health"
        },
        {
          "code": "AGRICULTURE",
          "label": "Agriculture"
        },
        {
          "code": "TECHNOLOGY",
          "label": "Technology"
        },
        {
          "code": "BUSINESS",
          "label": "Business and trade"
        },
        {
          "code": "CONSTRUCTION",
          "label": "Construction"
        },
        {
          "code": "TRANSPORT",
          "label": "Transport"
        },
        {
          "code": "GOVERNMENT",
          "label": "Government"
        },
        {
          "code": "CHURCH",
          "label": "Church or ministry"
        },
        {
          "code": "OTHER",
          "label": "Other"
        }
      ],
      "required": false
    },
    {
      "key": "EMPLOYMENT.employer",
      "header": "Work - Employer",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "Who is your employer?",
      "required": false
    },
    {
      "key": "EMPLOYMENT.role",
      "header": "Work - Role",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "What's your job title/role?",
      "required": false
    },
    {
      "key": "EMPLOYMENT.since",
      "header": "Work - Since",
      "section": "EMPLOYMENT",
      "type": "date",
      "question": "When did this work begin?",
      "required": false
    },
    {
      "key": "EMPLOYMENT.business",
      "header": "Work - Business",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "What business do you run?",
      "required": false
    },
    {
      "key": "EDUCATION.level",
      "header": "Education - Level",
      "section": "EDUCATION",
      "type": "select",
      "question": "What is your education level?",
      "choices": [
        {
          "code": "NONE",
          "label": "None"
        },
        {
          "code": "PRIMARY",
          "label": "Primary"
        },
        {
          "code": "SECONDARY_O",
          "label": "Secondary (O' Level)"
        },
        {
          "code": "SECONDARY_A",
          "label": "Secondary (A' Level)"
        },
        {
          "code": "ASSOCIATE",
          "label": "Associate Degree / Vocational"
        },
        {
          "code": "BACHELOR",
          "label": "Bachelor's Degree"
        },
        {
          "code": "MASTER",
          "label": "Master's Degree"
        },
        {
          "code": "DOCTORATE",
          "label": "Doctorate Degree"
        },
        {
          "code": "OTHER",
          "label": "Other"
        }
      ],
      "required": false
    },
    {
      "key": "EDUCATION.field",
      "header": "Education - Field of study",
      "section": "EDUCATION",
      "type": "text",
      "max": 120,
      "question": "What is your field of study?",
      "required": false
    },
    {
      "key": "EDUCATION.school",
      "header": "Education - School",
      "section": "EDUCATION",
      "type": "text",
      "max": 120,
      "question": "Which school or institution did you attend?",
      "required": false
    },
    {
      "key": "EDUCATION.startYear",
      "header": "Education - Start year",
      "section": "EDUCATION",
      "type": "number",
      "question": "In which year did you start?",
      "required": false
    },
    {
      "key": "EDUCATION.endYear",
      "header": "Education - End year",
      "section": "EDUCATION",
      "type": "number",
      "question": "In which year did you finish?",
      "required": false
    },
    {
      "key": "BAPTISM.date",
      "header": "Baptism - Date",
      "section": "BAPTISM",
      "type": "date",
      "question": "When were you baptised?",
      "required": false
    },
    {
      "key": "BAPTISM.place",
      "header": "Baptism - Place",
      "section": "BAPTISM",
      "type": "text",
      "max": 120,
      "question": "Where were you baptised?",
      "required": false
    },
    {
      "key": "BAPTISM.baptisedBy",
      "header": "Baptism - Baptised by",
      "section": "BAPTISM",
      "type": "text",
      "max": 120,
      "question": "Who baptised you?",
      "required": false
    },
    {
      "key": "MARRIAGE.date",
      "header": "Marriage - Date",
      "section": "MARRIAGE",
      "type": "date",
      "question": "What is your marriage date?",
      "required": false
    },
    {
      "key": "MARRIAGE.spouseName",
      "header": "Marriage - Spouse name",
      "section": "MARRIAGE",
      "type": "text",
      "max": 120,
      "question": "What is your spouse’s full name?",
      "required": false
    },
    {
      "key": "MARRIAGE.place",
      "header": "Marriage - Place",
      "section": "MARRIAGE",
      "type": "text",
      "max": 120,
      "question": "Where was the marriage held?",
      "required": false
    },
    {
      "key": "MARRIAGE.blessedBy",
      "header": "Marriage - Blessed by",
      "section": "MARRIAGE",
      "type": "text",
      "max": 120,
      "question": "Who blessed the marriage?",
      "required": false
    },
    {
      "key": "MARRIAGE.certificateRef",
      "header": "Marriage - Certificate reference",
      "section": "MARRIAGE",
      "type": "text",
      "max": 80,
      "question": "What is the marriage certificate reference?",
      "required": false
    },
    {
      "key": "MARRIAGE.endedBy",
      "header": "Marriage - Marriage ended by",
      "section": "MARRIAGE",
      "type": "select",
      "question": "Has your spouse passed away?",
      "choices": [
        {
          "code": "DEATH",
          "label": "Yes"
        },
        {
          "code": "",
          "label": "No"
        }
      ],
      "required": false
    },
    {
      "key": "MARRIAGE.endedOn",
      "header": "Marriage - Marriage ended on",
      "section": "MARRIAGE",
      "type": "date",
      "question": "If yes, when did your spouse pass away?",
      "required": false
    }
  ],
  "headers": [
    "Full name",
    "Preferred name",
    "Phone",
    "Email",
    "Date of birth",
    "National ID",
    "Gender",
    "Status",
    "Joined church on",
    "Address",
    "Contact - Label",
    "Contact - Value",
    "Work - Situation",
    "Work - Sector",
    "Work - Employer",
    "Work - Role",
    "Work - Since",
    "Work - Business",
    "Work - School",
    "Work - Field of study",
    "Education - Level",
    "Education - Field of study",
    "Education - School",
    "Education - Start year",
    "Education - End year",
    "Calling - Name",
    "Calling - Since",
    "Calling - Notes",
    "Family - Relationship",
    "Family - Name",
    "Family - Phone",
    "Family - National ID",
    "Family - Date of birth",
    "Family - Gender",
    "Family - Notes",
    "Baptism - Date",
    "Baptism - Place",
    "Baptism - Baptised by",
    "Marriage - Date",
    "Marriage - Spouse name",
    "Marriage - Place",
    "Marriage - Blessed by",
    "Marriage - Certificate reference",
    "Marriage - Marriage ended by",
    "Marriage - Marriage ended on",
    "CALLING",
    "FAMILY"
  ],
  "callings": [
    "Evangelist",
    "Intercessor",
    "Teach Sunday school",
    "Deacon",
    "Protocol",
    "Singer",
    "Instrumentalist",
    "Media"
  ],
  "familyLimit": 20,
  "relations": [
    {
      "code": "SPOUSE",
      "label": "Spouse"
    },
    {
      "code": "PARENT",
      "label": "Parent"
    },
    {
      "code": "CHILD",
      "label": "Child"
    },
    {
      "code": "SIBLING",
      "label": "Brother or sister"
    },
    {
      "code": "GUARDIAN",
      "label": "Guardian"
    },
    {
      "code": "OTHER",
      "label": "Other"
    }
  ]
};

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

/** New versions only: original forms, responses and destinations remain untouched. */
function revisedUnitKey_(id){return 'MORIAH_PERSON360_REVISED:'+CHOIR_V2.version+':'+id;}
function revisedUnits_(){return UNITS.filter(function(unit){return ['sys-choir-hope','sys-children','sys-youth','sys-music'].indexOf(unit.id)<0;});}
function revisedStructure_(form){return form.getItems().map(function(item){
  const type=item.getType(),row={id:String(item.getId()),type:String(type),title:item.getTitle()};
  if(type===FormApp.ItemType.MULTIPLE_CHOICE)row.routes=item.asMultipleChoiceItem().getChoices().map(function(choice){const page=choice.getGotoPage();return {label:choice.getValue(),to:page?page.getIndex():String(choice.getPageNavigationType())};});
  return row;
});}
/** Cache the immutable version's master structure; every copy is still compared to it. */
function revisedMasterStructure_(form){
  const props=PropertiesService.getScriptProperties(),key='MORIAH_REVISED_MASTER:'+CHOIR_V2.version;
  const count=Number(props.getProperty(key)||0);
  if(count){let json='';for(let index=0;index<count;index++)json+=props.getProperty(key+':'+index);return JSON.parse(json);}
  const structure=revisedStructure_(form),json=JSON.stringify(structure),chunks=Math.ceil(json.length/6000);
  for(let index=0;index<chunks;index++)props.setProperty(key+':'+index,json.slice(index*6000,(index+1)*6000));
  props.setProperty(key,String(chunks));return structure;
}
function revisedOriginal_(unit){
  const legacy=JSON.parse(PropertiesService.getScriptProperties().getProperty('MORIAH_PERSON360_UNIT:'+unit.id)||'null');
  if(!legacy||legacy.state!=='READY')throw new Error('Original form registry missing: '+unit.id);
  const form=FormApp.openById(legacy.formId);
  return {formId:legacy.formId,destination:form.getDestinationId(),responses:form.getResponses().length,published:form.isPublished(),structure:Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(revisedStructure_(form))))};
}
function createRevisedUnitForms(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw new Error('Another setup is running.');
  try{
    const props=PropertiesService.getScriptProperties(),started=Date.now();
    const template=JSON.parse(props.getProperty('MORIAH_CHOIR_REVIEW:'+CHOIR_V2.version)||'null');
    if(!template||template.state!=='READY')throw new Error('Run createChoirReview first.');
    const source=FormApp.openById(template.formId),sourceStructure=revisedMasterStructure_(source);
    if(source.isPublished()||source.getResponses().length)throw new Error('Review template must remain unpublished and unanswered.');
    let created=0;
    for(const unit of revisedUnits_()){
      const key=revisedUnitKey_(unit.id);let state=JSON.parse(props.getProperty(key)||'null');
      if(state&&state.state==='READY')continue;
      if(Date.now()-started>180000)break;
      const title=unit.name+' — Person 360 registration · Revised';
      if(!state){
        const original=revisedOriginal_(unit);
        const file=DriveApp.getFileById(template.formId).makeCopy(title);
        state={state:'CREATING',formId:file.getId(),version:CHOIR_V2.version,original:original,items:{}};
        props.setProperty(key,JSON.stringify(state));
      }
      const form=FormApp.openById(state.formId);
      if(form.getResponses().length||form.isPublished())throw new Error('Revised form was published or answered; inspect '+unit.id);
      form.setPublished(false).setTitle(title).setDescription('Person 360 registration — '+unit.name).setProgressBar(false).setCollectEmail(false).setPublishingSummary(false).setShuffleQuestions(false);
      const structure=revisedStructure_(form);
      if(structure.length!==sourceStructure.length||structure.some(function(row,index){const expected=sourceStructure[index];return row.type!==expected.type||row.title!==expected.title||JSON.stringify(row.routes)!==JSON.stringify(expected.routes);}))throw new Error('Copied question or family navigation differs: '+unit.id);
      state.items={};structure.forEach(function(item,index){const field=template.items[sourceStructure[index].id];if(field)state.items[item.id]=field;});
      // Save a freshly allocated destination before attaching it, so retries never duplicate it.
      if(!state.sheetId){const sheet=SpreadsheetApp.create(unit.name+' — Revised Person 360 responses');state.sheetId=sheet.getId();state.sheetUrl=sheet.getUrl();props.setProperty(key,JSON.stringify(state));}
      if(state.sheetId===source.getDestinationId()||state.sheetId===state.original.destination)throw new Error('Response destination must be separate.');
      form.setDestination(FormApp.DestinationType.SPREADSHEET,state.sheetId);
      Object.assign(state,{state:'READY',editUrl:form.getEditUrl(),responderUrl:form.getPublishedUrl()});props.setProperty(key,JSON.stringify(state));
      console.log('REVISED_CREATED '+JSON.stringify({id:unit.id,name:unit.name,editUrl:state.editUrl,sheetUrl:state.sheetUrl}));created++;
    }
    console.log('REVISED_BATCH '+JSON.stringify({created:created,ready:revisedUnits_().filter(function(unit){const state=JSON.parse(props.getProperty(revisedUnitKey_(unit.id))||'null');return state&&state.state==='READY';}).length,expected:revisedUnits_().length}));
  }finally{lock.releaseLock();}
}
function verifyRevisedUnitForms(){
  const props=PropertiesService.getScriptProperties(),started=Date.now();let ready=0;const sheets=[],reports=[];
  const runKey='MORIAH_REVISED_VERIFICATION_RUN:'+CHOIR_V2.version;
  let run=JSON.parse(props.getProperty(runKey)||'null');
  if(!run||run.complete){run={id:new Date().toISOString(),complete:false};props.setProperty(runKey,JSON.stringify(run));}
  const template=JSON.parse(props.getProperty('MORIAH_CHOIR_REVIEW:'+CHOIR_V2.version)||'null');
  const expected=revisedMasterStructure_(FormApp.openById(template.formId));
  for(const unit of revisedUnits_()){
    const verifiedKey='MORIAH_REVISED_VERIFIED:'+CHOIR_V2.version+':'+unit.id;
    const cached=JSON.parse(props.getProperty(verifiedKey)||'null');
    if(cached&&cached.verificationRun===run.id){reports.push(cached);sheets.push(cached.sheetId);ready++;continue;}
    if(Date.now()-started>180000)break;
    const state=JSON.parse(props.getProperty(revisedUnitKey_(unit.id))||'null');if(!state||state.state!=='READY')throw new Error('Not ready: '+unit.id);
    const form=FormApp.openById(state.formId),structure=revisedStructure_(form),original=revisedOriginal_(unit);
    const originalUnchanged=original.formId===state.original.formId&&original.destination===state.original.destination&&original.structure===state.original.structure&&original.responses>=state.original.responses&&original.published===state.original.published;
    const matches=structure.length===expected.length&&structure.every(function(row,index){return row.title===expected[index].title&&row.type===expected[index].type&&JSON.stringify(row.routes)===JSON.stringify(expected[index].routes);});
    const allItems=form.getItems();
    const requiredBasics=structure.filter(function(item,index){const column=CHOIR_V2.columns.find(function(column){return column.key===state.items[item.id];});return column&&column.section==='BASICS'&&(item.type==='LIST'?allItems[index].asListItem().isRequired():allItems[index].asTextItem().isRequired());}).length;
    const report={id:unit.id,name:unit.name,title:form.getTitle(),published:form.isPublished(),responses:form.getResponses().length,questions:structure.filter(function(item){return ['TEXT','LIST','CHECKBOX','MULTIPLE_CHOICE'].indexOf(item.type)>=0;}).length,requiredBasics:requiredBasics,navigationMatches:matches,originalUnchanged:originalUnchanged,originalResponses:original.responses,sheetId:form.getDestinationId(),editUrl:form.getEditUrl(),responderUrl:form.getPublishedUrl(),sheetUrl:state.sheetUrl};
    console.log('REVISED_REPORT '+JSON.stringify(report));
    if(report.published||!matches||!originalUnchanged||requiredBasics!==9||report.sheetId!==state.sheetId)throw new Error('Verification failed: '+unit.id);
    report.verifiedAt=new Date().toISOString();report.verificationRun=run.id;props.setProperty(verifiedKey,JSON.stringify(report));reports.push(report);ready++;sheets.push(report.sheetId);
  }
  if(new Set(sheets).size!==ready)throw new Error('Shared response destination detected.');
  if(ready!==revisedUnits_().length){console.log('REVISED_VERIFY_BATCH '+JSON.stringify({ready:ready,expected:revisedUnits_().length}));return;}
  reports.forEach(function(report){console.log('REVISED_REPORT '+JSON.stringify(report));});
  run.complete=true;props.setProperty(runKey,JSON.stringify(run));
  console.log('REVISED_VERIFICATION '+JSON.stringify({expected:revisedUnits_().length,ready:ready,separateResponseSheets:new Set(sheets).size,excluded:['sys-choir-hope','sys-children','sys-youth','sys-music']}));
}
/** Set REVISED_EXPORT_UNIT_ID to one of the approved unit IDs before exporting. */
function exportRevisedUnitCsv(){
  const id=REVISED_EXPORT_UNIT_ID;if(!revisedUnits_().some(function(unit){return unit.id===id;}))throw new Error('Select an approved unit ID.');
  const state=JSON.parse(PropertiesService.getScriptProperties().getProperty(revisedUnitKey_(id))||'null');if(!state||state.state!=='READY')throw new Error('Revised form is not ready.');
  const rows=FormApp.openById(state.formId).getResponses().map(function(response){const answers={};response.getItemResponses().forEach(function(item){const key=state.items[String(item.getItem().getId())];if(key)answers[key]=item.getResponse();});return answers;});
  if(!rows.length)throw new Error('No responses to export.');
  console.log('REVISED_CSV '+DriveApp.createFile(id+'-revised-person-360.csv',choirCollectionCsv_(state,rows),'text/csv').getUrl());
}
