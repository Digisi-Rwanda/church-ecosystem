import { useEffect } from 'react';
import { fetchChoirs } from '../api/frontDoorApi';
import { CHOIR_REGISTER_CHANGED } from '../api/choirRegisterEvents';
import { useLoad } from './useLoad';

export function useChoirRegisterRefresh(reload: () => void) {
  useEffect(() => {
    const storage = (event: StorageEvent) => { if (event.key === CHOIR_REGISTER_CHANGED) reload(); };
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener(CHOIR_REGISTER_CHANGED, reload);
    window.addEventListener('focus', reload);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(CHOIR_REGISTER_CHANGED, reload);
      window.removeEventListener('focus', reload);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reload]);
}
export function useChoirRegister(systemId?: string, key = 'choir-register') {
  const result = useLoad(() => fetchChoirs(systemId), key);
  useChoirRegisterRefresh(result.reload);
  return result;
}
