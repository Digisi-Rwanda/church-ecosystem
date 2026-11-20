import { clearBrowserData } from '../lib/clearBrowserData';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiLogin } from '../api/authApi';
import { ApiError, SESSION_EXPIRED_EVENT, getApiToken, setApiToken } from '../api/client';
import { fetchBootstrap, type Capabilities, type PortalSystem } from '../api/frontDoorApi';
import { clearOffline } from '../api/offlineStore';
import { clearLoadCache } from './useLoad';

type Status = 'checking' | 'out' | 'loading' | 'in' | 'error';

export type SignInResult = 'ok' | 'refused' | 'unreachable' | 'failed';

type FrontDoorValue = {
  status: Status;
  /** True when the server ended the session (as opposed to the person signing out). */
  sessionEnded: boolean;
  personName: string;
  portal: PortalSystem[];
  capabilities: Capabilities | null;
  signIn: (username: string, password: string) => Promise<SignInResult>;
  signOut: () => void;
  reload: () => Promise<void>;
};

const Ctx = createContext<FrontDoorValue | null>(null);

/**
 * The new front door talks only to the server: no local demo accounts, no browser
 * copy of the access rules. What the person may open and do is exactly what
 * /api/portal and /api/me/capabilities answer.
 */
export function FrontDoorProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (getApiToken() ? 'checking' : 'out'));
  const [sessionEnded, setSessionEnded] = useState(false);
  const [personName, setPersonName] = useState('');
  const [portal, setPortal] = useState<PortalSystem[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  const load = useCallback(async () => {
    // Already signed in: refresh quietly, without blanking the screen.
    setStatus((s) => (s === 'in' ? s : 'loading'));
    try {
      const { me, systems, capabilities: caps } = await fetchBootstrap();
      setPersonName(me.person.preferredName || me.person.fullName);
      setPortal(systems);
      setCapabilities(caps);
      setStatus('in');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setApiToken(null);
        setStatus('out');
      } else {
        setStatus('error');
      }
    }
  }, []);

  // A signed-in request the server refused as unauthenticated: the session is over, wherever the person was.
  useEffect(() => {
    const ended = () => {
      if (!getApiToken()) return;
      clearLoadCache();
      clearOffline();
      setApiToken(null);
      setPortal([]);
      setCapabilities(null);
      setSessionEnded(true);
      setStatus('out');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, ended);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, ended);
  }, []);

  useEffect(() => {
    if (getApiToken()) void load();
    // Only on first mount: a token left from an earlier visit is checked once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    async (username: string, password: string): Promise<SignInResult> => {
      try {
        await apiLogin(username, password);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return 'refused';
        if (e instanceof ApiError && e.status === 0) return 'unreachable';
        return 'failed';
      }
      clearLoadCache();
      setSessionEnded(false);
      await load();
      return 'ok';
    },
    [load],
  );

  const signOut = useCallback(() => {
    clearLoadCache();
    clearOffline();
    setApiToken(null);
    // Clear whatever an earlier release kept for this browser.
    clearBrowserData();
    setPortal([]);
    setCapabilities(null);
    setPersonName('');
    setSessionEnded(false);
    setStatus('out');
  }, []);

  const value = useMemo<FrontDoorValue>(
    () => ({ status, sessionEnded, personName, portal, capabilities, signIn, signOut, reload: load }),
    [status, sessionEnded, personName, portal, capabilities, signIn, signOut, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFrontDoor(): FrontDoorValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFrontDoor must be used inside FrontDoorProvider');
  return v;
}
