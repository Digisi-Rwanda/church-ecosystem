// Generated from the current Person 360 template. Rebuild using scripts/build-person360-google-forms.ts.
// Paste this entire file into a new standalone Google Apps Script project.
const UNITS = [
  {
    "id": "sys-youth",
    "name": "Youth Ministry"
  },
  {
    "id": "sys-music",
    "name": "Music Ministry"
  },
  {
    "id": "sys-men",
    "name": "Men Ministry"
  },
  {
    "id": "sys-women",
    "name": "Women Ministry"
  },
  {
    "id": "sys-couples",
    "name": "Family Ministry"
  },
  {
    "id": "sys-children",
    "name": "Children Ministry"
  },
  {
    "id": "sys-elderly",
    "name": "Elderly Ministry"
  },
  {
    "id": "sys-evangelism",
    "name": "Evangelism Ministry"
  },
  {
    "id": "sys-intercessors",
    "name": "Intercessors Ministry"
  },
  {
    "id": "sys-deacon",
    "name": "Deacon Ministry"
  },
  {
    "id": "sys-worship",
    "name": "Worship Team"
  },
  {
    "id": "sys-protocol",
    "name": "Protocol Team"
  },
  {
    "id": "sys-media",
    "name": "Media Team"
  },
  {
    "id": "sys-choir",
    "name": "Choir Ministry"
  },
  {
    "id": "sys-choir-ijwi",
    "name": "Ijwi ry' umwami Yesu"
  },
  {
    "id": "sys-choir-elbethel",
    "name": "El bethel"
  },
  {
    "id": "sys-choir-integuza",
    "name": "Integuza"
  },
  {
    "id": "sys-choir-elim",
    "name": "Elim"
  },
  {
    "id": "sys-choir-beulah",
    "name": "Beulah"
  },
  {
    "id": "sys-choir-yerusalemu",
    "name": "Yerusalemu"
  },
  {
    "id": "sys-choir-hope",
    "name": "Hope"
  }
];
const EXPORT_UNIT_ID = ''; // Set this to exactly one unit ID before exporting.
const PERSON360_SCHEMA = {
  "version": "99f1895108ad791e",
  "columns": [
    {
      "key": "fullName",
      "header": "Full name",
      "section": "BASICS",
      "type": "text",
      "max": 120,
      "question": "What is your full name?"
    },
    {
      "key": "preferredName",
      "header": "Preferred name",
      "section": "BASICS",
      "type": "text",
      "max": 120,
      "question": "What name do you prefer to be called?"
    },
    {
      "key": "phone",
      "header": "Phone",
      "section": "BASICS",
      "type": "text",
      "max": 30,
      "question": "What is your phone number?"
    },
    {
      "key": "email",
      "header": "Email",
      "section": "BASICS",
      "type": "email",
      "question": "What is your email address?"
    },
    {
      "key": "dateOfBirth",
      "header": "Date of birth",
      "section": "BASICS",
      "type": "date",
      "question": "What is your date of birth?"
    },
    {
      "key": "nationalId",
      "header": "National ID",
      "section": "BASICS",
      "type": "text",
      "max": 30,
      "question": "What is your National ID number?"
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
      ]
    },
    {
      "key": "status",
      "header": "Status",
      "section": "BASICS",
      "type": "select",
      "question": "What is your membership status?",
      "choices": [
        {
          "code": "ACTIVE",
          "label": "Active"
        },
        {
          "code": "INACTIVE",
          "label": "Inactive"
        },
        {
          "code": "VISITOR",
          "label": "Visitor"
        }
      ]
    },
    {
      "key": "joinedChurchOn",
      "header": "Joined church on",
      "section": "BASICS",
      "type": "date",
      "question": "When did you join the church?"
    },
    {
      "key": "address",
      "header": "Address",
      "section": "BASICS",
      "type": "text",
      "max": 200,
      "question": "Where do you live?"
    },
    {
      "key": "CONTACT.label",
      "header": "Contact - Label",
      "section": "CONTACT",
      "type": "text",
      "max": 60,
      "question": "Who or what is this additional contact?"
    },
    {
      "key": "CONTACT.value",
      "header": "Contact - Value",
      "section": "CONTACT",
      "type": "text",
      "max": 200,
      "question": "What is their phone number or address?"
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
      ]
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
      ]
    },
    {
      "key": "EMPLOYMENT.employer",
      "header": "Work - Employer",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "Who is your employer?"
    },
    {
      "key": "EMPLOYMENT.role",
      "header": "Work - Role",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "What work do you do?"
    },
    {
      "key": "EMPLOYMENT.since",
      "header": "Work - Since",
      "section": "EMPLOYMENT",
      "type": "date",
      "question": "When did this work situation begin?"
    },
    {
      "key": "EMPLOYMENT.business",
      "header": "Work - Business",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "What business do you run?"
    },
    {
      "key": "EMPLOYMENT.school",
      "header": "Work - School",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "Where are you studying?"
    },
    {
      "key": "EMPLOYMENT.field",
      "header": "Work - Field of study",
      "section": "EMPLOYMENT",
      "type": "text",
      "max": 120,
      "question": "What are you studying?"
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
      ]
    },
    {
      "key": "EDUCATION.field",
      "header": "Education - Field of study",
      "section": "EDUCATION",
      "type": "text",
      "max": 120,
      "question": "What is your field of study?"
    },
    {
      "key": "EDUCATION.school",
      "header": "Education - School",
      "section": "EDUCATION",
      "type": "text",
      "max": 120,
      "question": "Which school or institution did you attend?"
    },
    {
      "key": "EDUCATION.startYear",
      "header": "Education - Start year",
      "section": "EDUCATION",
      "type": "number",
      "question": "In which year did you start?"
    },
    {
      "key": "EDUCATION.endYear",
      "header": "Education - End year",
      "section": "EDUCATION",
      "type": "number",
      "question": "In which year did you finish?"
    },
    {
      "key": "CALLING.name",
      "header": "Calling - Name",
      "section": "CALLING",
      "type": "text",
      "max": 80,
      "question": "How do you serve in the church?"
    },
    {
      "key": "CALLING.since",
      "header": "Calling - Since",
      "section": "CALLING",
      "type": "date",
      "question": "When did you begin serving?"
    },
    {
      "key": "CALLING.note",
      "header": "Calling - Notes",
      "section": "CALLING",
      "type": "text",
      "max": 300,
      "question": "What else should we know about this calling?"
    },
    {
      "key": "FAMILY.relation",
      "header": "Family - Relationship",
      "section": "FAMILY",
      "type": "select",
      "question": "How is this person related to you?",
      "choices": [
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
    },
    {
      "key": "FAMILY.name",
      "header": "Family - Name",
      "section": "FAMILY",
      "type": "text",
      "max": 120,
      "question": "What is this relative’s full name?"
    },
    {
      "key": "FAMILY.dateOfBirth",
      "header": "Family - Date of birth",
      "section": "FAMILY",
      "type": "date",
      "question": "What is this child’s date of birth?"
    },
    {
      "key": "FAMILY.gender",
      "header": "Family - Gender",
      "section": "FAMILY",
      "type": "select",
      "question": "What is this child’s gender?",
      "choices": [
        {
          "code": "MALE",
          "label": "Male"
        },
        {
          "code": "FEMALE",
          "label": "Female"
        }
      ]
    },
    {
      "key": "FAMILY.note",
      "header": "Family - Notes",
      "section": "FAMILY",
      "type": "text",
      "max": 300,
      "question": "What else should we know about this family record?"
    },
    {
      "key": "BAPTISM.date",
      "header": "Baptism - Date",
      "section": "BAPTISM",
      "type": "date",
      "question": "When were you baptised?"
    },
    {
      "key": "BAPTISM.place",
      "header": "Baptism - Place",
      "section": "BAPTISM",
      "type": "text",
      "max": 120,
      "question": "Where were you baptised?"
    },
    {
      "key": "BAPTISM.baptisedBy",
      "header": "Baptism - Baptised by",
      "section": "BAPTISM",
      "type": "text",
      "max": 120,
      "question": "Who baptised you?"
    },
    {
      "key": "MARRIAGE.date",
      "header": "Marriage - Date",
      "section": "MARRIAGE",
      "type": "date",
      "question": "What is your marriage date?"
    },
    {
      "key": "MARRIAGE.spouseName",
      "header": "Marriage - Spouse name",
      "section": "MARRIAGE",
      "type": "text",
      "max": 120,
      "question": "What is your spouse’s full name?"
    },
    {
      "key": "MARRIAGE.place",
      "header": "Marriage - Place",
      "section": "MARRIAGE",
      "type": "text",
      "max": 120,
      "question": "Where was the marriage held?"
    },
    {
      "key": "MARRIAGE.blessedBy",
      "header": "Marriage - Blessed by",
      "section": "MARRIAGE",
      "type": "text",
      "max": 120,
      "question": "Who blessed the marriage?"
    },
    {
      "key": "MARRIAGE.certificateRef",
      "header": "Marriage - Certificate reference",
      "section": "MARRIAGE",
      "type": "text",
      "max": 80,
      "question": "What is the marriage certificate reference?"
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
        }
      ]
    },
    {
      "key": "MARRIAGE.endedOn",
      "header": "Marriage - Marriage ended on",
      "section": "MARRIAGE",
      "type": "date",
      "question": "When did your spouse pass away?"
    }
  ]
};

