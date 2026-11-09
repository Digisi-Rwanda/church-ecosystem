// Closure-scoped: no collisions with existing saved collections.
const STORE='MORIAH_CHURCH_WIDE:'+SPEC.version;
function save(state){const data=JSON.stringify(state),props=PropertiesService.getScriptProperties();for(let i=0;i<data.length;i+=7000)props.setProperty(STORE+':'+(i/7000),data.slice(i,i+7000));props.setProperty(STORE,String(Math.ceil(data.length/7000)));}
function load(){const props=PropertiesService.getScriptProperties(),count=Number(props.getProperty(STORE)||0);if(!count)return null;let data='';for(let i=0;i<count;i++)data+=props.getProperty(STORE+':'+i);return JSON.parse(data);}
function create(){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const prior=load();if(prior){if(prior.state!=='READY')throw Error('An unfinished new collection already exists. Inspect it; do not create another.');console.log('CHURCH_CREATED '+JSON.stringify(prior));return;}
  const form=FormApp.create(SPEC.title,false);
  const state={state:'CREATING',version:SPEC.version,formId:form.getId(),items:{},pages:{},editUrl:form.getEditUrl()};save(state);
  form.setTitle(SPEC.title).setDescription('English / Ikinyarwanda. Dates / Amatariki: DD-MM-YYYY.\nEach response can include up to 20 siblings and 20 children. / Igisubizo kimwe gishobora kugira abavandimwe 20 n’abana 20.').setCollectEmail(false).setPublishingSummary(false).setProgressBar(true).setShuffleQuestions(false);
  const pages={},items={};
  SPEC.nodes.forEach(function(n,index){
   if(index===0)form.addSectionHeaderItem().setTitle(n.title);else{pages[n.id]=form.addPageBreakItem().setTitle(n.title);state.pages[n.id]=String(pages[n.id].getId());}
   n.questions.forEach(function(q){
    const item=q.type==='branch'?form.addMultipleChoiceItem():q.type==='checkbox'?form.addCheckboxItem():q.options?form.addListItem():form.addTextItem();
    item.setTitle(q.title).setRequired(q.required);items[n.id+':'+q.key]=item;
    state.items[String(item.getId())]={key:q.key,node:n.id,type:q.type,options:q.options||null};
    if(q.options)item.setChoiceValues(q.options.map(function(o){return o.label;}));
    if(q.type==='checkbox')item.showOtherOption(true);
    if(!q.options){
     const v=FormApp.createTextValidation();
     if(q.type==='date'){v.requireTextMatchesPattern('^\\d{2}-\\d{2}-\\d{4}$');item.setHelpText('DD-MM-YYYY');}
     else if(q.type==='email')v.requireTextIsEmail();
     else if(q.type==='number')v.requireTextMatchesPattern('^(19[3-9][0-9]|20[0-9]{2}|2100)$');
     else v.requireTextLengthLessThanOrEqualTo(q.max||200);
     item.setValidation(v.build());
    }
   });
   state.lastCompletedNode=n.id;save(state);
  });
  // Google stores a section's default exit on the FOLLOWING physical page break.
  SPEC.nodes.forEach(function(n,index){
   if(n.next&&index+1<SPEC.nodes.length)pages[SPEC.nodes[index+1].id].setGoToPage(pages[n.next]);
   n.questions.filter(function(q){return q.type==='branch';}).forEach(function(q){const item=items[n.id+':'+q.key];item.setChoices(q.options.map(function(o){return item.createChoice(o.label,pages[o.go]);}));});
  });
  const sheet=SpreadsheetApp.create('Church — Person 360 responses / Itorero — Ibisubizo');form.setDestination(FormApp.DestinationType.SPREADSHEET,sheet.getId());
  Object.assign(state,{state:'READY',sheetId:sheet.getId(),sheetUrl:sheet.getUrl(),responderUrl:form.getPublishedUrl(),createdAt:new Date().toISOString()});save(state);
  console.log('CHURCH_CREATED '+JSON.stringify({state:state.state,version:state.version,formId:state.formId,editUrl:state.editUrl,sheetId:state.sheetId,sheetUrl:state.sheetUrl,responderUrl:state.responderUrl}));
 }finally{lock.releaseLock();}
}
function verify(){
 const state=load();if(!state||state.state!=='READY')throw Error('New church collection not ready.');
 const form=FormApp.openById(state.formId),all=form.getItems(),byId={};all.forEach(function(item){byId[String(item.getId())]=item;});
 let questionCount=0,branchCount=0;
 SPEC.nodes.forEach(function(n,index){
  if(index>0&&byId[state.pages[n.id]].getTitle()!==n.title)throw Error('Section mismatch: '+n.id);
  n.questions.forEach(function(q){
   const id=Object.keys(state.items).find(function(id){return state.items[id].node===n.id&&state.items[id].key===q.key;});
   const base=byId[id];if(!base||base.getTitle()!==q.title)throw Error('Question mismatch: '+q.key);
   const item=q.type==='branch'?base.asMultipleChoiceItem():q.type==='checkbox'?base.asCheckboxItem():q.options?base.asListItem():base.asTextItem();
   if(item.isRequired()!==q.required)throw Error('Required mismatch: '+q.key);
   if(q.options){const actual=item.getChoices();if(actual.length!==q.options.length||actual.some(function(c,i){return c.getValue()!==q.options[i].label;}))throw Error('Choices mismatch: '+q.key);}
   if(q.type==='branch'){branchCount++;item.getChoices().forEach(function(c,i){if(String(c.getGotoPage().getId())!==state.pages[q.options[i].go])throw Error('Branch mismatch: '+q.key);});}
   questionCount++;
  });
  if(n.next&&index+1<SPEC.nodes.length){const destination=byId[state.pages[SPEC.nodes[index+1].id]].asPageBreakItem().getGoToPage();if(!destination||String(destination.getId())!==state.pages[n.next])throw Error('Default exit mismatch: '+n.id);}
 });
 if(all.length!==questionCount+SPEC.nodes.length)throw Error('Unexpected item count.');
 if(form.isPublished()||form.getDestinationId()!==state.sheetId||form.getResponses().length!==0)throw Error('Publication, destination or response check failed.');
 const report={verifiedAt:new Date().toISOString(),formId:state.formId,version:state.version,title:form.getTitle(),published:form.isPublished(),responses:0,questions:questionCount,sections:SPEC.nodes.length,branches:branchCount,siblingLimit:20,childLimit:20,requiredAndChoicesVerified:true,navigationVerified:true,existingCollectionsAccessed:false,editUrl:form.getEditUrl(),responderUrl:state.responderUrl,sheetUrl:state.sheetUrl};
 console.log('CHURCH_VERIFIED '+JSON.stringify(report));
}
function responseRow(response,state){
 const byNode={};response.getItemResponses().forEach(function(r){const meta=state.items[String(r.getItem().getId())];if(!meta)return;const raw=r.getResponse();const decode=function(value){const option=(meta.options||[]).find(function(o){return o.label===value;});return option?option.code:value;};const value=Array.isArray(raw)?raw.map(decode):decode(raw);if(value!==''&&value!=null){if(!byNode[meta.node])byNode[meta.node]={};byNode[meta.node][meta.key]=value;}});
 // Only export the current route, excluding stale answers left after navigating Back.
 const answers={},visited={};let id='about';
 while(id){if(visited[id])throw Error('Questionnaire route cycle.');visited[id]=true;const n=SPEC.nodes.find(function(n){return n.id===id;});if(!n)throw Error('Unknown questionnaire route.');const current=byNode[id]||{};Object.assign(answers,current);const branch=n.questions.find(function(q){return q.type==='branch';});if(branch){const option=branch.options.find(function(o){return o.code===current[branch.key];});if(!option)throw Error('Missing routing answer: '+branch.title);id=option.go;}else id=n.next;}
 answers.callings=answers.callings||[];if(answers.singer==='YES')answers.callings.push('Singer');
 function member(prefix){return {name:answers[prefix+'.name'],phone:answers[prefix+'.phone'],nationalId:answers[prefix+'.nationalId']};}
 const members={father:member('father'),mother:member('mother'),siblings:[],children:[]};
 for(let i=0;i<20;i++){if(answers['sibling.'+i+'.name'])members.siblings.push(member('sibling.'+i));if(answers['child.'+i+'.name'])members.children.push(member('child.'+i));}
 return registrationRow(SCHEMA,answers,members);
}
function exportCsv(){
 const state=load();if(!state||state.state!=='READY')throw Error('Collection not ready.');const form=FormApp.openById(state.formId),responses=form.getResponses();if(!responses.length)throw Error('No responses to export.');
 const rows=responses.map(function(response){return responseRow(response,state);});rows.forEach(function(row){csv(SCHEMA,row);});
 const quote=function(value){return '"'+String(value||'').replace(/"/g,'""')+'"';};
 const content='\uFEFF'+[SCHEMA.headers].concat(rows.map(function(row){return SCHEMA.headers.map(function(key){return row[key]||'';});})).map(function(row){return row.map(quote).join(',');}).join('\r\n')+'\r\n';
 const file=DriveApp.createFile('church-person-360.csv',content,'text/csv');console.log('CHURCH_CSV '+file.getUrl());
}
