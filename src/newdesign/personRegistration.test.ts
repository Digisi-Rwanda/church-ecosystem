import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {I18nProvider} from '../i18n/I18nContext';
import {PersonRegistrationSections} from './PersonRegistrationSections';
import {peopleImportTemplate,PROFILE_COLUMNS} from './personRegistration';
import {parseCsv} from './peopleTools';
import {mapImport} from './peopleImportMapping';
import {SECTION_ORDER} from './person360';

describe('full Person 360 registration',()=>{
  it('round-trips every readable spreadsheet header to a recognized API field',()=>{
    const template=peopleImportTemplate(SECTION_ORDER);
    const headers=parseCsv(template)[0];
    const mapped=mapImport([headers,headers.map((_,index)=>index===0?'New member':'value')]);
    expect(mapped.unknown).toEqual([]); expect(mapped.hasName).toBe(true);
    expect(mapped.rows[0].nationalId).toBe('value');
    for(const column of PROFILE_COLUMNS) expect(mapped.rows[0][column.key]).toBe('value');
    for(const section of SECTION_ORDER) expect(PROFILE_COLUMNS.some(column=>column.section===section)).toBe(true);
    expect(template).not.toMatch(/Person ID|Unit ID/);
  });
  it('restricts template columns and registration sections to server-granted write rights',()=>{
    const template=peopleImportTemplate(['CONTACT','EDUCATION']);
    expect(template).toContain('Contact - Label'); expect(template).not.toContain('Marriage - Date');
    const html=renderToStaticMarkup(createElement(I18nProvider,null,createElement(PersonRegistrationSections,{write:['CONTACT','EDUCATION'],records:[],onChange:()=>{}})));
    expect(html).toContain('Contact'); expect(html).toContain('Education'); expect(html).not.toContain('Baptism');
  });
  it('collects conditional work, family and marriage fields without losing section identity',()=>{
    const html=renderToStaticMarkup(createElement(I18nProvider,null,createElement(PersonRegistrationSections,{write:SECTION_ORDER,records:[
      {id:1,section:'EMPLOYMENT',values:{status:'SELF_EMPLOYED'}},
      {id:2,section:'FAMILY',values:{relation:'CHILD'}},
      {id:3,section:'MARRIAGE',values:{endedBy:'DEATH'}},
    ],onChange:()=>{}})));
    expect(html).toContain('profile-1-business'); expect(html).toContain('profile-2-dateOfBirth'); expect(html).toContain('profile-3-endedOn');
    expect(html).not.toContain('profile-1-employer');
  });
});
