import { apiFetch, isApiEnabled } from './index';
import type {
  ChurchEvent,
  ChurchProject,
  MissionVisibility,
  Program,
  SystemId,
  WorkTask,
} from '../domain/types';

export type ApiProgram = {
  id: string;
  name: string;
  description: string;
  ownerSystemId: string;
  visibility: string;
  status: string;
  programType?: string | null;
  scheduleHint?: string | null;
  parentProgramId?: string | null;
  cohortLabel?: string | null;
  createdByPersonId?: string | null;
};

export type ApiEvent = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  ownerSystemId: string;
  visibility: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  status: string;
  lifecyclePhase?: string | null;
  registrationMode?: string | null;
  capacity?: number | null;
  beyondOwnerScope?: boolean;
  projectId?: string | null;
  programId?: string | null;
};

export type ApiTask = {
  id: string;
  title: string;
  description?: string | null;
  ownerPersonId: string;
  helperPersonIds?: string[] | string | null;
  systemId?: string | null;
  visibility: string;
  status: string;
  dueDate?: string | null;
  startDate: string;
  grantsSystemAccess: boolean;
  contextType: string;
  contextId?: string | null;
  contextLabel?: string | null;
};

export type ApiProject = {
  id: string;
  name: string;
  description: string;
  ownerSystemId: string;
  visibility: string;
  status: string;
  willSpend: boolean;
  fundId?: string | null;
  programId?: string | null;
  beyondOwnerScope?: boolean;
  leadPersonId?: string | null;
  collaboratorSystemIds?: string[] | string | null;
};

function mapVisibility(v: string): MissionVisibility {
  if (v === 'GENERAL' || v === 'CHURCH') return 'CHURCH';
  if (v === 'SELECTED' || v === 'SELECTIVE') return 'SELECTIVE';
  return 'MINISTRY_PRIVATE';
}

/** Persist canonical client visibility on the API. */
function toApiVisibility(v: MissionVisibility): string {
  if (v === 'CHURCH') return 'CHURCH';
  if (v === 'SELECTIVE') return 'SELECTIVE';
  return 'MINISTRY_PRIVATE';
}

export function mapApiProgram(p: ApiProgram): Program {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    ownerSystemId: p.ownerSystemId as SystemId,
    visibility: mapVisibility(p.visibility),
    status: (p.status as Program['status']) || 'DRAFT',
    programType: (p.programType as Program['programType']) || undefined,
    scheduleHint: p.scheduleHint ?? undefined,
    parentProgramId: p.parentProgramId ?? undefined,
    cohortLabel: p.cohortLabel ?? undefined,
    createdByPersonId: p.createdByPersonId ?? undefined,
  };
}

function parseIdList(raw: string[] | string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw.length ? raw.map(String) : undefined;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) && v.length ? v.map(String) : undefined;
  } catch {
    return undefined;
  }
}

function mapTaskContextType(v: string): WorkTask['contextType'] {
  if (v === 'PROGRAM' || v === 'EVENT' || v === 'PROJECT' || v === 'NONE') {
    return v;
  }
  return 'NONE';
}

export function mapApiEvent(e: ApiEvent): ChurchEvent {
  return {
    id: e.id,
    name: e.name,
    type: (e.type as ChurchEvent['type']) || 'OTHER',
    description: e.description ?? undefined,
    ownerSystemId: e.ownerSystemId as SystemId,
    visibility: mapVisibility(e.visibility),
    startsAt: e.startsAt,
    endsAt: e.endsAt ?? undefined,
    location: e.location ?? undefined,
    status: (e.status as ChurchEvent['status']) || 'DRAFT',
    lifecyclePhase: (e.lifecyclePhase as ChurchEvent['lifecyclePhase']) || 'PREPARE',
    registrationMode:
      (e.registrationMode as ChurchEvent['registrationMode']) || undefined,
    capacity: e.capacity ?? undefined,
    beyondOwnerScope: e.beyondOwnerScope === true,
    projectId: e.projectId ?? undefined,
    programId: e.programId ?? undefined,
  };
}

export function mapApiTask(t: ApiTask): WorkTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    ownerPersonId: t.ownerPersonId,
    helperPersonIds: parseIdList(t.helperPersonIds),
    systemId: (t.systemId as SystemId) || undefined,
    visibility: mapVisibility(t.visibility),
    status: (t.status as WorkTask['status']) || 'TODO',
    dueDate: t.dueDate ? t.dueDate.slice(0, 10) : undefined,
    startDate: t.startDate.slice(0, 10),
    grantsSystemAccess: t.grantsSystemAccess,
    contextType: mapTaskContextType(t.contextType),
    contextId: t.contextId ?? undefined,
    contextLabel: t.contextLabel ?? undefined,
  };
}

