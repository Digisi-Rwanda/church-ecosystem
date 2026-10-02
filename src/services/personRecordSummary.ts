import { membershipTypeLabel, roleLabel } from '../domain/access';
import { peopleService } from './authService';
import { correspondenceService } from './correspondenceService';
import { systemsService } from './orgService';
import { participationService } from './participationService';
import { buildPersonParticipationPlaces } from './personParticipation';

/**
 * One row per profile section, in the order the church asked for.
 * Keys match SECTION_LABELS on the person profile page.
 */
export const PERSON_RECORD_SECTIONS: ReadonlyArray<{
  key: string;
  label: string;
}> = [
  { key: 'overview', label: 'Overview' },
  { key: 'personal', label: 'Personal' },
  { key: 'contact', label: 'Contact' },
  { key: 'family', label: 'Family' },
  { key: 'membership', label: 'Membership' },
  { key: 'baptism', label: 'Baptism' },
  { key: 'marriage', label: 'Marriage' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'documents', label: 'Documents & Letters' },
  { key: 'teams', label: 'Teams / service' },
  { key: 'history', label: 'History' },
  { key: 'employment', label: 'Employment info' },
  { key: 'education', label: 'Education info' },
  { key: 'talents', label: 'Talents and skills' },
  { key: 'gifts', label: 'Spiritual gifts' },
  { key: 'account', label: 'Account' },
];

export type PersonRecordRow = {
  key: string;
  label: string;
  /** Viewer may not see this section at all (not in their allowed sections). */
  restricted: boolean;
  /** Why it is restricted, when it is. */
  restrictedReason?: string;
  /** Nothing on file for this person (only meaningful when not restricted). */
  empty: boolean;
  /** Short lines to show; empty when restricted or nothing on file. */
  lines: string[];
};

export type PersonRecordAccess = {
  /** Own profile or pastoral FULL record. */
  seeFullFields: boolean;
  /** Pastoral FULL record (address, pastoral notes). */
  canViewFullRecord: boolean;
  /** Sections the viewer's scope allows. */
  allowedSections: string[];
};

const FULL_ONLY = 'Pastoral / secretary access only';
const NOT_IN_SCOPE = 'Not available with your access';

function more(total: number, shown: number): string[] {
  return total > shown ? [`+ ${total - shown} more`] : [];
}

function joinBits(bits: Array<string | undefined | null | false>): string {
  return bits.filter(Boolean).join(' · ');
}

/**
 * Summarise a person's record for the table on the People page. Applies the
 * same rules as the full profile: a section outside the viewer's scope is
 * restricted, and sensitive sections also need the pastoral FULL record
 * (unless it is the viewer's own profile).
 */
