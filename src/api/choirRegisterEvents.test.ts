import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./client',()=>({ApiError:class extends Error{},apiFetch:vi.fn(async()=>({}))}));
import { apiFetch } from './client';
import { createChoir, editChoir, deleteChoir, setChoirActive } from './frontDoorApi';
import { CHOIR_REGISTER_CHANGED } from './choirRegisterEvents';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('Choir register invalidation',()=>{
  it('announces successful register changes locally and to other tabs',async()=>{
    const target=new EventTarget(), listener=vi.fn(), setItem=vi.fn();
    target.addEventListener(CHOIR_REGISTER_CHANGED,listener);
    vi.stubGlobal('window',target);vi.stubGlobal('localStorage',{setItem});
    await createChoir({name:'New',role:'PRIMARY'});await editChoir('c',{name:'Renamed',role:'CHILDREN'});await setChoirActive('c',false);await deleteChoir('unused');
    expect(listener).toHaveBeenCalledTimes(4);expect(setItem).toHaveBeenCalledTimes(4);
    expect(setItem).toHaveBeenLastCalledWith(CHOIR_REGISTER_CHANGED,expect.any(String));
  });
  it('does not announce a failed register write',async()=>{
    const target=new EventTarget(), listener=vi.fn(), setItem=vi.fn();target.addEventListener(CHOIR_REGISTER_CHANGED,listener);
    vi.stubGlobal('window',target);vi.stubGlobal('localStorage',{setItem});
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Refused'));
    await expect(deleteChoir('referenced')).rejects.toThrow('Refused');
    expect(listener).not.toHaveBeenCalled();expect(setItem).not.toHaveBeenCalled();
  });
});
