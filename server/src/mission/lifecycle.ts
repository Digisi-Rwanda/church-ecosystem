import { prisma } from '../lib/prisma.js';
import {
  confirmedFundingTotal,
  deliveryReadyToClose,
  mergeStewardship,
  openAdvances,
  parseStewardship,
  requiredDeliveryOpen,
  serializeStewardship,
  type StewardshipBlob,
} from './stewardshipJson.js';
import {
  approvalsSatisfied,
  buildScopeApprovalChain,
  parseApprovals,
  personCanApproveLevel,
  serializeApprovals,
  type ApprovalRecord,
} from './scopeApprovals.js';

export async function personIsChurchLeadership(
  personId: string,
): Promise<boolean> {
  const now = new Date();
  const n = await prisma.position.count({
    where: {
      personId,
      status: 'ACTIVE',
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      systemRole: { in: ['CHURCH_LEADER', 'PASTOR', 'ASSISTANT_PASTOR', 'CATECHIST'] },
    },
  });
  return n > 0;
}

export type TransitionResult<T> =
  | { ok: true; entity: T; warning?: string }
  | { ok: false; status: number; error: string };

function stewardshipOf(row: {
  stewardshipJson: string | null;
}): StewardshipBlob {
  return parseStewardship(row.stewardshipJson);
}

export async function submitProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (program.status !== 'DRAFT' && program.status !== 'PAUSED') {
    return {
      ok: false as const,
      status: 400,
      error: 'Only DRAFT (or PAUSED) can be submitted',
    };
  }
  const entity = await prisma.program.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL' },
  });
  return { ok: true as const, entity };
}

export async function approveProgram(id: string, approverPersonId: string) {
  if (!(await personIsChurchLeadership(approverPersonId))) {
    return {
      ok: false as const,
      status: 403,
      error: 'Church Leader (or Assistant Pastor) must approve',
    };
  }
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (program.status !== 'PENDING_APPROVAL' && program.status !== 'DRAFT') {
    return { ok: false as const, status: 400, error: 'Not awaiting approval' };
  }
  const entity = await prisma.program.update({
    where: { id },
    data: {
      status: 'SETUP',
      approvedByPersonId: approverPersonId,
      approvedAt: new Date(),
    },
  });
  return { ok: true as const, entity };
}

export async function startProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (program.status !== 'SETUP') {
    return {
      ok: false as const,
      status: 400,
      error: 'Only SETUP programs can start running',
    };
  }
  const s = stewardshipOf(program);
  const entity = await prisma.program.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });
  const gap = (Number(s.plannedCost) || 0) - confirmedFundingTotal(s);
  const openReq = requiredDeliveryOpen(s).length;
  return {
    ok: true as const,
    entity,
    gap: gap > 0 ? gap : undefined,
    openRequired: openReq > 0 ? openReq : undefined,
  };
}

export async function pauseProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (program.status !== 'ACTIVE' && program.status !== 'PAUSED') {
    return {
      ok: false as const,
      status: 400,
      error: 'Only ACTIVE programs can pause',
    };
  }
  const entity = await prisma.program.update({
    where: { id },
    data: { status: 'PAUSED' },
  });
  return { ok: true as const, entity };
}

export async function beginCloseProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (
    program.status !== 'ACTIVE' &&
    program.status !== 'PAUSED' &&
    program.status !== 'CLOSING'
  ) {
    return {
      ok: false as const,
      status: 400,
      error: 'Only ACTIVE/PAUSED programs can enter CLOSING',
    };
  }
  if (program.status === 'CLOSING') return { ok: true as const, entity: program };
  const entity = await prisma.program.update({
    where: { id },
    data: { status: 'CLOSING' },
  });
  return { ok: true as const, entity };
}

export async function abandonCloseProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (program.status !== 'CLOSING') {
    return { ok: false as const, status: 400, error: 'Not in CLOSING' };
  }
  const entity = await prisma.program.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });
  return { ok: true as const, entity };
}