/** Creates blank, unpublished forms. Does not publish, share, email, import or change Moriah. */
function createUnitForms() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another form setup is running. Try again later.');
  try {
    const started = Date.now();
    validateUnitList_();
    let created = 0;
    UNITS.forEach(function(unit) {
      const properties = PropertiesService.getScriptProperties();
      const key = unitKey_(unit.id);
      const prior = JSON.parse(properties.getProperty(key) || 'null');
      if (prior) {
        if (prior.schemaVersion !== PERSON360_SCHEMA.version) throw new Error('Template changed for ' + unit.id + '. Review existing responses before creating a new collection form.');
        if (prior.state === 'READY') {
          const completed = FormApp.openById(prior.formId);
          // An interrupted initial setup may have a Drive filename but no form title.
          if (!completed.getTitle() && !completed.isPublished() && !completed.getResponses().length) completed.setTitle(unit.name + ' — Person 360 registration');
          logUnit_(unit, prior); return;
        }
        if (prior.state !== 'CREATING') throw new Error('Unknown setup state for ' + unit.id);
      }
      // Bounded batches keep a larger church below Apps Script's execution time limit.
      if (created >= 21 || Date.now() - started > 180000) return;
      const template = UNITS.map(function(row) { return JSON.parse(properties.getProperty(unitKey_(row.id)) || 'null'); }).find(function(row) { return row && row.state === 'READY' && row.schemaVersion === PERSON360_SCHEMA.version; });
      const title = unit.name + ' — Person 360 registration';
      const form = prior ? FormApp.openById(prior.formId) : template ? FormApp.openById(DriveApp.getFileById(template.formId).makeCopy(title).getId()) : FormApp.create(title, false);
      const state = prior || {state:'CREATING',formId:form.getId(),schemaVersion:PERSON360_SCHEMA.version,items:{}};
      properties.setProperty(key, JSON.stringify(state));
      if (prior) resumeQuestions_(form, state, title);
      else if (template) {
        form.setPublished(false);
        if (form.getResponses().length) throw new Error('Copied form unexpectedly contains responses. Review it before continuing.');
        const originalItems = FormApp.openById(template.formId).getItems().filter(function(item) { return template.items[String(item.getId())]; });
        const copiedItems = form.getItems().filter(function(item) { return [FormApp.ItemType.TEXT, FormApp.ItemType.LIST].indexOf(item.getType()) >= 0; });
        if (originalItems.length !== PERSON360_SCHEMA.columns.length || copiedItems.length !== originalItems.length) throw new Error('Template questions changed. Review the copied form before continuing.');
        copiedItems.forEach(function(item,index) { state.items[String(item.getId())] = template.items[String(originalItems[index].getId())]; });
        properties.setProperty(key, JSON.stringify(state));
      }
      form.setTitle(title);
      form.setDescription('Register one person for ' + unit.name + '. Full name is required. Leave unknown or inapplicable details blank. The unit leadership will review the information before registering it in Moriah.');
      form.setCollectEmail(false).setPublishingSummary(false).setProgressBar(true).setShuffleQuestions(false);
      form.setConfirmationMessage('Thank you. Your unit leadership will review your registration.');
      let previousSection = '';
      if (!template && !prior) PERSON360_SCHEMA.columns.forEach(function(column) {
        if (column.section !== previousSection) {
          const title = sectionTitle_(column.section);
          if (!previousSection) form.addSectionHeaderItem().setTitle(title);
          else form.addPageBreakItem().setTitle(title);
          previousSection = column.section;
        }
        const item = configureQuestion_(form, column);
        state.items[String(item.getId())] = column.key;
      });
      const sheetId = state.sheetId || (prior ? destinationId_(form) : null);
      const sheet = sheetId ? SpreadsheetApp.openById(sheetId) : SpreadsheetApp.create(unit.name + ' — Person 360 responses');
      state.sheetId = sheet.getId();
      state.sheetUrl = sheet.getUrl();
      properties.setProperty(key, JSON.stringify(state));
      form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
      state.state = 'READY';
      properties.setProperty(key, JSON.stringify(state));
      logUnit_(unit, state);
      created++;
    });
    console.log('Created ' + created + ' forms. Run createUnitForms again to continue; completed forms are reused.');
  } finally { lock.releaseLock(); }
}

