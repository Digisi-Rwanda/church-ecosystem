import type { AccessLetter, ModuleKey, OfficeCode, SharedBlock, UnitKind } from '../../server/src/shared/vocabulary';
import { apiFetch } from './client';

export type PortalSystem = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  basePath: string;
  /** The person's role in that system, e.g. "Choir Leader" or "Member". */
  role: string;
  unreadCount: number;
};

/** A system's own blocks after the six shared ones. */
export type OwnBlock = 'governance' | 'settings';

export type Capabilities = {
  personId: string;
  offices: Array<{ id: string; systemId: string | null; title: string; code: OfficeCode | null }>;
  systems: Array<{ id: string; blocks: Record<SharedBlock, AccessLetter[]>; own?: Array<{ key: OwnBlock; letters: AccessLetter[] }> }>;
  blockOrder: SharedBlock[];
};

export async function fetchPortal(): Promise<PortalSystem[]> {
  const res = await apiFetch<{ systems: PortalSystem[] }>('/api/portal');
  return res.systems;
}

export async function fetchCapabilities(): Promise<Capabilities> {
  return apiFetch<Capabilities>('/api/me/capabilities');
}

/* ── People, units and offices (slice 1.2) ── */

export type PersonStatus = 'ACTIVE' | 'INACTIVE' | 'VISITOR';

/** A person as the server shows them to this viewer; fields the viewer may not see are simply absent. */
export type DirectoryPerson = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  memberCode?: string | null;
  status: PersonStatus;
  phone?: string | null;
  email?: string | null;
  archivedAt?: string | null;
  archivedReason?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  nationalId?: string | null;
  joinedChurchOn?: string | null;
  pastoralNotes?: string | null;
};

export type UnitRecord = {
  id: string;
  name: string;
  type: string;
  kind: 'CENTRAL' | 'MINISTRY' | 'ORGANISATION' | 'TEAM';
  code: string | null;
  parentId: string | null;
  description: string | null;
  systemId: string | null;
  leaderPersonId: string | null;
};

export type MembershipRecord = {
  id: string;
  personId: string;
  label: string;
  orgUnitId: string | null;
  systemId: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
};

export type OfficeRecord = {
  id: string;
  personId: string;
  title: string;
  office: OfficeCode | null;
  orgUnitId: string | null;
  systemId: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
};

export type Structure = {
  units: UnitRecord[];
  memberships: MembershipRecord[];
  offices: OfficeRecord[];
};

export async function fetchPeople(opts: { q?: string; status?: string; archived?: boolean; ids?: string[] } = {}): Promise<DirectoryPerson[]> {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q);
  if (opts.status) qs.set('status', opts.status);
  if (opts.archived) qs.set('archived', 'true');
  if (opts.ids?.length) qs.set('ids', opts.ids.join(','));
  const res = await apiFetch<{ people: DirectoryPerson[] }>(`/api/people${qs.size ? `?${qs}` : ''}`);
  return res.people;
}

export async function fetchPerson(id: string): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>(`/api/people/${encodeURIComponent(id)}`);
  return res.person;
}

export async function fetchStructure(): Promise<Structure> {
  const res = await apiFetch<{
    orgUnits: UnitRecord[];
    memberships: MembershipRecord[];
    positions: OfficeRecord[];
  }>('/api/participation/records');
  return { units: res.orgUnits, memberships: res.memberships, offices: res.positions };
}

export type NewPerson = {
  fullName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  nationalId?: string;
  confirmDuplicate?: boolean;
};

export async function createPerson(body: NewPerson): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>('/api/people', { method: 'POST', body });
  return res.person;
}

