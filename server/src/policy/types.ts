/** Minimal policy types (mirrors SPA domain types used by authorize). */

export type SystemId = string;
export type Action = string;
export type Resource = string;
export type SystemRole = string;

export type PermissionGrant = {
  systemId: SystemId;
  resource: Resource;
  action: Action;
  source: string;
  reason: string;
};

export type Membership = {
  id: string;
  personId: string;
  systemId?: SystemId;
  orgUnitId?: string;
  type: string;
  label: string;
  status: string;
  startDate: string;
  endDate?: string;
};

export type Position = {
  id: string;
  personId: string;
  systemId?: SystemId;
  orgUnitId?: string;
  title: string;
  systemRole?: SystemRole;
  ministryOffice?: string;
  choirOffice?: string;
  /** The one office record (new); the older columns above stay until the engine moves to letters. */
  office?: string;
  choirAdvisorRole?: string;
  systemAdmin?: boolean;
  worshipOffice?: string;
  protocolOffice?: string;
  deaconOffice?: string;
  grantsAllSystems?: boolean;
  status: string;
  startDate: string;
  endDate?: string;
};

export type Assignment = {
  id: string;
  personId: string;
  systemId?: SystemId;
  title: string;
  contextLabel: string;
  status: string;
  startDate: string;
  endDate?: string;
};

export type WorkTask = {
  id: string;
  ownerPersonId: string;
  title: string;
  systemId?: SystemId;
  status: string;
  grantsSystemAccess?: boolean;
  dueAt?: string;
  /** A task grants access only between these dates, as in the SPA (isTaskActive). */
  startDate?: string;
  endDate?: string;
};

export type AuthzRequest = {
  personId: string;
  systemId: SystemId;
  resource: Resource;
  action: Action;
  now?: Date;
};

export type AuthzDecision = {
  allowed: boolean;
  personId: string;
  systemId: SystemId;
  resource: Resource;
  action: Action;
  matchedGrant?: PermissionGrant;
  reason: string;
  evaluatedAt: string;
};

export type ChoirOffice =
  | 'MUSIC_DIRECTOR'
  | 'SECRETARY'
  | 'TREASURER'
  | 'COORDINATOR'
  | 'PRESIDENT'
  | 'VP'
  | 'ADVISOR'
  | 'FAMILY_LEADER'
  | 'MEMBER';

export type UserAccount = {
  id: string;
  personId: string;
  username: string;
  password: string;
};

export type SystemEntitlement = {
  systemId: SystemId;
  source: string;
  reason: string;
};
