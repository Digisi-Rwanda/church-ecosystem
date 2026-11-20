/** Adds optional questions to the 17 existing revised forms. Never deletes answers or changes publishing/destinations. */
function addFamilyContactQuestions(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))throw new Error('Another update is running.');
  try{
    const props=PropertiesService.getScriptProperties(),started=Date.now(),validation=FormApp.createTextValidation().requireTextLengthLessThanOrEqualTo(30).build();let completed=0;
    for(const unit of FAMILY_CONTACT_FORMS){
      const state=JSON.parse(props.getProperty(unit.registryKey)||'null');
      if(!state||state.formId!==unit.formId||state.state!=='READY')throw new Error('Unexpected collection registry: '+unit.id);
      if(state.familyContactsReady){completed++;continue;}
      if(Date.now()-started>180000)break;
      const form=FormApp.openById(state.formId);if(form.isPublished())throw new Error('Form must remain unpublished: '+unit.id);
      if(!state.familyContactsBefore){state.familyContactsBefore={responses:form.getResponses().length,sheetId:form.getDestinationId()};props.setProperty(unit.registryKey,JSON.stringify(state));}
      for(let index=0;index<20;index++){
        const prefix='family.'+index+'.';
        const genderId=Object.keys(state.items).find(function(id){return state.items[id]===prefix+'gender';});
        if(!genderId)throw new Error('Missing family member anchor: '+unit.id);
        let targetIndex=form.getItemById(Number(genderId)).getIndex()+1;
        for(const key of ['phone','nationalId']){
          const existingId=Object.keys(state.items).find(function(id){return state.items[id]===prefix+key;});
          let item=existingId?form.getItemById(Number(existingId)).asTextItem():null;
          if(!item){
            item=form.addTextItem().setTitle(key==='phone'?'What is this family member’s phone number?':'What is this family member’s National ID number?').setRequired(false).setValidation(validation);
            state.items[String(item.getId())]=prefix+key;props.setProperty(unit.registryKey,JSON.stringify(state));
          }
          const currentIndex=item.getIndex();if(currentIndex!==targetIndex)form.moveItem(currentIndex,targetIndex);
          targetIndex++;
        }
        if((index+1)%5===0)console.log('FAMILY_CONTACT_PROGRESS '+unit.id+' '+(index+1)+'/20 members');
      }
      if(form.isPublished()||form.getDestinationId()!==state.familyContactsBefore.sheetId||form.getResponses().length<state.familyContactsBefore.responses)throw new Error('Collection preservation check failed: '+unit.id);
      state.familyContactsReady=true;props.setProperty(unit.registryKey,JSON.stringify(state));completed++;
      console.log('FAMILY_CONTACT_UPDATED '+JSON.stringify({id:unit.id,editUrl:unit.editUrl}));
    }
    console.log('FAMILY_CONTACT_BATCH '+JSON.stringify({ready:completed,expected:FAMILY_CONTACT_FORMS.length}));
  }finally{lock.releaseLock();}
}
function verifyFamilyContactQuestions(){
  const props=PropertiesService.getScriptProperties(),started=Date.now(),reports=[];
  const runKey='MORIAH_FAMILY_CONTACT_VERIFY_RUN';let run=JSON.parse(props.getProperty(runKey)||'null');
  if(!run||run.complete){run={id:new Date().toISOString(),complete:false};props.setProperty(runKey,JSON.stringify(run));}
  for(const unit of FAMILY_CONTACT_FORMS){
    const cacheKey='MORIAH_FAMILY_CONTACT_VERIFIED:'+unit.id,cached=JSON.parse(props.getProperty(cacheKey)||'null');
    if(cached&&cached.run===run.id){reports.push(cached);continue;}
    if(Date.now()-started>180000)break;
    const state=JSON.parse(props.getProperty(unit.registryKey)||'null');if(!state||!state.familyContactsReady)throw new Error('Update incomplete: '+unit.id);
    const form=FormApp.openById(state.formId),items=form.getItems();let fields=0;
    for(let index=0;index<20;index++){
      const genderId=Object.keys(state.items).find(function(id){return state.items[id]==='family.'+index+'.gender';});
      const afterGender=form.getItemById(Number(genderId)).getIndex();
      for(const key of ['phone','nationalId']){
      const id=Object.keys(state.items).find(function(id){return state.items[id]==='family.'+index+'.'+key;});
      const item=form.getItemById(Number(id)).asTextItem();
      if(item.isRequired()||item.getIndex()!==afterGender+(key==='phone'?1:2)||item.getTitle()!==(key==='phone'?'What is this family member’s phone number?':'What is this family member’s National ID number?'))throw new Error('Incorrect optional family contact question: '+unit.id);
      fields++;
      }
    }
    let familyPage=0,navigation=true;
    for(const item of items){
      const type=item.getType();
      if(type===FormApp.ItemType.PAGE_BREAK){const match=/^Family member (\d+)$/.exec(item.getTitle());familyPage=match?Number(match[1]):0;}
      if(type!==FormApp.ItemType.MULTIPLE_CHOICE)continue;
      const widowed=item.getTitle()==='Has your spouse passed away?';
      for(const choice of item.asMultipleChoiceItem().getChoices()){
        const page=choice.getGotoPage(),yes=choice.getValue()==='Yes';
        const expected=widowed?(yes?'Spouse’s passing':'SUBMIT'):(yes?'Family member '+(familyPage+1):'Baptism');
        if((page?page.getTitle():String(choice.getPageNavigationType()))!==expected)navigation=false;
      }
    }
    const report={id:unit.id,fields:fields,questions:items.length-28,published:form.isPublished(),responses:form.getResponses().length,sheetUnchanged:form.getDestinationId()===state.familyContactsBefore.sheetId,responsesPreserved:form.getResponses().length>=state.familyContactsBefore.responses,navigationValid:navigation,editUrl:unit.editUrl,run:run.id,verifiedAt:new Date().toISOString()};
    if(report.published||!report.sheetUnchanged||!report.responsesPreserved||!navigation)throw new Error('Family contact verification failed: '+unit.id);
    props.setProperty(cacheKey,JSON.stringify(report));reports.push(report);console.log('FAMILY_CONTACT_REPORT '+JSON.stringify(report));
  }
  if(reports.length===FAMILY_CONTACT_FORMS.length){reports.forEach(function(row){console.log('FAMILY_CONTACT_REPORT '+JSON.stringify(row));});run.complete=true;props.setProperty(runKey,JSON.stringify(run));}
  console.log('FAMILY_CONTACT_VERIFICATION '+JSON.stringify({ready:reports.length,expected:FAMILY_CONTACT_FORMS.length,complete:run.complete}));
}
/** Select one unit ID above. Uses question IDs and retains phone/ID text in FAMILY JSON. */
function exportFamilyContactUnitCsv(){
  const unit=FAMILY_CONTACT_FORMS.find(function(unit){return unit.id===FAMILY_CONTACT_EXPORT_UNIT_ID;});if(!unit)throw new Error('Select a unit ID before export.');
  const state=JSON.parse(PropertiesService.getScriptProperties().getProperty(unit.registryKey)||'null');
  if(!state||!state.familyContactsReady)throw new Error('Family contact setup is incomplete.');
  const rows=FormApp.openById(state.formId).getResponses().map(function(response){const answers={};response.getItemResponses().forEach(function(item){const key=state.items[String(item.getItem().getId())];if(key)answers[key]=item.getResponse();});return answers;});
  if(!rows.length)throw new Error('No responses to export.');
  console.log('FAMILY_CONTACT_CSV '+DriveApp.createFile(unit.id+'-person360.csv',familyContactCsv_(rows),'text/csv').getUrl());
}
