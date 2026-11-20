import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {expect, it, vi} from 'vitest';
import {I18nProvider} from '../i18n/I18nContext';
import {PeopleLayout} from './PeopleLayout';
const state=vi.hoisted(()=>({code:'ADMINISTRATOR'}));
vi.mock('./FrontDoorContext',()=>({useFrontDoor:()=>({capabilities:{offices:[{code:state.code}],systems:[{id:'sys-main',blocks:{people:[]}}]}})}));
const render=(path:string)=>renderToStaticMarkup(h(I18nProvider,null,h(MemoryRouter,{initialEntries:[path]},h(Routes,null,h(Route,{path:'/s/:systemId/people',element:h(PeopleLayout)},h(Route,{path:'*',element:h('p',null,'Allowed admin screen')}))))));
it('opens the chief administration screens without ordinary People letters',()=>{
  state.code='ADMINISTRATOR';
  for(const page of ['appointments','access','admin']) expect(render('/s/sys-main/people/'+page)).toContain('Allowed admin screen');
});
it('does not open the directory or individual profiles through the chief-only exception',()=>{
  state.code='ADMINISTRATOR';
  for(const page of ['', 'p-other','new','import']) expect(render('/s/sys-main/people/'+page)).not.toContain('Allowed admin screen');
});
it('does not give the chief exception to a System Administrator',()=>{
  state.code='SYSTEM_ADMINISTRATOR';
  expect(render('/s/sys-main/people/admin')).not.toContain('Allowed admin screen');
});
