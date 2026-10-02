import { beforeEach, describe, expect, it } from 'vitest';
import { applyPlan, loadExisting, normalizePhone, parseCsv, planRows, type Existing } from '../src/lib/importProtocol';
import { createFakePrisma } from './fakePrisma';

const CSV = `Full name,Phone number,Email,Office,Choir
Niyigena Claudine,0788 123 456,claudine@x.org,President,Alpha Voices
Mukamana "Clarisse" Alice,+250788000111,,Vice President,none
Habimana Eric,250788222333,eric@x.org,Coordinator,"Zion's Singers"
Uwase Joy,788444555,joy@x.org,Treasure,Praise
Kamali Paul,0788666777,,Secretary,
Ineza Grace,0788999000,grace@x.org,Member,Alpha
Mutesi Ann,0788111222,ann@x.org,,
`;

// The choirs come from the data (any names, any number), never from the code.
const ORGS = [
  { id: 'ou-a', name: 'Alpha Voices' },
  { id: 'ou-z', name: "Zion's Singers" },
  { id: 'ou-p', name: 'Praise' },
];
const MUSIC = [
  { id: 'mu-a', name: 'Alpha Voices', kind: 'PRIMARY', orgUnitId: 'ou-a', active: true },
  { id: 'mu-z', name: "Zion's Singers", kind: 'PRIMARY', orgUnitId: 'ou-z', active: true },
  { id: 'mu-old', name: 'Retired Choir', kind: 'PRIMARY', active: false },
];
const known: Existing = { people: [], positions: [], orgChoirs: ORGS, musicUnits: MUSIC };