export async function archivePerson(id: string, reason?: string): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>(`/api/people/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    body: { reason },
  });
  return res.person;
}

export async function unarchivePerson(id: string): Promise<DirectoryPerson> {
  const res = await apiFetch<{ person: DirectoryPerson }>(`/api/people/${encodeURIComponent(id)}/unarchive`, {
    method: 'POST',
    body: {},
  });
  return res.person;
}

/* ── Access by letters (slice 1.3) ── */

export type AccessPowers = {
  canAppoint: boolean;
  canAppointLeader: boolean;
  canReadAppointments: boolean;
  canReadAudit: boolean;
  canExplainOthers: boolean;
  canSeeAllDelegations: boolean;
};

export type AppointmentRow = {
  id: string;
  personId: string;
  personName: string;
  memberCode: string | null;
  office: OfficeCode;
  title: string;
  orgUnitId: string | null;
  unitName: string | null;
  unitCode: string | null;
  systemId: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  live: boolean;
  endsSoon: boolean;
};

export async function fetchAppointments(
  opts: { unitId?: string; ended?: boolean } = {},
): Promise<AccessPowers & { appointments: AppointmentRow[] }> {
  const qs = new URLSearchParams();
  if (opts.unitId) qs.set('unitId', opts.unitId);
  if (opts.ended) qs.set('ended', 'true');
  return apiFetch(`/api/access/appointments${qs.size ? `?${qs}` : ''}`);
}

export type NewAppointment = {
  personId: string;
  orgUnitId: string;
  office: OfficeCode;
  endDate?: string | null;
};

export async function appointOffice(body: NewAppointment): Promise<void> {
  await apiFetch('/api/access/appointments', { method: 'POST', body });
}

export async function endAppointment(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/access/appointments/${encodeURIComponent(id)}/end`, { method: 'POST', body: { reason } });
}

export async function setAppointmentTerm(id: string, endDate: string | null): Promise<void> {
  await apiFetch(`/api/access/appointments/${encodeURIComponent(id)}/term`, { method: 'POST', body: { endDate } });
}

export type Vacancy = {
  unitId: string;
  unitName: string;
  unitCode: string | null;
  kind: UnitKind;
  office: OfficeCode;
  reason: 'EMPTY' | 'ENDS_SOON';
  endsOn?: string;
  holderName?: string | null;
};

export type VacancyReport = {
  vacancies: Vacancy[];
  conflicts: Array<{ unitId: string; unitName: string; office: OfficeCode; positionIds: string[] }>;
  administrators: { count: number; minimum: number };
};

export async function fetchVacancies(): Promise<VacancyReport> {
  return apiFetch('/api/access/vacancies');
}

export type LetterSource = {
  letter: AccessLetter;
  from: string;
  via: 'OFFICE' | 'DELEGATION' | 'MEMBER';
  office?: OfficeCode;
};

export type AccessExplanation = {
  person: { id: string; name: string; code: string | null };
  offices: Array<{ id: string; office: OfficeCode; title: string; systemId: string | null; orgUnitId: string | null; endDate: string | null }>;
  delegated: Array<{ delegationId: string; office: OfficeCode; fromPersonId: string }>;
  systems: Array<{
    id: string;
    name: string;
    letters: Record<ModuleKey, AccessLetter[]>;
    why: Record<ModuleKey, LetterSource[]>;
  }>;
};

export async function fetchMyAccess(): Promise<AccessExplanation & { powers: AccessPowers }> {
  return apiFetch('/api/access/me');
}

export async function fetchAccessOf(personId: string): Promise<AccessExplanation> {
  return apiFetch(`/api/access/explain/${encodeURIComponent(personId)}`);
}

export type RuleMatrix = {
  letters: Array<{ letter: AccessLetter; name: string; meaning: string }>;
  modules: Array<{ key: ModuleKey; letters: AccessLetter[] }>;
  offices: Array<{
    code: OfficeCode;
    title: string;
    scope: 'CHURCH' | 'UNIT';
    sole: boolean;
    letters: Partial<Record<ModuleKey, AccessLetter[]>>;
  }>;
  member: Partial<Record<ModuleKey, AccessLetter[]>>;
  limits: { minAdministrators: number; delegationMaxDays: number };
};

export async function fetchRuleMatrix(): Promise<RuleMatrix> {
  return apiFetch('/api/access/matrix');
}

export type DelegationRow = {
  id: string;
  positionId: string;
  fromPersonId: string;
  fromName: string;
  toPersonId: string;
  toName: string;
  letters: Partial<Record<ModuleKey, AccessLetter[]>>;
  note: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  live: boolean;
};

export type DelegationList = {
  canSeeAll: boolean;
  given: DelegationRow[];
  received: DelegationRow[];
  all?: DelegationRow[];
  limits: { maxDays: number };
};

export async function fetchDelegations(all = false): Promise<DelegationList> {
  return apiFetch(`/api/access/delegations${all ? '?all=true' : ''}`);
}

export type NewDelegation = {
  positionId: string;
  toPersonId: string;
  letters: Partial<Record<ModuleKey, AccessLetter[]>>;
  endDate: string;
  note?: string;
};

export async function lendLetters(body: NewDelegation): Promise<void> {
  await apiFetch('/api/access/delegations', { method: 'POST', body });
}