export function mapApiProject(p: ApiProject): ChurchProject {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    ownerSystemId: p.ownerSystemId as SystemId,
    visibility: mapVisibility(p.visibility),
    status: (p.status as ChurchProject['status']) || 'DRAFT',
    willSpend: p.willSpend,
    fundId: p.fundId ?? undefined,
    programId: p.programId ?? undefined,
    beyondOwnerScope: p.beyondOwnerScope === true,
    leadPersonId: p.leadPersonId ?? undefined,
    collaboratorSystemIds: parseIdList(p.collaboratorSystemIds) as
      | SystemId[]
      | undefined,
  };
}

export async function apiListPrograms(ownerSystemId?: string): Promise<Program[]> {
  const q = ownerSystemId
    ? `?ownerSystemId=${encodeURIComponent(ownerSystemId)}`
    : '';
  const res = await apiFetch<{ programs: ApiProgram[] }>(
    `/api/mission/programs${q}`,
  );
  return res.programs.map(mapApiProgram);
}

export async function apiListEvents(ownerSystemId?: string): Promise<ChurchEvent[]> {
  const q = ownerSystemId
    ? `?ownerSystemId=${encodeURIComponent(ownerSystemId)}`
    : '';
  const res = await apiFetch<{ events: ApiEvent[] }>(`/api/mission/events${q}`);
  return res.events.map(mapApiEvent);
}

export async function apiListTasks(systemId?: string): Promise<WorkTask[]> {
  const q = systemId ? `?systemId=${encodeURIComponent(systemId)}` : '';
  const res = await apiFetch<{ tasks: ApiTask[] }>(`/api/mission/tasks${q}`);
  return res.tasks.map(mapApiTask);
}

export async function apiListProjects(
  ownerSystemId?: string,
): Promise<ChurchProject[]> {
  const q = ownerSystemId
    ? `?ownerSystemId=${encodeURIComponent(ownerSystemId)}`
    : '';
  const res = await apiFetch<{ projects: ApiProject[] }>(
    `/api/mission/projects${q}`,
  );
  return res.projects.map(mapApiProject);
}

export async function apiCreateProgram(input: {
  name: string;
  description?: string;
  ownerSystemId: string;
  visibility?: MissionVisibility;
  status?: string;
  programType?: string;
  scheduleHint?: string;
  parentProgramId?: string;
  cohortLabel?: string;
}): Promise<Program> {
  const res = await apiFetch<{ program: ApiProgram }>('/api/mission/programs', {
    method: 'POST',
    body: {
      name: input.name,
      description: input.description,
      ownerSystemId: input.ownerSystemId,
      visibility: input.visibility
        ? toApiVisibility(input.visibility)
        : 'MINISTRY_PRIVATE',
      status: input.status,
      programType: input.programType,
      scheduleHint: input.scheduleHint,
      parentProgramId: input.parentProgramId,
      cohortLabel: input.cohortLabel,
    },
  });
  return mapApiProgram(res.program);
}

export async function apiCreateEvent(input: {
  name: string;
  type?: string;
  description?: string;
  ownerSystemId: string;
  visibility?: MissionVisibility;
  startsAt: string;
  endsAt?: string;
  location?: string;
  status?: string;
  capacity?: number;
  registrationMode?: string;
  beyondOwnerScope?: boolean;
  programId?: string;
  projectId?: string;
  willSpend?: boolean;
  plannedCost?: number;
}): Promise<ChurchEvent> {
  const res = await apiFetch<{ event: ApiEvent }>('/api/mission/events', {
    method: 'POST',
    body: {
      name: input.name,
      type: input.type,
      description: input.description,
      ownerSystemId: input.ownerSystemId,
      visibility: input.visibility
        ? toApiVisibility(input.visibility)
        : 'MINISTRY_PRIVATE',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      status: input.status,
      capacity: input.capacity,
      registrationMode: input.registrationMode,
      beyondOwnerScope: input.beyondOwnerScope,
      programId: input.programId,
      projectId: input.projectId,
      willSpend: input.willSpend,
      plannedCost: input.plannedCost,
    },
  });
  return mapApiEvent(res.event);
}

