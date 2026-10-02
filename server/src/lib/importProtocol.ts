/**
 * Import the Protocol team from a CSV.
 *
 * Columns (any order, header names are forgiving, extra columns are ignored):
 *   Full name | Phone number | Email | Office | Choir
 *
 * To add or drop a column later, change COLUMNS below and, for a new one,
 * where `planRows` / `applyPlan` use it.
 *
 * Two steps, so nothing is written by surprise:
 *   planRows   reads the rows and says what would happen, and what is wrong;
 *   applyPlan  does it. Running it again is safe: people already on the server
 *              (matched by email, phone, then name) are updated, not duplicated.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { hashPassword } from './auth.js';

export const COLUMNS = {
  fullName: ['full name', 'fullname', 'name', 'names'],
  phone: ['phone number', 'phone', 'telephone', 'tel', 'mobile', 'phone no'],
  email: ['email', 'e-mail', 'email address'],
  office: ['office', 'position', 'role', 'title'],
  choir: ['choir', 'choir name'],
} as const;
type Field = keyof typeof COLUMNS;

export type ProtocolOffice = 'PRESIDENT' | 'VP' | 'COORDINATOR' | 'SECRETARY' | 'TREASURER' | 'MEMBER';
const OFFICE_WORDS: Record<string, ProtocolOffice> = {
  president: 'PRESIDENT',
  'vice president': 'VP',
  'vice-president': 'VP',
  vicepresident: 'VP',
  vp: 'VP',
  coordinator: 'COORDINATOR',
  secretary: 'SECRETARY',
  treasurer: 'TREASURER',
  treasure: 'TREASURER',
  member: 'MEMBER',
};
const OFFICE_LABEL: Record<ProtocolOffice, string> = {
  PRESIDENT: 'Protocol President',
  VP: 'Protocol Vice President',
  COORDINATOR: 'Protocol Coordinator',
  SECRETARY: 'Protocol Secretary',
  TREASURER: 'Protocol Treasurer',
  MEMBER: 'Protocol Member',
};
/** One person holds these at a time. */
const SINGLE = new Set<ProtocolOffice>(['PRESIDENT', 'VP', 'COORDINATOR']);

/**
 * A choir as found in the data: Music's lineup (the shared Music document) and
 * the server's choir org units. Nothing is listed here in code, so renaming a
 * choir or having more or fewer than today just works.
 */
export type ChoirRef = {
  name: string;
  /** Music unit id (what the scheduler uses); null until the choir is on Music's list. */
  musicUnitId: string | null;
  /** Server org unit (what choir membership hangs on); null for Music-only units. */
  orgUnitId: string | null;
  /** Created by this import. */
  create?: boolean;
};
export type MusicUnitRow = { id: string; name: string; kind?: string; orgUnitId?: string; active?: boolean };
export type OrgChoir = { id: string; name: string };

export function choirRefs(music: MusicUnitRow[] | null, orgChoirs: OrgChoir[]): ChoirRef[] {
  const refs: ChoirRef[] = (music ?? [])
    .filter((u) => u.active !== false)
    .map((u) => ({ name: u.name, musicUnitId: u.id, orgUnitId: u.orgUnitId ?? null }));
  for (const o of orgChoirs) {
    const linked = refs.find((r) => r.orgUnitId === o.id);
    if (!linked) refs.push({ name: o.name, musicUnitId: null, orgUnitId: o.id });
  }
  return refs;
}

const slug = (name: string) => plain(name).replace(/ /g, '-') || 'choir';

// ---- reading the file -------------------------------------------------------