export async function endProgram(
  id: string,
  opts: {
    closedByPersonId: string;
    workSummary: string;
    moneySummary: string;
    leftoverDecision: string;
    leftoverNote?: string;
    narrative?: string;
    forceClose?: boolean;
    /** Required when forceClose skips open advances / delivery / tasks. */
    forceReason?: string;
    usedCost?: number;
  },
) {
  let program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (program.status === 'ENDED') {
    return { ok: false as const, status: 400, error: 'Already ended' };
  }
  if (program.status === 'ACTIVE' || program.status === 'PAUSED') {
    const entered = await beginCloseProgram(id);
    if (!entered.ok) return entered;
    program = entered.entity!;
  }
  if (!program || program.status !== 'CLOSING') {
    return {
      ok: false as const,
      status: 400,
      error: 'Begin close-out first (status must be CLOSING)',
    };
  }
  const s = stewardshipOf(program);
  const openAdv = openAdvances(s);
  const needsForce =
    !deliveryReadyToClose(s) || openAdv.length > 0;
  if (needsForce && !opts.forceClose) {
    if (!deliveryReadyToClose(s)) {
      const open = requiredDeliveryOpen(s);
      return {
        ok: false as const,
        status: 400,
        error: `${open.length} required delivery item(s) still open — finish, waive, or force`,
      };
    }
    return {
      ok: false as const,
      status: 400,
      error: `${openAdv.length} open advance(s) must be retired — or force close`,
    };
  }
  if (opts.forceClose && needsForce) {
    const reason = (opts.forceReason ?? '').trim();
    if (reason.length < 8) {
      return {
        ok: false as const,
        status: 400,
        error: 'Force close requires a reason (at least 8 characters)',
      };
    }
  }
  const used =
    opts.usedCost !== undefined
      ? opts.usedCost
      : s.usedCost !== undefined
        ? Number(s.usedCost)
        : 0;
  const closeout = {
    closedAt: new Date().toISOString(),
    closedByPersonId: opts.closedByPersonId,
    workSummary: opts.workSummary,
    moneySummary: opts.moneySummary,
    leftoverDecision: opts.leftoverDecision,
    leftoverNote: opts.leftoverNote,
    narrative: opts.narrative,
    forceReason:
      opts.forceClose && needsForce
        ? (opts.forceReason ?? '').trim()
        : undefined,
    plannedCostSnapshot: s.plannedCost,
    usedCostSnapshot: used,
    confirmedFundingSnapshot: confirmedFundingTotal(s),
  };
  const next = mergeStewardship(s, { usedCost: used, closeout });
  const today = new Date();
  await prisma.programEnrollment.updateMany({
    where: { programId: id, status: 'ACTIVE' },
    data: { status: 'ENDED', endedOn: today },
  });
  const entity = await prisma.program.update({
    where: { id },
    data: {
      status: 'ENDED',
      stewardshipJson: serializeStewardship(next),
      stewardshipVersion: { increment: 1 },
    },
  });
  return { ok: true as const, entity };
}

export async function patchProgramStewardship(
  id: string,
  patch: Partial<StewardshipBlob>,
  expectedVersion?: number,
) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) return { ok: false as const, status: 404, error: 'Program not found' };
  if (
    expectedVersion !== undefined &&
    program.stewardshipVersion !== expectedVersion
  ) {
    return {
      ok: false as const,
      status: 409,
      error: 'Stewardship version conflict — reload and retry',
    };
  }
  const next = mergeStewardship(stewardshipOf(program), patch);
  const entity = await prisma.program.update({
    where: { id },
    data: {
      stewardshipJson: serializeStewardship(next),
      stewardshipVersion: { increment: 1 },
    },
  });
  return { ok: true as const, entity };
}

export async function submitProject(id: string) {
  const project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (project.status !== 'DRAFT') {
    return {
      ok: false as const,
      status: 400,
      error: 'Only DRAFT projects can be submitted',
    };
  }
  const entity = await prisma.churchProject.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL' },
  });
  return { ok: true as const, entity };
}

export async function approveProjectSimple(
  id: string,
  approverPersonId: string,
) {
  if (!(await personIsChurchLeadership(approverPersonId))) {
    return {
      ok: false as const,
      status: 403,
      error: 'Church Leader (or Assistant Pastor) must approve',
    };
  }
  const project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (project.status !== 'PENDING_APPROVAL') {
    return { ok: false as const, status: 400, error: 'Not awaiting approval' };
  }
  if (project.beyondOwnerScope) {
    return {
      ok: false as const,
      status: 400,
      error: 'Use the approval chain for beyond-scope projects',
    };
  }
  const entity = await prisma.churchProject.update({
    where: { id },
    data: { status: 'PLANNED' },
  });
  return { ok: true as const, entity };
}

