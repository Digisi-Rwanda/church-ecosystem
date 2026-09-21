import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { eventSpendPolicyOk } from '../domain/eventOps';
import { eventTypeLabel } from '../domain/permissions';
import type {
  ChurchEventType,
  EventRegistrationMode,
  MissionVisibility,
  ProgramType,
  SystemId,
  TaskContextType,
} from '../domain/types';
import {
  financeService,
  missionService,
  peopleService,
  systemsService,
} from '../services';
import {
  writeCreateEvent,
  writeCreateProgram,
  writeCreateProject,
  writeCreateTask,
} from '../services/missionWrite';
import { CreateFormActions, CreateFormSection } from './ui/CreateForm';
import { Drawer } from './ui/Drawer';
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from './ui/Field';
import { useToast } from './ui/Toast';

export type MissionCreateKind = 'PROGRAM' | 'PROJECT' | 'EVENT' | 'TASK';

export type MissionCreateResult = {
  kind: MissionCreateKind;
  id: string;
  name: string;
  message: string;
  toastTitle: string;
};

const EVENT_TYPES: ChurchEventType[] = [
  'CONFERENCE',
  'BAPTISM',
  'WEDDING',
  'CONCERT',
  'RETREAT',
  'SEMINAR',
  'SPECIAL_SERVICE',
  'CAMPAIGN',
  'OTHER',
];

function defaultEventStarts() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  d.setHours(10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultTaskDue() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function VisibilityField({
  name,
  value,
  onChange,
  privateLabel = 'Private',
}: {
  name: string;
  value: MissionVisibility;
  onChange: (v: MissionVisibility) => void;
  privateLabel?: string;
}) {
  return (
    <SelectField
      label="Visibility"
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value as MissionVisibility)}
    >
      <option value="CHURCH">General church</option>
      <option value="MINISTRY_PRIVATE">{privateLabel}</option>
      <option value="SELECTIVE">Selective</option>
    </SelectField>
  );
}

const META: Record<
  MissionCreateKind,
  { title: string; formId: string; subtitle: (churchLead: boolean) => string }
> = {
  PROGRAM: {
    title: 'Create program',
    formId: 'mission-create-program',
    subtitle: (churchLead) =>
      churchLead
        ? 'Church leaders create as ACTIVE. Others start as draft for approval.'
        : 'Saved as a draft — submit later for Church Leader approval.',
  },
  PROJECT: {
    title: 'Create project',
    formId: 'mission-create-project',
    subtitle: () =>
      'Finite initiatives with an optional lead, programme link, and budget vault.',
  },
  EVENT: {
    title: 'Create event',
    formId: 'mission-create-event',
    subtitle: () =>
      'Public or ministry gatherings — schedule, registration, and optional spend link.',
  },
  TASK: {
    title: 'Create task',
    formId: 'mission-create-task',
    subtitle: () =>
      'Assign work with a primary owner, optional helper, and optional parent context.',
  },
};

