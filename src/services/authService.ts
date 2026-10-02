import { ACCOUNTS, PEOPLE } from '../data/seed';
import {
  markSeedPersonOverride,
  persistPeopleLocalStore,
} from '../data/peopleLocalStore';
import { membershipTypeLabel, roleLabel } from '../domain/access';
import {
  PERSON_BAPTISMS,
  PERSON_DOCUMENTS,
  PERSON_EDUCATION,
  PERSON_EMPLOYMENT,
  PERSON_FAMILY_LINKS,
  PERSON_MARRIAGES,
  PERSON_SPIRITUAL_GIFTS,
  PERSON_TALENTS,
  PERSON_TIMELINE,
  pushDocument,
  pushEducation,
  pushEmployment,
  pushFamilyLink,
  pushSpiritualGift,
  pushTalentSkill,
  pushTimelineEvent,
  removeEducation,
  removeEmployment,
  removeFamilyLink,
  removeSpiritualGift,
  removeTalentSkill,
  removeTimelineEvent,
  updateDocument as patchDocumentRecord,
  updateEducation as patchEducationRecord,
  updateEmployment as patchEmploymentRecord,
  updateSpiritualGift as patchSpiritualGiftRecord,
  updateTalentSkill as patchTalentSkillRecord,
  updateTimelineEvent as patchTimelineEvent,
  upsertBaptism,
  upsertMarriage,
} from '../data/personProfileSeed';
import {
  apiFetchGrants,
  apiLogin,
  ApiError,
  getApiToken,
  isApiEnabled,
  isApiFallbackEnabled,
  setApiToken,
  setSyncToken,
} from '../api';
import {
  clearSession,
  readSession,
  writeSession,
} from '../domain/sso';
import type {
  FamilyRelation,
  Person,
  PersonBaptismRecord,
  PersonDocumentMeta,
  PersonEducationRecord,
  PersonEmploymentRecord,
  PersonMarriageRecord,
  PersonSpiritualGift,
  PersonTalentSkill,
  PersonTimelineEvent,
  SessionState,
  SystemId,
  UserAccount,
} from '../domain/types';
import { accessService } from './accessService';
import { orgService } from './orgService';
import { participationService } from './participationService';
import { setActiveChoirOrgUnitId as syncChoirScope } from './choirScope';

/** Where directory search looks — beside the query on People. */
export type PeopleSearchScope =
  | 'all'
  | 'address'
  | 'membership'
  | 'baptism'
  | 'employment'
  | 'education'
  | 'service'
  | 'talents'
  | 'gifts';

/** Explicit “who to show” within a scope (e.g. employed vs no job on file). */
export type PeopleSearchFacet =
  | 'any'
  | 'current'
  | 'former'
  | 'none'
  | 'yes'
  | 'no'
  | 'in_progress'
  | 'completed';

export type PeopleSearchOptions = {
  scope?: PeopleSearchScope;
  facet?: PeopleSearchFacet;
  /** Sector, education level, membership type, gift name, etc. */
  category?: string;
};

function includesNeedle(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

function joinHay(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' · ');
}

function personIdentityHaystack(p: Person): string {
  return joinHay(
    p.fullName,
    p.preferredName,
    p.phone,
    p.email,
    p.nationalId,
    p.gender,
    p.status,
    p.pastoralNotes,
    p.joinedChurchOn,
    p.dateOfBirth,
  );
}

function personAddressHaystack(p: Person): string {
  return p.address ?? '';
}

function personMembershipHaystack(personId: string): string {
  return participationService
    .membershipsFor(personId)
    .map((m) =>
      joinHay(
        m.label,
        m.type,
        membershipTypeLabel(m.type),
        m.systemId,
        m.orgUnitId
          ? orgService.getById(m.orgUnitId)?.name
          : undefined,
      ),
    )
    .join(' · ');
}

function personBaptismHaystack(personId: string): string {
  const b = PERSON_BAPTISMS.find((x) => x.personId === personId);
  if (!b) return '';
  return joinHay(
    b.baptizedOn,
    b.place,
    b.mode,
    b.ministerName,
    b.certificateRef,
    b.notes,
    'baptism',
    'baptized',
  );
}