export async function approveProjectLevel(input: {
  projectId: string;
  levelKey: string;
  personId: string;
}) {
  const project = await prisma.churchProject.findUnique({
    where: { id: input.projectId },
  });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (!project.beyondOwnerScope) {
    return {
      ok: false as const,
      status: 400,
      error: 'This project does not need upper approvals',
    };
  }
  const chain = await buildScopeApprovalChain(project);
  const level = chain.find((l) => l.levelKey === input.levelKey);
  if (!level) {
    return { ok: false as const, status: 400, error: 'Unknown approval level' };
  }
  if (!(await personCanApproveLevel(level, input.personId))) {
    return {
      ok: false as const,
      status: 403,
      error: `You cannot approve: ${level.label}`,
    };
  }
  const approvals = parseApprovals(project.approvalsJson);
  if (approvals.some((a) => a.levelKey === level.levelKey)) {
    return {
      ok: false as const,
      status: 400,
      error: 'Already approved at this level',
    };
  }
  const next: ApprovalRecord[] = [
    ...approvals,
    {
      levelKey: level.levelKey,
      kind: level.kind,
      label: level.label,
      systemId: level.systemId,
      personId: input.personId,
      approvedAt: new Date().toISOString(),
    },
  ];
  const done = approvalsSatisfied(chain, next);
  const entity = await prisma.churchProject.update({
    where: { id: input.projectId },
    data: {
      approvalsJson: serializeApprovals(next),
      status: done ? 'PLANNED' : 'PENDING_APPROVAL',
    },
  });
  return { ok: true as const, entity, approvals: next };
}

export async function approveEventLevel(input: {
  eventId: string;
  levelKey: string;
  personId: string;
}) {
  const event = await prisma.churchEvent.findUnique({
    where: { id: input.eventId },
  });
  if (!event) return { ok: false as const, status: 404, error: 'Event not found' };
  if (!event.beyondOwnerScope) {
    return {
      ok: false as const,
      status: 400,
      error: 'This event does not need upper approvals',
    };
  }
  const chain = await buildScopeApprovalChain(event);
  const level = chain.find((l) => l.levelKey === input.levelKey);
  if (!level) {
    return { ok: false as const, status: 400, error: 'Unknown approval level' };
  }
  if (!(await personCanApproveLevel(level, input.personId))) {
    return {
      ok: false as const,
      status: 403,
      error: `You cannot approve: ${level.label}`,
    };
  }
  const approvals = parseApprovals(event.approvalsJson);
  if (approvals.some((a) => a.levelKey === level.levelKey)) {
    return {
      ok: false as const,
      status: 400,
      error: 'Already approved at this level',
    };
  }
  const next: ApprovalRecord[] = [
    ...approvals,
    {
      levelKey: level.levelKey,
      kind: level.kind,
      label: level.label,
      systemId: level.systemId,
      personId: input.personId,
      approvedAt: new Date().toISOString(),
    },
  ];
  const done = approvalsSatisfied(chain, next);
  const entity = await prisma.churchEvent.update({
    where: { id: input.eventId },
    data: {
      approvalsJson: serializeApprovals(next),
      status: done ? 'CONFIRMED' : 'PENDING_APPROVAL',
    },
  });
  return { ok: true as const, entity, approvals: next };
}

