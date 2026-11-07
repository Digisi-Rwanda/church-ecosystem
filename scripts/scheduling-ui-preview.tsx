import { AppointmentsPage } from '../src/newdesign/AppointmentsPage';
import { ChoirsPage } from '../src/newdesign/ChoirsPage';
import { AddPersonPage } from '../src/newdesign/AddPersonPage';
import { PeopleImportPage } from '../src/newdesign/PeopleImportPage';
import { Person360Page } from '../src/newdesign/Person360Page';
import { PersonCardPage } from '../src/newdesign/PersonCardPage';
// Development-only acceptance entry; never imported by the production app.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../src/i18n/I18nContext';
import { FrontDoorProvider } from '../src/newdesign/FrontDoorContext';
import { DoorSchedulingConfigPage } from '../src/newdesign/DoorSchedulingConfigPage';
import { MonthPlanPage } from '../src/newdesign/MonthPlanPage';
import { ProtocolTeamsPage } from '../src/newdesign/ProtocolTeamsPage';
import { ProtocolRosterPage } from '../src/newdesign/ProtocolRosterPage';
import { ProtocolMinePage } from '../src/newdesign/ProtocolMinePage';
import '../src/styles/app.css';
const query=new URLSearchParams(location.search), person=query.get('person') ?? 'p-outsider';
function encode(value:object){return btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
const header=encode({alg:'HS256',typ:'JWT'}), body=encode({sub:'fixture-'+person,personId:person,username:person,exp:Math.floor(Date.now()/1000)+3600});
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(header+'.'+body)));
localStorage.setItem('adepr.apiToken',header+'.'+body+'.'+btoa(String.fromCharCode(...sig)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''));
const route=query.get('route') ?? '/s/sys-music/config';
createRoot(document.getElementById('root')!).render(<I18nProvider><FrontDoorProvider><MemoryRouter initialEntries={[route]}><main style={{maxWidth:1100,margin:'auto',padding:20}}><p>Acceptance fixture · in-memory storage · {person}</p><Routes><Route path="/s/:systemId/people/new" element={<AddPersonPage/>}/><Route path="/s/:systemId/people/import" element={<PeopleImportPage/>}/><Route path="/s/:systemId/people/:personId/360" element={<Person360Page/>}/><Route path="/s/:systemId/people/:personId" element={<PersonCardPage/>}/><Route path="/s/:systemId/people/appointments" element={<AppointmentsPage/>}/><Route path="/s/:systemId/choirs" element={<ChoirsPage/>}/><Route path="/s/:systemId/config" element={<DoorSchedulingConfigPage/>}/><Route path="/s/:systemId/monthplan" element={<MonthPlanPage/>}/><Route path="/s/:systemId/teams" element={<ProtocolTeamsPage/>}/><Route path="/s/:systemId/roster" element={<ProtocolRosterPage/>}/><Route path="/s/:systemId/mine" element={<ProtocolMinePage/>}/></Routes></main></MemoryRouter></FrontDoorProvider></I18nProvider>);