export async function apiCreateTask(input: {
  title: string;
  description?: string;
  ownerPersonId?: string;
  helperPersonIds?: string[];
  systemId?: string;
  visibility?: MissionVisibility;
  status?: string;
  dueDate?: string;
  grantsSystemAccess?: boolean;
  contextType?: string;
  contextId?: string;
  contextLabel?: string;
}): Promise<WorkTask> {
  const res = await apiFetch<{ task: ApiTask }>('/api/mission/tasks', {
    method: 'POST',
    body: {
      title: input.title,
      description: input.description,
      ownerPersonId: input.ownerPersonId,
      helperPersonIds: input.helperPersonIds,
      systemId: input.systemId,
      visibility: input.visibility
        ? toApiVisibility(input.visibility)
        : 'MINISTRY_PRIVATE',
      status: input.status,
      dueDate: input.dueDate,
      grantsSystemAccess: input.grantsSystemAccess,
      contextType: input.contextType,
      contextId: input.contextId,
      contextLabel: input.contextLabel,
    },
  });
  return mapApiTask(res.task);
}

export async function apiCreateProject(input: {
  name: string;
  description?: string;
  ownerSystemId: string;
  visibility?: MissionVisibility;
  status?: ChurchProject['status'];
  willSpend?: boolean;
  fundId?: string;
  programId?: string;
  beyondOwnerScope?: boolean;
  leadPersonId?: string;
  collaboratorSystemIds?: string[];
}): Promise<ChurchProject> {
  const res = await apiFetch<{ project: ApiProject }>('/api/mission/projects', {
    method: 'POST',
    body: {
      name: input.name,
      description: input.description,
      ownerSystemId: input.ownerSystemId,
      visibility: input.visibility
        ? toApiVisibility(input.visibility)
        : 'MINISTRY_PRIVATE',
      status: input.status,
      willSpend: input.willSpend,
      fundId: input.fundId,
      programId: input.programId,
      beyondOwnerScope: input.beyondOwnerScope,
      leadPersonId: input.leadPersonId,
      collaboratorSystemIds: input.collaboratorSystemIds,
    },
  });
  return mapApiProject(res.project);
}

export async function apiGetProgram(id: string): Promise<Program> {
  const res = await apiFetch<{ program: ApiProgram & Record<string, unknown> }>(
    `/api/mission/programs/${encodeURIComponent(id)}`,
  );
  return mapApiProgram(res.program);
}

export async function apiSubmitProgram(id: string): Promise<Program> {
  const res = await apiFetch<{ program: ApiProgram }>(
    `/api/mission/programs/${encodeURIComponent(id)}/submit`,
    { method: 'POST', body: {} },
  );
  return mapApiProgram(res.program);
}

export async function apiApproveProgram(id: string): Promise<Program> {
  const res = await apiFetch<{ program: ApiProgram }>(
    `/api/mission/programs/${encodeURIComponent(id)}/approve`,
    { method: 'POST', body: {} },
  );
  return mapApiProgram(res.program);
}

export async function apiStartProgram(id: string): Promise<{
  program: Program;
  gap?: number;
  openRequired?: number;
}> {
  const res = await apiFetch<{
    program: ApiProgram;
    gap?: number;
    openRequired?: number;
  }>(`/api/mission/programs/${encodeURIComponent(id)}/start`, {
    method: 'POST',
    body: {},
  });
  return {
    program: mapApiProgram(res.program),
    gap: res.gap,
    openRequired: res.openRequired,
  };
}

export async function apiBeginCloseProgram(id: string): Promise<Program> {
  const res = await apiFetch<{ program: ApiProgram }>(
    `/api/mission/programs/${encodeURIComponent(id)}/begin-close`,
    { method: 'POST', body: {} },
  );
  return mapApiProgram(res.program);
}

export async function apiEndProgram(
  id: string,
  body: {
    workSummary: string;
    moneySummary: string;
    leftoverDecision: string;
    leftoverNote?: string;
    narrative?: string;
    forceClose?: boolean;
    forceReason?: string;
    usedCost?: number;
  },
): Promise<Program> {
  const res = await apiFetch<{ program: ApiProgram }>(
    `/api/mission/programs/${encodeURIComponent(id)}/end`,
    { method: 'POST', body },
  );
  return mapApiProgram(res.program);
}

export async function apiPatchProgramStewardship(
  id: string,
  patch: Record<string, unknown>,
  expectedVersion?: number,
): Promise<Program> {
  const res = await apiFetch<{ program: ApiProgram }>(
    `/api/mission/programs/${encodeURIComponent(id)}/stewardship`,
    {
      method: 'PATCH',
      body: { patch, expectedVersion },
    },
  );
  return mapApiProgram(res.program);
}