function personEmploymentHaystack(personId: string): string {
  return PERSON_EMPLOYMENT.filter((r) => r.personId === personId)
    .map((r) =>
      joinHay(
        r.employer,
        r.title,
        r.sector,
        r.status,
        r.startedOn,
        r.endedOn,
        r.notes,
        'job',
        'employment',
        'work',
      ),
    )
    .join(' · ');
}

function personEducationHaystack(personId: string): string {
  return PERSON_EDUCATION.filter((r) => r.personId === personId)
    .map((r) =>
      joinHay(
        r.institution,
        r.level,
        r.field,
        r.status,
        r.startedOn,
        r.endedOn,
        r.notes,
        'education',
        'school',
        'study',
      ),
    )
    .join(' · ');
}

function personServiceHaystack(personId: string): string {
  const positions = participationService.positionsFor(personId).map((p) =>
    joinHay(
      p.title,
      p.systemRole ? roleLabel(p.systemRole) : undefined,
      p.systemRole,
      orgService.getById(p.orgUnitId)?.name,
      p.choirOffice,
      p.protocolOffice,
      p.choirAdvisorRole,
    ),
  );
  const assignments = participationService
    .assignmentsFor(personId)
    .map((a) =>
      joinHay(a.title, a.contextLabel, a.contextType, a.systemId),
    );
  const roles = participationService
    .rolesFor(personId)
    .map((r) => joinHay(r, roleLabel(r)));
  return [...positions, ...assignments, ...roles].join(' · ');
}

function personTalentsHaystack(personId: string): string {
  return PERSON_TALENTS.filter((r) => r.personId === personId)
    .map((r) =>
      joinHay(r.kind, r.name, r.proficiency, r.notes, 'talent', 'skill'),
    )
    .join(' · ');
}

function personGiftsHaystack(personId: string): string {
  return PERSON_SPIRITUAL_GIFTS.filter((r) => r.personId === personId)
    .map((r) => joinHay(r.gift, r.evidence, r.notes, 'spiritual gift', 'gift'))
    .join(' · ');
}

function personExtraHaystack(personId: string): string {
  const marriage = PERSON_MARRIAGES.find((m) => m.personId === personId);
  const marriageHay = marriage
    ? joinHay(
        marriage.spouseName,
        marriage.place,
        marriage.status,
        marriage.certificateRef,
        marriage.notes,
        'marriage',
      )
    : '';
  const timeline = PERSON_TIMELINE.filter((e) => e.personId === personId)
    .map((e) => joinHay(e.kind, e.title, e.detail, e.at))
    .join(' · ');
  const docs = PERSON_DOCUMENTS.filter((d) => d.personId === personId)
    .map((d) => joinHay(d.label, d.kind, d.note, d.issuedOn))
    .join(' · ');
  const family = PERSON_FAMILY_LINKS.filter(
    (l) => l.personId === personId || l.relatedPersonId === personId,
  )
    .map((l) => joinHay(l.relation, l.notes))
    .join(' · ');
  return joinHay(marriageHay, timeline, docs, family);
}

function haystackForScope(p: Person, scope: PeopleSearchScope): string {
  switch (scope) {
    case 'address':
      return personAddressHaystack(p);
    case 'membership':
      return personMembershipHaystack(p.id);
    case 'baptism':
      return personBaptismHaystack(p.id);
    case 'employment':
      return personEmploymentHaystack(p.id);
    case 'education':
      return personEducationHaystack(p.id);
    case 'service':
      return personServiceHaystack(p.id);
    case 'talents':
      return personTalentsHaystack(p.id);
    case 'gifts':
      return personGiftsHaystack(p.id);
    case 'all':
    default:
      return joinHay(
        personIdentityHaystack(p),
        personAddressHaystack(p),
        personMembershipHaystack(p.id),
        personBaptismHaystack(p.id),
        personEmploymentHaystack(p.id),
        personEducationHaystack(p.id),
        personServiceHaystack(p.id),
        personTalentsHaystack(p.id),
        personGiftsHaystack(p.id),
        personExtraHaystack(p.id),
      );
  }
}

function personHasScopeData(p: Person, scope: PeopleSearchScope): boolean {
  if (scope === 'all') return true;
  if (scope === 'address') return Boolean(p.address?.trim());
  return haystackForScope(p, scope).trim().length > 0;
}

