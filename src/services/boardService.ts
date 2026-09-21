import { BOARD_MEETINGS } from '../data/boardSeed';
import { scheduleLocalDomainPersist } from '../data/localDomainStore';
import { isChurchLeader } from '../domain/churchLeadership';
import type {
  BoardAgendaItem,
  BoardDecision,
  BoardFollowUpUpdate,
  BoardFollowUpUpdateKind,
  BoardMeeting,
  BoardMeetingStatus,
  Position,
  SystemRole,
} from '../domain/types';
import { ITORERO_OVERSIGHT_ROLES } from '../domain/oversightAccess';

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

const BOARD_VIEW_ROLES: SystemRole[] = [
  ...ITORERO_OVERSIGHT_ROLES,
  'CHURCH_SECRETARY',
  'CHURCH_TREASURER',
  'DEACON_LEADER',
];

/** Who may see Board meetings (high leaders, secretary, treasurer, deacon leaders, ministry presidents). */
export function canViewBoard(
  personId: string,
  positions: Position[],
  roles: SystemRole[],
): boolean {
  if (roles.some((r) => BOARD_VIEW_ROLES.includes(r))) return true;
  return positions.some(
    (p) =>
      p.personId === personId &&
      p.status === 'ACTIVE' &&
      (p.ministryOffice === 'PRESIDENT' ||
        p.ministryOffice === 'VP' ||
        p.choirOffice === 'PRESIDENT' ||
        p.choirOffice === 'VP' ||
        p.worshipOffice === 'PRESIDENT' ||
        p.worshipOffice === 'VP' ||
        p.deaconOffice === 'COORDINATOR' ||
        p.protocolOffice === 'COORDINATOR'),
  );
}

/** Only Church Leader calls / schedules Board meetings. */
export function canCallBoardMeeting(roles: SystemRole[]): boolean {
  return roles.includes('CHURCH_LEADER');
}

function ensureAgendaItems(m: BoardMeeting): BoardAgendaItem[] {
  if (m.agendaItems && m.agendaItems.length > 0) return m.agendaItems;
  m.agendaItems = (m.agenda ?? []).map((text, i) => ({
    id: `${m.id}-legacy-${i}`,
    text,
    state: 'OPEN' as const,
  }));
  return m.agendaItems;
}

function findDecision(meetingId: string, decisionId: string) {
  const m = BOARD_MEETINGS.find((x) => x.id === meetingId);
  const d = m?.decisions.find((x) => x.id === decisionId);
  return { meeting: m ?? null, decision: d ?? null };
}

