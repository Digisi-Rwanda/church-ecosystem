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
export type OwnBlock = 'central' | 'governance' | 'settings' | 'groups' | 'couples' | 'visits' | 'watches' | 'contacts' | 'pulpit' | 'collections' | 'monthplan' | 'choirs' | 'oversight' | 'rehearsals' | 'repertoire' | 'sponsorship' | 'roster' | 'teams' | 'mine' | 'deaconreports';

export type Capabilities = {
  personId: string;
  offices: Array<{ id: string; systemId: string | null; title: string; code: OfficeCode | null }>;
  systems: Array<{ id: string; blocks: Record<SharedBlock, AccessLetter[]>; own?: Array<{ key: OwnBlock; letters: AccessLetter[]; variant?: string }> }>;
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


/* ───────────── Letters desk (slice 2.3) ───────────── */

export type LetterStatus = 'DRAFT' | 'DELIVERED' | 'WITHDRAWN';
export type DeliveryMethod = 'HAND' | 'POST' | 'EMAIL' | 'OTHER';

export type LetterItem = {
  id: string;
  reference: string;
  orgUnitId: string;
  unitName: string;
  systemId: string;
  typeCode: string;
  typeName: string;
  subject: string;
  recipientName: string;
  status: LetterStatus;
  createdAt: string | null;
  authorName: string;
  printed: boolean;
  deliveredOn: string | null;
  canEdit: boolean;
  canSend: boolean;
  canWithdraw: boolean;
};

export type LetterDetail = LetterItem & {
  body: string;
  recipientNote: string;
  printedAt: string | null;
  printedByName: string | null;
  deliveredAt: string | null;
  deliveredByName: string | null;
  deliveryMethod: DeliveryMethod | null;
  deliveryNote: string;
  withdrawnReason: string | null;
};

export type LetterOptions = {
  units: Array<{ id: string; name: string; code: string | null; kind: string | null; systemId: string }>;
  letterTypes: Array<{ code: string; name: string }>;
  deliveryMethods: DeliveryMethod[];
  limits: { subjectMax: number; bodyMax: number };
};

export type LetterPrint = {
  reference: string;
  church: { name: string; shortName: string; address: string; phone: string; email?: string };
  unitName: string;
  date: string;
  typeName: string;
  recipientName: string;
  recipientNote: string;
  subject: string;
  body: string;
};

export type LetterDraft = { orgUnitId: string; typeCode: string; subject: string; body: string; recipientName: string; recipientNote?: string };

export async function fetchLetterOptions(): Promise<LetterOptions> {
  return apiFetch('/api/letters/options');
}

export async function fetchLetters(opts: { systemId?: string; unitId?: string; status?: LetterStatus; q?: string } = {}): Promise<LetterItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  const res = await apiFetch<{ letters: LetterItem[] }>(`/api/letters${qs.size ? `?${qs}` : ''}`);
  return res.letters;
}

export async function fetchLetter(id: string): Promise<LetterDetail> {
  const res = await apiFetch<{ letter: LetterDetail }>(`/api/letters/${encodeURIComponent(id)}`);
  return res.letter;
}

export async function draftLetter(input: LetterDraft): Promise<string> {
  const res = await apiFetch<{ letter: { id: string } }>('/api/letters', { method: 'POST', body: input });
  return res.letter.id;
}