export async function revokeDelegation(id: string): Promise<void> {
  await apiFetch(`/api/access/delegations/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: {} });
}

export type AuditEntry = {
  id: string;
  at: string | null;
  action: string;
  detail: string;
  actorName: string | null;
};

export async function fetchAuditTrail(limit = 50): Promise<AuditEntry[]> {
  const res = await apiFetch<{ events: AuditEntry[] }>(`/api/access/audit?limit=${limit}`);
  return res.events;
}

/* ── Notifications and preferences (slice 1.4) ── */

export type NoticeKind = 'WAITING_FOR_ME' | 'FOR_INFORMATION';

export type NoticeItem = {
  key: string;
  kind: NoticeKind;
  title: string;
  body: string | null;
  href: string | null;
  systemId: string;
  createdAt: string;
  read: boolean;
  important: boolean;
};

export type NoticeCounts = {
  waiting: { total: number; unread: number };
  info: { total: number; unread: number };
  unread: number;
  bySystem: Record<string, number>;
};

export async function fetchNotices(opts: { tab?: 'waiting' | 'info'; system?: string } = {}): Promise<{ items: NoticeItem[]; counts: NoticeCounts }> {
  const qs = new URLSearchParams();
  if (opts.tab) qs.set('tab', opts.tab);
  if (opts.system) qs.set('system', opts.system);
  return apiFetch(`/api/notifications${qs.size ? `?${qs}` : ''}`);
}

export async function fetchNoticeSummary(system?: string): Promise<{ counts: NoticeCounts; urgent: NoticeItem[] }> {
  return apiFetch(`/api/notifications/summary${system ? `?system=${encodeURIComponent(system)}` : ''}`);
}

export async function markNoticesRead(body: { keys?: string[]; all?: boolean; tab?: 'waiting' | 'info'; system?: string }): Promise<number> {
  const res = await apiFetch<{ marked: number }>('/api/notifications/read', { method: 'POST', body });
  return res.marked;
}

export async function markNoticesUnread(keys: string[]): Promise<void> {
  await apiFetch('/api/notifications/unread', { method: 'POST', body: { keys } });
}

export type Preferences = { language: string | null; mutedSystems: string[] };

export async function fetchPreferences(): Promise<Preferences> {
  return apiFetch('/api/me/preferences');
}

export async function savePreferences(body: Partial<Preferences>): Promise<Preferences> {
  return apiFetch('/api/me/preferences', { method: 'PUT', body });
}

/* ── Announcements (slice 1.5) ── */

export type AudienceKind = 'WHOLE_CHURCH' | 'SYSTEM' | 'OFFICE';

export type Audience = { kind: AudienceKind; systemId?: string; office?: OfficeCode };

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  audience: { kind: AudienceKind; systemId: string | null; systemName: string | null; office: OfficeCode | null };
  authorId: string;
  authorName: string;
  publishedAt: string | null;
  expiresAt: string | null;
  read: boolean;
  mine: boolean;
  canWithdraw: boolean;
};

export type AnnouncementOptions = {
  wholeChurch: boolean;
  offices: OfficeCode[];
  systems: Array<{ id: string; name: string; shortName: string }>;
  limits: { titleMax: number; bodyMax: number };
};

export async function fetchAnnouncements(): Promise<{ items: AnnouncementItem[]; unread: number }> {
  return apiFetch('/api/announcements');
}

export async function fetchAnnouncementSummary(): Promise<{ unread: number; latest: AnnouncementItem[] }> {
  return apiFetch('/api/announcements/summary');
}

export async function fetchAnnouncementOptions(): Promise<AnnouncementOptions> {
  return apiFetch('/api/announcements/options');
}

export async function postAnnouncement(body: { title: string; body: string; audience: Audience; expiresAt?: string }): Promise<void> {
  await apiFetch('/api/announcements', { method: 'POST', body });
}

export async function withdrawAnnouncement(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/announcements/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: { reason } });
}

export async function markAnnouncementsRead(body: { ids?: string[]; all?: boolean }): Promise<number> {
  const res = await apiFetch<{ marked: number }>('/api/announcements/read', { method: 'POST', body });
  return res.marked;
}

/* ── Settings (slice 2.1) ── */

export type TypeItem = { code: string; name: string };
export type ChurchProfile = { name: string; shortName: string; address: string; phone: string; email: string };

export type SettingValues = {
  'church.profile': ChurchProfile;
  'church.language': 'en' | 'rw' | 'fr';
  'letters.types': TypeItem[];
  'meetings.types': TypeItem[];
  'access.termReminderDays': number;
  'access.delegationMaxDays': number;
};
export type SettingKey = keyof SettingValues;

export type SettingRow = {
  key: SettingKey;
  value: SettingValues[SettingKey];
  isDefault: boolean;
  defaultValue: SettingValues[SettingKey];
  updatedAt: string | null;
  updatedByName: string | null;
};

export async function fetchSettings(): Promise<{ canChange: boolean; settings: SettingRow[] }> {
  return apiFetch('/api/settings');
}

export async function saveSetting(key: SettingKey, value: unknown): Promise<void> {
  await apiFetch(`/api/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: { value } });
}

