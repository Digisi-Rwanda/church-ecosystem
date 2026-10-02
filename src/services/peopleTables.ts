import { roleLabel } from '../domain/access';
import type { GridColumn } from '../components/ui/dataGridLogic';
import type {
  Person,
  PersonEducationRecord,
  PersonEmploymentRecord,
} from '../domain/types';
import { peopleService } from './authService';
import { participationService } from './participationService';
import { buildPersonParticipationPlaces } from './personParticipation';

/** A cell the viewer is not allowed to see. */
export const RESTRICTED = null;
export type Cell = string | typeof RESTRICTED;

export type PersonalInfoRow = {
  personId: string;
  fullName: string;
  nationalId: Cell;
  dateOfBirth: Cell;
  phone: string;
  email: string;
  address: Cell;
  spouse: Cell;
};

export type ChurchInfoRow = {
  personId: string;
  fullName: string;
  baptismDate: Cell;
  service: string;
  roles: string;
};

export type OtherInfoRow = {
  personId: string;
  fullName: string;
  employment: string;
  education: string;
  talents: string;
};

export const NONE = 'None';

function latestBy<T>(items: T[], key: (t: T) => string): T | undefined {
  return [...items].sort((a, b) => key(b).localeCompare(key(a)))[0];
}

function latestEmployment(
  jobs: PersonEmploymentRecord[],
): PersonEmploymentRecord | undefined {
  const current = jobs.filter((j) => j.status === 'CURRENT');
  return latestBy(current.length > 0 ? current : jobs, (j) =>
    j.status === 'CURRENT' ? (j.startedOn ?? '') : (j.endedOn ?? j.startedOn ?? ''),
  );
}

function latestEducation(
  eds: PersonEducationRecord[],
): PersonEducationRecord | undefined {
  const inProgress = eds.filter((e) => e.status === 'IN_PROGRESS');
  return latestBy(inProgress.length > 0 ? inProgress : eds, (e) =>
    e.endedOn ?? e.startedOn ?? '',
  );
}

/** "Bachelor · University of Rwanda": level and where it was studied. */
export function educationLabel(
  edu: Pick<PersonEducationRecord, 'level' | 'institution'> | undefined,
): string {
  if (!edu) return NONE;
  const text = [edu.level, edu.institution]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(' · ');
  return text || NONE;
}

function spouseOf(personId: string): string {
  const marriage = peopleService.marriage(personId);
  if (marriage && marriage.status === 'MARRIED') {
    if (marriage.spouseName) return marriage.spouseName;
    if (marriage.spousePersonId) {
      const s = peopleService.getById(marriage.spousePersonId);
      if (s) return s.fullName;
    }
  }
  const link = peopleService
    .familyLinks(personId)
    .find((l) => l.relation === 'SPOUSE');
  return link ? link.otherName : NONE;
}

/**
 * One row per person for each of the three People tables.
 * `canViewFullRecord` (pastoral / secretary) unlocks the sensitive columns:
 * national ID, date of birth, address, spouse and baptism date.
 */
export function buildPeopleTableRows(
  person: Person,
  canViewFullRecord: boolean,
  now = new Date(),
): { personal: PersonalInfoRow; church: ChurchInfoRow; other: OtherInfoRow } {
  const full = (value: string | undefined): Cell =>
    canViewFullRecord ? (value && value.length > 0 ? value : NONE) : RESTRICTED;

  const places = buildPersonParticipationPlaces({
    memberships: participationService.activeMemberships(person.id, now),
    positions: participationService.activePositions(person.id, now),
    assignments: participationService.activeAssignments(person.id, now),
  });
  const roles = participationService.rolesFor(person.id, now);

  const job = latestEmployment(peopleService.employment(person.id));
  const edu = latestEducation(peopleService.education(person.id));
  const talents = peopleService.talents(person.id);

  return {
    personal: {
      personId: person.id,
      fullName: person.fullName,
      nationalId: full(person.nationalId),
      dateOfBirth: full(person.dateOfBirth),
      phone: person.phone ?? NONE,
      email: person.email ?? NONE,
      address: full(person.address),
      spouse: canViewFullRecord ? spouseOf(person.id) : RESTRICTED,
    },
    church: {
      personId: person.id,
      fullName: person.fullName,
      baptismDate: full(peopleService.baptism(person.id)?.baptizedOn),
      service:
        places.length > 0 ? places.map((p) => p.placeName).join(', ') : NONE,
      roles:
        roles.length > 0 ? roles.map((r) => roleLabel(r)).join(', ') : 'Member',
    },
    other: {
      personId: person.id,
      fullName: person.fullName,
      employment: job
        ? [job.title, job.employer].filter(Boolean).join(' · ')
        : NONE,
      education: educationLabel(edu),
      talents:
        talents.length > 0 ? talents.map((t) => t.name).join(', ') : NONE,
    },
  };
}

export type PeopleTableKey = 'personal' | 'church' | 'other';

export const PEOPLE_TABLE_KEYS: PeopleTableKey[] = [
  'personal',
  'church',
  'other',
];

export const PEOPLE_TABLE_META: Record<
  PeopleTableKey,
  { title: string; hint: string; exportName: string }
> = {
  personal: {
    title: 'Personal info',
    hint: 'Identity and contact details.',
    exportName: 'people-personal-info',
  },
  church: {
    title: 'Church info',
    hint: 'Baptism, where each person serves, and their role in the main system.',
    exportName: 'people-church-info',
  },
  other: {
    title: 'Other info',
    hint: 'Latest employment, latest education level, talents and skills.',
    exportName: 'people-other-info',
  },
};

export function isPeopleTableKey(v: string | undefined): v is PeopleTableKey {
  return v === 'personal' || v === 'church' || v === 'other';
}

export const personalColumns: GridColumn<PersonalInfoRow>[] = [
  { id: 'fullName', header: 'Full name', value: (r) => r.fullName, sortable: true, filter: 'text' },
  { id: 'nationalId', header: 'National ID', value: (r) => r.nationalId, sortable: true, filter: 'text' },
  { id: 'dateOfBirth', header: 'Date of birth', value: (r) => r.dateOfBirth, sortable: true, filter: 'text' },
  { id: 'phone', header: 'Phone number', value: (r) => r.phone, sortable: true, filter: 'text' },
  { id: 'email', header: 'Email', value: (r) => r.email, sortable: true, filter: 'text' },
  { id: 'address', header: 'Address', value: (r) => r.address, sortable: true, filter: 'text' },
  { id: 'spouse', header: 'Spouse', value: (r) => r.spouse, sortable: true, filter: 'text' },
];

export const churchColumns: GridColumn<ChurchInfoRow>[] = [
  { id: 'fullName', header: 'Full name', value: (r) => r.fullName, sortable: true, filter: 'text' },
  { id: 'baptismDate', header: 'Baptism date', value: (r) => r.baptismDate, sortable: true, filter: 'text' },
  { id: 'service', header: 'Service', value: (r) => r.service, sortable: true, filter: 'text' },
  { id: 'roles', header: 'System roles', value: (r) => r.roles, sortable: true, filter: 'select' },
];

export const otherColumns: GridColumn<OtherInfoRow>[] = [
  { id: 'fullName', header: 'Full name', value: (r) => r.fullName, sortable: true, filter: 'text' },
  { id: 'employment', header: 'Employment', value: (r) => r.employment, sortable: true, filter: 'text' },
  { id: 'education', header: 'Education', value: (r) => r.education, sortable: true, filter: 'select' },
  { id: 'talents', header: 'Talents & skills', value: (r) => r.talents, sortable: true, filter: 'text' },
];