export const boardService = {
  list() {
    return [...BOARD_MEETINGS].sort((a, b) =>
      b.scheduledAt.localeCompare(a.scheduledAt),
    );
  },

  get(id: string) {
    return BOARD_MEETINGS.find((m) => m.id === id) ?? null;
  },

  openFollowUps() {
    return BOARD_MEETINGS.flatMap((m) =>
      m.decisions
        .filter((d) => d.status === 'OPEN')
        .map((d) => ({ meeting: m, decision: d })),
    );
  },

  /** Resolve a decision (open or done) by id across meetings. */
  getFollowUp(decisionId: string) {
    for (const meeting of BOARD_MEETINGS) {
      const decision = meeting.decisions.find((d) => d.id === decisionId);
      if (decision) return { meeting, decision };
    }
    return null;
  },

  agendaItems(meetingId: string): BoardAgendaItem[] {
    const m = BOARD_MEETINGS.find((x) => x.id === meetingId);
    if (!m) return [];
    return ensureAgendaItems(m);
  },

  schedule(input: {
    title: string;
    scheduledAt: string;
    calledByPersonId: string;
    agenda: string[];
    attendeePersonIds: string[];
  }): BoardMeeting {
    const lines = input.agenda.map((a) => a.trim()).filter(Boolean);
    const meeting: BoardMeeting = {
      id: newId('board'),
      title: input.title.trim(),
      scheduledAt: input.scheduledAt,
      calledByPersonId: input.calledByPersonId,
      status: 'SCHEDULED',
      agenda: lines,
      agendaItems: lines.map((text) => ({
        id: newId('bag'),
        text,
        state: 'OPEN',
      })),
      attendeePersonIds: input.attendeePersonIds,
      decisions: [],
    };
    BOARD_MEETINGS.unshift(meeting);
    scheduleLocalDomainPersist();
    return meeting;
  },

  raiseAgendaItem(input: {
    meetingId?: string;
    text: string;
    raisedByPersonId: string;
  }): {
    ok: boolean;
    reason?: string;
    item?: BoardAgendaItem;
    meetingId?: string;
  } {
    const meeting =
      (input.meetingId
        ? BOARD_MEETINGS.find((m) => m.id === input.meetingId)
        : null) ??
      BOARD_MEETINGS.find((m) => m.status === 'SCHEDULED') ??
      BOARD_MEETINGS[0];
    if (!meeting) return { ok: false, reason: 'No Board meeting to attach to' };
    const items = ensureAgendaItems(meeting);
    const item: BoardAgendaItem = {
      id: newId('bag'),
      text: input.text.trim(),
      state: 'OPEN',
      raisedByPersonId: input.raisedByPersonId,
    };
    items.push(item);
    meeting.agenda.push(item.text);
    return { ok: true, item, meetingId: meeting.id };
  },

  freezeAgendaItem(
    meetingId: string,
    itemId: string,
    actorPersonId: string,
    roles: SystemRole[],
    note?: string,
  ): { ok: boolean; reason?: string } {
    if (!isChurchLeader(roles)) {
      return { ok: false, reason: 'Only Church Leader can freeze for Board' };
    }
    const m = BOARD_MEETINGS.find((x) => x.id === meetingId);
    if (!m) return { ok: false, reason: 'Meeting not found' };
    const item = ensureAgendaItems(m).find((a) => a.id === itemId);
    if (!item) return { ok: false, reason: 'Agenda item not found' };
    if (item.state === 'DECIDED') {
      return { ok: false, reason: 'Already decided' };
    }
    item.state = 'FROZEN';
    item.notes =
      note?.trim() ||
      `Frozen for Board by Leader — wait for the meeting; do not act alone.`;
    void actorPersonId;
    return { ok: true };
  },

  decideAgendaItem(
    meetingId: string,
    itemId: string,
    actorPersonId: string,
    roles: SystemRole[],
    summary?: string,
  ): { ok: boolean; reason?: string; decisionId?: string } {
    if (!isChurchLeader(roles)) {
      return { ok: false, reason: 'Only Church Leader can decide alone' };
    }
    const m = BOARD_MEETINGS.find((x) => x.id === meetingId);
    if (!m) return { ok: false, reason: 'Meeting not found' };
    const item = ensureAgendaItems(m).find((a) => a.id === itemId);
    if (!item) return { ok: false, reason: 'Agenda item not found' };
    if (item.state === 'DECIDED') {
      return { ok: false, reason: 'Already decided' };
    }
    const decisionSummary =
      summary?.trim() || `Decided by Church Leader: ${item.text}`;
    const d = this.addDecision(meetingId, {
      summary: decisionSummary,
      ownerPersonId: actorPersonId,
      status: 'DONE',
      resultSummary: decisionSummary,
    });
    item.state = 'DECIDED';
    item.decidedAt = new Date().toISOString();
    item.decidedByPersonId = actorPersonId;
    item.decisionId = d?.id;
    item.notes = `Decided between meetings by Church Leader (Board not required for this item).`;
    return { ok: true, decisionId: d?.id };
  },

  markHeld(id: string, notes?: string): BoardMeeting | null {
    const m = BOARD_MEETINGS.find((x) => x.id === id);
    if (!m || m.status === 'CANCELLED') return null;
    m.status = 'HELD';
    m.heldAt = new Date().toISOString();
    if (notes != null) m.notes = notes;
    return m;
  },

  setStatus(id: string, status: BoardMeetingStatus): BoardMeeting | null {
    const m = BOARD_MEETINGS.find((x) => x.id === id);
    if (!m) return null;
    m.status = status;
    return m;
  },

  addDecision(
    meetingId: string,
    input: Omit<BoardDecision, 'id' | 'status'> & {
      status?: BoardDecision['status'];
    },
  ): BoardDecision | null {
    const m = BOARD_MEETINGS.find((x) => x.id === meetingId);
    if (!m) return null;
    const d: BoardDecision = {
      id: newId('bd'),
      summary: input.summary.trim(),
      ownerPersonId: input.ownerPersonId,
      dueDate: input.dueDate,
      followUpTaskId: input.followUpTaskId,
      progressUpdates: input.progressUpdates,
      resultSummary: input.resultSummary,
      status: input.status ?? 'OPEN',
    };
    m.decisions.push(d);
    return d;
  },

  /**
   * Owner (or Church Leader) posts progress / interim result / blocker on a follow-up.
   */
  addFollowUpUpdate(
    meetingId: string,
    decisionId: string,
    input: {
      byPersonId: string;
      note: string;
      kind?: BoardFollowUpUpdateKind;
    },
  ): { ok: boolean; reason?: string; update?: BoardFollowUpUpdate } {
    const { decision } = findDecision(meetingId, decisionId);
    if (!decision) return { ok: false, reason: 'Follow-up not found' };
    if (decision.status !== 'OPEN') {
      return { ok: false, reason: 'Follow-up already closed' };
    }
    const note = input.note.trim();
    if (!note) return { ok: false, reason: 'Add a progress note' };
    const update: BoardFollowUpUpdate = {
      id: newId('bdu'),
      at: new Date().toISOString(),
      byPersonId: input.byPersonId,
      note,
      kind: input.kind ?? 'PROGRESS',
    };
    decision.progressUpdates = [...(decision.progressUpdates ?? []), update];
    return { ok: true, update };
  },

  /**
   * Close a follow-up after reviewing progress. Requires progress notes or a result summary.
   */
  completeDecision(
    meetingId: string,
    decisionId: string,
    input?: {
      actorPersonId?: string;
      resultSummary?: string;
      forceWithoutProgress?: boolean;
    },
  ): { ok: boolean; reason?: string } {
    const { decision } = findDecision(meetingId, decisionId);
    if (!decision) return { ok: false, reason: 'Follow-up not found' };
    if (decision.status !== 'OPEN') {
      return { ok: false, reason: 'Already done' };
    }
    const result = input?.resultSummary?.trim();
    const hasProgress = (decision.progressUpdates?.length ?? 0) > 0;
    if (!hasProgress && !result && !input?.forceWithoutProgress) {
      return {
        ok: false,
        reason:
          'Review progress first — ask the owner for an update, or record the result when closing',
      };
    }
    if (result) {
      decision.resultSummary = result;
      decision.progressUpdates = [
        ...(decision.progressUpdates ?? []),
        {
          id: newId('bdu'),
          at: new Date().toISOString(),
          byPersonId: input?.actorPersonId ?? decision.ownerPersonId ?? 'system',
          note: result,
          kind: 'RESULT',
        },
      ];
    }
    decision.status = 'DONE';
    decision.completedAt = new Date().toISOString();
    decision.completedByPersonId = input?.actorPersonId;
    return { ok: true };
  },
};
