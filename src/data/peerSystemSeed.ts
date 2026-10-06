import type {
  Membership,
  MissionLeaderOffice,
  Person,
  Position,
  Program,
  SystemId,
  UserAccount,
} from '../domain/types';

type PeerMinistryDef = {
  slug: string;
  systemId: SystemId;
  orgUnitId: string;
  membershipType: Membership['type'];
  memberLabel: string;
  shortName: string;
  /** Existing president person (kept as board president). */
  president: {
    id: string;
    fullName: string;
    preferredName: string;
    email: string;
    gender?: 'MALE' | 'FEMALE';
    username: string;
    password: string;
    title: string;
  };
};

const BOARD_OFFICES: Array<{
  key: string;
  office: MissionLeaderOffice;
  title: (short: string) => string;
  username: (slug: string) => string;
  password: string;
}> = [
  {
    key: 'pres',
    office: 'PRESIDENT',
    title: (s) => `${s} President`,
    username: (slug) => slug,
    password: '', // set per ministry
  },
  {
    key: 'vp',
    office: 'VP',
    title: (s) => `${s} Vice President`,
    username: (slug) => `${slug}vp`,
    password: 'board123',
  },
  {
    key: 'treas',
    office: 'TREASURER',
    title: (s) => `${s} Treasurer`,
    username: (slug) => `${slug}treas`,
    password: 'board123',
  },
  {
    key: 'sec',
    office: 'SECRETARY',
    title: (s) => `${s} Secretary`,
    username: (slug) => `${slug}sec`,
    password: 'board123',
  },
];

/** Nine peer-core ministries — each gets Pres / VP / Treas / Sec. */
const PEER_MINISTRIES: PeerMinistryDef[] = [
  {
    slug: 'music',
    systemId: 'sys-music',
    orgUnitId: 'ou-music',
    membershipType: 'MUSIC_MEMBER',
    memberLabel: 'Music member',
    shortName: 'Music',
    president: {
      id: 'p-music-leader',
      fullName: 'Samuel Habimana',
      preferredName: 'Samuel',
      email: 'music@adepr-kacyiru.rw',
      gender: 'MALE',
      username: 'music',
      password: 'music123',
      title: 'Music Ministry President',
    },
  },
  {
    slug: 'media',
    systemId: 'sys-media',
    orgUnitId: 'ou-media',
    membershipType: 'MEDIA_MEMBER',
    memberLabel: 'Media member',
    shortName: 'Media',
    president: {
      id: 'p-media-leader',
      fullName: 'Kevin Niyonzima',
      preferredName: 'Kevin',
      email: 'media@adepr-kacyiru.rw',
      gender: 'MALE',
      username: 'media',
      password: 'media123',
      title: 'Media Team President',
    },
  },
  {
    slug: 'men',
    systemId: 'sys-men',
    orgUnitId: 'ou-men',
    membershipType: 'MEN_MEMBER',
    memberLabel: 'Men member',
    shortName: 'Men',
    president: {
      id: 'p-men-leader',
      fullName: 'Joseph Mugisha',
      preferredName: 'Joseph',
      email: 'men@adepr-kacyiru.rw',
      gender: 'MALE',
      username: 'men',
      password: 'men123',
      title: 'Men Ministry President',
    },
  },
  {
    slug: 'women',
    systemId: 'sys-women',
    orgUnitId: 'ou-women',
    membershipType: 'WOMEN_MEMBER',
    memberLabel: 'Women member',
    shortName: 'Women',
    president: {
      id: 'p-women-leader',
      fullName: 'Diane Uwimana',
      preferredName: 'Diane',
      email: 'women@adepr-kacyiru.rw',
      gender: 'FEMALE',
      username: 'women',
      password: 'women123',
      title: 'Women Ministry President',
    },
  },
  {
    slug: 'couples',
    systemId: 'sys-couples',
    orgUnitId: 'ou-couples',
    membershipType: 'COUPLES_MEMBER',
    memberLabel: 'Couples member',
    shortName: 'Couples',
    president: {
      id: 'p-couples-leader',
      fullName: 'Paul & Ruth Kayitesi',
      preferredName: 'Paul & Ruth',
      email: 'couples@adepr-kacyiru.rw',
      username: 'couples',
      password: 'couples123',
      title: 'Couples Ministry President',
    },
  },
  {
    slug: 'children',
    systemId: 'sys-children',
    orgUnitId: 'ou-children',
    membershipType: 'CHILDREN_MEMBER',
    memberLabel: 'Children ministry member',
    shortName: 'Children',
    president: {
      id: 'p-children-leader',
      fullName: 'Jeanne Mukamana',
      preferredName: 'Jeanne',
      email: 'children@adepr-kacyiru.rw',
      gender: 'FEMALE',
      username: 'children',
      password: 'children123',
      title: 'Children Ministry President',
    },
  },
  {
    slug: 'elderly',
    systemId: 'sys-elderly',
    orgUnitId: 'ou-elderly',
    membershipType: 'ELDERLY_MEMBER',
    memberLabel: 'Elderly member',
    shortName: 'Elderly',
    president: {
      id: 'p-elderly-leader',
      fullName: 'Emmanuel Nsengiyumva',
      preferredName: 'Emmanuel',
      email: 'elderly@adepr-kacyiru.rw',
      gender: 'MALE',
      username: 'elderly',
      password: 'elderly123',
      title: 'Elderly Ministry President',
    },
  },
  {
    slug: 'evangelism',
    systemId: 'sys-evangelism',
    orgUnitId: 'ou-evangelism',
    membershipType: 'EVANGELISM_MEMBER',
    memberLabel: 'Evangelism member',
    shortName: 'Evangelism',
    president: {
      id: 'p-evangelism-leader',
      fullName: 'Patrick Habineza',
      preferredName: 'Patrick H.',
      email: 'evangelism@adepr-kacyiru.rw',
      gender: 'MALE',
      username: 'evangelism',
      password: 'evangel123',
      title: 'Evangelism Ministry President',
    },
  },
  {
    slug: 'intercessors',
    systemId: 'sys-intercessors',
    orgUnitId: 'ou-intercessors',
    membershipType: 'INTERCESSORS_MEMBER',
    memberLabel: 'Intercessors member',
    shortName: 'Intercessors',
    president: {
      id: 'p-intercessors-leader',
      fullName: 'Chantal Uwase',
      preferredName: 'Chantal',
      email: 'prayer@adepr-kacyiru.rw',
      gender: 'FEMALE',
      username: 'intercessors',
      password: 'pray123',
      title: 'Intercessors Ministry President',
    },
  },
];