function configureQuestion_(form, column, existing) {
  const item = existing ? column.choices ? existing.asListItem() : existing.asTextItem() : column.choices ? form.addListItem() : form.addTextItem();
  item.setTitle(column.question).setRequired(column.key === 'fullName');
  if (column.choices) item.setChoiceValues(column.choices.map(function(choice) { return choice.label; }));
  else {
    const validation = FormApp.createTextValidation();
    if (column.type === 'date') {
      item.setHelpText('YYYY-MM-DD');
      validation.requireTextMatchesPattern('^\\d{4}-\\d{2}-\\d{2}$').setHelpText('Use YYYY-MM-DD.');
    } else if (column.type === 'number') validation.requireTextMatchesPattern('^(19[3-9][0-9]|20[0-9]{2}|2100)$').setHelpText('Enter a year from 1930 to 2100.');
    else if (column.type === 'email') validation.requireTextIsEmail();
    else validation.requireTextLengthLessThanOrEqualTo(column.max || 200);
    item.setValidation(validation.build());
  }
  return item;
}

/** Resume only this script's unchanged, unpublished, unanswered partial form. */
function resumeQuestions_(form, state, title) {
  if ((form.getTitle() && form.getTitle() !== title) || form.isPublished() || form.getResponses().length) throw new Error('Partial form was changed, published or answered. Review it before resuming.');
  const sequence = [];
  let section = '';
  PERSON360_SCHEMA.columns.forEach(function(column) {
    if (section !== column.section) { sequence.push({title:sectionTitle_(column.section),type:section ? FormApp.ItemType.PAGE_BREAK : FormApp.ItemType.SECTION_HEADER}); section = column.section; }
    sequence.push({title:column.question,type:column.choices ? FormApp.ItemType.LIST : FormApp.ItemType.TEXT,column:column});
  });
  const items = form.getItems();
  if (items.length > sequence.length || items.some(function(item,index) { return item.getType() !== sequence[index].type || (item.getTitle() !== sequence[index].title && !(index === items.length - 1 && !item.getTitle())); })) throw new Error('Partial form questions differ from the template. Review them before resuming.');
  state.items = {};
  sequence.forEach(function(definition,index) {
    const existing = items[index];
    if (definition.column) {
      const item = configureQuestion_(form,definition.column,existing);
      state.items[String(item.getId())] = definition.column.key;
    } else if (!existing) {
      (definition.type === FormApp.ItemType.SECTION_HEADER ? form.addSectionHeaderItem() : form.addPageBreakItem()).setTitle(definition.title);
    } else if (!existing.getTitle()) {
      (definition.type === FormApp.ItemType.SECTION_HEADER ? existing.asSectionHeaderItem() : existing.asPageBreakItem()).setTitle(definition.title);
    }
  });
}

