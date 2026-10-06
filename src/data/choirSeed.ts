import type {
  ChoirRehearsal,
  ChoirRosterMember,
  ChoirSong,
  ChoirTeam,
  ChoirTeamMember,
} from '../domain/types';

const IJWI = 'ou-choir-ijwi';
const HOPE = 'ou-choir-hope';

export const CHOIR_SONGS: ChoirSong[] = [
  {
    id: 'song-amazing',
    orgUnitId: IJWI,
    title: 'Amazing Grace',
    composer: 'Traditional',
    language: 'English',
    status: 'READY',
  },
  {
    id: 'song-ni-mwari',
    orgUnitId: IJWI,
    title: 'Ni Mwari',
    language: 'Kinyarwanda',
    status: 'READY',
    notes: 'Concert opener',
  },
  {
    id: 'song-hallelujah',
    orgUnitId: IJWI,
    title: 'Hallelujah Chorus (excerpt)',
    composer: 'Handel',
    language: 'English',
    status: 'LEARNING',
  },
  {
    id: 'song-yesu',
    orgUnitId: IJWI,
    title: 'Yesu Ni Umwami',
    language: 'Kinyarwanda',
    status: 'LEARNING',
  },
  {
    id: 'song-old',
    orgUnitId: IJWI,
    title: 'Old concert piece',
    status: 'ARCHIVED',
  },
  {
    id: 'song-hope-1',
    orgUnitId: HOPE,
    title: 'Hope in Christ',
    language: 'Kinyarwanda',
    status: 'READY',
  },
  {
    id: 'song-hope-2',
    orgUnitId: HOPE,
    title: 'Nzahimbaza',
    language: 'Kinyarwanda',
    status: 'LEARNING',
  },
];

export const CHOIR_REHEARSALS: ChoirRehearsal[] = [
  {
    id: 'reh-2026-09-13',
    orgUnitId: IJWI,
    title: 'Weekly rehearsal',
    startsAt: '2026-09-13T15:00:00',
    endsAt: '2026-09-13T17:00:00',
    location: 'Choir loft',
    songIds: ['song-ni-mwari', 'song-hallelujah'],
    notes: 'Focus on blend in altos',
  },
  {
    id: 'reh-2026-09-20',
    orgUnitId: IJWI,
    title: 'Weekly rehearsal',
    startsAt: '2026-09-20T15:00:00',
    endsAt: '2026-09-20T17:00:00',
    location: 'Choir loft',
    songIds: ['song-amazing', 'song-yesu'],
  },
  {
    id: 'reh-2026-11-15',
    orgUnitId: IJWI,
    title: 'Concert dress rehearsal',
    startsAt: '2026-11-15T14:00:00',
    endsAt: '2026-11-15T17:00:00',
    location: 'Main sanctuary',
    songIds: ['song-ni-mwari', 'song-amazing', 'song-hallelujah', 'song-yesu'],
  },
  {
    id: 'reh-hope-2026-09-14',
    orgUnitId: HOPE,
    title: 'Hope weekly rehearsal',
    startsAt: '2026-09-14T16:00:00',
    endsAt: '2026-09-14T18:00:00',
    location: 'Hope hall',
    songIds: ['song-hope-1'],
  },
];

/** Choir teams (renamed from "families"): a leader and a vice leader each. */
export const CHOIR_TEAMS: ChoirTeam[] = [
  {
    id: 'cteam-alpha',
    orgUnitId: IJWI,
    name: 'Family Alpha',
    code: 'ALPHA',
    leaderPersonId: 'p-member',
    viceLeaderPersonId: 'p-secretary',
    status: 'ACTIVE',
  },
  {
    id: 'cteam-beta',
    orgUnitId: IJWI,
    name: 'Family Beta',
    code: 'BETA',
    leaderPersonId: 'p-choir-pres',
    status: 'ACTIVE',
  },
];

export const CHOIR_TEAM_MEMBERS: ChoirTeamMember[] = [
  {
    id: 'ctm-patrick-alpha',
    teamId: 'cteam-alpha',
    personId: 'p-member',
    status: 'ACTIVE',
  },
  {
    id: 'ctm-grace-alpha',
    teamId: 'cteam-alpha',
    personId: 'p-secretary',
    status: 'ACTIVE',
  },
  {
    id: 'ctm-eric-beta',
    teamId: 'cteam-beta',
    personId: 'p-choir-leader',
    status: 'ACTIVE',
  },
  {
    id: 'ctm-pres-beta',
    teamId: 'cteam-beta',
    personId: 'p-choir-pres',
    status: 'ACTIVE',
  },
  {
    id: 'ctm-treas-beta',
    teamId: 'cteam-beta',
    personId: 'p-choir-treas',
    status: 'ACTIVE',
  },
];

export const CHOIR_ROSTER: ChoirRosterMember[] = [
  {
    id: 'crm-eric',
    orgUnitId: IJWI,
    personId: 'p-choir-leader',
    office: 'MUSIC_DIRECTOR',
    teamId: 'cteam-beta',
    status: 'ACTIVE',
  },
  {
    id: 'crm-pres',
    orgUnitId: IJWI,
    personId: 'p-choir-pres',
    office: 'PRESIDENT',
    teamId: 'cteam-beta',
    status: 'ACTIVE',
  },
  {
    id: 'crm-vp',
    orgUnitId: IJWI,
    personId: 'p-choir-vp',
    office: 'VP',
    status: 'ACTIVE',
  },
  {
    id: 'crm-treas',
    orgUnitId: IJWI,
    personId: 'p-choir-treas',
    office: 'TREASURER',
    teamId: 'cteam-beta',
    status: 'ACTIVE',
  },
  {
    id: 'crm-secretary',
    orgUnitId: IJWI,
    personId: 'p-secretary',
    office: 'SECRETARY',
    teamId: 'cteam-alpha',
    status: 'ACTIVE',
  },
  {
    id: 'crm-coord',
    orgUnitId: IJWI,
    personId: 'p-choir-coord',
    office: 'COORDINATOR',
    status: 'ACTIVE',
  },
  {
    id: 'crm-adv-spirit',
    orgUnitId: IJWI,
    personId: 'p-choir-adv-spirit',
    office: 'ADVISOR',
    advisorRole: 'Spiritual leader',
    status: 'ACTIVE',
  },
  {
    id: 'crm-adv-social',
    orgUnitId: IJWI,
    personId: 'p-choir-adv-social',
    office: 'ADVISOR',
    advisorRole: 'Social & outreach',
    status: 'ACTIVE',
  },
  {
    id: 'crm-patrick',
    orgUnitId: IJWI,
    personId: 'p-member',
    office: 'FAMILY_LEADER',
    teamId: 'cteam-alpha',
    status: 'ACTIVE',
  },
  {
    id: 'crm-hope-leader',
    orgUnitId: HOPE,
    personId: 'p-hope-leader',
    office: 'MUSIC_DIRECTOR',
    status: 'ACTIVE',
  },
];
