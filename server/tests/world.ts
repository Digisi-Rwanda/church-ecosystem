import jwt from 'jsonwebtoken';

export const SYSTEMS = [
  'sys-main','sys-music','sys-choir','sys-worship','sys-youth','sys-deacon',
  'sys-protocol','sys-media','sys-men','sys-women','sys-couples','sys-children',
  'sys-elderly','sys-evangelism','sys-intercessors','sys-finance',
];

export function tokenFor(personId: string) {
  return jwt.sign({ sub: `acc-${personId}`, personId, username: personId }, 'test-secret', { expiresIn: '1h' });
}
export const bearer = (personId: string) => ({ Authorization: `Bearer ${tokenFor(personId)}` });

/** Seeds people + positions so each persona has a known privilege level. */
export function seedWorld(db: Record<string, any[]>) {
  const add = (m: string, rows: any[]) => db[m].push(...rows);
  for (const k of ['churchSystem','person','membership','position','workTask','assignment','program','churchEvent','churchProject','auditEvent','missionShare','contribution','eventRegistration','programEnrollment','programActivity'])
    db[k] ??= [];
  add('churchSystem', SYSTEMS.map((id) => ({ id })));
  const people = ['p-pastor','p-treasurer','p-member','p-outsider','p-choir-leader','p-youth-leader','p-choir-member','p-youth-member'];
  add('person', people.map((id) => ({ id, fullName: id, status: 'ACTIVE', email: `${id}@x.org`, phone: '0780000000' })));
  const church = (id: string) => ({ id: `mem-${id}-c`, personId: id, systemId: 'sys-main', type: 'CHURCH_MEMBER', label: 'Church member', status: 'ACTIVE', startDate: new Date('2020-01-01') });
  add('membership', people.filter((p) => p !== 'p-outsider').map(church));
  add('membership', [
    { id: 'mem-cm', personId: 'p-choir-member', systemId: 'sys-choir', type: 'MINISTRY_MEMBER', label: 'Choir member', status: 'ACTIVE', startDate: new Date('2021-01-01') },
    { id: 'mem-ym', personId: 'p-youth-member', systemId: 'sys-youth', type: 'MINISTRY_MEMBER', label: 'Youth member', status: 'ACTIVE', startDate: new Date('2021-01-01') },
  ]);
  add('position', [
    { id: 'pos-pastor', personId: 'p-pastor', systemId: 'sys-main', title: 'Senior Pastor', systemRole: 'CHURCH_LEADER', grantsAllSystems: true, status: 'ACTIVE', startDate: new Date('2019-01-01') },
    { id: 'pos-treas', personId: 'p-treasurer', systemId: 'sys-finance', title: 'Church Treasurer', systemRole: 'CHURCH_TREASURER', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2019-01-01') },
    { id: 'pos-choir', personId: 'p-choir-leader', systemId: 'sys-choir', title: 'Choir Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') },
    { id: 'pos-youth', personId: 'p-youth-leader', systemId: 'sys-youth', title: 'Youth Leader', ministryOffice: 'PRESIDENT', grantsAllSystems: false, status: 'ACTIVE', startDate: new Date('2021-01-01') },
  ]);
}
