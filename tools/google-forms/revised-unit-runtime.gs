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
