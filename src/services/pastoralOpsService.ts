import {
  CALENDAR_CONFLICTS,
  DISCIPLINE_CASES,
  PERSON_PATHWAYS,
  PULPIT_SLOTS,
  TRANSFER_LETTERS_OUT,
  pushCalendarConflict,
  pushDiscipline,
  pushPathway,
  pushPulpit,
  pushTransferLetter,
  updateCalendarConflict,
  updateDiscipline,
  updatePathway,
  updatePulpit,
  updateTransferLetter,
} from '../data/pastoralOpsSeed';
import { POSITIONS } from '../data/seed';
import { isChurchLeader, isCatechist, isOrdainedPastor } from '../domain/churchLeadership';
import type {
  CalendarConflictCase,
  DisciplineCase,
  PersonPathway,
  PersonPathwayKind,
  PersonPathwayStatus,
  PulpitServiceKind,
  PulpitSlot,
  SystemRole,
  TransferLetterOut,
} from '../domain/types';
import { MUSIC_SERVICE_LABELS } from '../domain/musicSchedule';
import { rolesFromPositions } from '../domain/participation';
import { correspondenceService } from './correspondenceService';

/** Sanctuary services used for pulpit planning (same set as Protocol / Music). */
export const PULPIT_SERVICE_KINDS: readonly PulpitServiceKind[] = [
  'SS1',
  'SS2',
  'TUESDAY',
  'IGABURO',
];

export const PULPIT_SERVICE_LABELS: Record<PulpitServiceKind, string> = {
  SS1: MUSIC_SERVICE_LABELS.SS1,
  SS2: MUSIC_SERVICE_LABELS.SS2,
  TUESDAY: MUSIC_SERVICE_LABELS.TUESDAY,
  IGABURO: MUSIC_SERVICE_LABELS.IGABURO,
};

function nid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

function rolesFor(personId: string): SystemRole[] {
  return rolesFromPositions(
    POSITIONS.filter((p) => p.personId === personId && p.status === 'ACTIVE'),
  );
}

export const PATHWAY_KIND_LABELS: Record<PersonPathwayKind, string> = {
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  BAPTISM_TRACK: 'Baptism track',
  DEDICATION: 'Dedication',
  RESTORATION: 'Restoration',
  OTHER: 'Other pathway',
};