/** RFC 4180 style: quotes, doubled quotes, commas/semicolons, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true; // a quote inside a word is just a quote
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function mapHeaders(header: string[]): { index: Partial<Record<Field, number>>; ignored: string[] } {
  const index: Partial<Record<Field, number>> = {};
  const ignored: string[] = [];
  header.forEach((h, i) => {
    const key = (Object.keys(COLUMNS) as Field[]).find(
      (f) => index[f] === undefined && (COLUMNS[f] as readonly string[]).includes(plain(h)),
    );
    if (key) index[key] = i;
    else if (h.trim()) ignored.push(h.trim());
  });
  return { index, ignored };
}

export function normalizePhone(raw: string): { value: string | null; warning?: string } {
  const s = raw.trim();
  if (!s) return { value: null };
  const digits = s.replace(/[^\d]/g, '');
  if (/^0\d{9}$/.test(digits)) return { value: `+250${digits.slice(1)}` };
  if (/^250\d{9}$/.test(digits)) return { value: `+${digits}` };
  if (/^7\d{8}$/.test(digits)) return { value: `+250${digits}` };
  if (s.startsWith('+') && digits.length >= 8) return { value: `+${digits}` };
  return { value: s, warning: `phone "${s}" does not look like a Rwandan number; kept as written` };
}

// ---- planning ---------------------------------------------------------------

export type ImportOptions = {
  /** A choir name not found anywhere is created instead of reported. */
  createChoirs?: boolean;
};
export type ExistingPerson = { id: string; fullName: string; email: string | null; phone: string | null };
export type ExistingPosition = { personId: string; protocolOffice: string | null; status: string };

export type PlannedPerson = {
  line: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  office: ProtocolOffice;
  choir: ChoirRef | null;
  /** Existing person this row matches, if any. */
  personId: string | null;
  /** Give this person the office position (leaders and officers only). */
  createPosition: boolean;
};
export type RowIssue = { line: number; level: 'error' | 'warning'; message: string };
export type Plan = {
  people: PlannedPerson[];
  issues: RowIssue[];
  ignoredColumns: string[];
  fatal?: string;
};

export type Existing = {
  people: ExistingPerson[];
  positions: ExistingPosition[];
  /** Units in the shared Music document; null when Music has not saved a lineup yet. */
  musicUnits?: MusicUnitRow[] | null;
  orgChoirs?: OrgChoir[];
};

