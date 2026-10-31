import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { musicExceptions, preserveRelaxableKinds, schedulingError } from './schedulingForms';
import type { ChoirCategoryLinkApi } from '../api/frontDoorApi';
describe('editing versioned choir participation',()=>{
  const prior = {eligibleOverride:{SS1:false,custom:true},frequencyOverride:{SS1:{frequencyKind:'MINIMUM',frequencyCounting:'DISTINCT_DATES'},custom:{frequencyTarget:9,frequencyPeriod:'YEAR'}}} as unknown as ChoirCategoryLinkApi;
  it('keeps hidden services and partial inherited settings when membership is edited',()=>{
    const data=new FormData();data.append('exceptionCode','ss1');data.set('eligible:ss1','no');data.set('target:ss1','');data.set('kind:ss1','MINIMUM');data.set('period:ss1','');
    expect(musicExceptions(data,prior)).toEqual({eligibleOverride:prior.eligibleOverride,frequencyOverride:prior.frequencyOverride});
  });
  it('changes a known exception without dropping counting or hidden service settings',()=>{
    const data=new FormData();data.append('exceptionCode','ss1');data.set('eligible:ss1','yes');data.set('target:ss1','2');data.set('kind:ss1','MAXIMUM');data.set('period:ss1','QUARTER');
    expect(musicExceptions(data,prior)).toEqual({eligibleOverride:{SS1:true,custom:true},frequencyOverride:{SS1:{frequencyTarget:2,frequencyKind:'MAXIMUM',frequencyPeriod:'QUARTER',frequencyCounting:'DISTINCT_DATES'},custom:prior.frequencyOverride.custom}});
    expect(prior.eligibleOverride.SS1).toBe(false);
  });
  it('removes only explicitly cleared supported fields',()=>{
    const data=new FormData();data.append('exceptionCode','ss1');data.set('eligible:ss1','inherit');data.set('kind:ss1','');data.set('period:ss1','');data.set('target:ss1','');
    expect(musicExceptions(data,prior)).toEqual({eligibleOverride:{custom:true},frequencyOverride:{SS1:{frequencyCounting:'DISTINCT_DATES'},custom:prior.frequencyOverride.custom}});
  });
  it('preserves unsupported relaxation codes while updating selected supported ones',()=>{
    expect(preserveRelaxableKinds(['ss1','CUSTOM'],['TUESDAY'])).toEqual(['CUSTOM','TUESDAY']);
  });
  it('shows actionable policy validation issues and withholds server errors',()=>{
    expect(schedulingError(new ApiError('x',409,{error:'Resolve rules',issues:['Choose a period',{message:'Link Grace Choir'}]}))).toBe('Resolve rules · Choose a period · Link Grace Choir');
    expect(schedulingError(new ApiError('x',500,{error:'Internal details'}))).toBeNull();
  });
});