export async function editLetter(id: string, input: Pick<LetterDraft, 'subject' | 'body' | 'recipientName' | 'recipientNote'>): Promise<void> {
  await apiFetch(`/api/letters/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
}

export async function printLetter(id: string): Promise<LetterPrint> {
  const res = await apiFetch<{ print: LetterPrint }>(`/api/letters/${encodeURIComponent(id)}/print`, { method: 'POST', body: {} });
  return res.print;
}

export async function deliverLetter(id: string, input: { method: DeliveryMethod; deliveredOn: string; note?: string }): Promise<void> {
  await apiFetch(`/api/letters/${encodeURIComponent(id)}/deliver`, { method: 'POST', body: input });
}

export async function withdrawLetter(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/letters/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: { reason } });
}

/* ───────────── Central Administration home (slice 2.4) ───────────── */

export type UrgentKind = 'DECISION_TO_APPROVE' | 'MEETING_OVERDUE' | 'LETTER_TO_DELIVER' | 'LETTER_TO_PRINT' | 'VACANCY' | 'TERM_ENDING';

export type UrgentItem = {
  key: string;
  kind: UrgentKind;
  systemId: string;
  systemName: string;
  unitName: string;
  subject: string;
  id: string | null;
  at: string | null;
};

export type OversightRow = {
  systemId: string;
  name: string;
  units: number;
  plannedMeetings: number;
  overdueMeetings: number;
  decisionsWaiting: number;
  lettersOpen: number;
  vacancies: number;
};

export type CentralOverview = { urgent: UrgentItem[]; urgentTotal: number; oversight: OversightRow[]; reports: ReceivedReport[]; reportsLate?: LateReport[] };

export type ChurchCollections = {
  months: Array<{ month: string; total: number; count: number }>;
  ministries: Array<{ systemId: string; name: string; total: number; count: number; toConfirm: number; toHandOver: number }>;
  totals: { all: number; toConfirm: number; toHandOver: number };
  missing: Array<{ date: string; kinds: string[] }>;
};
export const fetchChurchCollections = (): Promise<ChurchCollections> => apiFetch('/api/central/collections');

export async function fetchCentralOverview(): Promise<CentralOverview> {
  return apiFetch('/api/central/overview');
}

/* ───────────── Schedule (slice 3.1) ───────────── */

export type PlanStatus = 'DRAFT' | 'CONFIRMED' | 'PUBLISHED';
export type SlotKind = 'SERVICE' | 'REHEARSAL' | 'MEETING' | 'OTHER';
export type AssignmentStatus = 'ASSIGNED' | 'DECLINED' | 'REPLACED';

export type ScheduleAssignment = {
  id: string;
  personId: string;
  personName: string;
  role: string;
  status: AssignmentStatus;
  declineReason: string | null;
  mine: boolean;
};

export type ScheduleSlot = {
  id: string;
  title: string;
  kind: SlotKind;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  churchWide: boolean;
  assignments: ScheduleAssignment[];
};

export type UnitPlan = {
  unitId: string;
  unitName: string;
  plan: { id: string; status: PlanStatus; confirmedAt: string | null; publishedAt: string | null } | null;
  slots: ScheduleSlot[];
};

export type MonthView = { month: string; systemId: string; canWrite: boolean; canConfirm: boolean; canPublish: boolean; units: UnitPlan[] };
export type ScheduleOptions = {
  units: Array<{ id: string; name: string; systemId: string }>;
  kinds: SlotKind[];
  limits: { titleMax: number; roleMax: number; noteMax: number };
};
export type SlotInput = {
  title: string;
  kind: SlotKind;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  churchWide: boolean;
};
export type ChurchSlot = { id: string; title: string; kind: SlotKind; startsAt: string; endsAt: string | null; location: string | null; unitName: string };
export type Duty = {
  assignmentId: string;
  role: string;
  slotId: string;
  title: string;
  kind: SlotKind;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  systemId: string;
  unitName: string;
};

export const fetchScheduleOptions = (): Promise<ScheduleOptions> => apiFetch('/api/schedule/options');
export const fetchMonth = (systemId: string, month: string): Promise<MonthView> =>
  apiFetch(`/api/schedule/month?systemId=${encodeURIComponent(systemId)}&month=${encodeURIComponent(month)}`);
export async function fetchChurchCalendar(month: string): Promise<ChurchSlot[]> {
  const res = await apiFetch<{ slots: ChurchSlot[] }>(`/api/schedule/church?month=${encodeURIComponent(month)}`);
  return res.slots;
}
export async function fetchMyDuties(): Promise<Duty[]> {
  const res = await apiFetch<{ duties: Duty[] }>('/api/schedule/mine');
  return res.duties;
}
export async function addSlot(unitId: string, input: SlotInput): Promise<void> {
  await apiFetch('/api/schedule/slots', { method: 'POST', body: { unitId, ...input } });
}
export async function editSlot(id: string, input: SlotInput): Promise<void> {
  await apiFetch(`/api/schedule/slots/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
}
export async function removeSlot(id: string): Promise<void> {
  await apiFetch(`/api/schedule/slots/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function assignToSlot(slotId: string, personId: string, role: string): Promise<void> {
  await apiFetch(`/api/schedule/slots/${encodeURIComponent(slotId)}/assign`, { method: 'POST', body: { personId, role } });
}
export async function removeAssignment(id: string): Promise<void> {
  await apiFetch(`/api/schedule/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function declineAssignment(id: string, reason: string): Promise<void> {
  await apiFetch(`/api/schedule/assignments/${encodeURIComponent(id)}/decline`, { method: 'POST', body: { reason } });
}
export async function replaceAssignment(id: string, personId: string): Promise<void> {
  await apiFetch(`/api/schedule/assignments/${encodeURIComponent(id)}/replace`, { method: 'POST', body: { personId } });
}
export async function movePlan(id: string, action: 'confirm' | 'publish' | 'reopen'): Promise<void> {
  await apiFetch(`/api/schedule/plans/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: {} });
}

/* ───────────── Light work (slice 3.2) ───────────── */

export type WorkStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type WorkVisibility = 'PERSONS' | 'UNIT' | 'SYSTEM' | 'CHURCH';

export type WorkItem = {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  ownerName: string;
  helpers: Array<{ id: string; name: string }>;
  systemId: string;
  orgUnitId: string | null;
  unitName: string;
  status: WorkStatus;
  visibility: WorkVisibility;
  dueDate: string | null;
  overdue: boolean;
  outcomeNote: string | null;
  contextLabel: string | null;
  mine: boolean;
  canManage: boolean;
  canMove: boolean;
  canDelete: boolean;
  planId: string | null;
  canUpgrade: boolean;
};

export type WorkOptions = {
  units: Array<{ id: string; name: string; systemId: string }>;
  visibilities: WorkVisibility[];
  limits: { titleMax: number; textMax: number; noteMax: number; helpersMax: number };
};

export type WorkInput = {
  title: string;
  description: string | null;
  ownerId: string;
  helperIds: string[];
  dueDate: string | null;
  visibility: WorkVisibility;
};

export type DeletedWork = { id: string; title: string; status: WorkStatus; systemId: string; unitName: string; ownerName: string; deletedAt: string | null; deletedByName: string };

export const fetchWorkOptions = (): Promise<WorkOptions> => apiFetch('/api/work/options');
export async function fetchWork(opts: { systemId?: string; view?: 'mine' | 'all'; status?: 'open' | 'all' | WorkStatus; q?: string } = {}): Promise<WorkItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  const res = await apiFetch<{ items: WorkItem[] }>(`/api/work${qs.size ? `?${qs}` : ''}`);
  return res.items;
}
export async function createWork(unitId: string, input: WorkInput): Promise<WorkItem> {
  const res = await apiFetch<{ work: WorkItem }>('/api/work', { method: 'POST', body: { unitId, ...input } });
  return res.work;
}
export async function editWork(id: string, input: WorkInput): Promise<void> {
  await apiFetch(`/api/work/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
}
export async function moveWork(id: string, status: WorkStatus, note?: string): Promise<void> {
  await apiFetch(`/api/work/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status, note } });
}
export const upgradeWork = (id: string): Promise<{ planId: string }> => apiFetch(`/api/work/${encodeURIComponent(id)}/upgrade`, { method: 'POST', body: {} });
export async function deleteWork(id: string): Promise<void> {
  await apiFetch(`/api/work/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function fetchDeletedWork(): Promise<DeletedWork[]> {
  const res = await apiFetch<{ items: DeletedWork[] }>('/api/work/deleted');
  return res.items;
}
export async function restoreWork(id: string): Promise<void> {
  await apiFetch(`/api/work/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} });
}

/* ───────────── Full work (slice 3.3) ───────────── */

export type WorkPlanStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'SETUP' | 'RUNNING' | 'CLOSING' | 'ENDED' | 'CANCELLED';

export type PlanFlags = {
  canEdit: boolean; canSubmit: boolean; canWithdraw: boolean; canApprove: boolean; canReopen: boolean; canStart: boolean; canClose: boolean;
  canCancel: boolean; canDelete: boolean; canNote: boolean; canCheck: boolean; canAddCheck: boolean; canCompose: boolean; canPublish: boolean;
};

export type PlanItem = PlanFlags & {
  id: string; title: string; status: WorkPlanStatus; systemId: string; orgUnitId: string; unitName: string; leaderId: string; leaderName: string;
  startsOn: string | null; endsOn: string | null; visibility: WorkVisibility; beyondUnit: boolean; mine: boolean; waitingLevel: string | null;
};

export type PlanDetail = PlanItem & {
  aim: string; needs: string; location: string; createdByName: string;
  team: Array<{ personId: string; name: string; role: string }>;
  levels: Array<{ levelKey: 'UNIT' | 'CHURCH'; label: string; status: 'PENDING' | 'APPROVED'; byName: string | null; at: string | null; note: string | null }>;
  rejectedReason: string | null; cancelReason: string | null;
  notes: Array<{ id: string; authorName: string; text: string; at: string | null }>;
  checks: Array<{ id: string; label: string; done: boolean; doneAt: string | null }>;
  report: { planningSummary: string; executionSummary: string; outcome: string; composedAt: string | null; publishedAt: string | null; frozen: boolean };
};

export type PlanInput = {
  title: string; aim: string; needs: string | null; location: string | null; startsOn: string | null; endsOn: string | null;
  leaderId: string; team: Array<{ personId: string; role: string }>; beyondUnit: boolean; visibility: WorkVisibility;
};
export type PlanOptions = {
  units: Array<{ id: string; name: string; systemId: string }>;
  visibilities: WorkVisibility[];
  limits: { titleMax: number; textMax: number; noteMax: number; teamMax: number; roleMax: number; checksMax: number };
};

const P = '/api/work-plans';
const planBody = async (p: Promise<{ plan: PlanDetail }>): Promise<PlanDetail> => (await p).plan;
export const fetchPlanOptions = (): Promise<PlanOptions> => apiFetch(`${P}/options`);
export async function fetchPlans(opts: { systemId?: string; view?: 'mine' | 'all'; status?: string; q?: string } = {}): Promise<PlanItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  const res = await apiFetch<{ items: PlanItem[] }>(`${P}${qs.size ? `?${qs}` : ''}`);
  return res.items;
}
export const fetchPlan = (id: string) => planBody(apiFetch(`${P}/${encodeURIComponent(id)}`));
export const createPlan = (unitId: string, input: PlanInput) => planBody(apiFetch(P, { method: 'POST', body: { unitId, ...input } }));
export const editPlan = (id: string, input: PlanInput) => planBody(apiFetch(`${P}/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }));
export async function deletePlan(id: string): Promise<void> {
  await apiFetch(`${P}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export const planStep = (id: string, step: 'submit' | 'withdraw' | 'reopen' | 'start' | 'close' | 'publish' | 'approve', body: object = {}) =>
  planBody(apiFetch(`${P}/${encodeURIComponent(id)}/${step}`, { method: 'POST', body }));
export const rejectPlan = (id: string, reason: string) => planBody(apiFetch(`${P}/${encodeURIComponent(id)}/reject`, { method: 'POST', body: { reason } }));
export const cancelPlan = (id: string, reason: string) => planBody(apiFetch(`${P}/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { reason } }));
export const addPlanNote = (id: string, text: string) => planBody(apiFetch(`${P}/${encodeURIComponent(id)}/notes`, { method: 'POST', body: { text } }));
export const addPlanCheck = (id: string, label: string) => planBody(apiFetch(`${P}/${encodeURIComponent(id)}/checks`, { method: 'POST', body: { label } }));
export const tickPlanCheck = (id: string, checkId: string, done: boolean) =>
  planBody(apiFetch(`${P}/${encodeURIComponent(id)}/checks/${encodeURIComponent(checkId)}`, { method: 'PATCH', body: { done } }));
export const removePlanCheck = (id: string, checkId: string) => planBody(apiFetch(`${P}/${encodeURIComponent(id)}/checks/${encodeURIComponent(checkId)}`, { method: 'DELETE' }));
export const saveReport = (id: string, body: { planningSummary: string; executionSummary: string; outcome: string }) =>
  planBody(apiFetch(`${P}/${encodeURIComponent(id)}/report`, { method: 'PUT', body }));
export async function fetchDeletedPlans(): Promise<DeletedWork[]> {
  const res = await apiFetch<{ items: DeletedWork[] }>(`${P}/deleted`);
  return res.items;
}
export async function restorePlan(id: string): Promise<void> {
  await apiFetch(`${P}/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} });
}

// ── Money and Collections (slice 3.4) ───────────────────────────────────────────
export type MoneyEntryKind = 'INCOME' | 'SPENDING';
export type MoneyStatus = 'RECORDED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'VOIDED';
export type MoneyOptions = {
  units: Array<{ id: string; name: string; systemId: string }>;
  categories: string[];
  limits: { nameMax: number; noteMax: number; amountMax: number };
};
export type MoneyAccountItem = {
  id: string; name: string; status: 'ACTIVE' | 'CLOSED'; orgUnitId: string; unitName: string;
  income: number; spent: number; pending: number; balance: number;
};
export type MoneyAccounts = { canRecord: boolean; canApprove: boolean; accounts: MoneyAccountItem[] };
export type MoneyEntryItem = {
  id: string; accountId: string; accountName: string; kind: MoneyEntryKind; amount: number; occurredOn: string; category: string; note: string;
  status: MoneyStatus; recordedByName: string; recordedAt: string | null; decidedByName: string | null; decisionNote: string | null;
  canDecide: boolean; canVoid: boolean;
};
export type MoneyEntryInput = { accountId: string; kind: MoneyEntryKind; amount: number; occurredOn: string; category: string; note?: string | null };
const M = '/api/money';
export const fetchMoneyOptions = (): Promise<MoneyOptions> => apiFetch(`${M}/options`);
export const fetchMoneyAccounts = (systemId: string): Promise<MoneyAccounts> => apiFetch(`${M}/accounts?systemId=${encodeURIComponent(systemId)}`);
export async function fetchMoneyEntries(opts: { systemId: string; accountId?: string; status?: string; kind?: string; month?: string }): Promise<MoneyEntryItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  return (await apiFetch<{ entries: MoneyEntryItem[] }>(`${M}/entries?${qs}`)).entries;
}
export async function openMoneyAccount(unitId: string, name: string): Promise<void> {
  await apiFetch(`${M}/accounts`, { method: 'POST', body: { unitId, name } });
}
export async function closeMoneyAccount(id: string): Promise<void> {
  await apiFetch(`${M}/accounts/${encodeURIComponent(id)}/close`, { method: 'POST', body: {} });
}
export async function recordMoneyEntry(input: MoneyEntryInput): Promise<void> {
  await apiFetch(`${M}/entries`, { method: 'POST', body: input });
}
export async function decideMoneyEntry(id: string, approve: boolean, reason?: string): Promise<void> {
  await apiFetch(`${M}/entries/${encodeURIComponent(id)}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: { reason } });
}
export async function voidMoneyEntry(id: string, reason: string): Promise<void> {
  await apiFetch(`${M}/entries/${encodeURIComponent(id)}/void`, { method: 'POST', body: { reason } });
}

export type CountKind = 'OFFERING' | 'THANKSGIVING' | 'SPECIAL';
export type CountStatus = 'RECORDED' | 'CONFIRMED' | 'VOIDED';
export type CountItem = {
  id: string; systemId: string; unitName: string; serviceOn: string; label: string; kind: CountKind; amount: number; note: string; status: CountStatus;
  counters: Array<{ id: string; name: string }>; recordedByName: string; confirmedByName: string | null; handedToName: string | null; handedAt: string | null;
  voidReason: string | null; canConfirm: boolean; canVoid: boolean; canHandOver: boolean;
};
export type CountOptions = { units: Array<{ id: string; name: string; systemId: string }>; kinds: CountKind[]; limits: { noteMax: number; amountMax: number } };
export type CountInput = { unitId: string; serviceOn: string; label: string; kind: CountKind; amount: number; counterIds: string[]; note?: string | null };
const C = '/api/collections';
export const fetchCountOptions = (): Promise<CountOptions> => apiFetch(`${C}/options`);
export const fetchCounts = (systemId: string, status?: string): Promise<{ counts: CountItem[]; canWrite: boolean }> =>
  apiFetch(`${C}?systemId=${encodeURIComponent(systemId)}${status ? `&status=${status}` : ''}`);
export async function recordCount(input: CountInput): Promise<void> {
  await apiFetch(C, { method: 'POST', body: input });
}
export async function confirmCount(id: string): Promise<void> {
  await apiFetch(`${C}/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: {} });
}
export async function voidCount(id: string, reason: string): Promise<void> {
  await apiFetch(`${C}/${encodeURIComponent(id)}/void`, { method: 'POST', body: { reason } });
}
export async function handOverCount(id: string, toPersonId: string): Promise<void> {
  await apiFetch(`${C}/${encodeURIComponent(id)}/handover`, { method: 'POST', body: { toPersonId } });
}

// ── Reports (slice 3.5) ─────────────────────────────────────────────────────────
export type ReportKind = 'MEETINGS' | 'ATTENDANCE' | 'MONEY' | 'COLLECTIONS' | 'PEOPLE_LIST' | 'WORK_PLANS' | 'BAPTISMS' | 'MARRIAGES';
export type ReportCellType = 'text' | 'date' | 'money' | 'number' | 'code' | 'percent';
export type ReportCell = string | number | null;
export type ReportSnapshot = {
  version: 1; kind: ReportKind; periodKey: string; unitName: string;
  summary: Array<{ key: string; value: ReportCell; type: ReportCellType }>;
  tables: Array<{ key: string; columns: Array<{ key: string; type: ReportCellType }>; rows: ReportCell[][] }>;
};
export type ReportItem = {
  id: string; systemId: string; unitName: string; kind: ReportKind; periodKey: string; title: string; status: 'DRAFT' | 'PUBLISHED';
  composedByName: string; composedAt: string | null; publishedByName: string | null; publishedAt: string | null; canPublish: boolean; canEdit: boolean;
};
export type ReportDetail = ReportItem & { snapshot: ReportSnapshot | null };
export type ReportOptions = {
  units: Array<{ id: string; name: string; systemId: string; kinds: ReportKind[] }>;
  kinds: ReportKind[];
  schedulerUnits: Array<{ id: string; name: string; systemId: string }>;
};
export type ReportScheduleItem = { id: string; systemId: string; orgUnitId: string; unitName: string; kind: ReportKind; dueDay: number; periodKey: string; dueOn: string; state: 'RECEIVED' | 'DUE' | 'LATE' };
export type ReceivedReport = { id: string; systemId: string; unitName: string; kind: ReportKind; periodKey: string; publishedAt: string | null };
export type LateReport = { scheduleId: string; systemId: string; unitName: string; kind: ReportKind; periodKey: string; dueOn: string };
const R = '/api/reports';
export const fetchReportOptions = (): Promise<ReportOptions> => apiFetch(`${R}/options`);
export async function fetchReports(opts: { systemId: string; kind?: string; period?: string; status?: string }): Promise<{ reports: ReportItem[]; canCompose: boolean }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) if (v) qs.set(k, v);
  return apiFetch(`${R}?${qs}`);
}
export async function fetchReport(id: string): Promise<ReportDetail> {
  return (await apiFetch<{ report: ReportDetail }>(`${R}/${encodeURIComponent(id)}`)).report;
}
export const composeReport = (input: { unitId: string; kind: ReportKind; periodKey: string }): Promise<{ id: string }> => apiFetch(R, { method: 'POST', body: input });
export async function reportStep(id: string, step: 'refresh' | 'publish'): Promise<void> {
  await apiFetch(`${R}/${encodeURIComponent(id)}/${step}`, { method: 'POST', body: {} });
}
export async function discardReport(id: string): Promise<void> {
  await apiFetch(`${R}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export const fetchReportSchedules = (systemId: string): Promise<{ schedules: ReportScheduleItem[]; canSchedule: boolean }> => apiFetch(`${R}/schedules?systemId=${encodeURIComponent(systemId)}`);
export async function addReportSchedule(input: { unitId: string; kind: ReportKind; dueDay: number }): Promise<void> {
  await apiFetch(`${R}/schedules`, { method: 'POST', body: input });
}
export async function stopReportSchedule(id: string): Promise<void> {
  await apiFetch(`${R}/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Person 360 (slice 3.6) ──────────────────────────────────────────────────────
export type P360Section = 'CONTACT' | 'EMPLOYMENT' | 'EDUCATION' | 'GIFT' | 'SKILL' | 'CALLING' | 'FAMILY' | 'BAPTISM' | 'MARRIAGE';
export type P360Record = {
  id: string; section: P360Section; data: Record<string, string | number>; status: 'CURRENT' | 'SUPERSEDED' | 'VOIDED';
  recordedByName: string; recordedAt: string | null; voidReason: string | null; voidedByName: string | null; relatedName: string; programName: string; canChange: boolean;
};
export type P360Person = {
  id: string; fullName: string; memberCode: string | null; status: string; archived: boolean; dateOfBirth: string | null; gender: string | null;
  joinedChurchOn: string | null; phone: string | null; email: string | null; address: string | null; nationalId: string | null;
};
export type P360View = { person: P360Person; read: P360Section[]; write: P360Section[]; records: P360Record[] };
export type P360Cohort = { id: string; name: string; cohortLabel: string; learners: Array<{ personId: string; name: string; baptised: boolean }> };
const P3 = '/api/person360';
export const fetchP360Access = (): Promise<{ read: P360Section[]; write: P360Section[]; allowed: boolean }> => apiFetch(`${P3}/access`);
export const fetchP360 = (personId: string): Promise<P360View> => apiFetch(`${P3}/${encodeURIComponent(personId)}`);
export async function addP360Record(personId: string, section: P360Section, data: Record<string, string | number>): Promise<void> {
  await apiFetch(`${P3}/${encodeURIComponent(personId)}/records`, { method: 'POST', body: { section, data } });
}
export async function changeP360Record(id: string, data: Record<string, string | number>): Promise<void> {
  await apiFetch(`${P3}/records/${encodeURIComponent(id)}`, { method: 'PATCH', body: { data } });
}
export async function voidP360Record(id: string, reason: string): Promise<void> {
  await apiFetch(`${P3}/records/${encodeURIComponent(id)}/void`, { method: 'POST', body: { reason } });
}
export async function fetchP360History(id: string): Promise<P360Record[]> {
  return (await apiFetch<{ history: P360Record[] }>(`${P3}/records/${encodeURIComponent(id)}/history`)).history;
}
export async function fetchP360Cohorts(): Promise<P360Cohort[]> {
  return (await apiFetch<{ cohorts: P360Cohort[] }>(`${P3}/cohorts`)).cohorts;
}
export const recordBaptismCohort = (input: { programId: string; date: string; place?: string; baptisedBy?: string; personIds: string[] }): Promise<{ created: number; skipped: number }> =>
  apiFetch(`${P3}/baptism-cohort`, { method: 'POST', body: input });

// ── Groups (slice 3.8) ──────────────────────────────────────────────────────────
export type GroupKind = 'FELLOWSHIP' | 'CLASS' | 'AGE_GROUP';
export type GroupOptions = { units: Array<{ id: string; name: string; systemId: string; kind: GroupKind }>; limits: { nameMax: number; meetsMax: number; noteMax: number } };
export type GroupListItem = { id: string; name: string; status: 'ACTIVE' | 'CLOSED'; unitName: string; ageFrom: number | null; ageTo: number | null; meetsOn: string; leaderName: string; members: number; lastSessionOn: string | null };
export type GroupDetail = {
  group: { id: string; name: string; kind: GroupKind; systemId: string; status: 'ACTIVE' | 'CLOSED'; unitName: string; ageFrom: number | null; ageTo: number | null; meetsOn: string; leaderId: string | null; leaderName: string; canWrite: boolean };
  members: Array<{ personId: string; name: string; joinedOn: string; age: number | null; outsideAge: boolean; came: number; of: number; rate: number }>;
  sessions: Array<{ id: string; heldOn: string; present: number; note: string; names: string[] }>;
};
export type GroupInput = { name: string; leaderId?: string | null; ageFrom?: number | null; ageTo?: number | null; meetsOn?: string | null };
const G = '/api/groups';
export const fetchGroupOptions = (): Promise<GroupOptions> => apiFetch(`${G}/options`);
export const fetchGroups = (systemId: string): Promise<{ kind: GroupKind; canWrite: boolean; groups: GroupListItem[] }> => apiFetch(`${G}?systemId=${encodeURIComponent(systemId)}`);
export const fetchGroup = (id: string): Promise<GroupDetail> => apiFetch(`${G}/${encodeURIComponent(id)}`);
export const createGroup = (unitId: string, input: GroupInput): Promise<{ id: string }> => apiFetch(G, { method: 'POST', body: { unitId, ...input } });
export async function editGroup(id: string, input: GroupInput): Promise<void> {
  await apiFetch(`${G}/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
}
export async function closeGroup(id: string): Promise<void> {
  await apiFetch(`${G}/${encodeURIComponent(id)}/close`, { method: 'POST', body: {} });
}
export async function addGroupMember(id: string, personId: string): Promise<void> {
  await apiFetch(`${G}/${encodeURIComponent(id)}/members`, { method: 'POST', body: { personId } });
}
export async function removeGroupMember(id: string, personId: string): Promise<void> {
  await apiFetch(`${G}/${encodeURIComponent(id)}/members/${encodeURIComponent(personId)}`, { method: 'DELETE' });
}
export async function recordGroupSession(id: string, input: { heldOn: string; presentIds: string[]; note?: string | null }): Promise<void> {
  await apiFetch(`${G}/${encodeURIComponent(id)}/sessions`, { method: 'POST', body: input });
}

// ── Caring ministries (slice 3.9) ───────────────────────────────────────────────
export type CouplePairItem = { id: string; aId: string; aName: string; bId: string; bName: string; marriedOn: string | null };
export type VisitItem = { id: string; elderId: string; elderName: string; visitedOn: string; visitorNames: string[]; note: string };
export type WatchItem = { id: string; name: string; weekday: number; startTime: string; endTime: string; members: Array<{ personId: string; name: string }> };
const CARE = '/api/caring';
export const fetchCouples = (): Promise<{ canWrite: boolean; pairs: CouplePairItem[] }> => apiFetch(`${CARE}/couples`);
export async function addCouple(input: { aId: string; bId: string; marriedOn?: string | null }): Promise<void> {
  await apiFetch(`${CARE}/couples`, { method: 'POST', body: input });
}
export async function endCouple(id: string): Promise<void> {
  await apiFetch(`${CARE}/couples/${encodeURIComponent(id)}/end`, { method: 'POST', body: {} });
}
export const fetchVisits = (): Promise<{ visits: VisitItem[] }> => apiFetch(`${CARE}/visits`);
export async function recordVisit(input: { elderId: string; visitedOn: string; visitorIds: string[]; note?: string | null }): Promise<void> {
  await apiFetch(`${CARE}/visits`, { method: 'POST', body: input });
}
export const fetchWatches = (): Promise<{ canWrite: boolean; watches: WatchItem[] }> => apiFetch(`${CARE}/watches`);
export async function createWatch(input: { name: string; weekday: number; startTime: string; endTime: string }): Promise<void> {
  await apiFetch(`${CARE}/watches`, { method: 'POST', body: input });
}
export async function closeWatch(id: string): Promise<void> {
  await apiFetch(`${CARE}/watches/${encodeURIComponent(id)}/close`, { method: 'POST', body: {} });
}
export async function addWatchMember(id: string, personId: string): Promise<void> {
  await apiFetch(`${CARE}/watches/${encodeURIComponent(id)}/members`, { method: 'POST', body: { personId } });
}
export async function removeWatchMember(id: string, personId: string): Promise<void> {
  await apiFetch(`${CARE}/watches/${encodeURIComponent(id)}/members/${encodeURIComponent(personId)}`, { method: 'DELETE' });
}

// ── Evangelism (slice 3.10) ─────────────────────────────────────────────────────
export type ContactStatus = 'NEW' | 'FOLLOWING' | 'JOINED' | 'CLOSED';
export type ContactItem = { id: string; fullName: string; phone: string; howMet: string; metOn: string; status: ContactStatus; assignedToId: string | null; assignedName: string; lastFollowUpOn: string | null; nextOn: string | null; overdue: boolean };
export type ContactDetail = {
  contact: { id: string; fullName: string; phone: string; howMet: string; metOn: string; status: ContactStatus; note: string; assignedToId: string | null; assignedName: string; canWrite: boolean };
  followUps: Array<{ id: string; doneOn: string; note: string; nextOn: string | null; byName: string }>;
};
export type ContactInput = { fullName: string; phone?: string | null; howMet?: string | null; metOn?: string | null; assignedToId?: string | null; note?: string | null };
export type PulpitSlotItem = { id: string; serviceOn: string; theme: string; bibleText: string; status: 'PLANNED' | 'DONE' | 'CANCELLED'; preacherId: string | null; guestId: string | null; preacherName: string; isGuest: boolean };
export type GuestItem = { id: string; name: string; church: string; phone: string; note: string; visits: number; lastVisitOn: string | null };
export type PulpitSlotInput = { serviceOn?: string; personId?: string | null; guestId?: string | null; theme?: string | null; bibleText?: string | null; status?: 'PLANNED' | 'DONE' | 'CANCELLED' };
const EV = '/api/evangelism';
export const fetchContacts = (status = ''): Promise<{ canWrite: boolean; contacts: ContactItem[] }> => apiFetch(`${EV}/contacts${status ? `?status=${status}` : ''}`);
export const fetchContact = (id: string): Promise<ContactDetail> => apiFetch(`${EV}/contacts/${encodeURIComponent(id)}`);
export const createContact = (input: ContactInput): Promise<{ id: string }> => apiFetch(`${EV}/contacts`, { method: 'POST', body: input });
export async function followUpContact(id: string, input: { doneOn: string; note: string; nextOn?: string | null }): Promise<void> {
  await apiFetch(`${EV}/contacts/${encodeURIComponent(id)}/followups`, { method: 'POST', body: input });
}
export async function setContactStatus(id: string, status: ContactStatus): Promise<void> {
  await apiFetch(`${EV}/contacts/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status } });
}
export async function assignContact(id: string, personId: string | null): Promise<void> {
  await apiFetch(`${EV}/contacts/${encodeURIComponent(id)}/assign`, { method: 'POST', body: { personId } });
}
export const fetchPulpit = (): Promise<{ canWrite: boolean; canSeeGuests: boolean; slots: PulpitSlotItem[] }> => apiFetch(`${EV}/pulpit/slots`);
export async function createPulpitSlot(input: PulpitSlotInput): Promise<void> {
  await apiFetch(`${EV}/pulpit/slots`, { method: 'POST', body: input });
}
export async function changePulpitSlot(id: string, input: PulpitSlotInput): Promise<void> {
  await apiFetch(`${EV}/pulpit/slots/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
}
export const fetchGuests = (): Promise<{ canWrite: boolean; guests: GuestItem[] }> => apiFetch(`${EV}/pulpit/guests`);
export async function createGuest(input: { name: string; church?: string | null; phone?: string | null; note?: string | null }): Promise<void> {
  await apiFetch(`${EV}/pulpit/guests`, { method: 'POST', body: input });
}
export async function archiveGuest(id: string): Promise<void> {
  await apiFetch(`${EV}/pulpit/guests/${encodeURIComponent(id)}/archive`, { method: 'POST', body: {} });
}

// ── Music ministry (slice 3.12) ─────────────────────────────────────────────────
export type ChoirRole = 'PRIMARY' | 'SECONDARY' | 'CHILDREN' | 'WORSHIP';
export type MusicServiceKind = 'SS1' | 'SS2' | 'TUESDAY' | 'FRIDAY' | 'IGABURO';
export type ChoirItem = { id: string; name: string; role: ChoirRole; active: boolean; members: number; canWrite: boolean };
export type ChoirDetail = { choir: { id: string; name: string; role: ChoirRole; active: boolean; canWrite: boolean }; members: Array<{ personId: string; name: string; joinedOn: string }> };
export type OversightView = {
  month: string; planStatus: 'CONFIRMED' | 'PUBLISHED' | null;
  choirs: Array<{ id: string; name: string; role: ChoirRole; members: number; services: number; days: string[]; noMembers: boolean; notScheduled: boolean }>;
  emptyServices: Array<{ id: string; serviceOn: string; kind: MusicServiceKind }>;
};
const MU = '/api/music';
export const fetchChoirs = (): Promise<{ canManage: boolean; choirs: ChoirItem[] }> => apiFetch(`${MU}/choirs`);
export const fetchChoir = (id: string): Promise<ChoirDetail> => apiFetch(`${MU}/choirs/${encodeURIComponent(id)}`);
export async function createChoir(input: { name: string; role: ChoirRole }): Promise<void> {
  await apiFetch(`${MU}/choirs`, { method: 'POST', body: input });
}
export async function setChoirActive(id: string, active: boolean): Promise<void> {
  await apiFetch(`${MU}/choirs/${encodeURIComponent(id)}/active`, { method: 'POST', body: { active } });
}
export async function addChoirMember(id: string, personId: string): Promise<void> {
  await apiFetch(`${MU}/choirs/${encodeURIComponent(id)}/members`, { method: 'POST', body: { personId } });
}
export async function removeChoirMember(id: string, personId: string): Promise<void> {
  await apiFetch(`${MU}/choirs/${encodeURIComponent(id)}/members/${encodeURIComponent(personId)}`, { method: 'DELETE' });
}
export type MusicHorizonKey = 'MONTH' | 'QUARTER' | 'HALF' | 'YEAR';
export type ScheduleUnitRef = { unitId: string; name: string; kind: ChoirRole };
export type ScheduleService = { id: string; periodKey: string; date: string; kind: MusicServiceKind; label: string; units: ScheduleUnitRef[] };
export type ScheduleState = {
  canWrite: boolean;
  months: Array<{ periodKey: string; state: 'CONFIRMED' | 'PUBLISHED'; version: number; confirmedAt: string | null; publishedAt: string | null; updatedAt: string | null }>;
  drafts: Array<{ id: string; label: string; horizon: MusicHorizonKey; startMonth: string; months: string[]; warnings: number }>;
  options: Record<string, Array<{ value: string; label: string }>>;
  units: Array<{ id: string; name: string; kind: ChoirRole }>;
};
export type ScheduleDraftView = { id: string; label: string; horizon: MusicHorizonKey; warnings: string[]; months: Array<{ periodKey: string; decided: 'CONFIRMED' | 'PUBLISHED' | null }>; services: ScheduleService[] };
export type ScheduleMonthView = { canWrite: boolean; periodKey: string; state: 'CONFIRMED' | 'PUBLISHED'; version: number; warnings: string[]; services: ScheduleService[] };
export type ScheduleEdit = { serviceId: string; action: 'add' | 'remove' | 'replace'; unitId: string; toUnitId?: string | null };
export type ScheduleLogEntry = { id: string; at: string; periodKey: string; stage: string; action: string; version: number; by: string; summary: string; changes: string[] };
const MS = `${MU}/schedule`;
export const fetchScheduleState = (): Promise<ScheduleState> => apiFetch(`${MS}/state`);
export const fetchScheduleDraft = (id: string): Promise<ScheduleDraftView> => apiFetch(`${MS}/drafts/${encodeURIComponent(id)}`);
export const fetchScheduleMonth = (month: string): Promise<ScheduleMonthView> => apiFetch(`${MS}/months/${encodeURIComponent(month)}`);
export const fetchScheduleLog = (month?: string): Promise<{ entries: ScheduleLogEntry[] }> => apiFetch(`${MS}/log${month ? `?month=${encodeURIComponent(month)}` : ''}`);
export async function generateScheduleDraft(horizon: MusicHorizonKey, start: string): Promise<{ id: string; warnings: string[] }> {
  return apiFetch(`${MS}/drafts/generate`, { method: 'POST', body: { horizon, start } });
}
export async function editScheduleDraft(id: string, edit: ScheduleEdit): Promise<{ warnings: string[] }> {
  return apiFetch(`${MS}/drafts/${encodeURIComponent(id)}/edit`, { method: 'POST', body: edit });
}
export async function discardScheduleDraft(id: string): Promise<void> {
  await apiFetch(`${MS}/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function confirmScheduleDraft(id: string, months?: string[]): Promise<void> {
  await apiFetch(`${MS}/drafts/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: { months } });
}
export async function publishScheduleDraft(id: string): Promise<void> {
  await apiFetch(`${MS}/drafts/${encodeURIComponent(id)}/publish`, { method: 'POST', body: {} });
}
export async function publishScheduleMonths(months: string[]): Promise<void> {
  await apiFetch(`${MS}/months/publish`, { method: 'POST', body: { months } });
}
export async function editScheduleMonth(month: string, edit: ScheduleEdit): Promise<{ warnings: string[]; version: number }> {
  return apiFetch(`${MS}/months/${encodeURIComponent(month)}/edit`, { method: 'POST', body: edit });
}
export const fetchMusicOversight = (month: string): Promise<OversightView> => apiFetch(`${MU}/oversight?month=${month}`);

// ── Choir work (slice 3.13) ─────────────────────────────────────────────────────
export type RehearsalView = {
  canWrite: boolean;
  members: Array<{ personId: string; name: string; came: number; of: number; rate: number }>;
  rehearsals: Array<{ id: string; heldOn: string; present: number; note: string }>;
};
export type SongItem = { id: string; title: string; composer: string; songKey: string; lastSungOn: string | null };
export type PledgeItem = { id: string; amount: number; pledgedOn: string; receivedOn: string | null; note: string; status: 'PLEDGED' | 'RECEIVED' };
export type SponsorItem = { id: string; name: string; kind: 'PERSON' | 'ORGANISATION'; contact: string; pledges: PledgeItem[] };
const CW = '/api/choir';
const q = (choirId: string) => `choirId=${encodeURIComponent(choirId)}`;
export const fetchChoirChoices = (forRepertoire = false): Promise<{ choirs: Array<{ id: string; name: string }> }> => apiFetch(`${CW}/choirs${forRepertoire ? '?for=repertoire' : ''}`);
export const fetchRehearsals = (choirId: string): Promise<RehearsalView> => apiFetch(`${CW}/rehearsals?${q(choirId)}`);
export async function recordRehearsal(input: { choirId: string; heldOn: string; presentIds: string[]; note?: string | null }): Promise<void> {
  await apiFetch(`${CW}/rehearsals`, { method: 'POST', body: input });
}
export const fetchSongs = (choirId: string): Promise<{ canWrite: boolean; songs: SongItem[] }> => apiFetch(`${CW}/songs?${q(choirId)}`);
export async function addSong(input: { choirId: string; title: string; composer?: string | null; songKey?: string | null }): Promise<void> {
  await apiFetch(`${CW}/songs`, { method: 'POST', body: input });
}
export async function markSongSung(id: string, day: string): Promise<void> {
  await apiFetch(`${CW}/songs/${encodeURIComponent(id)}/sung`, { method: 'POST', body: { day } });
}
export async function retireSong(id: string): Promise<void> {
  await apiFetch(`${CW}/songs/${encodeURIComponent(id)}/retire`, { method: 'POST', body: {} });
}
export const fetchSponsors = (choirId: string): Promise<{ canWrite: boolean; totals: { pledged: number; received: number }; sponsors: SponsorItem[] }> => apiFetch(`${CW}/sponsors?${q(choirId)}`);
export async function addSponsor(input: { choirId: string; name: string; kind: 'PERSON' | 'ORGANISATION'; contact?: string | null }): Promise<void> {
  await apiFetch(`${CW}/sponsors`, { method: 'POST', body: input });
}
export async function endSponsor(id: string): Promise<void> {
  await apiFetch(`${CW}/sponsors/${encodeURIComponent(id)}/end`, { method: 'POST', body: {} });
}
export async function addPledge(sponsorId: string, input: { amount: number; pledgedOn: string; note?: string | null }): Promise<void> {
  await apiFetch(`${CW}/sponsors/${encodeURIComponent(sponsorId)}/pledges`, { method: 'POST', body: input });
}
export async function receivePledge(id: string, day: string): Promise<void> {
  await apiFetch(`${CW}/pledges/${encodeURIComponent(id)}/received`, { method: 'POST', body: { day } });
}
export async function cancelPledge(id: string): Promise<void> {
  await apiFetch(`${CW}/pledges/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
}

/* ─── Home dashboards (slice 3.14) ─── */
export interface GlanceTile { key: string; value: number; format: 'count' | 'rwf'; tone?: 'warn'; href?: string }
export interface GlanceSeries { key: string; format: 'count' | 'rwf'; points: Array<{ label: string; value: number }> }
export const fetchGlance = (systemId: string): Promise<{ systemId: string; tiles: GlanceTile[]; series: GlanceSeries[] }> =>
  apiFetch(`/api/glance?systemId=${encodeURIComponent(systemId)}`);

// ── Protocol (slice 3.16): the old team engine ─────────────────────────────────
export type ProtocolOffice = 'PRESIDENT' | 'VP' | 'SECRETARY' | 'TREASURER' | 'COORDINATOR' | 'MEMBER';
export type ProtocolServeDays = 'SUNDAY' | 'TUESDAY' | 'BOTH';
export type ProtocolKind = 'SS1' | 'SS2' | 'TUESDAY' | 'IGABURO';
export type ProtocolRosterStatus = 'ACTIVE' | 'INACTIVE' | 'LEAVE';
export type ProtocolRole = 'MEMBER' | 'TEAM_LEADER' | 'VICE_LEADER';
export type ProtocolAttendanceStatus = 'PRESENT' | 'HALF_PRESENT' | 'EXCUSED' | 'ABSENT';
export type ProtocolStep = 'WAIT_MUSIC' | 'BUILD' | 'SEND' | 'WAIT_PRESIDENT' | 'DONE';
export type ProtocolMemberRow = {
  id: string; personId: string; name: string; office: ProtocolOffice; serveDays: ProtocolServeDays; status: ProtocolRosterStatus; unavailableDates: string[];
  allowedServiceKinds: ProtocolKind[]; onlyServices: Array<{ date: string; kind: ProtocolKind }>; notes: string; choirs: string[];
};
export type ProtocolRosterPatch = Partial<{
  office: ProtocolOffice; serveDays: ProtocolServeDays; status: ProtocolRosterStatus; unavailableDates: string[]; allowedServiceKinds: ProtocolKind[];
  onlyServices: Array<{ date: string; kind: ProtocolKind }>; notes: string;
}>;
export type ProtocolTeamEntry = { id: string; personId: string; name: string; role: ProtocolRole; recommendedRole: ProtocolRole | null; slotKind: 'REGULAR' | 'EXTRA' | 'FILL_IN'; source: string; load: number };
export type ProtocolServiceView = { id: string; date: string; kind: ProtocolKind; label: string; target: number; music: string[]; team: ProtocolTeamEntry[] };
export type ProtocolIssueView = {
  key: string; code: string; severity: 'BLOCKING' | 'WARNING'; message: string; serviceId: string | null; personId: string | null; overridden: boolean; canOverride: boolean;
};
export type ProtocolMonthView = {
  month: string; step: ProtocolStep; status: 'OPEN' | 'DRAFT' | 'REVIEW' | 'PUBLISHED'; version: number; music: { state: 'CONFIRMED' | 'PUBLISHED'; version: number } | null;
  builtOnMusicVersion: number | null; stale: string[]; notes: string[]; relax: { tuesday: boolean; reason: string | null }; rules: { target: number; hardMax: number; teamSize: number };
  services: ProtocolServiceView[]; issues: ProtocolIssueView[]; overrides: Array<{ issueKey: string; reason: string; at: string }>; roster: Array<{ personId: string; name: string; load: number }>;
  can: { build: boolean; edit: boolean; reopen: boolean; review: boolean };
};
export type ProtocolDuty = {
  serviceId: string; date: string; kind: ProtocolKind; label: string; role: ProtocolRole; slotKind: string; attendance: ProtocolAttendanceStatus | null; absence: string | null;
  swapOffers: Array<{ id: string; from: string }>;
};
export type ProtocolLeading = {
  serviceId: string; date: string; kind: ProtocolKind; label: string;
  team: Array<{ personId: string; name: string; role: ProtocolRole; slotKind: string; attendance: ProtocolAttendanceStatus | null; absence: { id: string; status: string; reason: string } | null }>;
  fillIns: Array<{ id: string; excused: string; candidate: string; status: string }>;
};
export type ProtocolMine = {
  duties: ProtocolDuty[]; leading: ProtocolLeading[]; fillInOffers: Array<{ id: string; serviceId: string; excused: string }>;
  absencesToDecide: Array<{ id: string; serviceId: string; person: string; reason: string }>;
  others: Array<{ serviceId: string; date: string; kind: ProtocolKind; label: string; team: Array<{ personId: string; name: string }> }>;
  pool: Array<{ personId: string; name: string }>;
};
export type ProtocolReportParts = { challenges: string; solutions: string; issues: string; recommendations: string };
export type ProtocolReportItem = ProtocolReportParts & { serviceId: string; date: string; kind: string; label: string; author: string; submittedAt: string | null };
const PR = '/api/protocol';
const prPost = async (path: string, body: object = {}): Promise<{ id?: string; version?: number }> => apiFetch(`${PR}${path}`, { method: 'POST', body });
export const fetchProtocolRoster = (): Promise<{ canWrite: boolean; members: ProtocolMemberRow[] }> => apiFetch(`${PR}/roster`);
export const addProtocolMember = (personId: string, office: ProtocolOffice = 'MEMBER', serveDays: ProtocolServeDays = 'BOTH') => prPost('/roster', { personId, office, serveDays });
export async function patchProtocolMember(id: string, patch: ProtocolRosterPatch): Promise<void> {
  await apiFetch(`${PR}/roster/${id}`, { method: 'PATCH', body: patch });
}
export const fetchProtocolMonths = (): Promise<{ months: Array<{ month: string; music: string | null; status: string; version: number }> }> => apiFetch(`${PR}/months`);
export const fetchProtocolMonth = (month: string): Promise<ProtocolMonthView> => apiFetch(`${PR}/months/${month}`);
export const generateProtocolTeams = (month: string) => prPost(`/months/${month}/generate`);
export const addProtocolSlot = (month: string, serviceId: string, personId: string) => prPost(`/months/${month}/slots`, { serviceId, personId });
export async function removeProtocolSlot(month: string, id: string): Promise<void> {
  await apiFetch(`${PR}/months/${month}/slots/${id}`, { method: 'DELETE' });
}
export const replaceProtocolSlot = (month: string, id: string, personId: string) => prPost(`/months/${month}/slots/${id}/replace`, { personId });
export const setProtocolRole = (month: string, id: string, role: ProtocolRole) => prPost(`/months/${month}/slots/${id}/role`, { role });
export const approveProtocolRoles = (month: string) => prPost(`/months/${month}/roles/approve`);
export const overrideProtocolIssue = (month: string, issueKey: string, reason: string) => prPost(`/months/${month}/overrides`, { issueKey, reason });
export const relaxProtocolTuesday = (month: string, on: boolean, reason?: string) => prPost(`/months/${month}/relax`, { on, reason });
export const acknowledgeProtocolMusic = (month: string) => prPost(`/months/${month}/acknowledge-music`);
export const submitProtocolMonth = (month: string) => prPost(`/months/${month}/submit`);
export const returnProtocolMonth = (month: string) => prPost(`/months/${month}/return`);
export const publishProtocolMonth = (month: string) => prPost(`/months/${month}/publish`);
export const fetchProtocolHistory = (month: string): Promise<{ versions: Array<{ version: number; publishedAt: string; by: string; slots: number }> }> => apiFetch(`${PR}/months/${month}/history`);
export const fetchProtocolMine = (): Promise<ProtocolMine> => apiFetch(`${PR}/mine`);
export const requestProtocolAbsence = (serviceId: string, reason: string) => prPost('/absences', { serviceId, reason });
export const decideProtocolAbsence = (id: string, decision: 'EXCUSE' | 'DENY') => prPost(`/absences/${id}/decide`, { decision });
export const offerProtocolFillIn = (serviceId: string, excusedPersonId: string, candidatePersonId: string) => prPost('/fillins', { serviceId, excusedPersonId, candidatePersonId });
export const answerProtocolFillIn = (id: string, accept: boolean) => prPost(`/fillins/${id}/respond`, { accept });
export const proposeProtocolSwap = (serviceId: string, targetPersonId: string) => prPost('/swaps', { serviceId, targetPersonId });
export const answerProtocolSwap = (id: string, accept: boolean) => prPost(`/swaps/${id}/respond`, { accept });
export const markProtocolAttendance = (serviceId: string, personId: string, status: ProtocolAttendanceStatus) => prPost(`/services/${serviceId}/attendance`, { personId, status });
export const fetchProtocolScores = (month?: string): Promise<{ scores: Array<{ personId: string; name: string; points: number; services: number; absent: number }> }> =>
  apiFetch(`${PR}/scores${month ? `?month=${month}` : ''}`);
export const fetchProtocolServiceReport = (serviceId: string): Promise<{ service: { id: string; date: string; kind: string; label: string }; canWrite: boolean; report: (ProtocolReportParts & { submittedAt: string | null }) | null }> =>
  apiFetch(`${PR}/services/${serviceId}/report`);
export async function saveProtocolServiceReport(serviceId: string, parts: ProtocolReportParts): Promise<void> {
  await apiFetch(`${PR}/services/${serviceId}/report`, { method: 'PUT', body: parts });
}
export const fetchProtocolReports = (month: string): Promise<{ month: string; reports: ProtocolReportItem[] }> => apiFetch(`${PR}/reports?month=${month}`);