export async function apiCreateActivity(
  programId: string,
  input: {
    title: string;
    startsAt: string;
    endsAt?: string;
    location?: string;
  },
) {
  const res = await apiFetch<{
    activity: {
      id: string;
      programId: string;
      title: string;
      startsAt: string;
      endsAt?: string;
      location?: string;
    };
  }>(`/api/mission/programs/${encodeURIComponent(programId)}/activities`, {
    method: 'POST',
    body: input,
  });
  return res.activity;
}

export async function apiEnroll(
  programId: string,
  input: { personId: string; role?: 'LEADER' | 'PARTICIPANT'; roleKey?: string },
) {
  const res = await apiFetch<{
    enrollment: {
      id: string;
      programId: string;
      personId: string;
      role: string;
      roleKey?: string;
      status: string;
      enrolledOn: string;
    };
  }>(`/api/mission/programs/${encodeURIComponent(programId)}/enrollments`, {
    method: 'POST',
    body: input,
  });
  return res.enrollment;
}

export async function apiMarkAttendance(
  activityId: string,
  input: {
    personId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  },
) {
  const res = await apiFetch<{
    attendance: {
      id: string;
      activityId: string;
      personId: string;
      status: string;
      recordedAt: string;
    };
  }>(`/api/mission/activities/${encodeURIComponent(activityId)}/attendance`, {
    method: 'POST',
    body: input,
  });
  return res.attendance;
}

export async function apiSubmitProject(id: string) {
  const res = await apiFetch<{ project: ApiProject }>(
    `/api/mission/projects/${encodeURIComponent(id)}/submit`,
    { method: 'POST', body: {} },
  );
  return mapApiProject(res.project);
}

export async function apiApproveProject(id: string) {
  const res = await apiFetch<{ project: ApiProject }>(
    `/api/mission/projects/${encodeURIComponent(id)}/approve`,
    { method: 'POST', body: {} },
  );
  return mapApiProject(res.project);
}

export async function apiApproveProjectLevel(id: string, levelKey: string) {
  const res = await apiFetch<{ project: ApiProject }>(
    `/api/mission/projects/${encodeURIComponent(id)}/approve-level`,
    { method: 'POST', body: { levelKey } },
  );
  return mapApiProject(res.project);
}

export async function apiStartProject(
  id: string,
  opts?: { forceSpendGap?: boolean; forceReason?: string },
) {
  const res = await apiFetch<{
    project: ApiProject;
    gap?: number;
    openRequired?: number;
  }>(`/api/mission/projects/${encodeURIComponent(id)}/start`, {
    method: 'POST',
    body: opts ?? {},
  });
  return {
    project: mapApiProject(res.project),
    gap: res.gap,
    openRequired: res.openRequired,
  };
}

export async function apiBeginCloseProject(id: string) {
  const res = await apiFetch<{ project: ApiProject }>(
    `/api/mission/projects/${encodeURIComponent(id)}/begin-close`,
    { method: 'POST', body: {} },
  );
  return mapApiProject(res.project);
}

export async function apiCompleteProject(
  id: string,
  body: {
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
  const res = await apiFetch<{ project: ApiProject }>(
    `/api/mission/projects/${encodeURIComponent(id)}/complete`,
    { method: 'POST', body },
  );
  return mapApiProject(res.project);
}

export async function apiCancelProject(id: string) {
  const res = await apiFetch<{ project: ApiProject }>(
    `/api/mission/projects/${encodeURIComponent(id)}/cancel`,
    { method: 'POST', body: {} },
  );
  return mapApiProject(res.project);
}

export async function apiApproveEventLevel(id: string, levelKey: string) {
  const res = await apiFetch<{ event: ApiEvent }>(
    `/api/mission/events/${encodeURIComponent(id)}/approve-level`,
    { method: 'POST', body: { levelKey } },
  );
  return mapApiEvent(res.event);
}

export async function apiPatchEvent(
  id: string,
  patch: { status?: string; lifecyclePhase?: 'PREPARE' | 'DELIVER' | 'CLOSE' },
) {
  const res = await apiFetch<{ event: ApiEvent }>(
    `/api/mission/events/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: patch },
  );
  return mapApiEvent(res.event);
}

export async function apiCompleteEvent(id: string) {
  try {
    const res = await apiFetch<{ event: ApiEvent }>(
      `/api/mission/events/${encodeURIComponent(id)}/complete`,
      { method: 'POST', body: {} },
    );
    return mapApiEvent(res.event);
  } catch {
    const res = await apiFetch<{ event: ApiEvent }>(
      `/api/mission/events/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { status: 'COMPLETED', lifecyclePhase: 'CLOSE' } },
    );
    return mapApiEvent(res.event);
  }
}