export async function startProject(
  id: string,
  opts?: { forceSpendGap?: boolean; forceReason?: string },
) {
  const project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (project.status !== 'PLANNED') {
    return {
      ok: false as const,
      status: 400,
      error: 'Only PLANNED projects can start running',
    };
  }
  const s = parseStewardship(project.stewardshipJson);
  const gap = (Number(s.plannedCost) || 0) - confirmedFundingTotal(s);
  if (project.willSpend && gap > 0) {
    if (!opts?.forceSpendGap) {
      return {
        ok: false as const,
        status: 400,
        error: `Funding gap ${Math.round(gap)} RWF — confirm funding or force start with a reason`,
        gap,
      };
    }
    const reason = (opts.forceReason ?? '').trim();
    if (reason.length < 8) {
      return {
        ok: false as const,
        status: 400,
        error: 'Force start requires a reason (at least 8 characters)',
        gap,
      };
    }
  }
  const nextSteward =
    opts?.forceSpendGap && gap > 0
      ? {
          ...s,
          forceStartReason: (opts.forceReason ?? '').trim(),
          forceStartAt: new Date().toISOString(),
        }
      : s;
  const entity = await prisma.churchProject.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      startsOn: project.startsOn ?? new Date(),
      ...(opts?.forceSpendGap && gap > 0
        ? { stewardshipJson: serializeStewardship(nextSteward) }
        : {}),
    },
  });
  const openReq = requiredDeliveryOpen(s).length;
  return {
    ok: true as const,
    entity,
    gap: gap > 0 ? gap : undefined,
    openRequired: openReq > 0 ? openReq : undefined,
  };
}

export async function beginCloseProject(id: string) {
  const project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (project.status === 'CLOSING') return { ok: true as const, entity: project };
  if (project.status !== 'ACTIVE' && project.status !== 'PAUSED') {
    return {
      ok: false as const,
      status: 400,
      error: 'Only ACTIVE/PAUSED projects can enter CLOSING',
    };
  }
  const entity = await prisma.churchProject.update({
    where: { id },
    data: { status: 'CLOSING' },
  });
  return { ok: true as const, entity };
}

export async function abandonCloseProject(id: string) {
  const project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (project.status !== 'CLOSING') {
    return { ok: false as const, status: 400, error: 'Not in CLOSING' };
  }
  const entity = await prisma.churchProject.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });
  return { ok: true as const, entity };
}

export async function completeProject(
  id: string,
  opts: {
    closedByPersonId: string;
    workSummary: string;
    moneySummary: string;
    leftoverDecision: string;
    leftoverNote?: string;
    narrative?: string;
    forceClose?: boolean;
    forceReason?: string;
    usedCost?: number;
  },
) {
  let project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (project.status === 'DONE' || project.status === 'CANCELLED') {
    return { ok: false as const, status: 400, error: 'Already closed' };
  }
  if (project.status === 'PENDING_APPROVAL' || project.status === 'DRAFT') {
    return { ok: false as const, status: 400, error: 'Still pending approval' };
  }
  if (project.status === 'PLANNED') {
    return {
      ok: false as const,
      status: 400,
      error: 'Still in SETUP — start running before close-out',
    };
  }
  if (project.status === 'ACTIVE' || project.status === 'PAUSED') {
    const entered = await beginCloseProject(id);
    if (!entered.ok) return entered;
    project = entered.entity!;
  }
  if (!project || project.status !== 'CLOSING') {
    return {
      ok: false as const,
      status: 400,
      error: 'Begin close-out first (status must be CLOSING)',
    };
  }
  const s = parseStewardship(project.stewardshipJson);
  const openAdv = openAdvances(s);
  const openTasks = await prisma.workTask.count({
    where: {
      contextType: 'PROJECT',
      contextId: id,
      status: { in: ['TODO', 'IN_PROGRESS'] },
    },
  });
  const needsForce =
    !deliveryReadyToClose(s) || openAdv.length > 0 || openTasks > 0;
  if (needsForce && !opts.forceClose) {
    if (!deliveryReadyToClose(s)) {
      const openDel = requiredDeliveryOpen(s);
      return {
        ok: false as const,
        status: 400,
        error: `${openDel.length} required delivery item(s) still open — finish, waive, or force`,
      };
    }
    if (openAdv.length > 0) {
      return {
        ok: false as const,
        status: 400,
        error: `${openAdv.length} open advance(s) must be retired — or force close`,
      };
    }
    return {
      ok: false as const,
      status: 400,
      error: `${openTasks} open task(s) — finish or force close`,
      openTasks,
    };
  }
  if (opts.forceClose && needsForce) {
    const reason = (opts.forceReason ?? '').trim();
    if (reason.length < 8) {
      return {
        ok: false as const,
        status: 400,
        error: 'Force close requires a reason (at least 8 characters)',
      };
    }
  }
  const used =
    opts.usedCost !== undefined
      ? opts.usedCost
      : s.usedCost !== undefined
        ? Number(s.usedCost)
        : 0;
  const closeout = {
    closedAt: new Date().toISOString(),
    closedByPersonId: opts.closedByPersonId,
    workSummary: opts.workSummary,
    moneySummary: opts.moneySummary,
    leftoverDecision: opts.leftoverDecision,
    leftoverNote: opts.leftoverNote,
    narrative: opts.narrative,
    forceReason:
      opts.forceClose && needsForce
        ? (opts.forceReason ?? '').trim()
        : undefined,
    plannedCostSnapshot: s.plannedCost,
    usedCostSnapshot: used,
    confirmedFundingSnapshot: confirmedFundingTotal(s),
  };
  const next = mergeStewardship(s, { usedCost: used, closeout });
  const entity = await prisma.churchProject.update({
    where: { id },
    data: {
      status: 'DONE',
      endsOn: new Date(),
      stewardshipJson: serializeStewardship(next),
      stewardshipVersion: { increment: 1 },
    },
  });
  return { ok: true as const, entity };
}

