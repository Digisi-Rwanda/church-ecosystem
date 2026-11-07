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
