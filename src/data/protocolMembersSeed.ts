import type {
  Membership,
  Person,
  ProtocolOffice,
  ProtocolRosterMember,
  ProtocolServiceKind,
  ServeDayCapability,
} from '../domain/types';

/** Canonical protocol roster — replaces all prior demo protocol members. */
const ROSTER_ROWS: {
  name: string;
  email: string;
  role: 'Member' | 'Coordinator';
  choir: string;
  availability: 'available' | 'pregnant' | 'on_leave';
  serveDays: 'tuesday' | 'all';
}[] = [
  {
    name: 'Ayinkamiye Florence',
    email: 'a.florence@church.internal',
    role: 'Member',
    choir: 'Elim Choir',
    availability: 'available',
    serveDays: 'tuesday',
  },
  {
    name: 'Bagorwa Eslon',
    email: 'b.eslon@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Bugirimfura Pascal',
    email: 'b.pascal@church.internal',
    role: 'Member',
    choir: "Ijwi ry'Umwami Yesu Choir",
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Dusabimana Jeanne (Jolie)',
    email: 'd.jolie@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'pregnant',
    serveDays: 'all',
  },
  {
    name: 'Dushime Remy Mathias',
    email: 'd.mathias@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Dushimiyimana Eric',
    email: 'd.eric@church.internal',
    role: 'Member',
    choir: "Ijwi ry'Umwami Yesu Choir",
    availability: 'available',
    serveDays: 'tuesday',
  },
  {
    name: 'Habibu Niyibizi',
    email: 'h.niyibizi@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: "Hakizimana Jean D'Amour",
    email: 'h.damour@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ihumure Ester Athanasie',
    email: 'i.athanasie@church.internal',
    role: 'Member',
    choir: "Ijwi ry'Umwami Yesu Choir",
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Imanishimwe Sylvestre',
    email: 'i.sylvestre@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ingabire Cynthia',
    email: 'i.cynthia@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ingabire Georgette',
    email: 'i.georgette@church.internal',
    role: 'Member',
    choir: 'Beulah Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Iryayo Jean Wiclef',
    email: 'i.wiclef@church.internal',
    role: 'Coordinator',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ishimwe Jimmy',
    email: 'i.jimmy@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Kwizera Saïd',
    email: 'k.said@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Macumi Emmanuel',
    email: 'm.emmanuel@church.internal',
    role: 'Member',
    choir: 'El Bethel Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Manirakiza Jean Damascene',
    email: 'm.damascene@church.internal',
    role: 'Member',
    choir: "Ijwi ry'Umwami Yesu Choir",
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Mukadive Anne Marie',
    email: 'm.marie@church.internal',
    role: 'Member',
    choir: 'Beulah Choir',
    availability: 'available',
    serveDays: 'tuesday',
  },
  {
    name: 'Mukakarisa Elevanie',
    email: 'm.elevanie@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Mukamunana Marie Therese',
    email: 'm.therese@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Mukasekuru Immaculée',
    email: 'm.immaculee@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Mukashyaka Joseline',
    email: 'm.joseline@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Mukesharugo Jeanne',
    email: 'm.jeanne@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Munyana Dorothee',
    email: 'm.dorothee@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Mushimiyimana Jacqueline',
    email: 'm.jacqueline@church.internal',
    role: 'Member',
    choir: 'Beulah Choir',
    availability: 'on_leave',
    serveDays: 'all',
  },
  {
    name: 'Mutesi Louange',
    email: 'm.louange@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ndahunga Jean De La Croix',
    email: 'n.croix@church.internal',
    role: 'Member',
    choir: 'El Bethel Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ngabonziza Athanase',
    email: 'n.athanase@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Nirere Monique',
    email: 'n.monique@church.internal',
    role: 'Member',
    choir: 'El Bethel Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Niwemutoni Jeannette',
    email: 'n.jeannette@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Niyigena Claudine',
    email: 'n.claudine@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Niyikiza Baptiste',
    email: 'n.baptiste@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Niyokwizerwa Obed',
    email: 'n.obed@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Niyompuhwe Aimable',
    email: 'n.aimable@church.internal',
    role: 'Member',
    choir: "Ijwi ry'Umwami Yesu Choir",
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Niyomuco Anabella',
    email: 'n.anabella@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'pregnant',
    serveDays: 'all',
  },
  {
    name: 'Ntahobavukira Modeste',
    email: 'n.modeste@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ntirenganya Emmanuel',
    email: 'n.emmanuel@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ntivuguruzwa Jean Paul',
    email: 'n.paul@church.internal',
    role: 'Member',
    choir: 'El Bethel Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Nyirahabimana Betty',
    email: 'n.betty@church.internal',
    role: 'Member',
    choir: 'Elim Choir',
    availability: 'available',
    serveDays: 'tuesday',
  },
  {
    name: 'Nyirandorimana Chantal',
    email: 'n.chantal@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Nyiruburanga Henriette',
    email: 'n.henriette@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ruberanzira Reverien',
    email: 'r.reverien@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ruhanga Julie',
    email: 'r.julie@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Rwumbuguza Patience',
    email: 'r.patience@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Sibomana Evariste',
    email: 's.evariste@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ufiteyezu Marie Rose',
    email: 'u.rose@church.internal',
    role: 'Member',
    choir: 'El Bethel Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ufituwe Christine',
    email: 'u.christine@church.internal',
    role: 'Member',
    choir: "Ijwi ry'Umwami Yesu Choir",
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ujeneza Wivine',
    email: 'u.wivine@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Ukundwaniwabo Eric',
    email: 'u.eric@church.internal',
    role: 'Member',
    choir: 'Integuza Choir',
    availability: 'on_leave',
    serveDays: 'all',
  },
  {
    name: 'Umugwaneza Hodari',
    email: 'u.hodari@church.internal',
    role: 'Member',
    choir: 'El Bethel Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Uwera Alice',
    email: 'u.alice@church.internal',
    role: 'Member',
    choir: "Ijwi ry'Umwami Yesu Choir",
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Uwimana Jean Marie',
    email: 'u.marie@church.internal',
    role: 'Member',
    choir: 'El Bethel Choir',
    availability: 'available',
    serveDays: 'all',
  },
  {
    name: 'Zaninka Jacqueline',
    email: 'z.jacqueline@church.internal',
    role: 'Member',
    choir: '',
    availability: 'available',
    serveDays: 'all',
  },
];