export async function cancelProject(id: string) {
  const project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (project.status === 'DONE' || project.status === 'CANCELLED') {
    return { ok: false as const, status: 400, error: 'Already closed' };
  }
  const entity = await prisma.churchProject.update({
    where: { id },
    data: { status: 'CANCELLED', endsOn: new Date() },
  });
  return { ok: true as const, entity };
}

export async function patchProjectStewardship(
  id: string,
  patch: Partial<StewardshipBlob>,
  expectedVersion?: number,
) {
  const project = await prisma.churchProject.findUnique({ where: { id } });
  if (!project) return { ok: false as const, status: 404, error: 'Project not found' };
  if (
    expectedVersion !== undefined &&
    project.stewardshipVersion !== expectedVersion
  ) {
    return {
      ok: false as const,
      status: 409,
      error: 'Stewardship version conflict — reload and retry',
    };
  }
  const next = mergeStewardship(
    parseStewardship(project.stewardshipJson),
    patch,
  );
  const entity = await prisma.churchProject.update({
    where: { id },
    data: {
      stewardshipJson: serializeStewardship(next),
      stewardshipVersion: { increment: 1 },
    },
  });
  return { ok: true as const, entity };
}

export async function setTaskStatus(id: string, status: string) {
  const task = await prisma.workTask.findUnique({ where: { id } });
  if (!task) return { ok: false as const, status: 404, error: 'Task not found' };
  const data: {
    status: string;
    endDate?: Date | null;
    grantsSystemAccess?: boolean;
    accessRevokedAt?: Date | null;
  } = { status };
  if (status === 'DONE' || status === 'CANCELLED') {
    data.endDate = new Date();
    if (task.grantsSystemAccess) {
      data.grantsSystemAccess = false;
      data.accessRevokedAt = new Date();
    }
  }
  const entity = await prisma.workTask.update({ where: { id }, data });
  return { ok: true as const, entity };
}

export async function setEventStatus(
  id: string,
  patch: { status?: string; lifecyclePhase?: string },
) {
  const event = await prisma.churchEvent.findUnique({ where: { id } });
  if (!event) return { ok: false as const, status: 404, error: 'Event not found' };
  const entity = await prisma.churchEvent.update({
    where: { id },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.lifecyclePhase
        ? { lifecyclePhase: patch.lifecyclePhase }
        : {}),
    },
  });
  return { ok: true as const, entity };
}

export async function getApprovalChainFor(
  kind: 'PROJECT' | 'EVENT',
  id: string,
) {
  const row =
    kind === 'PROJECT'
      ? await prisma.churchProject.findUnique({ where: { id } })
      : await prisma.churchEvent.findUnique({ where: { id } });
  if (!row) return { ok: false as const, status: 404, error: 'Not found' };
  const chain = await buildScopeApprovalChain(row);
  const approvals = parseApprovals(row.approvalsJson);
  return {
    ok: true as const,
    chain,
    approvals,
    satisfied: approvalsSatisfied(chain, approvals),
  };
}