export function MissionCreateDrawer({
  kind,
  open,
  onClose,
  listSource: _listSource,
  ownerSystemId = 'sys-main',
  accountPersonId,
  canManage,
  isChurchLeader: churchLead,
  onCreated,
}: {
  kind: MissionCreateKind;
  open: boolean;
  onClose: () => void;
  /** From use*List hooks — when 'api', prefer HTTP create. */
  listSource: 'api' | 'seed';
  ownerSystemId?: SystemId;
  accountPersonId: string;
  canManage: boolean;
  isChurchLeader: boolean;
  onCreated: (result: MissionCreateResult) => void;
}) {
  void _listSource;
  const { push: toast } = useToast();
  const meta = META[kind];
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Shared
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [vis, setVis] = useState<MissionVisibility>('CHURCH');

  // Program
  const [ptype, setPtype] = useState<ProgramType>('CLASS');
  const [parentId, setParentId] = useState('');
  const [cohort, setCohort] = useState('');
  const [hint, setHint] = useState('');

  // Project
  const [leadId, setLeadId] = useState('');
  const [beyond, setBeyond] = useState(false);
  const [willSpend, setWillSpend] = useState(false);
  const [fundId, setFundId] = useState('');
  const [collabSys, setCollabSys] = useState<SystemId | ''>('');
  const [programId, setProgramId] = useState('');
  const [fastTrack, setFastTrack] = useState(false);

  // Event
  const [etype, setEtype] = useState<ChurchEventType>('OTHER');
  const [regMode, setRegMode] =
    useState<EventRegistrationMode>('ANNOUNCEMENT_ONLY');
  const [capacity, setCapacity] = useState('50');
  const [startsAt, setStartsAt] = useState(defaultEventStarts);
  const [location, setLocation] = useState('');
  const [projectId, setProjectId] = useState('');
  const [plannedCost, setPlannedCost] = useState('');

  // Task
  const [ownerId, setOwnerId] = useState(accountPersonId);
  const [helperId, setHelperId] = useState('');
  const [dueDate, setDueDate] = useState(defaultTaskDue);
  const [ctxType, setCtxType] = useState<TaskContextType>('NONE');
  const [ctxId, setCtxId] = useState('');
  const [grantAccess, setGrantAccess] = useState(false);

  const people = useMemo(() => peopleService.list(), [open]);
  const standingPrograms = useMemo(
    () =>
      missionService
        .listPrograms({ viewerSystemId: ownerSystemId })
        .filter((p) => !p.parentProgramId && p.status === 'ACTIVE'),
    [open, ownerSystemId],
  );
  const allPrograms = useMemo(
    () =>
      missionService
        .listPrograms({ viewerSystemId: ownerSystemId })
        .filter((p) => !p.parentProgramId),
    [open, ownerSystemId],
  );
  const peerSystems = useMemo(
    () => systemsService.list().filter((s) => s.id !== ownerSystemId),
    [open, ownerSystemId],
  );
  const funds = useMemo(
    () =>
      financeService.listAllFunds().filter(
        (f) =>
          f.status === 'ACTIVE' &&
          (f.kind === 'PROJECT' ||
            f.kind === 'GENERAL' ||
            f.ownerSystemId === ownerSystemId),
      ),
    [open, ownerSystemId],
  );
  const projects = useMemo(
    () => missionService.listProjects({ viewerSystemId: ownerSystemId }),
    [open, ownerSystemId],
  );
  const events = useMemo(
    () => missionService.listEvents({ viewerSystemId: ownerSystemId }),
    [open, ownerSystemId],
  );

  useEffect(() => {
    if (!open) return;
    setFormError('');
    setFieldErrors({});
    setBusy(false);
    setName('');
    setDesc('');
    setVis('CHURCH');
    setPtype('CLASS');
    setParentId('');
    setCohort('');
    setHint('');
    setLeadId('');
    setBeyond(false);
    setWillSpend(false);
    setFundId('');
    setCollabSys('');
    setProgramId('');
    setFastTrack(false);
    setEtype('OTHER');
    setRegMode('ANNOUNCEMENT_ONLY');
    setCapacity('50');
    setStartsAt(defaultEventStarts());
    setLocation('');
    setProjectId('');
    setPlannedCost('');
    setOwnerId(accountPersonId);
    setHelperId('');
    setDueDate(defaultTaskDue());
    setCtxType('NONE');
    setCtxId('');
    setGrantAccess(false);
  }, [open, kind, accountPersonId]);

  function clearField(key: string) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function close() {
    if (busy) return;
    onClose();
  }

  function submitLabel() {
    if (kind === 'PROGRAM') {
      return churchLead ? 'Create & activate' : 'Create draft';
    }
    if (kind === 'PROJECT') {
      return churchLead && fastTrack && !beyond
        ? 'Create & activate'
        : 'Create draft';
    }
    if (kind === 'EVENT') {
      return beyond ? 'Create (pending approval)' : 'Create event';
    }
    return 'Create task';
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManage || busy) return;
    setFormError('');
    const errs: Record<string, string> = {};
    const trimmed = name.trim();

    if (kind === 'PROGRAM' || kind === 'PROJECT' || kind === 'EVENT') {
      if (!trimmed) errs.name = 'Name is required.';
    }
    if (kind === 'PROJECT' && willSpend && !fundId) {
      errs.fund = 'Choose a fund when the project will spend.';
    }
    if (kind === 'EVENT') {
      if (!startsAt) errs.startsAt = 'Start date and time are required.';
      const planned = plannedCost ? Number(plannedCost) : undefined;
      const spendGate = eventSpendPolicyOk({
        willSpend,
        projectId: projectId || undefined,
        plannedCost: planned,
      });
      if (!spendGate.ok) {
        errs.cost = spendGate.reason ?? 'Spend policy failed';
      }
    }
    if (kind === 'TASK') {
      if (!trimmed) errs.title = 'Title is required.';
      if (!ownerId) errs.owner = 'Choose a primary assignee.';
      if (ctxType !== 'NONE' && !ctxId) {
        errs.context = `Pick the ${ctxType.toLowerCase()} this task belongs to.`;
      }
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setBusy(true);

    try {
      let result: MissionCreateResult | null = null;

      if (kind === 'PROGRAM') {
        const r = await writeCreateProgram({
          name: trimmed,
          description: desc.trim() || trimmed,
          ownerSystemId,
          visibility: vis,
          programType: ptype,
          scheduleHint: hint.trim() || undefined,
          parentProgramId: parentId || undefined,
          cohortLabel: cohort.trim() || undefined,
          createdByPersonId: accountPersonId,
          startActive: churchLead,
        });
        if (!r.ok || !r.program) {
          setFormError(r.reason ?? 'Create failed');
          return;
        }
        result = {
          kind,
          id: r.program.id,
          name: r.program.name,
          message: churchLead
            ? `Created & active: ${r.program.name}`
            : `Draft created: ${r.program.name} — submit for Church Leader approval`,
          toastTitle: churchLead ? 'Program active' : 'Draft created',
        };
      }

      if (kind === 'PROJECT') {
        const startActive = churchLead && fastTrack && !beyond;
        const r = await writeCreateProject({
          name: trimmed,
          description: desc.trim() || undefined,
          ownerSystemId,
          visibility: vis,
          leadPersonId: leadId || undefined,
          beyondOwnerScope: beyond,
          willSpend,
          fundId: willSpend ? fundId || undefined : undefined,
          collaboratorSystemIds: collabSys
            ? ([collabSys] as SystemId[])
            : undefined,
          programId: programId || undefined,
          createdByPersonId: accountPersonId,
          startActive,
        });
        if (!r.ok || !r.project) {
          setFormError(r.reason ?? 'Create failed');
          return;
        }
        result = {
          kind,
          id: r.project.id,
          name: r.project.name,
          message:
            r.project.status === 'ACTIVE'
              ? `Created ${r.project.name} — fast-track ACTIVE`
              : `Draft created: ${r.project.name} — submit when ready${
                  beyond ? ' (beyond-scope approvals after submit)' : ''
                }`,
          toastTitle:
            r.project.status === 'ACTIVE' ? 'Project active' : 'Draft created',
        };
      }

      if (kind === 'EVENT') {
        const planned = plannedCost ? Number(plannedCost) : undefined;
        const r = await writeCreateEvent({
          name: trimmed,
          type: etype,
          ownerSystemId,
          startsAt: new Date(startsAt).toISOString(),
          location: location.trim() || undefined,
          description: desc.trim() || undefined,
          visibility: vis,
          registrationMode: regMode,
          capacity:
            regMode === 'REGISTRATION_REQUIRED'
              ? Number(capacity) || undefined
              : undefined,
          beyondOwnerScope: beyond,
          projectId: projectId || undefined,
          willSpend,
          plannedCost: planned,
          createdByPersonId: accountPersonId,
        });
        if (!r.ok || !r.event) {
          setFormError(r.reason ?? 'Create failed');
          return;
        }
        result = {
          kind,
          id: r.event.id,
          name: r.event.name,
          message: beyond
            ? `Created ${r.event.name} — pending upper approvals`
            : `Created ${r.event.name} — confirmed (in-scope)`,
          toastTitle: beyond ? 'Event pending approval' : 'Event confirmed',
        };
      }

      if (kind === 'TASK') {
        let contextLabel: string | undefined;
        if (ctxType === 'PROGRAM' && ctxId) {
          contextLabel = missionService
            .listPrograms({ viewerSystemId: ownerSystemId })
            .find((p) => p.id === ctxId)?.name;
        } else if (ctxType === 'EVENT' && ctxId) {
          contextLabel = events.find((ev) => ev.id === ctxId)?.name;
        } else if (ctxType === 'PROJECT' && ctxId) {
          contextLabel = projects.find((p) => p.id === ctxId)?.name;
        }
        const r = await writeCreateTask({
          title: trimmed,
          description: desc.trim() || undefined,
          ownerPersonId: ownerId,
          helperPersonIds: helperId ? [helperId] : undefined,
          systemId: ownerSystemId,
          visibility: vis,
          contextType: ctxType,
          contextId: ctxType === 'NONE' ? undefined : ctxId || undefined,
          contextLabel,
          dueDate: dueDate || undefined,
          grantsSystemAccess: grantAccess,
          createdByPersonId: accountPersonId,
        });
        if (!r.ok || !r.task) {
          setFormError(r.reason ?? 'Create failed');
          return;
        }
        result = {
          kind,
          id: r.task.id,
          name: r.task.title,
          message: grantAccess
            ? `Created ${r.task.title} — opens a ministry for the assignee until closed`
            : `Created ${r.task.title}`,
          toastTitle: 'Task created',
        };
      }

      if (!result) {
        setFormError('Create failed');
        return;
      }
      toast({
        title: result.toastTitle,
        detail: result.name,
        tone: 'success',
      });
      onClose();
      onCreated(result);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      title={meta.title}
      subtitle={meta.subtitle(churchLead)}
      onClose={close}
      wide
      footer={
        <CreateFormActions
          formId={meta.formId}
          onCancel={close}
          submitLabel={submitLabel()}
          busy={busy}
          disabled={!canManage}
        />
      }
    >
      <form id={meta.formId} className="stack" onSubmit={onSubmit}>
        {formError ? (
          <p className="create-form-error" role="alert">
            {formError}
          </p>
        ) : null}

        {kind === 'PROGRAM' && (
          <>
            <CreateFormSection
              title="Basics"
              hint="Name and type show on lists and calendars."
            >
              <TextField
                label="Name"
                name="prog-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearField('name');
                }}
                placeholder="e.g. Baptism class · Fall 2026"
                error={fieldErrors.name}
                required
                autoComplete="off"
              />
              <SelectField
                label="Type"
                name="prog-type"
                value={ptype}
                onChange={(e) => setPtype(e.target.value as ProgramType)}
                hint="Helps people find the right kind of programme."
              >
                <option value="CLASS">Class</option>
                <option value="SMALL_GROUP">Small group</option>
                <option value="FELLOWSHIP">Fellowship</option>
                <option value="DISCIPLESHIP">Discipleship</option>
                <option value="SERVING_TEAM">Serving team</option>
                <option value="OTHER">Other</option>
              </SelectField>
              <TextAreaField
                label="Description"
                name="prog-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                placeholder="Who it’s for and what happens"
                hint="Optional — defaults to the name if left blank."
              />
            </CreateFormSection>
            <CreateFormSection
              title="Placement"
              hint="Standing programmes can spawn timed cohorts."
            >
              <SelectField
                label="Standing parent"
                name="prog-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                hint="Leave empty to create a new standing programme."
              >
                <option value="">— New standing programme —</option>
                {standingPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Cohort label"
                name="prog-cohort"
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
                placeholder="2026 Q3"
                hint="Useful when this is a run under a standing parent."
              />
              <TextField
                label="Schedule hint"
                name="prog-hint"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Sundays 10:00 · Room B"
              />
              <VisibilityField
                name="prog-vis"
                value={vis}
                onChange={setVis}
                privateLabel="Main private"
              />
            </CreateFormSection>
          </>
        )}

        {kind === 'PROJECT' && (
          <>
            <CreateFormSection title="Basics">
              <TextField
                label="Name"
                name="proj-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearField('name');
                }}
                placeholder="e.g. Youth camp logistics"
                error={fieldErrors.name}
                required
                autoComplete="off"
              />
              <SelectField
                label="Lead"
                name="proj-lead"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                hint="Recommended — primary owner of delivery."
              >
                <option value="">None yet</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.preferredName ?? p.fullName}
                  </option>
                ))}
              </SelectField>
              <TextAreaField
                label="Description"
                name="proj-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                placeholder="Outcome and scope in a few lines"
              />
            </CreateFormSection>
            <CreateFormSection
              title="Links & visibility"
              hint="Optional ties to programmes and peer systems."
            >
              <SelectField
                label="Parent programme"
                name="proj-program"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
              >
                <option value="">None</option>
                {allPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Collaborating system"
                name="proj-collab"
                value={collabSys}
                onChange={(e) => setCollabSys(e.target.value as SystemId | '')}
              >
                <option value="">None</option>
                {peerSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName}
                  </option>
                ))}
              </SelectField>
              <VisibilityField name="proj-vis" value={vis} onChange={setVis} />
            </CreateFormSection>
            <CreateFormSection title="Approvals & money">
              <CheckboxField
                label="Beyond owner scope (needs upper approvals)"
                checked={beyond}
                onChange={(v) => {
                  setBeyond(v);
                  if (v) setFastTrack(false);
                }}
              />
              {churchLead && !beyond && (
                <CheckboxField
                  label="Fast-track ACTIVE (Church Leader only)"
                  checked={fastTrack}
                  onChange={setFastTrack}
                />
              )}
              <CheckboxField
                label="Will spend / has budget"
                checked={willSpend}
                onChange={(v) => {
                  setWillSpend(v);
                  if (!v) {
                    setFundId('');
                    clearField('fund');
                  }
                }}
              />
              {willSpend && (
                <SelectField
                  label="Fund"
                  name="proj-fund"
                  value={fundId}
                  onChange={(e) => {
                    setFundId(e.target.value);
                    clearField('fund');
                  }}
                  required
                  error={fieldErrors.fund}
                  hint="Spending still needs a Treasurer FundAccessGrant on the vault."
                >
                  <option value="">Select fund…</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </option>
                  ))}
                </SelectField>
              )}
            </CreateFormSection>
          </>
        )}

        {kind === 'EVENT' && (
          <>
            <CreateFormSection title="Basics">
              <TextField
                label="Name"
                name="event-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearField('name');
                }}
                placeholder="e.g. Leaders seminar"
                error={fieldErrors.name}
                required
                autoComplete="off"
              />
              <SelectField
                label="Type"
                name="event-type"
                value={etype}
                onChange={(e) => setEtype(e.target.value as ChurchEventType)}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {eventTypeLabel(t)}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Starts"
                name="event-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => {
                  setStartsAt(e.target.value);
                  clearField('startsAt');
                }}
                error={fieldErrors.startsAt}
                required
              />
              <TextField
                label="Location"
                name="event-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Main sanctuary · Hall B"
              />
              <TextAreaField
                label="Description"
                name="event-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
              />
            </CreateFormSection>
            <CreateFormSection title="Attendance">
              <SelectField
                label="Registration mode"
                name="event-reg"
                value={regMode}
                onChange={(e) =>
                  setRegMode(e.target.value as EventRegistrationMode)
                }
              >
                <option value="ANNOUNCEMENT_ONLY">Announcement only</option>
                <option value="REGISTRATION_REQUIRED">
                  Registration required
                </option>
              </SelectField>
              {regMode === 'REGISTRATION_REQUIRED' && (
                <TextField
                  label="Capacity"
                  name="event-capacity"
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  hint="Leave blank only if capacity is open-ended."
                />
              )}
              <VisibilityField name="event-vis" value={vis} onChange={setVis} />
            </CreateFormSection>
            <CreateFormSection
              title="Project & spend"
              hint="Linking a project covers spend policy; otherwise set a planned cost."
            >
              <SelectField
                label="Link to project"
                name="event-project"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  clearField('cost');
                }}
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
              <CheckboxField
                label="Will spend"
                checked={willSpend}
                onChange={(v) => {
                  setWillSpend(v);
                  if (!v) {
                    setPlannedCost('');
                    clearField('cost');
                  }
                }}
              />
              {willSpend && !projectId && (
                <TextField
                  label="Planned cost (RWF)"
                  name="event-cost"
                  type="number"
                  min={1}
                  value={plannedCost}
                  onChange={(e) => {
                    setPlannedCost(e.target.value);
                    clearField('cost');
                  }}
                  error={fieldErrors.cost}
                  required
                />
              )}
              {fieldErrors.cost && (projectId || !willSpend) ? (
                <p className="create-form-error" role="alert">
                  {fieldErrors.cost}
                </p>
              ) : null}
              <CheckboxField
                label="Beyond owner scope (needs upper approvals)"
                checked={beyond}
                onChange={setBeyond}
              />
            </CreateFormSection>
          </>
        )}

        {kind === 'TASK' && (
          <>
            <CreateFormSection title="Work">
              <TextField
                label="Title"
                name="task-title"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearField('title');
                }}
                placeholder="Verb + object — e.g. Review baptism candidates"
                error={fieldErrors.title}
                required
                autoComplete="off"
              />
              <TextAreaField
                label="Description"
                name="task-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                placeholder="Definition of done, links, notes"
              />
              <TextField
                label="Due"
                name="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </CreateFormSection>
            <CreateFormSection title="People">
              <SelectField
                label="Primary assignee"
                name="task-owner"
                value={ownerId}
                onChange={(e) => {
                  setOwnerId(e.target.value);
                  clearField('owner');
                }}
                error={fieldErrors.owner}
                required
              >
                <option value="">Select person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.preferredName ?? p.fullName}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Helper"
                name="task-helper"
                value={helperId}
                onChange={(e) => setHelperId(e.target.value)}
                hint="Optional second Responsible person."
              >
                <option value="">None</option>
                {people
                  .filter((p) => p.id !== ownerId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.preferredName ?? p.fullName}
                    </option>
                  ))}
              </SelectField>
            </CreateFormSection>
            <CreateFormSection
              title="Context & access"
              hint="Link to a programme, event, or project when this task is not standalone."
            >
              <SelectField
                label="Context type"
                name="task-ctx"
                value={ctxType}
                onChange={(e) => {
                  setCtxType(e.target.value as TaskContextType);
                  setCtxId('');
                  clearField('context');
                }}
              >
                <option value="NONE">Standalone</option>
                <option value="PROGRAM">Program</option>
                <option value="EVENT">Event</option>
                <option value="PROJECT">Project</option>
              </SelectField>
              {ctxType === 'PROGRAM' && (
                <SelectField
                  label="Program"
                  name="task-ctx-id"
                  value={ctxId}
                  onChange={(e) => {
                    setCtxId(e.target.value);
                    clearField('context');
                  }}
                  error={fieldErrors.context}
                  required
                >
                  <option value="">Select programme…</option>
                  {missionService
                    .listPrograms({ viewerSystemId: ownerSystemId })
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </SelectField>
              )}
              {ctxType === 'EVENT' && (
                <SelectField
                  label="Event"
                  name="task-ctx-id"
                  value={ctxId}
                  onChange={(e) => {
                    setCtxId(e.target.value);
                    clearField('context');
                  }}
                  error={fieldErrors.context}
                  required
                >
                  <option value="">Select event…</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </SelectField>
              )}
              {ctxType === 'PROJECT' && (
                <SelectField
                  label="Project"
                  name="task-ctx-id"
                  value={ctxId}
                  onChange={(e) => {
                    setCtxId(e.target.value);
                    clearField('context');
                  }}
                  error={fieldErrors.context}
                  required
                >
                  <option value="">Select project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              )}
              <VisibilityField name="task-vis" value={vis} onChange={setVis} />
              <CheckboxField
                label="While open, let the assignee enter a ministry (temp access)"
                checked={grantAccess}
                onChange={setGrantAccess}
              />
            </CreateFormSection>
          </>
        )}
      </form>
    </Drawer>
  );
}