const CHOIR_ORG_UNIT: Record<string, string> = {
  'Elim Choir': 'ou-choir-elim',
  "Ijwi ry'Umwami Yesu Choir": 'ou-choir-ijwi',
  'Integuza Choir': 'ou-choir-integuza',
  'Beulah Choir': 'ou-choir-beulah',
  'El Bethel Choir': 'ou-choir-elbethel',
};

export const PROTOCOL_COORDINATOR_PERSON_ID = 'p-proto-coord';

function personIdForRow(row: (typeof ROSTER_ROWS)[number]): string {
  if (row.role === 'Coordinator') return PROTOCOL_COORDINATOR_PERSON_ID;
  const local = row.email.split('@')[0] ?? 'member';
  return `p-proto-${local.replace(/\./g, '-')}`;
}

function parseDisplayName(raw: string): {
  fullName: string;
  preferredName?: string;
} {
  const paren = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    return { fullName: paren[1]!.trim(), preferredName: paren[2]!.trim() };
  }
  const parts = raw.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { fullName: raw.trim(), preferredName: parts[parts.length - 1] };
  }
  return { fullName: raw.trim() };
}

function rosterStatus(
  availability: (typeof ROSTER_ROWS)[number]['availability'],
): ProtocolRosterMember['status'] {
  if (availability === 'on_leave') return 'LEAVE';
  if (availability === 'pregnant') return 'LEAVE';
  return 'ACTIVE';
}

function serveCapability(row: (typeof ROSTER_ROWS)[number]): {
  serveDays: ServeDayCapability;
  allowedServiceKinds?: ProtocolServiceKind[];
} {
  if (row.serveDays === 'tuesday') {
    return { serveDays: 'TUESDAY', allowedServiceKinds: ['TUESDAY'] };
  }
  return { serveDays: 'BOTH' };
}

function rosterNotes(row: (typeof ROSTER_ROWS)[number]): string | undefined {
  const bits: string[] = [];
  if (row.choir) bits.push(row.choir);
  if (row.availability === 'pregnant') bits.push('Pregnant');
  if (row.availability === 'on_leave') bits.push('On leave');
  return bits.length ? bits.join(' · ') : undefined;
}

function buildRoster(): ProtocolRosterMember[] {
  return ROSTER_ROWS.map((row, index) => {
    const personId = personIdForRow(row);
    const office: ProtocolOffice =
      row.role === 'Coordinator' ? 'COORDINATOR' : 'MEMBER';
    const { serveDays, allowedServiceKinds } = serveCapability(row);
    const rosterId =
      row.role === 'Coordinator'
        ? 'prm-coord'
        : `prm-${String(index + 1).padStart(3, '0')}`;
    return {
      id: rosterId,
      personId,
      office,
      serveDays,
      ...(allowedServiceKinds ? { allowedServiceKinds } : {}),
      status: rosterStatus(row.availability),
      unavailableDates: [],
      notes: rosterNotes(row),
    };
  });
}

function buildPeople(): Person[] {
  return ROSTER_ROWS.map((row) => {
    const { fullName, preferredName } = parseDisplayName(row.name);
    return {
      id: personIdForRow(row),
      fullName,
      preferredName,
      email: row.email,
      status: 'ACTIVE',
      createdAt: '2024-01-01',
    };
  });
}

function buildMemberships(): Membership[] {
  const out: Membership[] = [];
  for (const row of ROSTER_ROWS) {
    const personId = personIdForRow(row);
    out.push(
      {
        id: `mem-${personId}-church`,
        personId,
        type: 'CHURCH_MEMBER',
        label: 'Church member',
        status: 'ACTIVE',
        startDate: '2024-01-01',
      },
      {
        id: `mem-${personId}-protocol`,
        personId,
        type: 'PROTOCOL_MEMBER',
        label: 'Protocol member',
        orgUnitId: 'ou-protocol',
        systemId: 'sys-protocol',
        status: 'ACTIVE',
        startDate: '2024-01-01',
      },
    );
    const choirOrg = row.choir ? CHOIR_ORG_UNIT[row.choir] : undefined;
    if (choirOrg) {
      out.push({
        id: `mem-${personId}-choir`,
        personId,
        type: 'CHOIR_MEMBER',
        label: 'Choir member',
        orgUnitId: choirOrg,
        systemId: 'sys-choir',
        status: 'ACTIVE',
        startDate: '2024-01-01',
      });
    }
  }
  return out;
}

export const PROTOCOL_ROSTER: ProtocolRosterMember[] = buildRoster();
export const PROTOCOL_ROSTER_PEOPLE: Person[] = buildPeople();
export const PROTOCOL_ROSTER_MEMBERSHIPS: Membership[] = buildMemberships();