function matchesEmploymentFacet(
  personId: string,
  facet: PeopleSearchFacet,
): boolean {
  const jobs = PERSON_EMPLOYMENT.filter((r) => r.personId === personId);
  const hasCurrent = jobs.some((j) => j.status === 'CURRENT');
  const hasFormer = jobs.some((j) => j.status === 'FORMER');
  switch (facet) {
    case 'current':
      return hasCurrent;
    case 'former':
      return hasFormer && !hasCurrent;
    case 'none':
      return jobs.length === 0;
    case 'any':
    default:
      return jobs.length > 0;
  }
}

function matchesFacet(
  p: Person,
  scope: PeopleSearchScope,
  facet: PeopleSearchFacet,
): boolean {
  if (scope === 'all') return true;
  switch (scope) {
    case 'employment':
      return matchesEmploymentFacet(p.id, facet);
    case 'baptism':
      if (facet === 'yes') return Boolean(PERSON_BAPTISMS.some((b) => b.personId === p.id));
      if (facet === 'no') return !PERSON_BAPTISMS.some((b) => b.personId === p.id);
      return true;
    case 'address':
      if (facet === 'yes') return Boolean(p.address?.trim());
      if (facet === 'no') return !p.address?.trim();
      return true;
    case 'education': {
      const rows = PERSON_EDUCATION.filter((r) => r.personId === p.id);
      if (facet === 'none') return rows.length === 0;
      if (facet === 'in_progress')
        return rows.some((r) => r.status === 'IN_PROGRESS');
      if (facet === 'completed')
        return rows.some((r) => r.status === 'COMPLETED');
      if (facet === 'any') return rows.length > 0;
      return true;
    }
    case 'membership': {
      const rows = participationService.membershipsFor(p.id);
      if (facet === 'none') return rows.length === 0;
      if (facet === 'any') return rows.length > 0;
      return true;
    }
    case 'service': {
      const has =
        participationService.positionsFor(p.id).length > 0 ||
        participationService.assignmentsFor(p.id).length > 0;
      if (facet === 'none') return !has;
      if (facet === 'any') return has;
      return true;
    }
    case 'talents': {
      const rows = PERSON_TALENTS.filter((r) => r.personId === p.id);
      if (facet === 'none') return rows.length === 0;
      if (facet === 'any') return rows.length > 0;
      return true;
    }
    case 'gifts': {
      const rows = PERSON_SPIRITUAL_GIFTS.filter((r) => r.personId === p.id);
      if (facet === 'none') return rows.length === 0;
      if (facet === 'any') return rows.length > 0;
      return true;
    }
    default:
      return personHasScopeData(p, scope);
  }
}

function matchesCategory(
  p: Person,
  scope: PeopleSearchScope,
  category: string,
): boolean {
  const cat = category.trim().toLowerCase();
  if (!cat) return true;
  switch (scope) {
    case 'employment':
      return PERSON_EMPLOYMENT.some(
        (r) =>
          r.personId === p.id &&
          (r.sector?.toLowerCase() === cat ||
            r.title?.toLowerCase() === cat ||
            r.employer.toLowerCase() === cat),
      );
    case 'education':
      return PERSON_EDUCATION.some(
        (r) =>
          r.personId === p.id &&
          (r.level?.toLowerCase() === cat ||
            r.field?.toLowerCase() === cat ||
            r.institution.toLowerCase() === cat),
      );
    case 'membership':
      return participationService.membershipsFor(p.id).some(
        (m) =>
          m.type.toLowerCase() === cat ||
          membershipTypeLabel(m.type).toLowerCase() === cat ||
          m.label.toLowerCase() === cat,
      );
    case 'talents':
      return PERSON_TALENTS.some(
        (r) =>
          r.personId === p.id &&
          (r.name.toLowerCase() === cat || r.kind.toLowerCase() === cat),
      );
    case 'gifts':
      return PERSON_SPIRITUAL_GIFTS.some(
        (r) => r.personId === p.id && r.gift.toLowerCase() === cat,
      );
    case 'service':
      return includesNeedle(personServiceHaystack(p.id), cat);
    default:
      return true;
  }
}