export const pastoralOpsService = {
  PATHWAY_KIND_LABELS,

  listPathways(filter?: {
    kind?: PersonPathwayKind;
    status?: PersonPathwayStatus;
    personId?: string;
    openOnly?: boolean;
  }) {
    return PERSON_PATHWAYS.filter((p) => {
      if (filter?.kind && p.kind !== filter.kind) return false;
      if (filter?.status && p.status !== filter.status) return false;
      if (filter?.personId && p.personId !== filter.personId) return false;
      if (
        filter?.openOnly &&
        (p.status === 'COMPLETED' || p.status === 'WITHDRAWN')
      ) {
        return false;
      }
      return true;
    });
  },

  openPathway(input: {
    personId: string;
    kind: PersonPathwayKind;
    label: string;
    openedByPersonId?: string;
    notes?: string;
  }): PersonPathway {
    const p: PersonPathway = {
      id: nid('path'),
      personId: input.personId,
      kind: input.kind,
      status: 'OPEN',
      label: input.label,
      openedOn: new Date().toISOString().slice(0, 10),
      openedByPersonId: input.openedByPersonId,
      notes: input.notes,
    };
    pushPathway(p);
    return p;
  },

  /**
   * Church Leader must confirm every baptism-track name before the rite.
   */
  confirmBaptismName(
    pathwayId: string,
    actorPersonId: string,
  ): { ok: boolean; reason?: string } {
    if (!isChurchLeader(rolesFor(actorPersonId))) {
      return { ok: false, reason: 'Church Leader must confirm every baptism name' };
    }
    const p = PERSON_PATHWAYS.find((x) => x.id === pathwayId);
    if (!p) return { ok: false, reason: 'Pathway not found' };
    if (p.kind !== 'BAPTISM_TRACK') {
      return { ok: false, reason: 'Not a baptism track' };
    }
    updatePathway(pathwayId, {
      leaderConfirmedAt: new Date().toISOString(),
      leaderConfirmedByPersonId: actorPersonId,
      status: 'READY',
    });
    return { ok: true };
  },

  baptismNameConfirmed(personId: string): boolean {
    return PERSON_PATHWAYS.some(
      (p) =>
        p.personId === personId &&
        p.kind === 'BAPTISM_TRACK' &&
        !!p.leaderConfirmedByPersonId &&
        (p.status === 'READY' || p.status === 'COMPLETED'),
    );
  },

  listDiscipline(filter?: { status?: DisciplineCase['status']; personId?: string }) {
    return DISCIPLINE_CASES.filter((c) => {
      if (filter?.status && c.status !== filter.status) return false;
      if (filter?.personId && c.personId !== filter.personId) return false;
      return true;
    });
  },

  startDiscipline(input: {
    personId: string;
    title: string;
    summary: string;
    openedByPersonId: string;
    privateNotes?: string;
  }): { ok: boolean; reason?: string; case?: DisciplineCase } {
    const roles = rolesFor(input.openedByPersonId);
    if (
      !isChurchLeader(roles) &&
      !isOrdainedPastor(roles) &&
      !isCatechist(roles)
    ) {
      return {
        ok: false,
        reason: 'Only pastors or catechist may start discipline',
      };
    }
    const c: DisciplineCase = {
      id: nid('disc'),
      personId: input.personId,
      title: input.title,
      status: 'OPEN',
      openedOn: new Date().toISOString().slice(0, 10),
      openedByPersonId: input.openedByPersonId,
      summary: input.summary,
      privateNotes: input.privateNotes,
    };
    pushDiscipline(c);
    return { ok: true, case: c };
  },

  submitDisciplineForLeader(id: string): { ok: boolean; reason?: string } {
    const c = DISCIPLINE_CASES.find((x) => x.id === id);
    if (!c) return { ok: false, reason: 'Not found' };
    updateDiscipline(id, { status: 'AWAITING_LEADER' });
    return { ok: true };
  },

  resolveDiscipline(
    id: string,
    actorPersonId: string,
    outcome: {
      finalStanding: NonNullable<DisciplineCase['finalStanding']>;
      mayServe?: boolean;
      mayTakeCommunion?: boolean;
    },
  ): { ok: boolean; reason?: string } {
    if (!isChurchLeader(rolesFor(actorPersonId))) {
      return { ok: false, reason: 'Final standing needs Church Leader' };
    }
    updateDiscipline(id, {
      status: outcome.finalStanding === 'RESTORED' ? 'RESTORED' : 'RESOLVED',
      finalStanding: outcome.finalStanding,
      mayServe: outcome.mayServe,
      mayTakeCommunion: outcome.mayTakeCommunion,
      resolvedAt: new Date().toISOString(),
      resolvedByPersonId: actorPersonId,
    });
    return { ok: true };
  },

  listTransferLettersOut(filter?: { status?: TransferLetterOut['status'] }) {
    return TRANSFER_LETTERS_OUT.filter((l) =>
      filter?.status ? l.status === filter.status : true,
    );
  },

  draftTransferOut(input: {
    personId: string;
    destinationChurch: string;
    draftedByPersonId: string;
    note?: string;
  }): TransferLetterOut {
    const opened = correspondenceService.openLetter({
      letterType: 'TRANSFER_OUT',
      personId: input.personId,
      actorPersonId: input.draftedByPersonId,
      origin: 'CHURCH_GENERATED',
      purpose: input.note,
      destinationChurch: input.destinationChurch,
      note: input.note,
      useTemplate: true,
    });
    if (opened.ok && opened.document.transferLetterId) {
      const linked = TRANSFER_LETTERS_OUT.find(
        (x) => x.id === opened.document.transferLetterId,
      );
      if (linked) {
        correspondenceService.submitForSignature(opened.document.id);
        return (
          TRANSFER_LETTERS_OUT.find(
            (x) => x.id === opened.document.transferLetterId,
          ) ?? linked
        );
      }
    }
    // Fallback if correspondence open failed
    const l: TransferLetterOut = {
      id: nid('tlo'),
      personId: input.personId,
      destinationChurch: input.destinationChurch,
      status: 'AWAITING_LEADER',
      draftedByPersonId: input.draftedByPersonId,
      draftedOn: new Date().toISOString().slice(0, 10),
      note: input.note,
    };
    pushTransferLetter(l);
    return l;
  },

  signTransferOut(
    id: string,
    actorPersonId: string,
  ): { ok: boolean; reason?: string } {
    if (!isChurchLeader(rolesFor(actorPersonId))) {
      return { ok: false, reason: 'Transfer letter OUT — Church Leader only signs' };
    }
    const l = TRANSFER_LETTERS_OUT.find((x) => x.id === id);
    if (!l) return { ok: false, reason: 'Letter not found' };
    if (l.documentId) {
      const r = correspondenceService.sign(l.documentId, actorPersonId);
      return { ok: r.ok, reason: r.reason };
    }
    updateTransferLetter(id, {
      status: 'SIGNED',
      signedByPersonId: actorPersonId,
      signedOn: new Date().toISOString().slice(0, 10),
    });
    return { ok: true };
  },

  listPulpit(filter?: { status?: PulpitSlot['status'] }) {
    return [...PULPIT_SLOTS]
      .filter((s) => (filter?.status ? s.status === filter.status : true))
      .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
  },

  preparePulpit(input: {
    serviceDate: string;
    /** One or more sanctuary services (e.g. SS1 + SS2 same preacher). */
    serviceKinds: PulpitServiceKind[];
    preacherPersonId?: string;
    preparedByPersonId: string;
    isGuest?: boolean;
    guestName?: string;
    guestFrom?: string;
    guestPhone?: string;
    notes?: string;
  }):
    | { ok: true; slots: PulpitSlot[] }
    | { ok: false; reason: string } {
    const kinds = [...new Set(input.serviceKinds)].filter((k) =>
      (PULPIT_SERVICE_KINDS as readonly string[]).includes(k),
    );
    if (kinds.length === 0) {
      return {
        ok: false,
        reason: 'Select at least one service (SS1, SS2, Tuesday, or Igaburo)',
      };
    }
    const isGuest = Boolean(input.isGuest);
    if (isGuest) {
      if (!input.guestName?.trim()) {
        return {
          ok: false,
          reason: 'Guest name is required for an outside preacher',
        };
      }
      if (!input.guestPhone?.trim()) {
        return {
          ok: false,
          reason: 'Guest phone is required so the guest can be contacted',
        };
      }
    } else if (!input.preacherPersonId) {
      return {
        ok: false,
        reason: 'Select a church preacher, or switch to Outside guest',
      };
    }

    const slots: PulpitSlot[] = [];
    for (const kind of kinds) {
      const s: PulpitSlot = {
        id: nid('pulpit'),
        serviceDate: input.serviceDate,
        serviceKind: kind,
        serviceLabel: PULPIT_SERVICE_LABELS[kind],
        preacherPersonId: isGuest ? undefined : input.preacherPersonId,
        preparedByPersonId: input.preparedByPersonId,
        isGuest,
        guestName: isGuest ? input.guestName!.trim() : undefined,
        guestFrom: isGuest ? input.guestFrom?.trim() || undefined : undefined,
        guestPhone: isGuest ? input.guestPhone!.trim() : undefined,
        notes: input.notes,
        status: 'CATECHIST_REVIEW',
      };
      pushPulpit(s);
      slots.push(s);
    }
    return { ok: true, slots };
  },

  catechistReviewPulpit(
    id: string,
    actorPersonId: string,
  ): { ok: boolean; reason?: string } {
    if (!isCatechist(rolesFor(actorPersonId)) && !isChurchLeader(rolesFor(actorPersonId))) {
      return { ok: false, reason: 'Catechist reviews the pulpit plan' };
    }
    updatePulpit(id, {
      status: 'AWAITING_LEADER',
      catechistReviewedByPersonId: actorPersonId,
      catechistReviewedAt: new Date().toISOString(),
    });
    return { ok: true };
  },

  approvePulpit(
    id: string,
    actorPersonId: string,
  ): { ok: boolean; reason?: string } {
    if (!isChurchLeader(rolesFor(actorPersonId))) {
      return { ok: false, reason: 'Church Leader must approve the pulpit' };
    }
    updatePulpit(id, {
      status: 'APPROVED',
      approvedByPersonId: actorPersonId,
      approvedAt: new Date().toISOString(),
    });
    return { ok: true };
  },

  listCalendarConflicts(filter?: { status?: CalendarConflictCase['status'] }) {
    return CALENDAR_CONFLICTS.filter((c) =>
      filter?.status ? c.status === filter.status : true,
    );
  },

  openCalendarConflict(input: {
    title: string;
    date: string;
    eventIds?: string[];
    notes?: string;
  }): CalendarConflictCase {
    const c: CalendarConflictCase = {
      id: nid('calconf'),
      title: input.title,
      date: input.date,
      eventIds: input.eventIds ?? [],
      status: 'OPEN',
      notes: input.notes,
    };
    pushCalendarConflict(c);
    return c;
  },

  /** Ministries failed → catechist resolves. */
  resolveCalendarConflict(
    id: string,
    actorPersonId: string,
    notes?: string,
  ): { ok: boolean; reason?: string } {
    const roles = rolesFor(actorPersonId);
    if (!isCatechist(roles) && !isChurchLeader(roles)) {
      return { ok: false, reason: 'Catechist resolves calendar conflicts' };
    }
    updateCalendarConflict(id, {
      status: 'RESOLVED',
      resolvedByPersonId: actorPersonId,
      resolvedAt: new Date().toISOString(),
      notes: notes,
    });
    return { ok: true };
  },
};