const VP_NAMES: Record<string, { fullName: string; preferredName: string; gender: 'MALE' | 'FEMALE' }> = {
  music: { fullName: 'Grace Mukamana', preferredName: 'Grace M.', gender: 'FEMALE' },
  media: { fullName: 'Eric Twagirumukiza', preferredName: 'Eric T.', gender: 'MALE' },
  men: { fullName: 'Alain Habimana', preferredName: 'Alain', gender: 'MALE' },
  women: { fullName: 'Immaculée Uwase', preferredName: 'Immaculée', gender: 'FEMALE' },
  couples: { fullName: 'Jean & Anne Bizimana', preferredName: 'Jean & Anne', gender: 'MALE' },
  children: { fullName: 'Claudine Ingabire', preferredName: 'Claudine', gender: 'FEMALE' },
  elderly: { fullName: 'Pierre Ndayisaba', preferredName: 'Pierre', gender: 'MALE' },
  evangelism: { fullName: 'Divine Uwera', preferredName: 'Divine', gender: 'FEMALE' },
  intercessors: { fullName: 'Pastorate Esther Mukeshimana', preferredName: 'Esther', gender: 'FEMALE' },
};

const TREAS_NAMES: Record<string, { fullName: string; preferredName: string; gender: 'MALE' | 'FEMALE' }> = {
  music: { fullName: 'David Nkurunziza', preferredName: 'David N.', gender: 'MALE' },
  media: { fullName: 'Solange Uwimana', preferredName: 'Solange', gender: 'FEMALE' },
  men: { fullName: 'Bernard Habineza', preferredName: 'Bernard', gender: 'MALE' },
  women: { fullName: 'Alice Mukamana', preferredName: 'Alice M.', gender: 'FEMALE' },
  couples: { fullName: 'Roger Mugisha', preferredName: 'Roger', gender: 'MALE' },
  children: { fullName: 'Patricia Uwase', preferredName: 'Patricia', gender: 'FEMALE' },
  elderly: { fullName: 'François Habimana', preferredName: 'François', gender: 'MALE' },
  evangelism: { fullName: 'Yves Niyonzima', preferredName: 'Yves', gender: 'MALE' },
  intercessors: { fullName: 'Naomi Ingabire', preferredName: 'Naomi', gender: 'FEMALE' },
};

