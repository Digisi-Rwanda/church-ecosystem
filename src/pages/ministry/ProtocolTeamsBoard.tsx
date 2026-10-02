import { useMemo, useState } from 'react';
import { Drawer } from '../../components/ui/Drawer';
import { useToast } from '../../components/ui/Toast';
import type { ProtocolService, ProtocolTeamRole } from '../../domain/types';
import { protocolService } from '../../services';

const KIND_LABEL: Record<string, string> = {
  SS1: 'Sunday Service 1',
  SS2: 'Sunday Service 2',
  TUESDAY: 'Tuesday service',
  IGABURO: 'Igaburo',
  FRIDAY: 'Friday service',
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d));
  return { dow: DOW[dt.getUTCDay()]!, day: d!, mon: MON[m! - 1]! };
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? (p[p.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

const roleName = (r: ProtocolTeamRole) =>
  r === 'TEAM_LEADER' ? 'Team Leader' : r === 'VICE_LEADER' ? 'Vice Team Leader' : 'Member';

function Avatar({ name, tone }: { name: string; tone?: 'lead' }) {
  return (
    <span className={`avatar-dot${tone === 'lead' ? ' lead' : ''}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Teams for every service of the selected month, with a person panel on click. */
export function ProtocolTeamsBoard({
  services,
  monthKey,
  tick,
  refresh,
  canManage,
  teamsEditable,
  actorPersonId,
}: {
  services: ProtocolService[];
  monthKey: string;
  tick: number;
  refresh: () => void;
  canManage: boolean;
  teamsEditable: boolean;
  actorPersonId?: string;
}) {
  const { push } = useToast();
  const [open, setOpen] = useState<{ serviceId: string; personId: string } | null>(null);
  const [replaceWith, setReplaceWith] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [addPick, setAddPick] = useState<Record<string, string>>({});

  const load = useMemo(
    () => new Map(protocolService.dutyLoad(monthKey).map((r) => [r.personId, r.count])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, tick],
  );
  const target = protocolService.rules().preferTarget;
  const nameOf = (id: string) => protocolService.personLabel(id);
  const done = (title: string, ok: boolean, detail?: string) =>
    push({ title, detail, tone: ok ? (detail ? 'warn' : 'success') : 'danger' });

  function close() {
    setOpen(null);
    setReplaceWith('');
    setConfirmRemove(false);
  }

  const openSvc = open ? protocolService.getService(open.serviceId) : null;
  const panel = open && openSvc ? open : null;
  const participation = panel
    ? protocolService.personParticipation(panel.personId, monthKey)
    : null;
  const panelSlot = panel
    ? protocolService.teamForService(panel.serviceId).find((s) => s.personId === panel.personId)
    : undefined;
  const eligible = panel ? protocolService.eligibleForServiceTeam(panel.serviceId) : [];
  const canEdit = canManage && teamsEditable && !!actorPersonId;

  if (services.length === 0) {
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Teams by service</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          No services for this month yet. Once Music confirms it, build the teams from the months table above.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Teams by service</h3>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          Click a name to see their participation{canManage ? ', replace or remove them' : ''}.
        </span>
      </div>

      <div className="svc-grid">
        {services.map((svc) => {
          const team = protocolService.teamForService(svc.id);
          const staff = team.filter((s) => s.slotKind !== 'FILL_IN');
          const fillIns = team.filter((s) => s.slotKind === 'FILL_IN');
          const leaders = protocolService.leadersOf(svc.id);
          const d = dateParts(svc.date);
          const pct = Math.min(100, Math.round((staff.length / (svc.targetTeamSize || 1)) * 100));
          const needsApproval =
            leaders.teamLeader?.status === 'RECOMMENDED' || leaders.viceLeader?.status === 'RECOMMENDED';
          const leaderIds = new Set(
            [leaders.teamLeader?.personId, leaders.viceLeader?.personId].filter(Boolean) as string[],
          );
          const others = team.filter((s) => !leaderIds.has(s.personId));
          const slots = [
            { label: 'Team Leader', lead: leaders.teamLeader },
            { label: 'Vice Team Leader', lead: leaders.viceLeader },
          ];
          const addable = protocolService.eligibleForServiceTeam(svc.id);
          return (
            <article key={svc.id} className="svc-card">
              <header className="svc-head">
                <div className="svc-date" aria-label={svc.date}>
                  <span className="svc-dow">{d.dow}</span>
                  <span className="svc-day">{d.day}</span>
                  <span className="svc-mon">{d.mon}</span>
                </div>
                <div className="svc-title">
                  <strong>{KIND_LABEL[svc.kind] ?? svc.kind}</strong>
                  <span className="muted">{svc.kind}</span>
                </div>
                <div className="svc-count" title={`${staff.length} of ${svc.targetTeamSize} places filled`}>
                  <span className={staff.length < svc.targetTeamSize ? 'short' : ''}>
                    {staff.length}/{svc.targetTeamSize}
                  </span>
                  <span className="svc-bar">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                </div>
              </header>

              <div className="svc-leaders">
                {slots.map(({ label, lead }) => (
                  <button
                    key={label}
                    type="button"
                    className={`leader-slot${lead ? '' : ' empty'}`}
                    disabled={!lead}
                    onClick={() => lead && setOpen({ serviceId: svc.id, personId: lead.personId })}
                  >
                    <span className="leader-role">{label}</span>
                    {lead ? (
                      <span className="leader-person">
                        <Avatar name={nameOf(lead.personId)} tone="lead" />
                        <span className="leader-name">{nameOf(lead.personId)}</span>
                        <span className={`pill ${lead.status === 'APPROVED' ? 'ok' : 'warn'}`}>
                          {lead.status === 'APPROVED' ? 'Approved' : 'Recommended'}
                        </span>
                      </span>
                    ) : (
                      <span className="muted">Not set</span>
                    )}
                  </button>
                ))}
              </div>

              <ul className="member-chips">
                {others.map((slot) => (
                  <li key={slot.id}>
                    <button
                      type="button"
                      className="member-chip"
                      onClick={() => setOpen({ serviceId: svc.id, personId: slot.personId })}
                    >
                      <Avatar name={nameOf(slot.personId)} />
                      <span>{nameOf(slot.personId)}</span>
                      {slot.slotKind === 'EXTRA' && <span className="pill warn">Extra</span>}
                      {slot.slotKind === 'FILL_IN' && <span className="pill">Fill-in</span>}
                    </button>
                  </li>
                ))}
                {others.length === 0 && staff.length === 0 && (
                  <li className="muted">No team yet. Build the teams first.</li>
                )}
              </ul>
              {fillIns.length > 0 && (
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                  {fillIns.length} fill-in{fillIns.length === 1 ? '' : 's'} included above.
                </p>
              )}

              {canEdit && (needsApproval || staff.length < svc.targetTeamSize) && (
                <footer className="svc-foot">
                  {needsApproval && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        const r = protocolService.approveLeaders(svc.id, actorPersonId!);
                        done(r.ok ? 'Leaders approved' : (r.reason ?? 'Could not approve'), r.ok);
                        refresh();
                      }}
                    >
                      Approve leaders
                    </button>
                  )}
                  {staff.length < svc.targetTeamSize && (
                    <span className="svc-add">
                      <select
                        aria-label="Add a member"
                        value={addPick[svc.id] ?? ''}
                        onChange={(e) => setAddPick((p) => ({ ...p, [svc.id]: e.target.value }))}
                      >
                        <option value="">Add a member…</option>
                        {addable.map((m) => (
                          <option key={m.id} value={m.personId}>
                            {nameOf(m.personId)} · {load.get(m.personId) ?? 0}/{target}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn secondary sm"
                        disabled={!addPick[svc.id]}
                        onClick={() => {
                          const r = protocolService.addTeamMember(svc.id, addPick[svc.id]!, actorPersonId!);
                          done(r.ok ? 'Member added' : (r.reason ?? 'Could not add'), r.ok);
                          setAddPick((p) => ({ ...p, [svc.id]: '' }));
                          refresh();
                        }}
                      >
                        Add
                      </button>
                    </span>
                  )}
                </footer>
              )}
            </article>
          );
        })}
      </div>

      <Drawer
        open={!!panel}
        title={participation?.name ?? ''}
        subtitle={
          panel && openSvc
            ? `${KIND_LABEL[openSvc.kind] ?? openSvc.kind} · ${openSvc.date}`
            : undefined
        }
        onClose={close}
        footer={
          <button type="button" className="btn ghost" onClick={close}>
            Close
          </button>
        }
      >
        {panel && participation && openSvc && (
          <div className="stack">
            <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
              {panelSlot && panelSlot.role !== 'MEMBER' && (
                <span className="pill ok">{roleName(panelSlot.role)}</span>
              )}
              {panelSlot?.slotKind === 'EXTRA' && <span className="pill warn">Extra duty</span>}
              {participation.office && participation.office !== 'MEMBER' && (
                <span className="pill">{protocolService.officeLabel(participation.office)}</span>
              )}
            </div>

            <section>
              <h4 className="drawer-h">Participation</h4>
              <div className="stat-tiles">
                <div className="stat-tile">
                  <span className="stat-num">
                    {participation.officialThisMonth}/{participation.target}
                  </span>
                  <span className="stat-label">Duties this month</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-num">{participation.served}</span>
                  <span className="stat-label">Services served</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-num">{participation.fillIns}</span>
                  <span className="stat-label">Fill-ins</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-num">
                    {participation.rank ? `#${participation.rank}` : '—'}
                  </span>
                  <span className="stat-label">
                    Performance rank{participation.rank ? ` of ${participation.ranked}` : ''}
                  </span>
                </div>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
                Absent {participation.absent} · Excused {participation.excused} · Absence requests{' '}
                {participation.absenceRequests} · Led {participation.led} this month
              </p>
            </section>

            <section>
              <h4 className="drawer-h">This month&apos;s duties</h4>
              {participation.duties.length === 0 ? (
                <p className="muted">Not on any team this month.</p>
              ) : (
                <ul className="duty-list">
                  {participation.duties.map((du) => (
                    <li key={du.serviceId} className={du.serviceId === panel.serviceId ? 'here' : ''}>
                      <span>
                        {dateParts(du.date).dow} {dateParts(du.date).day} {dateParts(du.date).mon} ·{' '}
                        {KIND_LABEL[du.kind] ?? du.kind}
                      </span>
                      <span className="row" style={{ gap: '0.3rem' }}>
                        {du.role !== 'MEMBER' && <span className="pill ok">{du.role === 'TEAM_LEADER' ? 'TL' : 'VTL'}</span>}
                        {du.slotKind === 'EXTRA' && <span className="pill warn">Extra</span>}
                        {du.slotKind === 'FILL_IN' && <span className="pill">Fill-in</span>}
                        {du.attendance && <span className="pill">{du.attendance.replace('_', ' ').toLowerCase()}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {canManage && (
              <section>
                <h4 className="drawer-h">Change this team</h4>
                {!teamsEditable ? (
                  <p className="muted">
                    This month is with the President or already published. Withdraw or reopen it to change teams.
                  </p>
                ) : (
                  <div className="stack">
                    <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                      {(['TEAM_LEADER', 'VICE_LEADER'] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          className="btn secondary sm"
                          disabled={panelSlot?.role === role}
                          onClick={() => {
                            const r = protocolService.setTeamRole(panel.serviceId, panel.personId, role, actorPersonId!);
                            done(r.ok ? `${participation.name} is now ${roleName(role)}` : (r.reason ?? 'Failed'), r.ok);
                            refresh();
                          }}
                        >
                          Make {roleName(role)}
                        </button>
                      ))}
                      {panelSlot && panelSlot.role !== 'MEMBER' && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => {
                            protocolService.setTeamRole(panel.serviceId, panel.personId, 'MEMBER', actorPersonId!);
                            protocolService.ensureLeaders(panel.serviceId);
                            done('Leadership removed', true);
                            refresh();
                          }}
                        >
                          Step down as leader
                        </button>
                      )}
                    </div>

                    <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                      <select
                        aria-label="Replace with"
                        value={replaceWith}
                        onChange={(e) => setReplaceWith(e.target.value)}
                        style={{ minWidth: '12rem' }}
                      >
                        <option value="">Replace with…</option>
                        {eligible.map((m) => (
                          <option key={m.id} value={m.personId}>
                            {nameOf(m.personId)} · {load.get(m.personId) ?? 0}/{target}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn secondary sm"
                        disabled={!replaceWith}
                        onClick={() => {
                          const r = protocolService.replaceTeamMember(
                            panel.serviceId,
                            panel.personId,
                            replaceWith,
                            actorPersonId!,
                          );
                          done(r.ok ? `Replaced with ${nameOf(replaceWith)}` : (r.reason ?? 'Failed'), r.ok);
                          if (r.ok) close();
                          refresh();
                        }}
                      >
                        Replace
                      </button>
                    </div>

                    {!confirmRemove ? (
                      <button type="button" className="btn danger-ghost sm" onClick={() => setConfirmRemove(true)}>
                        Remove from this team
                      </button>
                    ) : (
                      <div className="row" style={{ gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="muted">Remove {participation.name}? The team will be one short.</span>
                        <button
                          type="button"
                          className="btn danger sm"
                          onClick={() => {
                            const r = protocolService.removeTeamMember(panel.serviceId, panel.personId, actorPersonId!);
                            done(r.ok ? `${participation.name} removed` : (r.reason ?? 'Failed'), r.ok, r.ok ? r.reason : undefined);
                            if (r.ok) close();
                            refresh();
                          }}
                        >
                          Yes, remove
                        </button>
                        <button type="button" className="btn ghost sm" onClick={() => setConfirmRemove(false)}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