export async function resetSetting(key: SettingKey): Promise<void> {
  await apiFetch(`/api/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

/* ── Governance (slice 2.2) ── */

export type MeetingStatus = 'PLANNED' | 'HELD' | 'CANCELLED';
export type DecisionStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export type MeetingItem = {
  id: string;
  orgUnitId: string;
  unitName: string;
  systemId: string;
  typeCode: string;
  typeName: string;
  title: string;
  scheduledAt: string | null;
  location: string | null;
  status: MeetingStatus;
  decisionCount: number;
  canWrite: boolean;
};

export type DecisionItem = {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  orgUnitId: string;
  unitName: string;
  systemId: string;
  title: string;
  detail: string;
  status: DecisionStatus;
  createdAt: string | null;
  authorName: string;
  decidedAt: string | null;
  decidedByName: string | null;
  rejectReason: string | null;
  owner: { id: string; name: string } | null;
  dueDate: string | null;
  taskId: string | null;
  canApprove: boolean;
  canWithdraw: boolean;
};

export type GovernanceOptions = {
  units: Array<{ id: string; name: string; code: string | null; kind: string | null; systemId: string }>;
  meetingTypes: TypeItem[];
  limits: { titleMax: number; textMax: number };
};

export type MeetingDetail = MeetingItem & {
  agenda: string;
  minutes: string;
  createdByName: string;
  heldAt: string | null;
  cancelledReason: string | null;
  attendees: Array<{ id: string; name: string }>;
};

export async function fetchGovernanceOptions(): Promise<GovernanceOptions> {
  return apiFetch('/api/governance/options');
}

export async function fetchMeetings(opts: { systemId?: string; unitId?: string; status?: MeetingStatus } = {}): Promise<MeetingItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  const res = await apiFetch<{ meetings: MeetingItem[] }>(`/api/governance/meetings${qs.size ? `?${qs}` : ''}`);
  return res.meetings;
}

export async function fetchMeeting(id: string): Promise<{ meeting: MeetingDetail; decisions: DecisionItem[] }> {
  return apiFetch(`/api/governance/meetings/${encodeURIComponent(id)}`);
}

export type NewMeeting = { orgUnitId: string; typeCode: string; title?: string; scheduledAt: string; location?: string; agenda?: string };

export async function planMeeting(body: NewMeeting): Promise<string> {
  const res = await apiFetch<{ meeting: { id: string } }>('/api/governance/meetings', { method: 'POST', body });
  return res.meeting.id;
}

export async function markMeetingHeld(id: string, body: { minutes?: string; attendeeIds?: string[] }): Promise<void> {
  await apiFetch(`/api/governance/meetings/${encodeURIComponent(id)}/held`, { method: 'POST', body });
}

export async function cancelMeeting(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/governance/meetings/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { reason } });
}

export async function fetchDecisions(opts: { systemId?: string; unitId?: string; status?: DecisionStatus; q?: string } = {}): Promise<DecisionItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  const res = await apiFetch<{ decisions: DecisionItem[] }>(`/api/governance/decisions${qs.size ? `?${qs}` : ''}`);
  return res.decisions;
}

export type NewDecision = {
  meetingId?: string;
  orgUnitId?: string;
  title: string;
  detail?: string;
  work?: { ownerPersonId?: string; dueDate?: string };
};

export async function draftDecision(body: NewDecision): Promise<void> {
  await apiFetch('/api/governance/decisions', { method: 'POST', body });
}

export async function approveDecision(id: string): Promise<void> {
  await apiFetch(`/api/governance/decisions/${encodeURIComponent(id)}/approve`, { method: 'POST', body: {} });
}

export async function rejectDecision(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/governance/decisions/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason } });
}

export async function withdrawDecision(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/governance/decisions/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: { reason } });
}
