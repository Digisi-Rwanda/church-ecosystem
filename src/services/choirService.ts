import {
  CHOIR_REHEARSALS,
  CHOIR_ROSTER,
  CHOIR_SONGS,
  CHOIR_TEAM_MEMBERS,
  CHOIR_TEAMS,
} from '../data/choirSeed';
import type {
  ChoirOffice,
  ChoirRehearsal,
  ChoirSong,
} from '../domain/types';
import { peopleService } from './authService';
import { getActiveChoirOrgUnitId } from './choirScope';

function personName(personId: string): string {
  const p = peopleService.getById(personId);
  return p?.preferredName || p?.fullName || personId;
}

function activeChoir(): string | null {
  return getActiveChoirOrgUnitId();
}

function inActiveChoirRequired(row: { orgUnitId: string }): boolean {
  const ou = activeChoir();
  if (!ou) return false;
  return row.orgUnitId === ou;
}

export const choirService = {
  listSongs(filter?: { status?: ChoirSong['status'] }): ChoirSong[] {
    return CHOIR_SONGS.filter(
      (s) =>
        inActiveChoirRequired(s) &&
        (filter?.status ? s.status === filter.status : true),
    );
  },

  getSong(id: string): ChoirSong | null {
    const s = CHOIR_SONGS.find((x) => x.id === id);
    return s && inActiveChoirRequired(s) ? s : null;
  },

  listRehearsals(): ChoirRehearsal[] {
    return CHOIR_REHEARSALS.filter(inActiveChoirRequired).sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
  },

  upcomingRehearsals(now = new Date()): ChoirRehearsal[] {
    return this.listRehearsals().filter(
      (r) => new Date(r.startsAt) >= new Date(now.toDateString()),
    );
  },

  officeLabel(office: ChoirOffice, advisorRole?: string): string {
    if (office === 'ADVISOR') {
      return advisorRole ? `Advisor · ${advisorRole}` : 'Advisor';
    }
    const map: Record<Exclude<ChoirOffice, 'ADVISOR'>, string> = {
      PRESIDENT: 'President',
      VP: 'Vice President',
      SECRETARY: 'Secretary',
      TREASURER: 'Treasurer',
      COORDINATOR: 'Coordinator',
      MUSIC_DIRECTOR: 'Music Director',
      FAMILY_LEADER: 'Team Leader',
      MEMBER: 'Member',
    };
    return map[office];
  },

  displayOfficeFor(personId: string): string {
    const row = this.rosterFor(personId);
    if (!row) return '—';
    return this.officeLabel(row.office, row.advisorRole);
  },

  personLabel(personId: string): string {
    return personName(personId);
  },

  listRoster() {
    return CHOIR_ROSTER.filter(
      (m) => m.status === 'ACTIVE' && inActiveChoirRequired(m),
    ).map((m) => ({
      ...m,
      name: personName(m.personId),
      teamName: m.teamId
        ? (CHOIR_TEAMS.find((t) => t.id === m.teamId)?.name ?? m.teamId)
        : '—',
    }));
  },

  rosterFor(personId: string) {
    return CHOIR_ROSTER.find(
      (m) =>
        m.personId === personId &&
        m.status === 'ACTIVE' &&
        inActiveChoirRequired(m),
    );
  },

  officeFor(personId: string): ChoirOffice | null {
    return this.rosterFor(personId)?.office ?? null;
  },

  listTeams() {
    return CHOIR_TEAMS.filter(
      (t) => t.status === 'ACTIVE' && inActiveChoirRequired(t),
    ).map((t) => ({
      ...t,
      memberCount: CHOIR_TEAM_MEMBERS.filter(
        (m) => m.teamId === t.id && m.status === 'ACTIVE',
      ).length,
      leaderName: t.leaderPersonId
        ? personName(t.leaderPersonId)
        : undefined,
    }));
  },

  teamMembers(teamId: string) {
    const team = CHOIR_TEAMS.find((t) => t.id === teamId);
    if (!team || !inActiveChoirRequired(team)) return [];
    return CHOIR_TEAM_MEMBERS.filter(
      (m) => m.teamId === teamId && m.status === 'ACTIVE',
    ).map((m) => ({
      ...m,
      name: personName(m.personId),
    }));
  },

  teamIdForPerson(personId: string): string | undefined {
    const teamId =
      CHOIR_TEAM_MEMBERS.find(
        (m) => m.personId === personId && m.status === 'ACTIVE',
      )?.teamId ?? this.rosterFor(personId)?.teamId;
    if (!teamId) return undefined;
    const team = CHOIR_TEAMS.find((t) => t.id === teamId);
    return team && inActiveChoirRequired(team) ? teamId : undefined;
  },

  stats() {
    return {
      songsReady: this.listSongs({ status: 'READY' }).length,
      songsLearning: this.listSongs({ status: 'LEARNING' }).length,
      upcomingRehearsals: this.upcomingRehearsals().length,
      rosterCount: this.listRoster().length,
      teams: this.listTeams().length,
    };
  },
};