export function planRows(rows: string[][], existing: Existing, opts: ImportOptions = {}): Plan {
  const plan: Plan = { people: [], issues: [], ignoredColumns: [] };
  const refs = choirRefs(existing.musicUnits ?? null, existing.orgChoirs ?? []);
  const created = new Map<string, ChoirRef>();
  if (rows.length === 0) return { ...plan, fatal: 'The file is empty' };
  const { index, ignored } = mapHeaders(rows[0]!);
  plan.ignoredColumns = ignored;
  if (index.fullName === undefined) {
    return { ...plan, fatal: 'No "Full name" column found in the first row' };
  }
  const warn = (line: number, message: string) => plan.issues.push({ line, level: 'warning', message });
  const fail = (line: number, message: string) => plan.issues.push({ line, level: 'error', message });
  const cell = (r: string[], f: Field) => (index[f] === undefined ? '' : (r[index[f]!] ?? '').trim());

  const byEmail = new Map(existing.people.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]));
  const byPhone = new Map(existing.people.filter((p) => p.phone).map((p) => [p.phone!, p]));
  const byName = new Map(existing.people.map((p) => [plain(p.fullName), p]));
  const seen = new Map<string, PlannedPerson>();
  const holders = new Map<ProtocolOffice, PlannedPerson>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const fullName = cell(r, 'fullName').replace(/\s+/g, ' ');
    if (!fullName) return fail(line, 'No name; row skipped');

    // phone
    const ph = normalizePhone(cell(r, 'phone'));
    if (ph.warning) warn(line, ph.warning);
    // email
    let email: string | null = cell(r, 'email').toLowerCase() || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      warn(line, `email "${email}" is not valid; ignored`);
      email = null;
    }
    // office
    const officeRaw = plain(cell(r, 'office'));
    let office: ProtocolOffice = 'MEMBER';
    if (officeRaw) {
      const o = OFFICE_WORDS[officeRaw] ?? OFFICE_WORDS[officeRaw.replace(/ /g, '')];
      if (!o) return fail(line, `Unknown office "${cell(r, 'office')}" (use President, Vice President, Coordinator, Secretary, Treasurer or Member); row skipped`);
      office = o;
    }
    // choir
    const choirRaw = plain(cell(r, 'choir'));
    let choir: PlannedPerson['choir'] = null;
    if (choirRaw && !['none', 'no', 'n a', 'na', 'nil', 'null'].includes(choirRaw)) {
      const hit = refs.filter((c) => plain(c.name) === choirRaw);
      const pre = choirRaw.length >= 3 ? refs.filter((c) => plain(c.name).startsWith(choirRaw)) : [];
      choir = hit[0] ?? (pre.length === 1 ? pre[0]! : null);
      if (!choir && pre.length > 1) {
        warn(line, `Choir "${cell(r, 'choir')}" matches more than one (${pre.map((c) => c.name).join(', ')}); left without a choir`);
      } else if (!choir && opts.createChoirs) {
        choir = created.get(choirRaw) ?? { name: cell(r, 'choir'), musicUnitId: null, orgUnitId: null, create: true };
        created.set(choirRaw, choir);
        warn(line, `Choir "${cell(r, 'choir')}" is new; it will be created`);
      } else if (!choir) {
        warn(line, `Unknown choir "${cell(r, 'choir')}" (known: ${refs.map((c) => c.name).join(', ') || 'none yet'}); left without a choir. Check the spelling, or use --create-choirs to add it`);
      }
    }

    // who is this?
    const match =
      (email && byEmail.get(email)) || (ph.value && byPhone.get(ph.value)) || byName.get(plain(fullName)) || null;

    // the same person twice in the file
    const key = email ?? ph.value ?? plain(fullName);
    const dup = seen.get(key) ?? seen.get(plain(fullName));
    if (dup) {
      warn(line, `${fullName} already appears on line ${dup.line}; this row is merged into it`);
      dup.phone ??= ph.value;
      dup.email ??= email;
      if (dup.office === 'MEMBER' && office !== 'MEMBER') {
        const other = SINGLE.has(office) ? holders.get(office) : undefined;
        if (other) {
          fail(line, `${OFFICE_LABEL[office]} is already ${other.fullName} (line ${other.line}); only one person holds it`);
        } else {
          dup.office = office;
          dup.createPosition = true;
          if (SINGLE.has(office)) holders.set(office, dup);
        }
      }
      dup.choir ??= choir;
      return;
    }

    const person: PlannedPerson = {
      line,
      fullName,
      phone: ph.value,
      email,
      office,
      choir,
      personId: match?.id ?? null,
      createPosition: office !== 'MEMBER',
    };

    if (SINGLE.has(office)) {
      const other = holders.get(office);
      if (other) {
        return fail(line, `${OFFICE_LABEL[office]} is already ${other.fullName} (line ${other.line}); only one person holds it. Row skipped`);
      }
      holders.set(office, person);
    }
    seen.set(key, person);
    seen.set(plain(fullName), person);
    plan.people.push(person);
  });

  // An office already held on the server by someone else is never taken over silently.
  for (const p of plan.people) {
    if (!p.createPosition) continue;
    const held = existing.positions.find(
      (x) => x.protocolOffice === p.office && x.status === 'ACTIVE',
    );
    if (!held) continue;
    if (held.personId === p.personId) p.createPosition = false; // already has it
    else if (SINGLE.has(p.office)) {
      p.createPosition = false;
      warn(p.line, `${OFFICE_LABEL[p.office]} is already held by someone else on the server; ${p.fullName} is added as a member only. End that position first to change it`);
    }
  }
  return plan;
}

// ---- applying ---------------------------------------------------------------

type Db = any; // PrismaClient, or the in-memory stand-in used in tests

export type NewCredential = { fullName: string; office: ProtocolOffice; username: string; password: string };

export type ApplyResult = {
  accountsCreated: number;
  /** Temporary sign-ins just made. The only time the passwords exist in clear. */
  credentials: NewCredential[];
  peopleCreated: number;
  peopleUpdated: number;
  positionsCreated: number;
  membershipsCreated: number;
  rosterAdded: number;
  rosterUpdated: number;
  choirsCreated: number;
  musicUnitsAdded: number;
};

/** Letters and digits that cannot be mistaken for each other when read aloud or typed. */
const PW_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function tempPassword(length = 12): string {
  return Array.from({ length }, () => PW_CHARS[randomInt(PW_CHARS.length)]).join('');
}

async function freeUsername(db: Db, p: PlannedPerson): Promise<string> {
  const base =
    (p.email?.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '') ||
    plain(p.fullName).replace(/ /g, '.') ||
    'member';
  let name = base;
  for (let n = 2; await db.account.findUnique({ where: { username: name } }); n++) name = `${base}${n}`;
  return name;
}

