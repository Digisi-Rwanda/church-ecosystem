import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  allowedOwnProfileSections,
  membershipTypeLabel,
  roleLabel,
} from '../domain/access';
import { useAuth } from '../auth/AuthContext';
import {
  EmptyState,
  ForbiddenState,
  StatusPill,
} from '../components/ui/StatusPill';
import { SelectField, TextField } from '../components/ui/Field';
import type { CorrespondenceLetterType } from '../domain/types';
import {
  buildPersonParticipationPlaces,
  correspondenceService,
  orgService,
  participationService,
  peopleService,
  systemsService,
} from '../services';

const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  personal: 'Personal',
  contact: 'Contact',
  family: 'Family',
  membership: 'Membership',
  baptism: 'Baptism',
  marriage: 'Marriage',
  certificates: 'Certificates',
  documents: 'Documents & Letters',
  teams: 'Teams / service',
  history: 'History',
  employment: 'Employment info',
  education: 'Education info',
  talents: 'Talents and skills',
  gifts: 'Spiritual gifts',
  account: 'Account',
};

function SectionPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="panel" style={{ margin: 0 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

export function PersonProfilePage() {
  const { id } = useParams();
  const {
    account,
    can,
    canManagePeople,
    canViewFullRecord,
    canViewPeople,
    allowedSections,
  } = useAuth();
  const person = id ? peopleService.getById(id) : null;
  const [section, setSection] = useState('overview');
  const [letterMsg, setLetterMsg] = useState('');
  const [reqType, setReqType] =
    useState<CorrespondenceLetterType>('MEMBERSHIP_CONFIRMATION');
  const [reqPurpose, setReqPurpose] = useState('');
  const [reqDest, setReqDest] = useState('');
  const [, setDocTick] = useState(0);
  const isSelf = Boolean(account && person && account.personId === person.id);

  const memberships = person
    ? participationService.activeMemberships(person.id)
    : [];
  const positions = person
    ? participationService.activePositions(person.id)
    : [];
  const assignments = person
    ? participationService.activeAssignments(person.id)
    : [];
  const roles = person ? participationService.rolesFor(person.id) : [];
  const places = person
    ? buildPersonParticipationPlaces({
        memberships,
        positions,
        assignments,
      })
    : [];

  const profileSections = useMemo(() => {
    if (isSelf && !canViewFullRecord) return allowedOwnProfileSections();
    return allowedSections;
  }, [isSelf, canViewFullRecord, allowedSections]);

  const visibleSections = useMemo(() => {
    const set = new Set(profileSections);
    return profileSections.filter((s) => set.has(s));
  }, [profileSections]);

  const activeSection = visibleSections.includes(section)
    ? section
    : (visibleSections[0] ?? 'overview');

  if (!person) {
    return (
      <div className="panel">
        <EmptyState
          title="Person not found"
          detail="They may have been removed from the directory."
          action={
            canViewPeople ? (
              <Link to="/people" className="btn">
                Back to directory
              </Link>
            ) : account ? (
              <Link to={`/people/${account.personId}`} className="btn">
                My profile
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (!isSelf && !canViewPeople) {
    return (
      <div className="stack">
        <div className="panel">
          <ForbiddenState
            resource="PERSON"
            action="VIEW"
            detail="The people directory is for church and ministry leaders. You may only open your own profile."
          />
        </div>
        {account && (
          <Link to={`/people/${account.personId}`} className="btn">
            Open my profile
          </Link>
        )}
      </div>
    );
  }

  const baptism = peopleService.baptism(person.id);
  const marriage = peopleService.marriage(person.id);
  const family = peopleService.familyLinks(person.id);
  const timeline = peopleService.timeline(person.id);
  const documents = peopleService.documents(person.id);
  const certificates = peopleService.certificates(person.id);
  const employment = peopleService.employment(person.id);
  const education = peopleService.education(person.id);
  const talents = peopleService.talents(person.id);
  const spiritualGifts = peopleService.spiritualGifts(person.id);
  const letters = correspondenceService.listDocuments({ personId: person.id });
  /** Own profile or pastoral FULL — show 360 fields (not pastoral-only notes). */
  const seeFullFields = canViewFullRecord || isSelf;

  function submitMemberLetterRequest(e: FormEvent) {
    e.preventDefault();
    if (!account || !person) return;
    const r = correspondenceService.memberRequestLetter({
      letterType: reqType,
      personId: person.id,
      purpose: reqPurpose.trim() || undefined,
      destinationChurch:
        reqType === 'TRANSFER_OUT' ? reqDest.trim() : undefined,
    });
    if (!r.ok) {
      setLetterMsg(r.reason);
      return;
    }
    setLetterMsg('Request submitted — church office will prepare the letter.');
    setReqPurpose('');
    setReqDest('');
    setDocTick((t) => t + 1);
  }

  let body: ReactNode = null;

  if (activeSection === 'overview') {
    body = (
      <div className="stack">
        <div className="grid-2">
          <SectionPanel title="Snapshot">
            <p style={{ marginTop: 0 }}>
              Status:{' '}
              <StatusPill status={person.status}>{person.status}</StatusPill>
            </p>
            <p>Joined church: {person.joinedChurchOn ?? '—'}</p>
            <p>
              Roles:{' '}
              {roles.length === 0
                ? '—'
                : roles.map((r) => roleLabel(r)).join(' · ')}
            </p>
          </SectionPanel>
          <SectionPanel title="Contact">
            <p style={{ marginTop: 0 }}>Phone: {person.phone ?? '—'}</p>
            <p>Email: {person.email ?? '—'}</p>
            {seeFullFields && <p>Address: {person.address ?? '—'}</p>}
          </SectionPanel>
        </div>
        <div className="panel stack">
          <div>
            <h3 style={{ margin: 0 }}>Where they participate</h3>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Memberships, positions, and assignments by place — not access
              rights.
            </p>
          </div>
          {places.length === 0 ? (
            <EmptyState
              title="No participation on file"
              detail="Add memberships or positions in Participation."
            />
          ) : (
            <ul className="people-place-list">
              {places.map((place) => (
                <li key={place.key} className="people-place-card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{place.placeName}</strong>
                    {place.roles.length > 0 && (
                      <span className="badge">
                        {place.roles.join(' · ')}
                      </span>
                    )}
                  </div>
                  <ul className="rail-list" style={{ marginTop: '0.45rem' }}>
                    {place.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid-2">
          <SectionPanel title="Memberships">
            {memberships.length === 0 ? (
              <EmptyState title="No memberships" />
            ) : (
              <ul className="rail-list">
                {memberships.slice(0, 5).map((m) => (
                  <li key={m.id}>
                    {membershipTypeLabel(m.type)}
                    {m.systemId
                      ? ` → ${systemsService.getById(m.systemId)?.shortName}`
                      : ''}
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
          <SectionPanel title="Positions">
            {positions.length === 0 ? (
              <EmptyState title="No positions" />
            ) : (
              <ul className="rail-list">
                {positions.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    {p.title}
                    {p.systemRole ? ` · ${roleLabel(p.systemRole)}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        </div>
      </div>
    );
  } else if (activeSection === 'personal') {
    body = (
      <SectionPanel title="Personal">
        {seeFullFields ? (
          <>
            <p style={{ marginTop: 0 }}>Full name: {person.fullName}</p>
            <p>Preferred: {person.preferredName ?? '—'}</p>
            <p>Date of birth: {person.dateOfBirth ?? '—'}</p>
            <p>Gender: {person.gender ?? '—'}</p>
            <p>National ID: {person.nationalId ?? '—'}</p>
            <p>Address: {person.address ?? '—'}</p>
            {canViewFullRecord && person.pastoralNotes && (
              <p>
                <strong>Pastoral notes:</strong> {person.pastoralNotes}
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Preferred: {person.preferredName ?? person.fullName}
            </p>
            <ForbiddenState
              resource="PERSON"
              action="VIEW_FULL"
              detail="Full personal identifiers require pastoral / secretary scope."
            />
          </>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'contact') {
    body = (
      <SectionPanel title="Contact">
        <p style={{ marginTop: 0 }}>Phone: {person.phone ?? '—'}</p>
        <p>Email: {person.email ?? '—'}</p>
        {canViewFullRecord && <p>Address: {person.address ?? '—'}</p>}
      </SectionPanel>
    );
  } else if (activeSection === 'family') {
    body = (
      <SectionPanel title="Family (household)">
        <p className="muted" style={{ marginTop: 0 }}>
          Household links on the pastoral record — not Choir team “families”.
        </p>
        {!seeFullFields ? (
          <ForbiddenState
            resource="PERSON"
            action="VIEW_FULL"
            detail="Household links require FULL pastoral scope."
          />
        ) : family.length === 0 ? (
          <EmptyState title="No family links on file" />
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {family.map((f) => (
              <li key={f.id}>
                <Link to={`/people/${f.otherPersonId}`}>{f.otherName}</Link>
                {' — '}
                {f.displayRelation}
                {f.notes ? ` · ${f.notes}` : ''}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'membership') {
    body = (
      <SectionPanel title="Memberships">
        {memberships.length === 0 ? (
          <EmptyState title="No memberships" />
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {memberships.map((m) => (
              <li key={m.id}>
                {membershipTypeLabel(m.type)}
                {m.systemId
                  ? ` → ${systemsService.getById(m.systemId)?.shortName}`
                  : ''}
                <div className="muted">
                  Since {m.startDate}
                  {m.orgUnitId
                    ? ` · ${orgService.getById(m.orgUnitId)?.name}`
                    : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'baptism') {
    body = (
      <SectionPanel title="Baptism">
        {!seeFullFields ? (
          <ForbiddenState
            resource="PERSON"
            action="VIEW_FULL"
            detail="Baptism record is pastoral / secretary only."
          />
        ) : !baptism ? (
          <EmptyState title="No baptism record on file" />
        ) : (
          <>
            <p style={{ marginTop: 0 }}>Date: {baptism.baptizedOn}</p>
            <p>Place: {baptism.place ?? '—'}</p>
            <p>Minister: {baptism.ministerName ?? '—'}</p>
            <p>Certificate: {baptism.certificateRef ?? '—'}</p>
            {baptism.notes && <p>Notes: {baptism.notes}</p>}
          </>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'marriage') {
    body = (
      <SectionPanel title="Marriage">
        {!seeFullFields ? (
          <ForbiddenState
            resource="PERSON"
            action="VIEW_FULL"
            detail="Marriage record is pastoral / secretary only."
          />
        ) : !marriage ? (
          <EmptyState title="No marriage record on file" />
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Status:{' '}
              <StatusPill status={marriage.status}>
                {marriage.status}
              </StatusPill>
            </p>
            <p>
              Spouse:{' '}
              {marriage.spousePersonId ? (
                <Link to={`/people/${marriage.spousePersonId}`}>
                  {marriage.spouseName ?? marriage.spousePersonId}
                </Link>
              ) : (
                (marriage.spouseName ?? '—')
              )}
            </p>
            <p>Married on: {marriage.marriedOn}</p>
            <p>Place: {marriage.place ?? '—'}</p>
            <p>Certificate: {marriage.certificateRef ?? '—'}</p>
          </>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'certificates') {
    body = (
      <SectionPanel title="Certificates">
        {!seeFullFields ? (
          <ForbiddenState resource="PERSON" action="VIEW_FULL" />
        ) : certificates.length === 0 ? (
          <EmptyState title="None on file" />
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {certificates.map((d) => (
              <li key={d.id}>
                {d.label}
                {d.issuedOn ? ` · ${d.issuedOn}` : ''}
                {d.note ? ` · ${d.note}` : ''}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'documents') {
    body = (
      <div className="stack">
        <SectionPanel title="Documents & Letters">
          {!seeFullFields ? (
            <ForbiddenState resource="PERSON" action="VIEW_FULL" />
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <p className="muted" style={{ margin: 0 }}>
                  Official letters on the correspondence engine, plus archived
                  meta (certificates, ID copies).
                </p>
                {canManagePeople || can('CORRESPONDENCE', 'CREATE') ? (
                  <Link className="btn sm" to="/correspondence">
                    New letter
                  </Link>
                ) : null}
              </div>
              {letterMsg ? (
                <p className="muted" style={{ margin: '0.5rem 0 0' }}>
                  {letterMsg}
                </p>
              ) : null}
              {letters.length === 0 ? (
                <EmptyState title="No official letters yet" />
              ) : (
                <div className="stack" style={{ marginTop: '0.75rem' }}>
                  {letters.map((d) => (
                    <div
                      key={d.id}
                      className={
                        d.status === 'NEEDS_INFORMATION'
                          ? 'panel stack letter-info-needed'
                          : 'panel stack'
                      }
                    >
                      <div
                        className="row"
                        style={{
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <strong>
                            {
                              correspondenceService.LETTER_TYPE_LABELS[
                                d.letterType
                              ]
                            }
                          </strong>
                          {d.destinationChurch
                            ? ` · ${d.destinationChurch}`
                            : ''}
                          {d.origin === 'MEMBER_REQUESTED'
                            ? ' · (your request)'
                            : ''}
                          <div className="muted" style={{ marginTop: '0.2rem' }}>
                            {d.status}
                            {d.referenceNumber
                              ? ` · Ref ${d.referenceNumber}`
                              : ''}
                            {d.purpose ? ` · ${d.purpose}` : ''}
                          </div>
                        </div>
                        <Link
                          className={
                            d.status === 'NEEDS_INFORMATION'
                              ? 'btn sm'
                              : 'btn ghost sm'
                          }
                          to={`/correspondence/${d.id}`}
                        >
                          {d.status === 'NEEDS_INFORMATION'
                            ? isSelf
                              ? 'See what is needed & reply'
                              : 'Open · needs info'
                            : 'Open'}
                        </Link>
                      </div>
                      {d.status === 'NEEDS_INFORMATION' ? (
                        <div>
                          <p
                            style={{
                              margin: '0 0 0.35rem',
                              fontWeight: 600,
                            }}
                          >
                            {isSelf
                              ? 'What the office asked you to provide:'
                              : 'Information requested:'}
                          </p>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                            {d.infoRequestNote?.trim() ||
                              'No details recorded — open the letter or ask the secretary.'}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SectionPanel>
        {isSelf && seeFullFields ? (
          <SectionPanel title="Request a letter">
            <p className="muted" style={{ marginTop: 0 }}>
              Ask the church office for a transfer, membership confirmation, or
              recommendation. You will collect it after the Leader signs.
            </p>
            <form className="stack" onSubmit={submitMemberLetterRequest}>
              <SelectField
                label="Letter type"
                value={reqType}
                onChange={(e) =>
                  setReqType(e.target.value as CorrespondenceLetterType)
                }
              >
                <option value="MEMBERSHIP_CONFIRMATION">
                  Membership confirmation
                </option>
                <option value="RECOMMENDATION">Recommendation</option>
                <option value="TRANSFER_OUT">Transfer out</option>
              </SelectField>
              {reqType === 'TRANSFER_OUT' ? (
                <TextField
                  label="Destination church"
                  value={reqDest}
                  onChange={(e) => setReqDest(e.target.value)}
                  required
                />
              ) : null}
              <TextField
                label="Purpose / note"
                value={reqPurpose}
                onChange={(e) => setReqPurpose(e.target.value)}
                placeholder="Why do you need this letter?"
              />
              <button type="submit" className="btn">
                Submit request
              </button>
            </form>
          </SectionPanel>
        ) : null}
        {seeFullFields ? (
          <SectionPanel title="On file (meta)">
            {documents.length === 0 ? (
              <EmptyState title="None on file" />
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {documents.map((d) => (
                  <li key={d.id}>
                    [{d.kind}] {d.label}
                    {d.issuedOn ? ` · ${d.issuedOn}` : ''}
                    {d.fileDataUrl ? (
                      <>
                        {' · '}
                        <a
                          href={d.fileDataUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View{d.fileName ? ` ${d.fileName}` : ' file'}
                        </a>
                      </>
                    ) : (
                      ' · no file uploaded'
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        ) : null}
      </div>
    );
  } else if (activeSection === 'teams') {
    body = (
      <div className="stack">
        <SectionPanel title="Where they participate">
          {places.length === 0 ? (
            <EmptyState title="No participation on file" />
          ) : (
            <ul className="people-place-list">
              {places.map((place) => (
                <li key={place.key} className="people-place-card">
                  <div
                    className="row"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <strong>{place.placeName}</strong>
                    {place.roles.length > 0 && (
                      <span className="badge">{place.roles.join(' · ')}</span>
                    )}
                  </div>
                  <ul className="rail-list" style={{ marginTop: '0.45rem' }}>
                    {place.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
        <div className="grid-2">
          <SectionPanel title="Positions">
            {positions.length === 0 ? (
              <EmptyState title="No positions" />
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {positions.map((p) => (
                  <li key={p.id}>
                    {p.title} ({orgService.getById(p.orgUnitId)?.name})
                    {p.systemRole ? (
                      <div className="muted">{roleLabel(p.systemRole)}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
          <SectionPanel title="Assignments">
            {assignments.length === 0 ? (
              <EmptyState title="No assignments" />
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {assignments.map((a) => (
                  <li key={a.id}>
                    {a.title} — {a.contextLabel}
                    {a.endDate ? (
                      <div className="muted">Until {a.endDate}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>
        </div>
      </div>
    );
  } else if (activeSection === 'history') {
    body = (
      <SectionPanel title="History">
        {!seeFullFields ? (
          <ForbiddenState
            resource="PERSON"
            action="VIEW_FULL"
            detail="Full history requires Pastor, Assistant Pastor, or Secretary."
          />
        ) : timeline.length === 0 ? (
          <EmptyState title="No history events" />
        ) : (
          <ul className="timeline-list">
            {timeline.map((e) => (
              <li key={e.id}>
                <div className="timeline-when">{e.at}</div>
                <div>
                  <StatusPill tone="neutral">{e.kind}</StatusPill>{' '}
                  <strong>{e.title}</strong>
                  {e.detail && <div className="muted">{e.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'employment') {
    body = (
      <SectionPanel title="Employment info">
        {employment.length === 0 ? (
          <EmptyState title="No employment on file" />
        ) : (
          <ul className="rail-list">
            {employment.map((job) => (
              <li key={job.id}>
                <strong>{job.title ?? 'Role'}</strong>
                {job.employer ? ` · ${job.employer}` : ''}
                <div className="muted">
                  {job.status}
                  {job.sector ? ` · ${job.sector}` : ''}
                  {job.startedOn ? ` · from ${job.startedOn}` : ''}
                  {job.endedOn ? ` → ${job.endedOn}` : ''}
                </div>
                {job.notes ? <div className="muted">{job.notes}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'education') {
    body = (
      <SectionPanel title="Education info">
        {education.length === 0 ? (
          <EmptyState title="No education on file" />
        ) : (
          <ul className="rail-list">
            {education.map((ed) => (
              <li key={ed.id}>
                <strong>{ed.institution}</strong>
                {ed.level ? ` · ${ed.level}` : ''}
                {ed.field ? ` · ${ed.field}` : ''}
                <div className="muted">
                  {ed.status}
                  {ed.startedOn ? ` · from ${ed.startedOn}` : ''}
                  {ed.endedOn ? ` → ${ed.endedOn}` : ''}
                </div>
                {ed.notes ? <div className="muted">{ed.notes}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'talents') {
    body = (
      <SectionPanel title="Talents and skills">
        {talents.length === 0 ? (
          <EmptyState title="No talents or skills on file" />
        ) : (
          <ul className="rail-list">
            {talents.map((t) => (
              <li key={t.id}>
                <StatusPill tone="neutral">{t.kind}</StatusPill>{' '}
                <strong>{t.name}</strong>
                {t.proficiency ? (
                  <span className="muted"> · {t.proficiency}</span>
                ) : null}
                {t.notes ? <div className="muted">{t.notes}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'gifts') {
    body = (
      <SectionPanel title="Spiritual gifts">
        {spiritualGifts.length === 0 ? (
          <EmptyState title="No spiritual gifts on file" />
        ) : (
          <ul className="rail-list">
            {spiritualGifts.map((g) => (
              <li key={g.id}>
                <strong>{g.gift}</strong>
                {g.evidence ? (
                  <div className="muted">{g.evidence}</div>
                ) : null}
                {g.notes ? <div className="muted">{g.notes}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  } else if (activeSection === 'account') {
    body = (
      <SectionPanel title="Account">
        <p className="muted" style={{ marginTop: 0 }}>
          Login credentials are 1:1 with Person. Linking is a secretary /
          admin workflow.
        </p>
        <p style={{ marginBottom: '0.35rem' }}>
          Participates in:{' '}
          {places.map((p) => p.placeName).join(', ') || 'None on file'}
        </p>
        {places.some((p) => p.roles.length > 0) && (
          <p className="muted">
            Roles:{' '}
            {[...new Set(places.flatMap((p) => p.roles))].join(' · ')}
          </p>
        )}
      </SectionPanel>
    );
  }

  return (
    <div className="stack">
      <p>
        {canViewPeople ? (
          <Link to="/people">← People directory</Link>
        ) : (
          <span className="muted">My profile</span>
        )}
      </p>

      <div className="detail-hero">
        <p className="hero-kicker">
          {isSelf
            ? 'My 360° profile'
            : canViewFullRecord
              ? '360° pastoral record'
              : 'Limited profile'}
        </p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{person.fullName}</h2>
            {person.preferredName &&
              person.preferredName !== person.fullName && (
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  Preferred: {person.preferredName}
                </p>
              )}
          </div>
          <div className="row">
            <StatusPill status={person.status}>{person.status}</StatusPill>
            {canManagePeople && (
              <Link to={`/people/${person.id}/edit`} className="btn secondary">
                Edit
              </Link>
            )}
          </div>
        </div>
        <div className="row" style={{ marginTop: '0.65rem' }}>
          {roles.map((r) => (
            <span key={r} className="badge">
              {roleLabel(r)}
            </span>
          ))}
          {!canViewFullRecord && !isSelf && (
            <span className="badge planned">Limited scope</span>
          )}
        </div>
        <div className="overview-strip">
          <div className="overview-tile">
            <div className="label">Memberships</div>
            <div className="value">{memberships.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Positions</div>
            <div className="value">{positions.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Assignments</div>
            <div className="value">{assignments.length}</div>
          </div>
          <div className="overview-tile">
            <div className="label">Places</div>
            <div className="value">{places.length}</div>
          </div>
        </div>
      </div>

      <div className="profile-layout">
        <nav className="profile-nav" aria-label="Profile sections">
          {visibleSections.map((s) => (
            <button
              key={s}
              type="button"
              className={`profile-nav-item ${activeSection === s ? 'active' : ''}`}
              onClick={() => setSection(s)}
            >
              {SECTION_LABELS[s] ?? s}
            </button>
          ))}
        </nav>
        <div className="profile-main">{body}</div>
      </div>
    </div>
  );
}