describe('csv reading', () => {
  it('handles quotes, BOM, CRLF and semicolons', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('normalizes Rwandan phone numbers', () => {
    expect(normalizePhone('0788 123 456').value).toBe('+250788123456');
    expect(normalizePhone('250788123456').value).toBe('+250788123456');
    expect(normalizePhone('788123456').value).toBe('+250788123456');
    expect(normalizePhone('12').warning).toBeTruthy();
  });
});

describe('planning', () => {
  const none = known;
  it('reads offices, choirs and the usual spellings', () => {
    const p = planRows(parseCsv(CSV), none);
    expect(p.fatal).toBeUndefined();
    expect(p.issues.filter((i) => i.level === 'error')).toEqual([]);
    const by = Object.fromEntries(p.people.map((x) => [x.fullName, x]));
    expect(by['Niyigena Claudine']).toMatchObject({ office: 'PRESIDENT', phone: '+250788123456', createPosition: true });
    expect(by['Niyigena Claudine']!.choir?.musicUnitId).toBe('mu-a');
    expect(by['Mukamana "Clarisse" Alice']).toMatchObject({ office: 'VP', choir: null });
    expect(by['Uwase Joy']).toMatchObject({ office: 'TREASURER', phone: '+250788444555' });
    expect(by['Habimana Eric']!.choir?.musicUnitId).toBe('mu-z');
    expect(by['Ineza Grace']!.choir?.name).toBe('Alpha Voices'); // a unique start of the name is enough
    expect(by['Uwase Joy']!.choir).toMatchObject({ name: 'Praise', musicUnitId: null, orgUnitId: 'ou-p' }); // on the server, not yet on Music's list
    expect(by['Ineza Grace']).toMatchObject({ office: 'MEMBER', createPosition: false });
    expect(by['Mutesi Ann']).toMatchObject({ office: 'MEMBER' }); // empty office = member
  });
  it('reports problems instead of guessing', () => {
    const csv = `Name,Phone,Email,Role,Choir,Extra
,0788000000,,Member,
Bad Office,0788000001,,Chairman,
Odd Choir,0788000002,not-an-email,Member,Gamma
Two Presidents,0788000003,,President,
Eric Twin,0788000004,,President,
Odd Phone,12,,Member,
Dup Person,0788000005,dup@x.org,Member,
Dup Person,0788000005,dup@x.org,Treasurer,Praise
`;
    const p = planRows(parseCsv(csv), none);
    const msg = (lvl: string) => p.issues.filter((i) => i.level === lvl).map((i) => `${i.line}: ${i.message}`);
    expect(p.ignoredColumns).toEqual(['Extra']);
    expect(msg('error').join('\n')).toMatch(/2: No name/);
    expect(msg('error').join('\n')).toMatch(/3: Unknown office "Chairman"/);
    expect(msg('error').join('\n')).toMatch(/6: Protocol President is already Two Presidents/);
    expect(msg('warning').join('\n')).toMatch(/4: Unknown choir "Gamma" \(known: Alpha Voices, Zion's Singers, Praise\)/);
    expect(msg('warning').join('\n')).toMatch(/4: email "not-an-email"/);
    expect(msg('warning').join('\n')).toMatch(/7: phone "12"/);
    expect(msg('warning').join('\n')).toMatch(/9: Dup Person already appears on line 8/);
    // the repeated person became one, picking up the better office and the choir
    const dup = p.people.filter((x) => x.fullName === 'Dup Person');
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ office: 'TREASURER', createPosition: true });
    expect(dup[0]!.choir?.name).toBe('Praise');
  });
  it('a retired choir is not offered, and with --create-choirs unknown names are new', () => {
    const csv = 'Full name,Choir\nA,Retired Choir\nB,Gamma\nC,Gamma';
    const off = planRows(parseCsv(csv), known);
    expect(off.people.every((x) => x.choir === null)).toBe(true);
    const on = planRows(parseCsv(csv), known, { createChoirs: true });
    const b = on.people.find((x) => x.fullName === 'B')!.choir!;
    expect(b).toMatchObject({ name: 'Gamma', create: true });
    expect(on.people.find((x) => x.fullName === 'C')!.choir).toBe(b); // one new choir, not two
    expect(on.people.find((x) => x.fullName === 'A')!.choir?.create).toBe(true); // retired names are not matched
  });
  it('an ambiguous start of a name is refused', () => {
    const p = planRows(parseCsv('Full name,Choir\nA,Pr'), { ...known, orgChoirs: [...ORGS, { id: 'ou-q', name: 'Praise Team' }] });
    expect(p.people[0]!.choir).toBeNull();
    const q = planRows(parseCsv('Full name,Choir\nA,Pra'), { ...known, orgChoirs: [...ORGS, { id: 'ou-q', name: 'Praise Team' }] });
    expect(q.issues.some((i) => /more than one/.test(i.message))).toBe(true);
  });
  it('stops on a file without a name column', () => {
    expect(planRows(parseCsv('Phone,Email\n1,2'), none).fatal).toMatch(/Full name/);
    expect(planRows([], none).fatal).toBeTruthy();
  });
  it('does not take over an office someone else holds on the server', () => {
    const p = planRows(parseCsv('Full name,Office\nNew Pres,President\nOld Sec,Secretary'), {
      people: [],
      positions: [{ personId: 'p-old', protocolOffice: 'PRESIDENT', status: 'ACTIVE' }],
    });
    expect(p.people.find((x) => x.fullName === 'New Pres')!.createPosition).toBe(false);
    expect(p.issues.some((i) => /already held by someone else/.test(i.message))).toBe(true);
    expect(p.people.find((x) => x.fullName === 'Old Sec')!.createPosition).toBe(true);
  });
});

describe('applying', () => {
  const fake = createFakePrisma();
  const seedChoirs = () => {
    const db = fake.__db;
    db.orgUnit ??= [];
    db.scheduleDocument ??= [];
    db.orgUnit.push(...ORGS.map((o) => ({ ...o, type: 'TEAM', systemId: 'sys-choir', parentId: 'ou-choir-parent' })));
    db.scheduleDocument.push({ key: 'music', version: 3, data: JSON.stringify({ musicSchedule: { units: MUSIC, drafts: [{ id: 'd1' }] } }), updatedByPersonId: 'p-m' });
  };
  beforeEach(() => {
    fake.__reset();
    seedChoirs();
  });
  const run = async (csv = CSV, opts = {}, apply = {}) => applyPlan(fake, planRows(parseCsv(csv), await loadExisting(fake), opts), apply);

  it('creates people, memberships, offices and the roster', async () => {
    const r = await run();
    expect(r).toMatchObject({ peopleCreated: 7, positionsCreated: 5, rosterAdded: 7 });
    const db = fake.__db;
    expect(db.person).toHaveLength(7);
    const claudine = db.person.find((p: any) => p.fullName === 'Niyigena Claudine');
    expect(claudine).toMatchObject({ phone: '+250788123456', email: 'claudine@x.org' });
    // protocol membership for everyone (it is what makes them Protocol participants)
    expect(db.membership.filter((m: any) => m.systemId === 'sys-protocol')).toHaveLength(7);
    expect(db.membership.filter((m: any) => m.systemId === 'sys-main')).toHaveLength(7);
    // choir memberships only where there is a server choir
    const choir = db.membership.filter((m: any) => m.systemId === 'sys-choir');
    expect(choir.map((m: any) => m.orgUnitId).sort()).toEqual(['ou-a', 'ou-a', 'ou-p', 'ou-z']);
    // offices as positions the server's policy reads
    const pos = db.position.map((p: any) => p.protocolOffice).sort();
    expect(pos).toEqual(['COORDINATOR', 'PRESIDENT', 'SECRETARY', 'TREASURER', 'VP']);
    expect(db.position.every((p: any) => p.systemId === 'sys-protocol' && p.status === 'ACTIVE')).toBe(true);
    // roster in the shared document, with names and choir
    const doc = JSON.parse(db.scheduleDocument.find((d: any) => d.key === 'protocol').data);
    expect(doc.protocolRoster).toHaveLength(7);
    const row = doc.protocolRoster.find((x: any) => x.personId === claudine.id);
    expect(row).toMatchObject({ office: 'PRESIDENT', displayName: 'Niyigena Claudine', choirUnitId: 'mu-a', status: 'ACTIVE' });
  });

  it('can be run again without duplicating, and keeps availability the Coordinator set', async () => {
    await run();
    const db = fake.__db;
    const doc = db.scheduleDocument.find((d: any) => d.key === 'protocol');
    const data = JSON.parse(doc.data);
    data.protocolRoster[5].status = 'LEAVE';
    data.protocolRoster[5].onlyServices = [{ date: '2026-10-04', kind: 'SS1' }];
    doc.data = JSON.stringify(data);
    const r = await run();
    expect(r).toMatchObject({ peopleCreated: 0, positionsCreated: 0, membershipsCreated: 0, rosterAdded: 0 });
    expect(db.person).toHaveLength(7);
    expect(db.position).toHaveLength(5);
    const after = JSON.parse(db.scheduleDocument.find((d: any) => d.key === 'protocol').data);
    expect(after.protocolRoster).toHaveLength(7);
    expect(after.protocolRoster[5]).toMatchObject({ status: 'LEAVE', onlyServices: [{ date: '2026-10-04', kind: 'SS1' }] });
    expect(db.scheduleDocument.find((d: any) => d.key === 'protocol').version).toBe(2);
  });

  it('keeps other parts of the shared document and matches people already known', async () => {
    const db = fake.__db;
    db.person.push({ id: 'p-known', fullName: 'Ineza Grace', email: 'grace@x.org', phone: null, status: 'ACTIVE' });
    db.scheduleDocument.push({ key: 'protocol', version: 4, data: JSON.stringify({ protocolMonthPlans: [{ id: 'mp1' }] }), updatedByPersonId: 'p-x' });
    await run();
    expect(db.person).toHaveLength(7); // Grace matched by email, not duplicated
    expect(db.person.find((p: any) => p.id === 'p-known').phone).toBe('+250788999000');
    const doc = db.scheduleDocument.find((d: any) => d.key === 'protocol');
    expect(doc.version).toBe(5);
    expect(JSON.parse(doc.data).protocolMonthPlans).toEqual([{ id: 'mp1' }]);
    expect(db.scheduleDocumentRevision.filter((r: any) => r.key === 'protocol').map((r: any) => r.version)).toEqual([4]);
  });

  it('puts a server-only choir on Music\'s list without touching the rest of the Music document', async () => {
    const r = await run();
    expect(r.musicUnitsAdded).toBe(1); // Praise
    const doc = fake.__db.scheduleDocument.find((d: any) => d.key === 'music');
    expect(doc.version).toBe(4);
    const ms = JSON.parse(doc.data).musicSchedule;
    expect(ms.drafts).toEqual([{ id: 'd1' }]);
    expect(ms.units.map((u: any) => u.id)).toEqual(['mu-a', 'mu-z', 'mu-old', 'mu-praise']);
    expect(ms.units[3]).toMatchObject({ name: 'Praise', orgUnitId: 'ou-p', kind: 'PRIMARY', active: true });
    const roster = JSON.parse(fake.__db.scheduleDocument.find((d: any) => d.key === 'protocol').data).protocolRoster;
    expect(roster.find((x: any) => x.displayName === 'Uwase Joy').choirUnitId).toBe('mu-praise');
    // running again adds nothing more
    expect((await run()).musicUnitsAdded).toBe(0);
  });

  it('--create-choirs makes a new choir on the server and on Music\'s list', async () => {
    const csv = 'Full name,Choir\nNew Singer,Gamma Chorale';
    const r = await run(csv, { createChoirs: true });
    expect(r).toMatchObject({ choirsCreated: 1, musicUnitsAdded: 1 });
    const org = fake.__db.orgUnit.find((o: any) => o.name === 'Gamma Chorale');
    expect(org).toMatchObject({ type: 'TEAM', systemId: 'sys-choir', parentId: 'ou-choir-parent' });
    expect(fake.__db.membership.find((m: any) => m.systemId === 'sys-choir').orgUnitId).toBe(org.id);
    const units = JSON.parse(fake.__db.scheduleDocument.find((d: any) => d.key === 'music').data).musicSchedule.units;
    expect(units.find((u: any) => u.name === 'Gamma Chorale').orgUnitId).toBe(org.id);
    // the same name next time is found, not created again
    expect((await run(csv, { createChoirs: true })).choirsCreated).toBe(0);
  });

  it('starts Music\'s lineup from the server\'s choirs when Music has none saved', async () => {
    fake.__db.scheduleDocument.length = 0;
    await run('Full name,Choir\nX,Praise');
    const ms = JSON.parse(fake.__db.scheduleDocument.find((d: any) => d.key === 'music').data).musicSchedule;
    expect(ms.units.map((u: any) => u.name).sort()).toEqual(['Alpha Voices', 'Praise', "Zion's Singers"]);
  });

  it('--accounts: one sign-in per person without one, unique usernames, passwords only returned once', async () => {
    const csv = 'Full name,Email\nAnn Uwase,ann@x.org\nAnn Mukamana,ann@y.org\nNo Email Person,\n';
    fake.__db.account ??= [];
    const r = await run(csv, {}, { accounts: true });
    expect(r.accountsCreated).toBe(3);
    expect(r.credentials.map((c) => c.username)).toEqual(['ann', 'ann2', 'no.email.person']);
    expect(r.credentials.every((c) => c.password.length === 12)).toBe(true);
    expect(new Set(r.credentials.map((c) => c.password)).size).toBe(3);
    // stored hashed, never in clear
    const stored = fake.__db.account.map((a: any) => a.passwordHash);
    for (const c of r.credentials) expect(stored).not.toContain(c.password);
    const bcrypt = (await import('bcryptjs')).default;
    expect(await bcrypt.compare(r.credentials[0]!.password, fake.__db.account.find((a: any) => a.username === 'ann').passwordHash)).toBe(true);
    // running again makes no new sign-ins and so reveals no passwords
    const again = await run(csv, {}, { accounts: true });
    expect(again.accountsCreated).toBe(0);
    expect(again.credentials).toEqual([]);
  });
  it('without --accounts no sign-ins are made', async () => {
    fake.__db.account ??= [];
    expect((await run()).accountsCreated).toBe(0);
    expect(fake.__db.account).toHaveLength(0);
  });
});