const SEC_NAMES: Record<string, { fullName: string; preferredName: string; gender: 'MALE' | 'FEMALE' }> = {
  music: { fullName: 'Linda Uwera', preferredName: 'Linda', gender: 'FEMALE' },
  media: { fullName: 'Chris Habimana', preferredName: 'Chris H.', gender: 'MALE' },
  men: { fullName: 'Olivier Nsengimana', preferredName: 'Olivier', gender: 'MALE' },
  women: { fullName: 'Beatrice Mukeshimana', preferredName: 'Beatrice', gender: 'FEMALE' },
  couples: { fullName: 'Helen Kayitesi', preferredName: 'Helen', gender: 'FEMALE' },
  children: { fullName: 'Sandrine Uwimana', preferredName: 'Sandrine', gender: 'FEMALE' },
  elderly: { fullName: 'Marie Claire Uwase', preferredName: 'Marie Claire', gender: 'FEMALE' },
  evangelism: { fullName: 'Thierry Mugisha', preferredName: 'Thierry', gender: 'MALE' },
  intercessors: { fullName: 'Josiane Habimana', preferredName: 'Josiane', gender: 'FEMALE' },
};

function personIdFor(slug: string, key: string): string {
  if (key === 'pres') {
    return PEER_MINISTRIES.find((m) => m.slug === slug)!.president.id;
  }
  return `p-${slug}-${key}`;
}

function buildBoardPerson(
  m: PeerMinistryDef,
  key: string,
): Person {
  if (key === 'pres') {
    const p = m.president;
    return {
      id: p.id,
      fullName: p.fullName,
      preferredName: p.preferredName,
      email: p.email,
      gender: p.gender,
      joinedChurchOn: '2019-01-01',
      status: 'ACTIVE',
      createdAt: '2025-01-10',
    };
  }
  const names =
    key === 'vp' ? VP_NAMES[m.slug] : key === 'treas' ? TREAS_NAMES[m.slug] : SEC_NAMES[m.slug];
  return {
    id: personIdFor(m.slug, key),
    fullName: names.fullName,
    preferredName: names.preferredName,
    email: `${m.slug}.${key}@adepr-kacyiru.rw`,
    gender: names.gender,
    joinedChurchOn: '2021-01-01',
    status: 'ACTIVE',
    createdAt: '2025-06-01',
  };
}

export const PEER_PEOPLE: Person[] = PEER_MINISTRIES.flatMap((m) =>
  BOARD_OFFICES.map((o) => buildBoardPerson(m, o.key)),
);

export const PEER_ACCOUNTS: UserAccount[] = PEER_MINISTRIES.flatMap((m) =>
  BOARD_OFFICES.map((o) => {
    const personId = personIdFor(m.slug, o.key);
    const username =
      o.key === 'pres' ? m.president.username : o.username(m.slug);
    const password =
      o.key === 'pres' ? m.president.password : o.password;
    return {
      id: `acc-${m.slug}-${o.key}`,
      personId,
      username,
      password,
    };
  }),
);

export const PEER_MEMBERSHIPS: Membership[] = PEER_MINISTRIES.flatMap((m) =>
  BOARD_OFFICES.flatMap((o) => {
    const personId = personIdFor(m.slug, o.key);
    return [
      {
        id: `mem-${m.slug}-${o.key}-church`,
        personId,
        type: 'CHURCH_MEMBER' as const,
        label: 'Church member',
        status: 'ACTIVE' as const,
        startDate: '2020-01-01',
      },
      {
        id: `mem-${m.slug}-${o.key}-peer`,
        personId,
        type: m.membershipType,
        label: m.memberLabel,
        orgUnitId: m.orgUnitId,
        systemId: m.systemId,
        status: 'ACTIVE' as const,
        startDate: '2023-01-01',
      },
    ];
  }),
);

export const PEER_POSITIONS: Position[] = PEER_MINISTRIES.flatMap((m) =>
  BOARD_OFFICES.map((o) => {
    const personId = personIdFor(m.slug, o.key);
    const title =
      o.key === 'pres' ? m.president.title : o.title(m.shortName);
    return {
      id: `pos-${m.slug}-${o.key}`,
      personId,
      title,
      orgUnitId: m.orgUnitId,
      ministryOffice: o.office,
      systemId: m.systemId,
      status: 'ACTIVE' as const,
      startDate: '2023-01-01',
    };
  }),
);

export const PEER_PROGRAMS: Program[] = [];

export const PEER_ORG_LEADERS: Record<string, string> = {
  'ou-music': 'p-music-leader',
  'ou-media': 'p-media-leader',
  'ou-men': 'p-men-leader',
  'ou-women': 'p-women-leader',
  'ou-couples': 'p-couples-leader',
  'ou-children': 'p-children-leader',
  'ou-elderly': 'p-elderly-leader',
  'ou-evangelism': 'p-evangelism-leader',
  'ou-intercessors': 'p-intercessors-leader',
};