/** Exports one unit's reviewed responses to a new CSV file; no rows are marked imported or removed. */
function exportUnitCsv() {
  validateUnitList_();
  const unit = UNITS.find(function(row) { return row.id === EXPORT_UNIT_ID; });
  if (!unit) throw new Error('Set EXPORT_UNIT_ID to exactly one ID from UNITS.');
  const state = JSON.parse(PropertiesService.getScriptProperties().getProperty(unitKey_(unit.id)) || 'null');
  if (!state || state.state !== 'READY' || state.schemaVersion !== PERSON360_SCHEMA.version) throw new Error('This unit has no ready form for the current template.');
  const form = FormApp.openById(state.formId);
  const currentIds = form.getItems().map(function(item) { return String(item.getId()); });
  if (Object.keys(state.items).some(function(id) { return currentIds.indexOf(id) < 0; })) throw new Error('A mapped form question was deleted. Review the form before exporting.');
  const responses = form.getResponses();
  if (!responses.length) throw new Error('No responses to export.');
  const rows = responses.map(function(response, index) {
    const values = {};
    response.getItemResponses().forEach(function(answer) {
      const key = state.items[String(answer.getItem().getId())];
      if (key) values[key] = answer.getResponse();
    });
    return PERSON360_SCHEMA.columns.map(function(column) {
      try { return normalizeAnswer_(column, values[column.key]); }
      catch (error) { throw new Error('Response ' + (index + 1) + ', ' + column.header + ': ' + error.message); }
    });
  });
  const data = [PERSON360_SCHEMA.columns.map(function(column) { return column.header; })].concat(rows);
  const csv = '\uFEFF' + data.map(function(row) { return row.map(csvCell_).join(','); }).join('\r\n') + '\r\n';
  const stamp = Utilities.formatDate(new Date(), 'Africa/Kigali', 'yyyy-MM-dd-HHmmss');
  const file = DriveApp.createFile(unit.id + '-person-360-' + stamp + '.csv', csv, 'text/csv');
  console.log('CSV: ' + file.getUrl());
  console.log('Import into: /s/' + unit.id + '/people/import — Check the file before adding people.');
  return file.getUrl();
}