export function summarizePersonRecord(
  personId: string,
  access: PersonRecordAccess,
  now = new Date(),
): PersonRecordRow[] {
  const person = peopleService.getById(personId);
  if (!person) return [];

  const allowed = new Set(access.allowedSections);
  const { seeFullFields, canViewFullRecord } = access;

  const memberships = participationService.activeMemberships(personId, now);
  const positions = participationService.activePositions(personId, now);
  const assignments = participationService.activeAssignments(personId, now);
  const mainRoles = participationService.rolesFor(personId, now);
  const places = buildPersonParticipationPlaces({
    memberships,
    positions,
    assignments,
  });

  const build = (key: string): Omit<PersonRecordRow, 'key' | 'label'> => {
    const done = (lines: string[]) => ({
      restricted: false,
      empty: lines.length === 0,
      lines,
    });
    const locked = (reason: string) => ({
      restricted: true,
      restrictedReason: reason,
      empty: false,
      lines: [] as string[],
    });

    if (!allowed.has(key)) return locked(NOT_IN_SCOPE);

    switch (key) {
      case 'overview':
        return done([
          joinBits([
            `Status: ${person.status}`,
            person.joinedChurchOn ? `Joined ${person.joinedChurchOn}` : null,
          ]),
          `Role: ${
            mainRoles.length === 0
              ? 'Member'
              : mainRoles.map((r) => roleLabel(r)).join(' · ')
          }`,
          `Participates in ${places.length} place${places.length === 1 ? '' : 's'}`,
        ]);

      case 'personal':
        if (!seeFullFields) {
          return locked(FULL_ONLY);
        }
        return done([
          joinBits([
            person.fullName,
            person.preferredName && person.preferredName !== person.fullName
              ? `“${person.preferredName}”`
              : null,
          ]),
          joinBits([
            person.dateOfBirth ? `Born ${person.dateOfBirth}` : null,
            person.gender ?? null,
          ]),
          person.nationalId ? 'National ID on file' : '',
        ].filter(Boolean));

      case 'contact':
        return done(
          [
            person.phone ? `Phone: ${person.phone}` : '',
            person.email ? `Email: ${person.email}` : '',
            canViewFullRecord && person.address
              ? `Address: ${person.address}`
              : '',
          ].filter(Boolean),
        );

      case 'family': {
        if (!seeFullFields) return locked(FULL_ONLY);
        const family = peopleService.familyLinks(personId);
        return done([
          ...family
            .slice(0, 4)
            .map((f) => `${f.otherName} — ${f.displayRelation}`),
          ...more(family.length, 4),
        ]);
      }

      case 'membership':
        return done([
          ...memberships.slice(0, 4).map((m) =>
            joinBits([
              m.label || membershipTypeLabel(m.type),
              m.systemId
                ? `→ ${systemsService.getById(m.systemId)?.shortName ?? m.systemId}`
                : null,
              `since ${m.startDate}`,
            ]),
          ),
          ...more(memberships.length, 4),
        ]);

      case 'baptism': {
        if (!seeFullFields) return locked(FULL_ONLY);
        const b = peopleService.baptism(personId);
        return done(
          b
            ? [joinBits([b.baptizedOn, b.place ?? null, b.ministerName ?? null])]
            : [],
        );
      }

      case 'marriage': {
        if (!seeFullFields) return locked(FULL_ONLY);
        const m = peopleService.marriage(personId);
        return done(
          m
            ? [
                joinBits([
                  m.status,
                  m.spouseName ? `Spouse: ${m.spouseName}` : null,
                  m.marriedOn ? `Married ${m.marriedOn}` : null,
                ]),
              ]
            : [],
        );
      }

      case 'certificates': {
        if (!seeFullFields) return locked(FULL_ONLY);
        const certs = peopleService.certificates(personId);
        return done([
          ...certs
            .slice(0, 4)
            .map((c) => joinBits([c.label, c.issuedOn ?? null])),
          ...more(certs.length, 4),
        ]);
      }

      case 'documents': {
        if (!seeFullFields) return locked(FULL_ONLY);
        const letters = correspondenceService.listDocuments({ personId });
        const docs = peopleService.documents(personId);
        const lines: string[] = [];
        if (letters.length > 0) {
          lines.push(
            `${letters.length} letter${letters.length === 1 ? '' : 's'}`,
          );
        }
        if (docs.length > 0) {
          lines.push(
            `${docs.length} document${docs.length === 1 ? '' : 's'} on file`,
          );
        }
        return done(lines);
      }

      case 'teams':
        return done([
          ...places.slice(0, 4).map((p) =>
            joinBits([
              p.placeName,
              p.roles.length > 0 ? p.roles.join(' / ') : null,
            ]),
          ),
          ...more(places.length, 4),
        ]);

      case 'history': {
        if (!seeFullFields) return locked(FULL_ONLY);
        const timeline = peopleService.timeline(personId);
        return done([
          ...timeline.slice(0, 3).map((e) => joinBits([e.at, e.title])),
          ...more(timeline.length, 3),
        ]);
      }

      case 'employment': {
        const jobs = peopleService.employment(personId);
        return done([
          ...jobs.slice(0, 3).map((j) =>
            joinBits([
              j.title ?? 'Role',
              j.employer ?? null,
              j.status ?? null,
            ]),
          ),
          ...more(jobs.length, 3),
        ]);
      }

      case 'education': {
        const eds = peopleService.education(personId);
        return done([
          ...eds.slice(0, 3).map((e) =>
            joinBits([
              e.institution,
              e.level ?? null,
              e.field ?? null,
              e.status ?? null,
            ]),
          ),
          ...more(eds.length, 3),
        ]);
      }

      case 'talents': {
        const ts = peopleService.talents(personId);
        return done([
          ...ts
            .slice(0, 4)
            .map((t) => joinBits([t.name, t.proficiency ?? null])),
          ...more(ts.length, 4),
        ]);
      }

      case 'gifts': {
        const gs = peopleService.spiritualGifts(personId);
        return done([
          ...gs.slice(0, 4).map((g) => g.gift),
          ...more(gs.length, 4),
        ]);
      }

      case 'account': {
        const roleBits = [...new Set(places.flatMap((p) => p.roles))];
        return done([
          places.length > 0
            ? `Participates in: ${places.map((p) => p.placeName).join(', ')}`
            : '',
          roleBits.length > 0 ? `Roles: ${roleBits.join(' · ')}` : '',
        ].filter(Boolean));
      }

      default:
        return done([]);
    }
  };

  return PERSON_RECORD_SECTIONS.map((s) => ({
    key: s.key,
    label: s.label,
    ...build(s.key),
  }));
}
