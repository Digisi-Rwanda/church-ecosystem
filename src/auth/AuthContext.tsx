import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  apiFetchGrants,
  isApiEnabled,
  type ApiGrant,
} from '../api';
import {
  allowedProfileSections,
  getEffectiveScope,
  roleLabel,
} from '../domain/access';
import type {
  AccessScope,
  Action,
  Assignment,
  AuthzDecision,
  ChurchSystem,
  Membership,
  PermissionGrant,
  Position,
  Resource,
  SessionState,
  SystemEntitlement,
  SystemId,
  SystemRole,
  UserAccount,
  WorkTask,
} from '../domain/types';
import {
  accessService,
  authService,
  openSystem,
  participationService,
  peopleService,
  systemsService,
} from '../services';

function toPermissionGrants(grants: ApiGrant[]): PermissionGrant[] {
  return grants.map((g) => ({
    systemId: g.systemId as SystemId,
    resource: g.resource as Resource,
    action: g.action as Action,
    source: g.source as PermissionGrant['source'],
    reason: g.reason,
  }));
}

interface AuthContextValue {
  account: UserAccount | null;
  personName: string;
  scope: AccessScope;
  roles: SystemRole[];
  roleLabels: string[];
  session: SessionState | null;
  currentSystem: ChurchSystem | null;
  entitlements: SystemEntitlement[];
  grants: PermissionGrant[];
  /** True when grants come from the server policy engine. */
  grantsFromApi: boolean;
  availableSystems: ChurchSystem[];
  memberships: Membership[];
  positions: Position[];
  assignments: Assignment[];
  tasks: WorkTask[];
  login: (
    username: string,
    password: string,
    targetSystemId?: SystemId,
  ) => Promise<boolean>;
  apiEnabled: boolean;
  authSource: 'local' | 'api';
  logout: () => void;
  refreshSession: () => void;
  activeChoirOrgUnitId: string | null;
  setActiveChoir: (orgUnitId: string) => void;
  openPeerSystem: (toSystemId: SystemId) => {
    ok: boolean;
    url?: string;
    reason?: string;
  };
  authorize: (
    resource: Resource,
    action: Action,
    systemId?: SystemId,
  ) => AuthzDecision;
  can: (
    resource: Resource,
    action: Action,
    systemId?: SystemId,
  ) => boolean;
  canEnter: (systemId: SystemId) => boolean;
  canManagePeople: boolean;
  canLinkAccounts: boolean;
  canViewFullRecord: boolean;
  canViewPeople: boolean;
  allowedSections: string[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<UserAccount | null>(() =>
    authService.getSessionAccount(),
  );
  const [session, setSession] = useState<SessionState | null>(() =>
    authService.getSession(),
  );
  const [apiGrants, setApiGrants] = useState<PermissionGrant[] | null>(null);

  const hydrateApiGrants = useCallback(async () => {
    if (!isApiEnabled() || authService.authSource() !== 'api') {
      setApiGrants(null);
      return;
    }
    try {
      const res = await apiFetchGrants();
      setApiGrants(toPermissionGrants(res.grants));
    } catch {
      setApiGrants(null);
    }
  }, []);

  const refreshSession = useCallback(() => {
    setAccount(authService.getSessionAccount());
    setSession(authService.getSession());
    void hydrateApiGrants();
  }, [hydrateApiGrants]);

  useEffect(() => {
    void hydrateApiGrants();
  }, [account?.id, hydrateApiGrants]);

  const setActiveChoir = useCallback(
    (orgUnitId: string) => {
      const current = authService.getSession()?.activeChoirOrgUnitId;
      if (current === orgUnitId) return;
      authService.setActiveChoirOrgUnitId(orgUnitId);
      refreshSession();
    },
    [refreshSession],
  );

  const login = useCallback(
    async (
      username: string,
      password: string,
      targetSystemId: SystemId = 'sys-main',
    ) => {
      const result = await authService.login(
        username,
        password,
        targetSystemId,
      );
      setAccount(result);
      setSession(authService.getSession());
      if (result && authService.authSource() === 'api') {
        await hydrateApiGrants();
      } else {
        setApiGrants(null);
      }
      return Boolean(result);
    },
    [hydrateApiGrants],
  );

  const logout = useCallback(() => {
    authService.logout();
    setAccount(null);
    setSession(null);
    setApiGrants(null);
  }, []);

  const openPeerSystem = useCallback(
    (toSystemId: SystemId) => {
      const from = session?.currentSystemId ?? 'sys-main';
      const result = openSystem(account, toSystemId, from);
      if (!result.ok) return { ok: false, reason: result.reason };
      return { ok: true, url: result.url };
    },
    [account, session],
  );

  const value = useMemo<AuthContextValue>(() => {
    const person = account ? peopleService.getById(account.personId) : null;
    const mainRoles = account
      ? participationService.rolesFor(account.personId)
      : [];
    // Anyone without one of the five main-church roles is simply a Member.
    const roles: SystemRole[] =
      account && mainRoles.length === 0 ? ['MEMBER'] : mainRoles;
    const entitlements = account
      ? participationService.entitlementsFor(account.personId)
      : [];
    const localGrants = account
      ? accessService.effectiveAccess(account.personId)
      : [];
    const grants = apiGrants ?? localGrants;
    const grantsFromApi = Boolean(apiGrants);
    const scope = getEffectiveScope(roles);
    const currentSystemId = session?.currentSystemId ?? 'sys-main';
    const currentSystem = session
      ? systemsService.getById(session.currentSystemId)
      : null;
    const entryMode = session?.entryMode;

    const decide = (
      resource: Resource,
      action: Action,
      systemId: SystemId,
      audit: boolean,
    ): AuthzDecision => {
      if (!account) {
        return {
          allowed: false,
          personId: '',
          systemId,
          resource,
          action,
          reason: 'Not signed in',
          evaluatedAt: new Date().toISOString(),
        };
      }
      if (apiGrants) {
        return accessService.authorizeWithGrants(
          account.personId,
          systemId,
          resource,
          action,
          apiGrants,
          { entryMode, audit },
        );
      }
      return accessService.authorize(
        account.personId,
        systemId,
        resource,
        action,
        { entryMode, audit },
      );
    };

    const authorize = (
      resource: Resource,
      action: Action,
      systemId: SystemId = currentSystemId,
    ): AuthzDecision => decide(resource, action, systemId, true);

    const can = (
      resource: Resource,
      action: Action,
      systemId: SystemId = currentSystemId,
    ): boolean => decide(resource, action, systemId, false).allowed;

    const canEnter = (systemId: SystemId) =>
      account ? can('SYSTEM', 'ENTER', systemId) : false;

    return {
      account,
      personName: person?.preferredName || person?.fullName || 'User',
      scope,
      roles,
      roleLabels: roles.map(roleLabel),
      session,
      currentSystem,
      entitlements,
      grants,
      grantsFromApi,
      availableSystems: account
        ? systemsService
            .listActive()
            .filter((s) => s.id !== 'sys-finance' && canEnter(s.id))
        : [],
      memberships: account
        ? participationService.activeMemberships(account.personId)
        : [],
      positions: account
        ? participationService.activePositions(account.personId)
        : [],
      assignments: account
        ? participationService.activeAssignments(account.personId)
        : [],
      tasks: account
        ? participationService.activeTasks(account.personId)
        : [],
      login,
      apiEnabled: isApiEnabled(),
      authSource: authService.authSource(),
      logout,
      refreshSession,
      activeChoirOrgUnitId: session?.activeChoirOrgUnitId ?? null,
      setActiveChoir,
      openPeerSystem,
      authorize,
      can,
      canEnter,
      canManagePeople: account
        ? can('PERSON', 'MANAGE', currentSystemId)
        : false,
      canLinkAccounts: account
        ? can('PERSON', 'LINK_ACCOUNT', currentSystemId)
        : false,
      canViewFullRecord: account
        ? can('PERSON', 'VIEW_FULL', currentSystemId)
        : false,
      canViewPeople: account
        ? can('PERSON', 'VIEW', 'sys-main') ||
          can('PERSON', 'VIEW_FULL', 'sys-main') ||
          can('PERSON', 'MANAGE', 'sys-main') ||
          can('PERSON', 'VIEW', currentSystemId) ||
          can('PERSON', 'MANAGE', currentSystemId)
        : false,
      allowedSections: allowedProfileSections(scope),
    };
  }, [
    account,
    session,
    apiGrants,
    login,
    logout,
    refreshSession,
    setActiveChoir,
    openPeerSystem,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