function normalizeAnswer_(column, answer) {
  if (answer == null || answer === '') {
    if (column.key === 'fullName') throw new Error('Full name is missing');
    return '';
  }
  if (typeof answer !== 'string') throw new Error('Expected one text answer');
  const value = answer.trim();
  if (!value) return normalizeAnswer_(column, '');
  if (column.choices) {
    const choice = column.choices.find(function(row) { return row.label === value || row.code === value; });
    if (!choice) throw new Error('Choice is not in the template');
    return choice.code;
  }
  if (column.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(value + 'T00:00:00Z').getTime()) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) throw new Error('Use a real date in YYYY-MM-DD format');
  }
  if (column.type === 'number' && (!/^\d{4}$/.test(value) || Number(value) < 1930 || Number(value) > 2100)) throw new Error('Use a year from 1930 to 2100');
  if (column.max && value.length > column.max) throw new Error('Answer is too long');
  return value;
}

function csvCell_(value) {
  const text = String(value == null ? '' : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function unitKey_(id) { return 'MORIAH_PERSON360_UNIT:' + id; }
function destinationId_(form) {
  try { return form.getDestinationId(); }
  catch (error) { if (String(error.message).indexOf('no response destination') >= 0) return null; throw error; }
}
function validateUnitList_() {
  if (!UNITS.length) throw new Error('No units configured.');
  const seen = {};
  UNITS.forEach(function(unit) {
    if (!/^sys-[a-z0-9-]+$/.test(unit.id) || !unit.name || seen[unit.id]) throw new Error('Invalid or repeated unit ID: ' + unit.id);
    seen[unit.id] = true;
  });
}
function sectionTitle_(section) {
  return {BASICS:'About you',CONTACT:'Additional contact',EMPLOYMENT:'Work',EDUCATION:'Education',CALLING:'Serving in the church',FAMILY:'Family',BAPTISM:'Baptism',MARRIAGE:'Marriage'}[section];
}
function logUnit_(unit, state) {
  const form = FormApp.openById(state.formId);
  console.log(unit.name + ' [' + unit.id + ']');
  console.log('Review form: ' + form.getEditUrl());
  console.log('Response sheet: ' + state.sheetUrl);
  console.log('Responder link (publish in Google Forms when ready): ' + form.getPublishedUrl());
}

/** Read-only inspection: logs metadata and links, never any submitted answers. */
function verifyUnitForms() {
  validateUnitList_();
  const reports = UNITS.map(function(unit) {
    const state = JSON.parse(PropertiesService.getScriptProperties().getProperty(unitKey_(unit.id)) || 'null');
    if (!state) { const missing = {id:unit.id,name:unit.name,state:'MISSING'}; console.log('UNIT_REPORT ' + JSON.stringify(missing)); return missing; }
    const form = FormApp.openById(state.formId);
    const report = {id:unit.id,name:unit.name,state:state.state,title:form.getTitle(),published:form.isPublished(),responses:form.getResponses().length,questions:form.getItems().filter(function(item) { return [FormApp.ItemType.TEXT,FormApp.ItemType.LIST].indexOf(item.getType()) >= 0; }).length,sheetId:destinationId_(form),editUrl:form.getEditUrl(),responderUrl:form.getPublishedUrl(),sheetUrl:state.sheetUrl || ''};
    console.log('UNIT_REPORT ' + JSON.stringify(report));
    return report;
  });
  const ready = reports.filter(function(row) { return row.state === 'READY' && row.title === row.name + ' — Person 360 registration' && !row.published && row.questions === PERSON360_SCHEMA.columns.length && row.sheetId; });
  const uniqueSheets = new Set(ready.map(function(row) { return row.sheetId; }));
  console.log('VERIFICATION ' + JSON.stringify({expected:UNITS.length,ready:ready.length,separateResponseSheets:uniqueSheets.size}));
}