export async function loadExisting(db: Db): Promise<Existing> {
  const people = (await db.person.findMany({})) as ExistingPerson[];
  const positions = (await db.position.findMany({
    where: { systemId: 'sys-protocol' },
  })) as ExistingPosition[];
  const orgChoirs = ((await db.orgUnit.findMany({ where: { systemId: 'sys-choir', type: 'TEAM' } })) as OrgChoir[]).map(
    (o) => ({ id: o.id, name: o.name }),
  );
  const music = await db.scheduleDocument.findUnique({ where: { key: 'music' } });
  const units = music ? JSON.parse(music.data)?.musicSchedule?.units : null;
  return { people, positions, orgChoirs, musicUnits: Array.isArray(units) ? (units as MusicUnitRow[]) : null };
}

/** Make sure every choir the file uses exists as an org unit and on Music's list. */
async function settleChoirs(db: Db, plan: Plan, out: ApplyResult) {
  const used = [...new Set(plan.people.map((p) => p.choir).filter((c): c is ChoirRef => !!c))];
  const need = used.filter((c) => c.create || !c.musicUnitId);
  if (need.length === 0) return;

  const orgs = (await db.orgUnit.findMany({ where: { systemId: 'sys-choir', type: 'TEAM' } })) as (OrgChoir & {
    parentId?: string | null;
  })[];
  for (const c of need.filter((x) => x.create)) {
    let parentId = orgs.find((o) => o.parentId)?.parentId ?? null;
    if (!parentId) {
      const sys = await db.churchSystem.findUnique({ where: { id: 'sys-choir' } });
      parentId = sys?.orgUnitId ?? null;
    }
    if (!parentId) continue; // no choir tree on this server: the choir exists on Music's list only
    let id = `ou-choir-${slug(c.name)}`;
    for (let n = 2; await db.orgUnit.findUnique({ where: { id } }); n++) id = `ou-choir-${slug(c.name)}-${n}`;
    await db.orgUnit.create({ data: { id, name: c.name, type: 'TEAM', parentId, systemId: 'sys-choir' } });
    orgs.push({ id, name: c.name, parentId });
    c.orgUnitId = id;
    out.choirsCreated++;
  }

  const doc = await db.scheduleDocument.findUnique({ where: { key: 'music' } });
  const data: Record<string, any> = doc ? JSON.parse(doc.data) : {};
  const ms: Record<string, any> = data.musicSchedule ?? {};
  const hadUnits = Array.isArray(ms.units);
  const list: MusicUnitRow[] = hadUnits ? ms.units : [];
  const add = (name: string, orgUnitId: string | null): string => {
    const found = list.find((u) => (orgUnitId && u.orgUnitId === orgUnitId) || plain(u.name) === plain(name));
    if (found) return found.id;
    let id = `mu-${slug(name)}`;
    for (let n = 2; list.some((u) => u.id === id); n++) id = `mu-${slug(name)}-${n}`;
    list.push({ id, kind: 'PRIMARY', name, ...(orgUnitId ? { orgUnitId } : {}), systemId: 'sys-choir', active: true } as MusicUnitRow);
    out.musicUnitsAdded++;
    return id;
  };
  // Music has never saved a lineup: start it from the server's choirs, so a
  // one-choir list does not replace the others.
  if (!hadUnits) for (const o of orgs) add(o.name, o.id);
  for (const c of need) if (!c.musicUnitId) c.musicUnitId = add(c.name, c.orgUnitId);
  ms.units = list;
  data.musicSchedule = ms;
  const json = JSON.stringify(data);
  if (doc) {
    await db.scheduleDocumentRevision.create({
      data: { key: 'music', version: doc.version, data: doc.data, savedByPersonId: doc.updatedByPersonId ?? null },
    });
    await db.scheduleDocument.update({ where: { key: 'music' }, data: { data: json, version: doc.version + 1, updatedByPersonId: null } });
  } else {
    await db.scheduleDocument.create({ data: { key: 'music', data: json, version: 1 } });
  }
}

