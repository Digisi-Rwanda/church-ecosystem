import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiLogin, apiMe } from '../api/authApi';
import { ApiError, getApiToken, setApiToken } from '../api/client';
import {
  fetchCapabilities,
  fetchPortal,
  type Capabilities,
  type PortalSystem,
} from '../api/frontDoorApi';
import { authService } from '../services';

type Status = 'checking' | 'out' | 'loading' | 'in' | 'error';

export type SignInResult = 'ok' | 'refused' | 'unreachable' | 'failed';

type FrontDoorValue = {
  status: Status;
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
  const [personName, setPersonName] = useState('');
  const [portal, setPortal] = useState<PortalSystem[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [me, systems, caps] = await Promise.all([apiMe(), fetchPortal(), fetchCapabilities()]);
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
      await load();
      return 'ok';
    },
    [load],
  );

  const signOut = useCallback(() => {
    authService.logout(); // also clears the token and anything the old app kept
    setApiToken(null);
    setPortal([]);
    setCapabilities(null);
    setPersonName('');
    setStatus('out');
  }, []);

  const value = useMemo<FrontDoorValue>(
    () => ({ status, personName, portal, capabilities, signIn, signOut, reload: load }),
    [status, personName, portal, capabilities, signIn, signOut, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFrontDoor(): FrontDoorValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFrontDoor must be used inside FrontDoorProvider');
  return v;
}
