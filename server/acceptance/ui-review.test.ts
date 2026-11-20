// Development-only browser acceptance fixture. All Prisma access is replaced with memory.
import { it, vi } from 'vitest';
import { createFakePrisma } from '../tests/fakePrisma';
import { seedWorld } from '../tests/world';
const fake = createFakePrisma();
vi.mock('../src/lib/prisma.js',()=>({prisma:fake}));
it('serves the isolated scheduling acceptance fixture', async()=>{
  console.log('Fixture initialization'); const db=fake.__db; seedWorld(db);
  // Match Prisma's schema defaults missing from the generic route-test stand-in.
  const createAway = fake.musicChoirUnavailability.create;
  fake.musicChoirUnavailability.create = async (args: any) => createAway({ ...args, data: { recordedAt: new Date(), updatedAt: new Date(), ...args.data } });
  for(const key of ['orgUnit','delegation','setting','notification','notificationRead','preference','musicChoir','musicChoirMember','musicDraft','musicMonth','musicLog','protocolRoster','protocolPlan','protocolSlot','protocolHistory','protocolAttendance','protocolAbsence','protocolFillIn','protocolSwapProposal','protocolServiceReport']) db[key] ??= [];
  for(const row of db.churchSystem)Object.assign(row,{code:row.id.replace('sys-','').toUpperCase(),name:row.id,shortName:row.id.replace('sys-',''),kind:'MINISTRY',basePath:'/s/'+row.id});
  for(const id of ['p-coord','p-pres',...Array.from({length:16},(_,i)=>'crew-'+i)])db.person.push({id,fullName:id==='p-coord'?'Coordinator':id==='p-pres'?'President':'Member '+id.replace('crew-',''),status:'ACTIVE',email:id+'@example.invalid',phone:'0780000000'});
  for(const [personId,systemId,office] of [['p-outsider','sys-music','PRESIDENT'],['p-coord','sys-protocol','COORDINATOR'],['p-pres','sys-protocol','PRESIDENT']])db.position.push({id:'preview-'+personId,personId,systemId,office,title:office,status:'ACTIVE',startDate:new Date('2020-01-01')});
  console.log('Loading scheduling store'); const store=await import('../src/scheduling/store.js');
  console.log('Creating memory records'); const music=await store.createConfigVersion({systemId:'sys-music',version:1,label:'Music rules 1',status:'ACTIVE',createdByPersonId:'p-outsider'});
  const category=await store.createChoirCategory({systemId:'sys-music',code:'PRIMARY',name:'Community choirs',configVersionId:music.id,createdByPersonId:'p-outsider'});
  for(const [i,name,role]of [[1,'Grace Choir','CHILDREN'],[2,'Faith Choir','PRIMARY'],[3,'Hope Choir','WORSHIP'],[4,'Peace Choir','PRIMARY']] as const){const id='choir-'+i;db.musicChoir.push({id,name,role,active:true,systemId:'sys-choir',createdById:'p-outsider',createdAt:new Date()});await store.createChoirCategoryLink({systemId:'sys-music',choirId:id,categoryId:category.id,configVersionId:music.id,createdByPersonId:'p-outsider'});}
  const protocol=await store.createConfigVersion({systemId:'sys-protocol',version:1,label:'Protocol rules 1',status:'ACTIVE',createdByPersonId:'p-coord'});
  for(const [code,name,weekday]of [['ss1','Sunday morning',0],['friday','Friday gathering',5]] as const){const service=await store.createSchedulingService({systemId:'sys-music',code,name,weekday,time:code==='ss1'?'09:00':'18:00',recurrence:'WEEKLY',selectedDates:[],musicRequired:true,protocolRequired:code==='ss1',maxChoirs:2,configVersionId:music.id,createdByPersonId:'p-outsider'});await store.createCategoryServicePolicy({systemId:'sys-music',categoryId:category.id,serviceId:service.id,eligible:true,minCount:1,maxCount:2,planningMode:'ROTATION',frequencyTarget:code==='ss1'?1:null,frequencyPeriod:code==='ss1'?'MONTH':null,frequencyKind:'MINIMUM',configVersionId:music.id,createdByPersonId:'p-outsider'});if(code==='ss1')await store.createProtocolServiceRule({systemId:'sys-protocol',serviceId:service.id,required:true,defaultTeamSize:2,requireChoir:false,requireWorship:false,relaxableKinds:[],configVersionId:protocol.id,createdByPersonId:'p-coord'});}
  await store.createProtocolDutyPolicy({systemId:'sys-protocol',preferTarget:3,softMax:3,hardMax:4,leadershipPriorities:[],configVersionId:protocol.id,createdByPersonId:'p-coord'});
  for(const person of db.person.filter((row:any)=>row.id.startsWith('crew-')||row.id==='p-coord'||row.id==='p-pres'))db.protocolRoster.push({id:'roster-'+person.id,personId:person.id,office:person.id==='p-pres'?'PRESIDENT':person.id==='p-coord'?'COORDINATOR':'MEMBER',serveDays:'BOTH',status:'ACTIVE',unavailableJson:'[]',allowedKindsJson:'[]',onlyServicesJson:'[]',notes:''});
  db.account ??= [];
  for(const person of db.person)db.account.push({id:'fixture-'+person.id,personId:person.id,username:person.id,person:{...person,memberships:db.membership.filter((row:any)=>row.personId===person.id),positions:db.position.filter((row:any)=>row.personId===person.id)}});
  const sharedServices = db.schedulingService.filter(row => row.configVersionId === music.id);
  for (const [code, name] of [['CHILDREN','Children’s Choir'], ['SECONDARY','Secondary Choir'], ['WORSHIP','Worship Team']]) {
    const cat = await store.createChoirCategory({systemId:'sys-music',code,name,configVersionId:music.id,createdByPersonId:'p-outsider'});
    for (const service of sharedServices) await store.createCategoryServicePolicy({systemId:'sys-music',categoryId:cat.id,serviceId:service.id,eligible:code === 'SECONDARY' || service.code === 'ss1',minCount:null,maxCount:1,planningMode:'ROTATION',frequencyTarget:null,frequencyKind:'TARGET',configVersionId:music.id,createdByPersonId:'p-outsider'});
  }
  await store.cloneActiveConfigVersion('sys-music',{label:'First working draft',createdByPersonId:'p-outsider'});
  await store.cloneActiveConfigVersion('sys-music',{label:'Second working draft',createdByPersonId:'p-outsider'});
  // Choir office review fixture: no database is connected.
  db.orgUnit.push({id:'ou-choir-review',name:'Grace Choir — leadership review',kind:'TEAM',type:'TEAM',systemId:'sys-choir-review',parentId:null});
  db.churchSystem.push({id:'sys-choir-review',code:'CHOIR-REVIEW',name:'Grace Choir',shortName:'Grace Choir',kind:'MINISTRY',orgUnitId:'ou-choir-review'});
  db.position.push({id:'preview-admin',personId:'p-outsider',office:'ADMINISTRATOR',systemId:'sys-media',status:'ACTIVE',startDate:new Date('2020-01-01')});
  db.orgUnit.push({id:'ou-choir-other',name:'Hope Choir — separate system',kind:'TEAM',type:'TEAM',systemId:'sys-choir-other',parentId:null});
  db.churchSystem.push({id:'sys-choir-other',code:'CHOIR-OTHER',name:'Hope Choir',shortName:'Hope Choir',kind:'MINISTRY',orgUnitId:'ou-choir-other'});
  db.position.push({id:'preview-system-admin',personId:'crew-0',office:'SYSTEM_ADMINISTRATOR',systemId:'sys-choir-review',orgUnitId:'ou-choir-review',status:'ACTIVE',startDate:new Date('2020-01-01')});
  const {createApp}=await import('../src/app.js');const app=createApp();
  const port=Number(process.env.SCHEDULING_PREVIEW_PORT ?? 4317); const server=app.listen(port,'127.0.0.1');console.log('Scheduling UI fixture ready on '+port+'; Prisma is mocked.');
  await new Promise<void>(resolve=>{const timer=setTimeout(()=>server.close(),Number(process.env.SCHEDULING_PREVIEW_DURATION_MS ?? 1100000));server.on('close',()=>{clearTimeout(timer);resolve();});});
});
