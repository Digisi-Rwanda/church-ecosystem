// New unpublished Youth revision; preserves the original form and response sheet.
const YOUTH_ORIGINAL_FORM_ID = "1zEYCMRkbCMvzxVExacWD_J2R0o0fjWpe0-M4Jeh3pg4";
const YOUTH_TEMPLATE_SCHEMA = {
  "version": "e72d451ce0efc415",
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
function createYouthFormRevision() {
  const properties=PropertiesService.getScriptProperties();
  const property='MORIAH_YOUTH_REVISED:'+YOUTH_TEMPLATE_SCHEMA.version;
  const prior=JSON.parse(properties.getProperty(property)||'null');
  if(prior) {
    if(prior.state!=='READY')throw new Error('The review form is unfinished. Inspect it before retrying.');
    console.log('YOUTH_REVISION '+JSON.stringify(prior));return;
  }
  const original=youthOriginalSnapshot_();
  const form=FormApp.create('Youth Ministry — Person 360 registration · Revised',false);
  const state={state:'CREATING',formId:form.getId(),items:{},original:original,version:YOUTH_TEMPLATE_SCHEMA.version};
  properties.setProperty(property,JSON.stringify(state));
  form.setTitle('Youth Ministry — Person 360 registration · Revised').setDescription('Youth Ministry registration').setCollectEmail(false).setPublishingSummary(false).setProgressBar(false);
  const map=function(item,key){state.items[String(item.getId())]=key;return item;};
  const page=function(title){return form.addPageBreakItem().setTitle(title);};
  const fields=function(section){YOUTH_TEMPLATE_SCHEMA.columns.filter(function(column){return column.section===section && column.key!=='MARRIAGE.endedOn' && column.key!=='MARRIAGE.endedBy';}).forEach(function(column){
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
  map(form.addCheckboxItem().setTitle('How do you serve in the church?').setChoiceValues(YOUTH_TEMPLATE_SCHEMA.callings).showOtherOption(true),'callings');
  page('Family');
  const startFamily=form.addMultipleChoiceItem().setTitle('Would you like to record a family member?').setRequired(true);
  const familyPages=[];const more=[];
  for(let index=0;index<YOUTH_TEMPLATE_SCHEMA.familyLimit;index++){
    familyPages.push(page('Family member '+(index+1)));
    map(form.addListItem().setTitle('How is this person related to you?').setChoiceValues(YOUTH_TEMPLATE_SCHEMA.relations.map(function(row){return row.label;})).setRequired(true),'family.'+index+'.relation');
    map(form.addTextItem().setTitle('What is this family member’s full name?').setRequired(true).setValidation(FormApp.createTextValidation().requireTextLengthLessThanOrEqualTo(120).build()),'family.'+index+'.name');
    map(form.addTextItem().setTitle('What is this family member’s date of birth?').setHelpText('DD-MM-YYYY').setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^\\d{2}-\\d{2}-\\d{4}$').build()),'family.'+index+'.dateOfBirth');
    map(form.addListItem().setTitle('What is this family member’s gender?').setChoiceValues(['Male','Female']),'family.'+index+'.gender');
    ['phone','nationalId'].forEach(function(key){map(form.addTextItem().setTitle(key==='phone'?'What is this family member’s phone number?':'What is this family member’s National ID number?').setValidation(FormApp.createTextValidation().requireTextLengthLessThanOrEqualTo(30).build()),'family.'+index+'.'+key);});
    if(index<YOUTH_TEMPLATE_SCHEMA.familyLimit-1)more.push(form.addMultipleChoiceItem().setTitle('Add another family member?').setRequired(true));
  }
  const baptism=page('Baptism');fields('BAPTISM');
  startFamily.setChoices([startFamily.createChoice('Yes',familyPages[0]),startFamily.createChoice('No',baptism)]);
  more.forEach(function(item,index){item.setChoices([item.createChoice('Yes',familyPages[index+1]),item.createChoice('No',baptism)]);});
  const sheet=SpreadsheetApp.create('Youth Ministry — Revised Person 360 responses');form.setDestination(FormApp.DestinationType.SPREADSHEET,sheet.getId());
  Object.assign(state,{state:'READY',editUrl:form.getEditUrl(),responderUrl:form.getPublishedUrl(),sheetUrl:sheet.getUrl()});properties.setProperty(property,JSON.stringify(state));
  console.log('YOUTH_REVISION '+JSON.stringify(state));
}


function youthDate_(raw){
  if(!raw)return '';
  const match=/^(\d{2})-(\d{2})-(\d{4})$/.exec(String(raw).trim());
  if(!match)throw new Error('Use DD-MM-YYYY.');
  const iso=match[3]+'-'+match[2]+'-'+match[1];const date=new Date(iso+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso)throw new Error('Enter a real date.');
  return iso;
}

/** Converts form answers into the existing import contract; no database or Google calls. */
function youthRow_(answers){
  const row={};
  YOUTH_TEMPLATE_SCHEMA.columns.forEach(function(column){
    let value=answers[column.key];if(value==null||String(value).trim()===''){if(column.required)throw new Error(column.question+' is required.');return;}
    if(typeof value!=='string')throw new Error('Expected text for '+column.header);
    value=value.trim();if(!value)return;
    if(column.choices){const choice=column.choices.find(function(item){return item.label===value||item.code===value;});if(!choice)throw new Error('Invalid choice for '+column.header);value=choice.code;}
    else if(column.type==='date')value=youthDate_(value);
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
  for(let index=0;index<YOUTH_TEMPLATE_SCHEMA.familyLimit;index++){
    const prefix='family.'+index+'.';const name=String(answers[prefix+'name']||'').trim();const relation=String(answers[prefix+'relation']||'').trim();
    const dob=answers[prefix+'dateOfBirth'];const gender=answers[prefix+'gender'];
    const phone=String(answers[prefix+'phone']||'').trim(),nationalId=String(answers[prefix+'nationalId']||'').trim();
    if(!name&&!relation&&!dob&&!gender&&!phone&&!nationalId)continue;
    const rel=YOUTH_TEMPLATE_SCHEMA.relations.find(function(item){return item.code===relation||item.label===relation;});
    if(!name||name.length>120||!rel)throw new Error('Complete the name and relationship for family member '+(index+1)+'.');
    const member={name:name,relation:rel.code};
    if(phone.length>30||nationalId.length>30)throw new Error('Family phone and National ID must be 30 characters or fewer.');
    if(phone)member.phone=phone;if(nationalId)member.nationalId=nationalId;
    if(dob)member.dateOfBirth=youthDate_(dob);
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

function youthCsv_(answers){
  const rows=[YOUTH_TEMPLATE_SCHEMA.headers].concat(answers.map(function(answer){const row=youthRow_(answer);return YOUTH_TEMPLATE_SCHEMA.headers.map(function(header){return row[header]||'';});}));
  return '\uFEFF'+rows.map(function(row){return row.map(function(value){return '"'+String(value).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n')+'\r\n';
}


function youthOriginalSnapshot_(){
  const form=FormApp.openById(YOUTH_ORIGINAL_FORM_ID);
  const structure=form.getItems().map(function(item){return [String(item.getId()),String(item.getType()),item.getTitle()];});
  return {formId:form.getId(),sheetId:form.getDestinationId(),responses:form.getResponses().length,published:form.isPublished(),structure:Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(structure)))};
}
function verifyYouthFormRevision(){
  const state=JSON.parse(PropertiesService.getScriptProperties().getProperty('MORIAH_YOUTH_REVISED:'+YOUTH_TEMPLATE_SCHEMA.version)||'null');
  if(!state||state.state!=='READY')throw new Error('Youth revision is not ready.');
  const form=FormApp.openById(state.formId),items=form.getItems(),original=youthOriginalSnapshot_();
  let basics=0,familyContacts=0,relationshipLists=0,familyPage=0,navigation=true,marriage=false;
  for(const item of items){
    const type=item.getType(),key=state.items[String(item.getId())];
    const column=YOUTH_TEMPLATE_SCHEMA.columns.find(function(column){return column.key===key;});
    if(column&&column.section==='BASICS'&&(type===FormApp.ItemType.LIST?item.asListItem().isRequired():item.asTextItem().isRequired()))basics++;
    if(key&&/^family\.\d+\.(phone|nationalId)$/.test(key)){if(item.asTextItem().isRequired())throw new Error('Family contact fields must be optional.');familyContacts++;}
    if(key&&/^family\.\d+\.relation$/.test(key)){
      const choices=item.asListItem().getChoices().map(function(choice){return choice.getValue();});
      if(JSON.stringify(choices)!==JSON.stringify(YOUTH_TEMPLATE_SCHEMA.relations.map(function(row){return row.label;})))throw new Error('Youth relationship choices differ.');
      relationshipLists++;
    }
    if(type===FormApp.ItemType.PAGE_BREAK){const title=item.getTitle(),match=/^Family member (\d+)$/.exec(title);familyPage=match?Number(match[1]):0;if(/Marriage|Spouse/i.test(title))marriage=true;}
    if(type===FormApp.ItemType.MULTIPLE_CHOICE)for(const choice of item.asMultipleChoiceItem().getChoices()){
      const page=choice.getGotoPage(),expected=choice.getValue()==='Yes'?'Family member '+(familyPage+1):'Baptism';
      if(!page||page.getTitle()!==expected)navigation=false;
    }
  }
  const preserved=original.formId===state.original.formId&&original.sheetId===state.original.sheetId&&original.published===state.original.published&&original.structure===state.original.structure&&original.responses>=state.original.responses;
  const report={systemId:'sys-youth',formId:state.formId,version:YOUTH_TEMPLATE_SCHEMA.version,title:form.getTitle(),published:form.isPublished(),responses:form.getResponses().length,questions:items.length-26,requiredBasics:basics,familyContacts:familyContacts,relationshipLists:relationshipLists,marriageSection:marriage,navigationValid:navigation,originalPreserved:preserved,originalResponses:original.responses,originalFormId:original.formId,originalSheetId:original.sheetId,sheetId:form.getDestinationId(),editUrl:form.getEditUrl(),responderUrl:form.getPublishedUrl(),sheetUrl:state.sheetUrl,verifiedAt:new Date().toISOString()};
  if(report.published||report.questions!==164||basics!==9||familyContacts!==40||relationshipLists!==20||marriage||!navigation||!preserved||report.sheetId===original.sheetId)throw new Error('Youth revision verification failed: '+JSON.stringify(report));
  console.log('YOUTH_VERIFIED '+JSON.stringify(report));
}
function exportYouthRevisionCsv(){
  const state=JSON.parse(PropertiesService.getScriptProperties().getProperty('MORIAH_YOUTH_REVISED:'+YOUTH_TEMPLATE_SCHEMA.version)||'null');if(!state||state.state!=='READY')throw new Error('Youth revision is not ready.');
  const rows=FormApp.openById(state.formId).getResponses().map(function(response){const answers={};response.getItemResponses().forEach(function(item){const key=state.items[String(item.getItem().getId())];if(key)answers[key]=item.getResponse();});return answers;});
  if(!rows.length)throw new Error('No responses to export.');
  console.log('YOUTH_CSV '+DriveApp.createFile('sys-youth-person360.csv',youthCsv_(rows),'text/csv').getUrl());
}
