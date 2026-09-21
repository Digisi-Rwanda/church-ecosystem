import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Drawer } from '../components/ui/Drawer';
import { SelectField } from '../components/ui/Field';
import { StatusPill } from '../components/ui/StatusPill';
import { isChurchLeader } from '../domain/churchLeadership';
import {
  MAIN_CHURCH_ADMIN_ORG_UNIT_ID,
  MAIN_CHURCH_SYSTEM_ID,
  activeSystemAdminPosition,
  canSeeSystemAdminNav,
  manageableSystemAdminSystemIds,
  systemAdminSystemIds,
} from '../domain/systemAdmin';
import type { SystemId } from '../domain/types';
import {
  buildPersonParticipationPlaces,
  participationService,
  peopleService,
  systemsService,
} from '../services';

/**
 * System Admin desk — presidents appoint peer admins; Leader appoints Main
 * Church admin and views peer appointments. Config posture only.
 */
export function SystemAdminPage() {
  const { account, positions, roles, can, refreshSession } = useAuth();
  const [, setTick] = useState(0);
  const refresh = () => {
    setTick((t) => t + 1);
    refreshSession();
  };

  const maySee = Boolean(
    account && canSeeSystemAdminNav(account.personId, positions, roles),
  );

  const peerSystems = useMemo(
    () =>
      systemsService
        .listActive()
        .filter((s) => s.kind !== 'MAIN' && s.id !== 'sys-finance'),
    [],
  );
  const peerIds = useMemo(
    () => peerSystems.map((s) => s.id),
    [peerSystems],
  );

  const manageableIds = useMemo(() => {
    if (!account) return [] as SystemId[];
    return manageableSystemAdminSystemIds(
      account.personId,
      positions,
      roles,
      peerIds,
    );
  }, [account, positions, roles, peerIds]);

  const myAdminIds = useMemo(
    () =>
      account ? systemAdminSystemIds(account.personId, positions) : [],
    [account, positions],
  );

  const allPositions = participationService.listPositions();

  const [selectedSystemId, setSelectedSystemId] = useState<SystemId | null>(
    null,
  );
  const [drawerMode, setDrawerMode] = useState<'appoint' | 'change' | null>(
    null,
  );
  const [pickPersonId, setPickPersonId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const selectedAdminPos = selectedSystemId
    ? activeSystemAdminPosition(selectedSystemId, allPositions)
    : null;
  const selectedAdminPerson = selectedAdminPos
    ? peopleService.getById(selectedAdminPos.personId)
    : null;
  const selectedAdminPlaces = selectedAdminPos
    ? buildPersonParticipationPlaces({
        memberships: participationService.activeMemberships(
          selectedAdminPos.personId,
        ),
        positions: participationService.activePositions(
          selectedAdminPos.personId,
        ),
        assignments: participationService.activeAssignments(
          selectedAdminPos.personId,
        ),
      })
    : [];

  const peopleOptions = useMemo(() => peopleService.list(), []);

  if (!account) return null;

  if (!maySee) {
    return (
      <div className="panel">
        <h1>System administration</h1>
        <p className="muted">
          Only Church Leader, ministry or organisation presidents, and
          appointed System Admins can open this desk.
        </p>
        <Link to="/" className="btn secondary">
          Home
        </Link>
      </div>
    );
  }

  const asLeader = isChurchLeader(roles);
  const canManageAny = manageableIds.length > 0;
  const drawerSystem = drawerMode
    ? systemsService.getById(
        (selectedSystemId ?? manageableIds[0]) as SystemId,
      )
    : null;

  function openAppoint(systemId: SystemId) {
    setSelectedSystemId(systemId);
    setPickPersonId('');
    setMsg(null);
    setDrawerMode('appoint');
  }

  function openChange(systemId: SystemId) {
    setSelectedSystemId(systemId);
    const current = activeSystemAdminPosition(systemId, allPositions);
    setPickPersonId(current?.personId ?? '');
    setMsg(null);
    setDrawerMode('change');
  }

  function selectSystem(systemId: SystemId) {
    setSelectedSystemId(systemId);
    setMsg(null);
  }

  function orgUnitForSystem(systemId: SystemId): string | null {
    const sys = systemsService.getById(systemId);
    if (sys?.orgUnitId) return sys.orgUnitId;
    if (systemId === MAIN_CHURCH_SYSTEM_ID) return MAIN_CHURCH_ADMIN_ORG_UNIT_ID;
    return null;
  }

  function appointOrChange(e: FormEvent) {
    e.preventDefault();
    const systemId = selectedSystemId;
    if (!systemId || !drawerMode) return;
    if (!manageableIds.includes(systemId)) {
      setMsg('You cannot appoint System Admin for this system.');
      return;
    }
    if (!pickPersonId) {
      setMsg('Choose a person.');
      return;
    }
    const sys = systemsService.getById(systemId);
    const orgUnitId = orgUnitForSystem(systemId);
    if (!orgUnitId) {
      setMsg('This system has no unit to attach the position to.');
      return;
    }
    const existing = activeSystemAdminPosition(systemId, allPositions);
    if (existing && existing.personId === pickPersonId) {
      setMsg('That person is already the System Admin.');
      return;
    }
    if (existing) {
      participationService.endPosition(existing.id);
    }
    const short = sys?.shortName || sys?.name || systemId;
    participationService.createPosition({
      personId: pickPersonId,
      title: `${short} System Admin`,
      orgUnitId,
      systemId,
      systemAdmin: true,
    });
    setMsg(
      existing
        ? `System Admin changed for ${short}.`
        : `System Admin appointed for ${short}.`,
    );
    setDrawerMode(null);
    setPickPersonId('');
    refresh();
  }

  function removeAdmin(systemId: SystemId) {
    if (!manageableIds.includes(systemId)) {
      setMsg('You cannot remove System Admin for this system.');
      return;
    }
    const existing = activeSystemAdminPosition(systemId, allPositions);
    if (!existing) {
      setMsg('No System Admin to remove.');
      return;
    }
    const sys = systemsService.getById(systemId);
    const name =
      peopleService.getById(existing.personId)?.preferredName ||
      peopleService.getById(existing.personId)?.fullName ||
      existing.personId;
    if (
      !window.confirm(
        `Remove ${name} as System Admin for ${sys?.shortName ?? systemId}?`,
      )
    ) {
      return;
    }
    participationService.endPosition(existing.id);
    setMsg(`Removed System Admin for ${sys?.shortName ?? systemId}.`);
    if (selectedSystemId === systemId) setSelectedSystemId(null);
    refresh();
  }

  function renderAdminDetail() {
    if (!selectedSystemId) return null;
    if (selectedAdminPos && selectedAdminPerson) {
      return (
        <div
          className="panel stack"
          style={{ margin: 0, background: 'var(--accent-soft)' }}
        >
          <div
            className="row"
            style={{
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <h3 style={{ margin: 0 }}>
              {selectedAdminPerson.preferredName ||
                selectedAdminPerson.fullName}
            </h3>
            <Link
              className="btn ghost"
              to={`/people/${selectedAdminPerson.id}`}
            >
              Open profile
            </Link>
          </div>
          <div>
            <p style={{ marginTop: 0 }}>
              Full name: {selectedAdminPerson.fullName}
            </p>
            <p>Phone: {selectedAdminPerson.phone ?? '—'}</p>
            <p style={{ marginBottom: 0 }}>
              Email: {selectedAdminPerson.email ?? '—'}
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: '0.35rem' }}>Participation</h4>
            {selectedAdminPlaces.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No memberships, positions, or assignments on file.
              </p>
            ) : (
              <ul
                className="stack"
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  gap: '0.5rem',
                }}
              >
                {selectedAdminPlaces.map((place) => (
                  <li key={place.key}>
                    <strong>{place.placeName}</strong>
                    {place.roles.length > 0 ? (
                      <div
                        className="muted"
                        style={{ fontSize: '0.85rem' }}
                      >
                        {place.roles.join(' · ')}
                      </div>
                    ) : null}
                    <ul
                      style={{
                        margin: '0.25rem 0 0',
                        paddingLeft: '1.1rem',
                      }}
                    >
                      {place.lines.map((line) => (
                        <li key={line} style={{ fontSize: '0.9rem' }}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }
    if (manageableIds.includes(selectedSystemId)) {
      return (
        <p className="muted" style={{ margin: 0 }}>
          Select Appoint to name a System Admin for{' '}
          {systemsService.getById(selectedSystemId)?.shortName ??
            selectedSystemId}
          .
        </p>
      );
    }
    return (
      <p className="muted" style={{ margin: 0 }}>
        No System Admin appointed for{' '}
        {systemsService.getById(selectedSystemId)?.shortName ??
          selectedSystemId}
        . The ministry or organisation president appoints this seat.
      </p>
    );
  }

  function renderSystemRow(
    id: SystemId,
    opts: { canAppoint: boolean },
  ) {
    const sys = systemsService.getById(id);
    const adminPos = activeSystemAdminPosition(id, allPositions);
    const admin = adminPos
      ? peopleService.getById(adminPos.personId)
      : null;
    const adminName = admin?.preferredName || admin?.fullName || null;
    const selected = selectedSystemId === id;
    return (
      <li
        key={id}
        className="panel"
        style={{
          margin: 0,
          borderColor: selected ? 'var(--accent)' : undefined,
          background: selected
            ? 'var(--surface-raised, var(--bg))'
            : undefined,
        }}
      >
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            className="btn ghost"
            style={{
              textAlign: 'left',
              padding: 0,
              height: 'auto',
              flex: '1 1 12rem',
            }}
            onClick={() => selectSystem(id)}
          >
            <strong>{sys?.name ?? id}</strong>
            <div
              className="muted"
              style={{ fontSize: '0.85rem', fontWeight: 400 }}
            >
              {adminName
                ? `Admin: ${adminName}`
                : 'No System Admin appointed'}
              {adminPos ? ` · since ${adminPos.startDate}` : ''}
            </div>
          </button>
          <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            {adminPos ? (
              <StatusPill tone="info">Appointed</StatusPill>
            ) : (
              <StatusPill tone="warn">Vacant</StatusPill>
            )}
            {opts.canAppoint ? (
              adminPos ? (
                <>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => openChange(id)}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => removeAdmin(id)}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => openAppoint(id)}
                >
                  Appoint
                </button>
              )
            ) : null}
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="stack">
      <div className="panel" style={{ background: 'var(--accent-soft)' }}>
        <h1 style={{ marginTop: 0 }}>System administration</h1>
        <p style={{ marginBottom: 0 }}>
          System Admin configures software — accounts, invites, role plumbing.
          It does not unlock finance ledgers, sacraments, or discipline.
          {asLeader
            ? ' You appoint the Main Church System Admin. Peer ministry and organisation admins are appointed by their presidents; you can see who holds each seat.'
            : ' Presidents appoint the System Admin for their own system.'}
        </p>
      </div>

      {msg ? (
        <div className="panel" role="status">
          {msg}
        </div>
      ) : null}

      {asLeader ? (
        <section className="panel stack">
          <div>
            <h2 style={{ marginTop: 0 }}>Main Church System Admin</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Appoint, change, or remove the Main Church System Admin. Select
              the row for contact details and participation.
            </p>
          </div>
          <ul
            className="stack"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {renderSystemRow(MAIN_CHURCH_SYSTEM_ID, { canAppoint: true })}
          </ul>
          {selectedSystemId === MAIN_CHURCH_SYSTEM_ID
            ? renderAdminDetail()
            : null}
        </section>
      ) : null}

      {asLeader ? (
        <section className="panel stack">
          <div>
            <h2 style={{ marginTop: 0 }}>Peer System Admins</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              View only — each ministry or organisation president appoints
              their own System Admin. Select a row to see who is appointed.
            </p>
          </div>
          <ul
            className="stack"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {peerIds.map((id) =>
              renderSystemRow(id, { canAppoint: false }),
            )}
          </ul>
          {selectedSystemId &&
          selectedSystemId !== MAIN_CHURCH_SYSTEM_ID
            ? renderAdminDetail()
            : null}
        </section>
      ) : null}

      {!asLeader && canManageAny ? (
        <section className="panel stack">
          <div>
            <h2 style={{ marginTop: 0 }}>Appointments</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Appoint, change, or remove the System Admin for systems you
              preside. Select a row to see their contact details and
              participation.
            </p>
          </div>
          <ul
            className="stack"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {manageableIds.map((id) =>
              renderSystemRow(id, { canAppoint: true }),
            )}
          </ul>
          {selectedSystemId && manageableIds.includes(selectedSystemId)
            ? renderAdminDetail()
            : null}
        </section>
      ) : null}

      {myAdminIds.length > 0 ? (
        <section className="stack">
          <h2 style={{ margin: 0 }}>Systems you administer</h2>
          <ul
            className="stack"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {myAdminIds.map((id) => {
              const sys = systemsService.getById(id);
              const configOk = can('SYSTEM_CONFIG', 'MANAGE', id);
              return (
                <li
                  key={id}
                  className="panel row"
                  style={{ justifyContent: 'space-between' }}
                >
                  <div>
                    <strong>{sys?.name ?? id}</strong>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      Config grant:{' '}
                      {configOk
                        ? 'active'
                        : 'missing — ask Church Leader or your president'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <StatusPill tone="info">System Admin</StatusPill>
                    <Link className="btn ghost" to="/systems">
                      Open systems
                    </Link>
                    <Link className="btn ghost" to="/participation">
                      Participation
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : !canManageAny && !asLeader ? (
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>
            You are not personally appointed as System Admin yet, and you do
            not hold a president seat that can appoint one.
          </p>
        </div>
      ) : null}

      <Drawer
        open={drawerMode !== null}
        title={
          drawerMode === 'change'
            ? 'Change System Admin'
            : 'Appoint System Admin'
        }
        subtitle={drawerSystem?.name}
        onClose={() => {
          setDrawerMode(null);
          setPickPersonId('');
        }}
        footer={
          <div
            className="row"
            style={{ gap: '0.5rem', justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setDrawerMode(null);
                setPickPersonId('');
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="sysadmin-appoint-form"
              className="btn"
              disabled={!pickPersonId}
            >
              {drawerMode === 'change' ? 'Save change' : 'Appoint'}
            </button>
          </div>
        }
      >
        <form id="sysadmin-appoint-form" onSubmit={appointOrChange}>
          <SelectField
            label="Person"
            name="personId"
            value={pickPersonId}
            onChange={(e) => setPickPersonId(e.target.value)}
            required
            hint="Tool configuration only — does not grant ledgers or pastoral dumps."
          >
            <option value="">Select person…</option>
            {peopleOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.preferredName || p.fullName}
              </option>
            ))}
          </SelectField>
        </form>
      </Drawer>
    </div>
  );
}