export async function applyPlan(
  db: Db,
  plan: Plan,
  opts: { accounts?: boolean } = {},
): Promise<ApplyResult> {
  const out: ApplyResult = {
    peopleCreated: 0,
    peopleUpdated: 0,
    positionsCreated: 0,
    membershipsCreated: 0,
    rosterAdded: 0,
    rosterUpdated: 0,
    choirsCreated: 0,
    musicUnitsAdded: 0,
    accountsCreated: 0,
    credentials: [],
  };
  await settleChoirs(db, plan, out);
  const ensureMembership = async (
    personId: string,
    systemId: string,
    type: string,
    label: string,
    orgUnitId: string | null = null,
  ) => {
    const have = await db.membership.findFirst({
      where: { personId, systemId, status: 'ACTIVE', ...(orgUnitId ? { orgUnitId } : {}) },
    });
    if (have) return;
    await db.membership.create({
      data: { personId, systemId, type, label, status: 'ACTIVE', ...(orgUnitId ? { orgUnitId } : {}) },
    });
    out.membershipsCreated++;
  };

  const resolved: { personId: string; p: PlannedPerson }[] = [];
  for (const p of plan.people) {
    let personId = p.personId;
    if (personId) {
      const cur = await db.person.findUnique({ where: { id: personId } });
      const patch: Record<string, unknown> = {};
      if (p.phone && !cur.phone) patch.phone = p.phone;
      if (p.email && !cur.email) patch.email = p.email;
      if (Object.keys(patch).length) {
        await db.person.update({ where: { id: personId }, data: patch });
        out.peopleUpdated++;
      }
    } else {
      personId = `p-${randomUUID().slice(0, 8)}`;
      await db.person.create({
        data: { id: personId, fullName: p.fullName, phone: p.phone, email: p.email, status: 'ACTIVE' },
      });
      out.peopleCreated++;
    }
    resolved.push({ personId, p });

    if (opts.accounts) {
      const has = await db.account.findFirst({ where: { personId } });
      if (!has) {
        const username = await freeUsername(db, p);
        const password = tempPassword();
        await db.account.create({
          data: { id: `acc-${personId}`, personId, username, passwordHash: await hashPassword(password) },
        });
        out.accountsCreated++;
        out.credentials.push({ fullName: p.fullName, office: p.office, username, password });
      }
    }
    await ensureMembership(personId, 'sys-main', 'CHURCH_MEMBER', 'Church member');
    await ensureMembership(personId, 'sys-protocol', 'MINISTRY_MEMBER', 'Protocol member');
    if (p.choir?.orgUnitId) {
      await ensureMembership(personId, 'sys-choir', 'CHOIR_MEMBER', 'Choir member', p.choir.orgUnitId);
    }
    if (p.createPosition) {
      await db.position.create({
        data: {
          personId,
          systemId: 'sys-protocol',
          orgUnitId: 'ou-protocol',
          title: OFFICE_LABEL[p.office],
          protocolOffice: p.office,
          status: 'ACTIVE',
        },
      });
      out.positionsCreated++;
    }
  }

  // The roster lives in the shared Protocol document. Add people; keep any
  // availability the Coordinator has already set for those who are on it.
  const doc = await db.scheduleDocument.findUnique({ where: { key: 'protocol' } });
  const data: Record<string, unknown> = doc ? JSON.parse(doc.data) : {};
  const roster = (Array.isArray(data.protocolRoster) ? data.protocolRoster : []) as Record<string, any>[];
  for (const { personId, p } of resolved) {
    const row = roster.find((r) => r.personId === personId);
    if (row) {
      row.displayName = p.fullName;
      if (p.email) row.email = p.email;
      if (p.choir?.musicUnitId) row.choirUnitId = p.choir.musicUnitId;
      if (p.office !== 'MEMBER') row.office = p.office;
      out.rosterUpdated++;
    } else {
      roster.push({
        id: `prm-${personId}`,
        personId,
        office: p.office,
        serveDays: 'BOTH',
        status: 'ACTIVE',
        unavailableDates: [],
        displayName: p.fullName,
        ...(p.email ? { email: p.email } : {}),
        ...(p.choir?.musicUnitId ? { choirUnitId: p.choir.musicUnitId } : {}),
      });
      out.rosterAdded++;
    }
  }
  data.protocolRoster = roster;
  const json = JSON.stringify(data);
  if (doc) {
    await db.scheduleDocumentRevision.create({
      data: { key: 'protocol', version: doc.version, data: doc.data, savedByPersonId: doc.updatedByPersonId ?? null },
    });
    await db.scheduleDocument.update({
      where: { key: 'protocol' },
      data: { data: json, version: doc.version + 1, updatedByPersonId: null },
    });
  } else {
    await db.scheduleDocument.create({ data: { key: 'protocol', data: json, version: 1 } });
  }
  return out;
}