function matchSummaryFor(p: Person, scope: PeopleSearchScope): string {
  switch (scope) {
    case 'employment': {
      const jobs = PERSON_EMPLOYMENT.filter((r) => r.personId === p.id);
      const current = jobs.find((j) => j.status === 'CURRENT') ?? jobs[0];
      if (!current) return 'No employment on file';
      return joinHay(
        current.title,
        current.employer,
        current.sector,
        current.status === 'CURRENT' ? 'Employed' : 'Former',
      );
    }
    case 'education': {
      const ed = PERSON_EDUCATION.filter((r) => r.personId === p.id)[0];
      if (!ed) return 'No education on file';
      return joinHay(ed.level, ed.field, ed.institution, ed.status);
    }
    case 'baptism': {
      const b = PERSON_BAPTISMS.find((x) => x.personId === p.id);
      if (!b) return 'Not baptized on file';
      return joinHay(b.baptizedOn, b.place, b.ministerName);
    }
    case 'address':
      return p.address?.trim() || 'No address on file';
    case 'membership': {
      const m = participationService.membershipsFor(p.id)[0];
      if (!m) return 'No membership on file';
      return joinHay(m.label, membershipTypeLabel(m.type));
    }
    case 'service': {
      const pos = participationService.positionsFor(p.id)[0];
      if (pos) {
        return joinHay(
          pos.title,
          orgService.getById(pos.orgUnitId)?.name,
          pos.systemRole ? roleLabel(pos.systemRole) : undefined,
        );
      }
      const a = participationService.assignmentsFor(p.id)[0];
      if (a) return joinHay(a.title, a.contextLabel);
      return 'No service role on file';
    }
    case 'talents': {
      const t = PERSON_TALENTS.filter((r) => r.personId === p.id);
      if (t.length === 0) return 'No talents / skills on file';
      return t.map((x) => joinHay(x.kind, x.name)).join(' · ');
    }
    case 'gifts': {
      const g = PERSON_SPIRITUAL_GIFTS.filter((r) => r.personId === p.id);
      if (g.length === 0) return 'No spiritual gifts on file';
      return g.map((x) => x.gift).join(' · ');
    }
    default:
      return p.phone || p.email || 'No contact on file';
  }
}

function normalizeSearchArgs(
  query: string,
  scopeOrOptions?: PeopleSearchScope | PeopleSearchOptions,
): { needle: string; scope: PeopleSearchScope; facet: PeopleSearchFacet; category: string } {
  if (typeof scopeOrOptions === 'string' || scopeOrOptions === undefined) {
    return {
      needle: query.trim().toLowerCase(),
      scope: scopeOrOptions ?? 'all',
      facet: 'any',
      category: '',
    };
  }
  return {
    needle: query.trim().toLowerCase(),
    scope: scopeOrOptions.scope ?? 'all',
    facet: scopeOrOptions.facet ?? 'any',
    category: scopeOrOptions.category?.trim() ?? '',
  };
}

function facetOptionsFor(
  scope: PeopleSearchScope,
): { value: PeopleSearchFacet; label: string }[] {
  switch (scope) {
    case 'employment':
      return [
        { value: 'current', label: 'Currently employed' },
        { value: 'former', label: 'Former job only' },
        { value: 'any', label: 'Any job on file' },
        { value: 'none', label: 'No employment on file' },
      ];
    case 'baptism':
      return [
        { value: 'yes', label: 'Baptized' },
        { value: 'no', label: 'Not baptized on file' },
        { value: 'any', label: 'Anyone' },
      ];
    case 'address':
      return [
        { value: 'yes', label: 'Has address' },
        { value: 'no', label: 'Missing address' },
        { value: 'any', label: 'Anyone' },
      ];
    case 'education':
      return [
        { value: 'any', label: 'Any education on file' },
        { value: 'completed', label: 'Completed studies' },
        { value: 'in_progress', label: 'In progress' },
        { value: 'none', label: 'No education on file' },
      ];
    case 'membership':
      return [
        { value: 'any', label: 'Has membership' },
        { value: 'none', label: 'No membership' },
      ];
    case 'service':
      return [
        { value: 'any', label: 'Has service role' },
        { value: 'none', label: 'No service role' },
      ];
    case 'talents':
      return [
        { value: 'any', label: 'Has talent / skill' },
        { value: 'none', label: 'None on file' },
      ];
    case 'gifts':
      return [
        { value: 'any', label: 'Has spiritual gift' },
        { value: 'none', label: 'None on file' },
      ];
    default:
      return [{ value: 'any', label: 'Anyone' }];
  }
}