export async function apiCancelEventRegistration(
  eventId: string,
  personId: string,
) {
  return apiFetch<{
    registration: {
      id: string;
      eventId: string;
      personId: string;
      status: string;
      registeredOn: string;
      attendedAt?: string;
      promotedAt?: string;
      offerExpiresAt?: string;
    };
    promoted?: {
      id: string;
      eventId: string;
      personId: string;
      status: string;
      registeredOn: string;
      offerExpiresAt?: string;
    } | null;
  }>(`/api/mission/events/${encodeURIComponent(eventId)}/registrations/cancel`, {
    method: 'POST',
    body: { personId },
  });
}

export async function apiSetTaskStatus(
  id: string,
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED',
) {
  const res = await apiFetch<{ task: ApiTask }>(
    `/api/mission/tasks/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: { status } },
  );
  return mapApiTask(res.task);
}

export async function apiListActivities(programId: string) {
  const res = await apiFetch<{
    activities: Array<{
      id: string;
      programId: string;
      title: string;
      startsAt: string;
      endsAt?: string;
      location?: string;
      sessionClosedAt?: string;
    }>;
  }>(`/api/mission/programs/${encodeURIComponent(programId)}/activities`);
  return res.activities;
}

export async function apiCloseActivity(
  activityId: string,
  opts?: { completeLinkedDelivery?: boolean },
) {
  return apiFetch<{
    activity: {
      id: string;
      programId: string;
      title: string;
      startsAt: string;
      sessionClosedAt?: string;
    };
    alreadyClosed?: boolean;
    deliveryCompleted?: boolean;
  }>(`/api/mission/activities/${encodeURIComponent(activityId)}/close`, {
    method: 'POST',
    body: opts ?? {},
  });
}

export type ApiPulse = {
  kind: 'PROGRAM' | 'PROJECT';
  id: string;
  name: string;
  status: string;
  health: {
    score: number;
    tone: 'green' | 'amber' | 'red' | 'neutral';
    label: string;
    parts: {
      schedule: number;
      money: number;
      delivery: number;
      people: number;
    };
  };
  money: {
    plannedCost: number;
    confirmedFunding: number;
    usedCost: number;
    gap: number;
    openAdvances: number;
  };
  openRequiredDelivery: Array<{ id?: string; title?: string; status?: string }>;
  nextSession?: {
    id: string;
    title: string;
    startsAt: string;
    sessionClosedAt?: string;
  } | null;
  needsMeHints: string[];
  healthSnapshots?: Array<{
    date: string;
    score: number;
    tone: string;
    label: string;
  }>;
  blockers?: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    ownerPersonId: string;
    createdAt: string;
    ageDays?: number;
    deliveryItemId?: string;
    taskId?: string;
  }>;
  impact?: {
    participantsServed: number;
    impactPerFranc: number | null;
  };
};

export async function apiGetProgramPulse(id: string) {
  const res = await apiFetch<{ pulse: ApiPulse }>(
    `/api/mission/programs/${encodeURIComponent(id)}/pulse`,
  );
  return res.pulse;
}

export async function apiGetProjectPulse(id: string) {
  const res = await apiFetch<{ pulse: ApiPulse }>(
    `/api/mission/projects/${encodeURIComponent(id)}/pulse`,
  );
  return res.pulse;
}

export async function apiApplyDesignatedGift(input: {
  amount: number;
  label: string;
  fundId: string;
  donationId: string;
  programId?: string;
  projectId?: string;
  note?: string;
}) {
  return apiFetch<{ ok: boolean }>('/api/mission/stewardship/designated-gift', {
    method: 'POST',
    body: input,
  });
}

export async function apiIncrementUsedCost(input: {
  amount: number;
  programId?: string;
  projectId?: string;
  expenseId?: string;
}) {
  return apiFetch<{ ok: boolean }>('/api/mission/stewardship/used-cost', {
    method: 'POST',
    body: input,
  });
}

export async function apiListEnrollments(programId: string) {
  const res = await apiFetch<{
    enrollments: Array<{
      id: string;
      programId: string;
      personId: string;
      role: string;
      roleKey?: string;
      status: string;
      enrolledOn: string;
    }>;
  }>(`/api/mission/programs/${encodeURIComponent(programId)}/enrollments`);
  return res.enrollments;
}

export async function apiListEventRegistrations(eventId: string) {
  const res = await apiFetch<{
    registrations: Array<{
      id: string;
      eventId: string;
      personId: string;
      status: string;
      registeredOn: string;
      attendedAt?: string;
    }>;
  }>(`/api/mission/events/${encodeURIComponent(eventId)}/registrations`);
  return res.registrations;
}

export async function apiRegisterForEvent(
  eventId: string,
  personId: string,
) {
  const res = await apiFetch<{
    registration: {
      id: string;
      eventId: string;
      personId: string;
      status: string;
      registeredOn: string;
    };
  }>(`/api/mission/events/${encodeURIComponent(eventId)}/registrations`, {
    method: 'POST',
    body: { personId },
  });
  return res.registration;
}

export async function apiMarkEventAttendance(
  eventId: string,
  input: { personId: string; attended: boolean },
) {
  const res = await apiFetch<{
    registration: {
      id: string;
      eventId: string;
      personId: string;
      status: string;
      registeredOn: string;
      attendedAt?: string;
    };
  }>(`/api/mission/events/${encodeURIComponent(eventId)}/attendance`, {
    method: 'POST',
    body: input,
  });
  return res.registration;
}

export async function apiEventNextSteps(
  eventId: string,
  body: {
    personId: string;
    enrollProgramId?: string;
    addMembershipType?: string;
    membershipLabel?: string;
    createFollowUpTask?: { title: string; ownerPersonId: string };
  },
) {
  return apiFetch<{ ok: boolean; enrolled?: unknown; taskId?: string }>(
    `/api/mission/events/${encodeURIComponent(eventId)}/next-steps`,
    { method: 'POST', body },
  );
}

export async function apiAddEventCollaborator(
  eventId: string,
  input: { addSystemId?: string; addPersonId?: string },
) {
  const res = await apiFetch<{ event: ApiEvent & { collaboratorSystemIds?: string[]; collaboratorPersonIds?: string[] } }>(
    `/api/mission/events/${encodeURIComponent(eventId)}/collaborators`,
    { method: 'PATCH', body: input },
  );
  return res.event;
}

export async function apiAddProjectCollaborator(
  projectId: string,
  input: { addSystemId?: string; addPersonId?: string },
) {
  const res = await apiFetch<{
    project: ApiProject & {
      collaboratorSystemIds?: string[];
      collaboratorPersonIds?: string[];
    };
  }>(`/api/mission/projects/${encodeURIComponent(projectId)}/collaborators`, {
    method: 'PATCH',
    body: input,
  });
  return res.project;
}

export async function loadActivitiesPreferApi(programId: string) {
  if (!isApiEnabled()) return null;
  try {
    return await apiListActivities(programId);
  } catch {
    return null;
  }
}

export async function loadEnrollmentsPreferApi(programId: string) {
  if (!isApiEnabled()) return null;
  try {
    return await apiListEnrollments(programId);
  } catch {
    return null;
  }
}

export async function loadEventRegistrationsPreferApi(eventId: string) {
  if (!isApiEnabled()) return null;
  try {
    return await apiListEventRegistrations(eventId);
  } catch {
    return null;
  }
}

/** Prefer API when enabled; otherwise null so callers use seed. */
export async function loadProgramsPreferApi(
  ownerSystemId?: string,
): Promise<Program[] | null> {
  if (!isApiEnabled()) return null;
  try {
    return await apiListPrograms(ownerSystemId);
  } catch {
    return null;
  }
}

export async function loadEventsPreferApi(
  ownerSystemId?: string,
): Promise<ChurchEvent[] | null> {
  if (!isApiEnabled()) return null;
  try {
    return await apiListEvents(ownerSystemId);
  } catch {
    return null;
  }
}

export async function loadTasksPreferApi(
  systemId?: string,
): Promise<WorkTask[] | null> {
  if (!isApiEnabled()) return null;
  try {
    return await apiListTasks(systemId);
  } catch {
    return null;
  }
}

export async function loadProjectsPreferApi(
  ownerSystemId?: string,
): Promise<ChurchProject[] | null> {
  if (!isApiEnabled()) return null;
  try {
    return await apiListProjects(ownerSystemId);
  } catch {
    return null;
  }
}