function categoryOptionsFor(scope: PeopleSearchScope): string[] {
  const set = new Set<string>();
  switch (scope) {
    case 'employment':
      for (const r of PERSON_EMPLOYMENT) {
        if (r.sector?.trim()) set.add(r.sector.trim());
      }
      break;
    case 'education':
      for (const r of PERSON_EDUCATION) {
        if (r.level?.trim()) set.add(r.level.trim());
        if (r.field?.trim()) set.add(r.field.trim());
      }
      break;
    case 'membership':
      for (const p of PEOPLE) {
        for (const m of participationService.membershipsFor(p.id)) {
          set.add(membershipTypeLabel(m.type));
        }
      }
      break;
    case 'talents':
      for (const r of PERSON_TALENTS) set.add(r.name);
      break;
    case 'gifts':
      for (const r of PERSON_SPIRITUAL_GIFTS) set.add(r.gift);
      break;
    default:
      break;
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const ACCOUNT_KEY = 'adepr.accountId';
const API_ACCOUNT_KEY = 'adepr.apiAccount';
const AUTH_SOURCE_KEY = 'adepr.authSource';

type AuthSource = 'local' | 'api';

function preserveChoirSession(
  patch: Omit<SessionState, 'activeChoirOrgUnitId'> &
    Partial<Pick<SessionState, 'activeChoirOrgUnitId'>>,
): SessionState {
  const prev = readSession();
  const next: SessionState = {
    ...patch,
    activeChoirOrgUnitId:
      patch.activeChoirOrgUnitId ?? prev?.activeChoirOrgUnitId,
  };
  writeSession(next);
  if (next.activeChoirOrgUnitId) {
    syncChoirScope(next.activeChoirOrgUnitId);
  }
  return next;
}

function readApiAccountSnapshot(): UserAccount | null {
  try {
    const raw = localStorage.getItem(API_ACCOUNT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserAccount;
  } catch {
    return null;
  }
}

function writeApiAccountSnapshot(account: UserAccount): void {
  localStorage.setItem(API_ACCOUNT_KEY, JSON.stringify(account));
  localStorage.setItem(AUTH_SOURCE_KEY, 'api');
}

function clearApiAuth(): void {
  localStorage.removeItem(API_ACCOUNT_KEY);
  localStorage.removeItem(AUTH_SOURCE_KEY);
  setApiToken(null);
}

function findAccount(id: string | null): UserAccount | null {
  if (!id) return null;
  const fromSeed = ACCOUNTS.find((a) => a.id === id);
  if (fromSeed) return fromSeed;
  const api = readApiAccountSnapshot();
  return api?.id === id ? api : null;
}

function ensurePersonMirror(person: {
  id: string;
  fullName: string;
  preferredName?: string | null;
  status: string;
}): void {
  if (PEOPLE.some((p) => p.id === person.id)) return;
  PEOPLE.push({
    id: person.id,
    fullName: person.fullName,
    preferredName: person.preferredName ?? undefined,
    status: (person.status as Person['status']) || 'ACTIVE',
    createdAt: new Date().toISOString().slice(0, 10),
  });
  persistPeopleLocalStore();
}

function establishSession(
  account: UserAccount,
  targetSystemId: SystemId,
  entryMode: SessionState['entryMode'],
): UserAccount | null {
  const enter = accessService.authorize(
    account.personId,
    targetSystemId,
    'SYSTEM',
    'ENTER',
    { audit: true, entryMode },
  );
  if (!enter.allowed) return null;

  localStorage.setItem(ACCOUNT_KEY, account.id);
  preserveChoirSession({
    accountId: account.id,
    currentSystemId: targetSystemId,
    entryMode,
  });
  return account;
}

function loginLocal(
  username: string,
  password: string,
  targetSystemId: SystemId,
): UserAccount | null {
  const account = ACCOUNTS.find(
    (a) =>
      a.username === username.trim().toLowerCase() &&
      a.password === password,
  );
  if (!account) return null;
  clearApiAuth();
  localStorage.setItem(AUTH_SOURCE_KEY, 'local');
  const entryMode: SessionState['entryMode'] =
    targetSystemId === 'sys-main' ? 'main' : 'direct';
  return establishSession(account, targetSystemId, entryMode);
}

export const authService = {
  authSource(): AuthSource {
    return localStorage.getItem(AUTH_SOURCE_KEY) === 'api' ? 'api' : 'local';
  },

  isApiMode(): boolean {
    return isApiEnabled();
  },

  /**
   * Prefer API when VITE_API_URL is set; fall back to in-memory seed login
   * unless VITE_API_FALLBACK=false.
   */
  async login(
    username: string,
    password: string,
    targetSystemId: SystemId = 'sys-main',
  ): Promise<UserAccount | null> {
    if (isApiEnabled()) {
      try {
        const result = await apiLogin(username, password, targetSystemId);
        // A demo role account that exists on the server only as a bare account
        // (no roles there) keeps its local demo permissions; the token is kept
        // just to share Music/Protocol data.
        const token = getApiToken();
        const grants = await apiFetchGrants().catch(() => null);
        if (
          grants &&
          grants.grants.length > 0 &&
          grants.grants.every((g) => g.source === 'ACCOUNT')
        ) {
          const local = loginLocal(username, password, targetSystemId);
          if (local) {
            setSyncToken(token);
            return local;
          }
        }
        ensurePersonMirror(result.person);
        const account: UserAccount = {
          id: result.account.id,
          personId: result.account.personId,
          username: result.account.username,
          password: '',
        };
        writeApiAccountSnapshot(account);
        const entryMode: SessionState['entryMode'] =
          targetSystemId === 'sys-main' ? 'main' : 'direct';
        const sessionAccount = establishSession(
          account,
          targetSystemId,
          entryMode,
        );
        if (sessionAccount) return sessionAccount;
        clearApiAuth();
        return null;
      } catch (e) {
        if (!isApiFallbackEnabled()) return null;
        if (e instanceof ApiError && (e.status === 0 || e.status === 401)) {
          // API down or unknown user → local demo accounts
        } else {
          return null;
        }
      }
    }
    return loginLocal(username, password, targetSystemId);
  },

  logout() {
    setSyncToken(null);
    localStorage.removeItem(ACCOUNT_KEY);
    clearApiAuth();
    clearSession();
  },

  getSessionAccount(): UserAccount | null {
    const session = readSession();
    if (session) {
      const api = readApiAccountSnapshot();
      if (api && api.id === session.accountId) return api;
      return findAccount(session.accountId);
    }
    const id = localStorage.getItem(ACCOUNT_KEY);
    const api = readApiAccountSnapshot();
    if (api && api.id === id) return api;
    return findAccount(id);
  },

  getSession(): SessionState | null {
    return readSession();
  },

  setCurrentSystem(
    systemId: SystemId,
    entryMode: SessionState['entryMode'],
  ) {
    const account = this.getSessionAccount();
    if (!account) return;
    preserveChoirSession({
      accountId: account.id,
      currentSystemId: systemId,
      entryMode,
    });
  },

  setActiveChoirOrgUnitId(orgUnitId: string) {
    const session = readSession();
    if (!session) return;
    preserveChoirSession({
      accountId: session.accountId,
      currentSystemId: session.currentSystemId,
      entryMode: session.entryMode,
      activeChoirOrgUnitId: orgUnitId,
    });
  },

  /** Establish session from a redeemed SSO handoff. */
  acceptHandoff(accountId: string, toSystemId: SystemId): UserAccount | null {
    const account = findAccount(accountId);
    if (!account) return null;
    return establishSession(account, toSystemId, 'handoff');
  },
};

export const peopleService = {
  list() {
    return [...PEOPLE];
  },
  getById(id: string) {
    return PEOPLE.find((p) => p.id === id) ?? null;
  },
  search(
    query: string,
    scopeOrOptions?: PeopleSearchScope | PeopleSearchOptions,
  ) {
    const { needle, scope, facet, category } = normalizeSearchArgs(
      query,
      scopeOrOptions,
    );
    return [...PEOPLE].filter((p) => {
      if (!matchesFacet(p, scope, facet)) return false;
      if (!matchesCategory(p, scope, category)) return false;
      if (!needle) {
        // Scoped browse with no text: facet/category already define the set.
        if (scope === 'all') return true;
        if (facet === 'none' || facet === 'no') return true;
        if (facet === 'any' || facet === 'current' || facet === 'former' ||
            facet === 'yes' || facet === 'completed' || facet === 'in_progress') {
          return true;
        }
        return personHasScopeData(p, scope);
      }
      // Text search: within identity always when scope is all; else within scope fields.
      // For "none/no" facets, still allow name search among that set.
      if (facet === 'none' || facet === 'no') {
        return includesNeedle(personIdentityHaystack(p), needle);
      }
      if (scope === 'all') {
        return includesNeedle(haystackForScope(p, 'all'), needle);
      }
      return (
        includesNeedle(haystackForScope(p, scope), needle) ||
        includesNeedle(personIdentityHaystack(p), needle)
      );
    });
  },

  /** Secondary “Show” options for a Look-in scope. */
  searchFacetOptions(scope: PeopleSearchScope) {
    return facetOptionsFor(scope);
  },

  /** Category chips/select values (sectors, levels, gift names…). */
  searchCategoryOptions(scope: PeopleSearchScope) {
    return categoryOptionsFor(scope);
  },

  /** One-line summary shown under each person for the active scope. */
  searchMatchSummary(personId: string, scope: PeopleSearchScope) {
    const p = PEOPLE.find((x) => x.id === personId);
    if (!p) return '';
    return matchSummaryFor(p, scope);
  },

  familyLinks(personId: string) {
    return PERSON_FAMILY_LINKS.filter(
      (l) => l.personId === personId || l.relatedPersonId === personId,
    ).map((l) => {
      const otherId =
        l.personId === personId ? l.relatedPersonId : l.personId;
      const other = PEOPLE.find((p) => p.id === otherId);
      const relation =
        l.personId === personId
          ? l.relation
          : reverseRelation(l.relation);
      return {
        ...l,
        otherPersonId: otherId,
        otherName: other?.preferredName || other?.fullName || otherId,
        displayRelation: relation,
      };
    });
  },

  baptism(personId: string) {
    return PERSON_BAPTISMS.find((b) => b.personId === personId) ?? null;
  },

  marriage(personId: string) {
    return PERSON_MARRIAGES.find((m) => m.personId === personId) ?? null;
  },

  timeline(personId: string) {
    return PERSON_TIMELINE.filter((e) => e.personId === personId).sort(
      (a, b) => b.at.localeCompare(a.at),
    );
  },

  documents(personId: string) {
    return PERSON_DOCUMENTS.filter((d) => d.personId === personId);
  },

  certificates(personId: string) {
    return this.documents(personId).filter((d) => d.kind === 'CERTIFICATE');
  },

  employment(personId: string) {
    return PERSON_EMPLOYMENT.filter((r) => r.personId === personId);
  },

  education(personId: string) {
    return PERSON_EDUCATION.filter((r) => r.personId === personId);
  },

  talents(personId: string) {
    return PERSON_TALENTS.filter((r) => r.personId === personId);
  },

  spiritualGifts(personId: string) {
    return PERSON_SPIRITUAL_GIFTS.filter((r) => r.personId === personId);
  },

  create(input: Omit<Person, 'id' | 'createdAt'> & { id?: string }): Person {
    const person: Person = {
      id: input.id ?? `p-${Date.now()}`,
      fullName: input.fullName,
      preferredName: input.preferredName,
      phone: input.phone,
      email: input.email,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      address: input.address,
      nationalId: input.nationalId,
      joinedChurchOn: input.joinedChurchOn,
      pastoralNotes: input.pastoralNotes,
      photoUrl: input.photoUrl,
      status: input.status,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    PEOPLE.push(person);
    persistPeopleLocalStore();
    return person;
  },

  update(
    personId: string,
    patch: Partial<Omit<Person, 'id' | 'createdAt'>>,
  ): Person | null {
    const p = PEOPLE.find((x) => x.id === personId);
    if (!p) return null;
    Object.assign(p, patch);
    markSeedPersonOverride(personId);
    persistPeopleLocalStore();
    return p;
  },

  saveBaptism(record: PersonBaptismRecord) {
    upsertBaptism(record);
    persistPeopleLocalStore();
  },

  saveMarriage(record: PersonMarriageRecord) {
    upsertMarriage(record);
    persistPeopleLocalStore();
  },

  addFamilyLink(input: {
    personId: string;
    relatedPersonId: string;
    relation: FamilyRelation;
    notes?: string;
  }) {
    pushFamilyLink({
      id: `pfl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...input,
    });
    persistPeopleLocalStore();
  },

  removeFamilyLink(id: string) {
    removeFamilyLink(id);
    persistPeopleLocalStore();
  },

  addTimelineEvent(
    input: Omit<PersonTimelineEvent, 'id'> & { id?: string },
  ) {
    pushTimelineEvent({
      id: input.id ?? `ptl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personId: input.personId,
      at: input.at,
      kind: input.kind,
      title: input.title,
      detail: input.detail,
    });
    persistPeopleLocalStore();
  },

  updateTimelineEvent(
    id: string,
    patch: Partial<Omit<PersonTimelineEvent, 'id' | 'personId'>>,
  ) {
    const next = patchTimelineEvent(id, patch);
    persistPeopleLocalStore();
    return next;
  },

  removeTimelineEvent(id: string) {
    removeTimelineEvent(id);
    persistPeopleLocalStore();
  },

  addDocument(input: Omit<PersonDocumentMeta, 'id'> & { id?: string }) {
    pushDocument({
      id: input.id ?? `pdoc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...input,
    });
    persistPeopleLocalStore();
  },

  updateDocument(
    id: string,
    patch: Partial<Omit<PersonDocumentMeta, 'id' | 'personId'>>,
  ) {
    const next = patchDocumentRecord(id, patch);
    persistPeopleLocalStore();
    return next;
  },

  addEmployment(input: Omit<PersonEmploymentRecord, 'id'> & { id?: string }) {
    pushEmployment({
      id:
        input.id ??
        `pemp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...input,
    });
    persistPeopleLocalStore();
  },

  updateEmployment(
    id: string,
    patch: Partial<Omit<PersonEmploymentRecord, 'id' | 'personId'>>,
  ) {
    const next = patchEmploymentRecord(id, patch);
    persistPeopleLocalStore();
    return next;
  },

  removeEmployment(id: string) {
    removeEmployment(id);
    persistPeopleLocalStore();
  },

  addEducation(input: Omit<PersonEducationRecord, 'id'> & { id?: string }) {
    pushEducation({
      id:
        input.id ??
        `pedu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...input,
    });
    persistPeopleLocalStore();
  },

  updateEducation(
    id: string,
    patch: Partial<Omit<PersonEducationRecord, 'id' | 'personId'>>,
  ) {
    const next = patchEducationRecord(id, patch);
    persistPeopleLocalStore();
    return next;
  },

  removeEducation(id: string) {
    removeEducation(id);
    persistPeopleLocalStore();
  },

  addTalentSkill(input: Omit<PersonTalentSkill, 'id'> & { id?: string }) {
    pushTalentSkill({
      id:
        input.id ??
        `ptal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...input,
    });
    persistPeopleLocalStore();
  },

  updateTalentSkill(
    id: string,
    patch: Partial<Omit<PersonTalentSkill, 'id' | 'personId'>>,
  ) {
    const next = patchTalentSkillRecord(id, patch);
    persistPeopleLocalStore();
    return next;
  },

  removeTalentSkill(id: string) {
    removeTalentSkill(id);
    persistPeopleLocalStore();
  },

  addSpiritualGift(input: Omit<PersonSpiritualGift, 'id'> & { id?: string }) {
    pushSpiritualGift({
      id:
        input.id ??
        `pgift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...input,
    });
    persistPeopleLocalStore();
  },

  updateSpiritualGift(
    id: string,
    patch: Partial<Omit<PersonSpiritualGift, 'id' | 'personId'>>,
  ) {
    const next = patchSpiritualGiftRecord(id, patch);
    persistPeopleLocalStore();
    return next;
  },

  removeSpiritualGift(id: string) {
    removeSpiritualGift(id);
    persistPeopleLocalStore();
  },
};

function reverseRelation(relation: string): string {
  if (relation === 'PARENT') return 'CHILD';
  if (relation === 'CHILD') return 'PARENT';
  return relation;
}
