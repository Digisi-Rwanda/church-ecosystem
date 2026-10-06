/**
 * Settings (slice 2.1): Central Administration's six settings. Every change is audited
 * with what it was and what it became. Only the Church Leader, Catechist and Church
 * Secretary change them; Administrators may read them.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { liveHoldings } from '../capabilities/engine.js';
import { loadAccessData } from '../notifications/feed.js';
import { DEFAULTS, SETTINGS_EDITORS, SETTING_KEYS, check, isSettingKey, resolve, type SettingKey } from '../settings/catalog.js';
import { loadSettingRows } from '../settings/store.js';

export const settingsRouter = Router();

const MAIN = 'sys-main';
const fail = (res: import('express').Response, status: number, code: string, error: string) => res.status(status).json({ error, code });

async function powers(personId: string) {
  const { data } = await loadAccessData(personId);
  const own = liveHoldings(personId, data, new Date()).filter((h) => h.via === 'OFFICE').map((h) => h.office);
  const canChange = own.some((o) => (SETTINGS_EDITORS as readonly string[]).includes(o));
  return { canChange, canRead: canChange || own.includes('ADMINISTRATOR') };
}

/** The few values everyone signed in may read: the church's name and the lists the forms offer. */
settingsRouter.get('/public', requireAuth, async (_req, res) => {
  const v = resolve(await loadSettingRows());
  res.json({
    churchName: v['church.profile'].name,
    shortName: v['church.profile'].shortName,
    defaultLanguage: v['church.language'],
    letterTypes: v['letters.types'],
    meetingTypes: v['meetings.types'],
  });
});

settingsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const pw = await powers(req.auth!.personId);
  if (!pw.canRead) return fail(res, 403, 'NOT_ALLOWED', 'Only Central Administration reads settings');
  const rows = await loadSettingRows();
  const values = resolve(rows);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const ids = [...new Set(rows.map((r) => r.updatedById).filter((x): x is string => !!x))];
  const people = ids.length ? ((await prisma.person.findMany({ where: { id: { in: ids } } })) as Array<{ id: string; fullName: string }>) : [];
  const nameOf = new Map(people.map((p) => [p.id, p.fullName]));
  res.json({
    canChange: pw.canChange,
    settings: SETTING_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        key,
        value: values[key],
        isDefault: !row,
        defaultValue: DEFAULTS[key],
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        updatedByName: row?.updatedById ? (nameOf.get(row.updatedById) ?? '') : null,
      };
    }),
  });
});

async function audit(actorId: string, action: string, key: SettingKey, before: unknown, after: unknown) {
  await prisma.auditEvent.create({
    data: {
      at: new Date(),
      actorId,
      systemId: MAIN,
      action,
      resource: 'SETTING',
      detail: `${action === 'SETTING_RESET' ? 'Reset' : 'Changed'} ${key}`,
      metaJson: JSON.stringify({ key, before, after }),
    },
  });
}

settingsRouter.put('/:key', requireAuth, async (req: AuthedRequest, res) => {
  const key = String(req.params.key);
  if (!isSettingKey(key)) return fail(res, 404, 'UNKNOWN_SETTING', 'No such setting');
  const me = req.auth!.personId;
  if (!(await powers(me)).canChange) return fail(res, 403, 'NOT_ALLOWED', 'Only the Church Leader, Catechist and Church Secretary change settings');
  const c = check(key, (req.body as { value?: unknown } | undefined)?.value);
  if (!c.ok) return fail(res, 400, 'BAD_VALUE', c.message);
  const before = resolve(await loadSettingRows())[key];
  const valueJson = JSON.stringify(c.value);
  if (JSON.stringify(before) === valueJson) return res.json({ ok: true, changed: false });
  await prisma.setting.upsert({
    where: { key },
    update: { valueJson, updatedById: me, updatedAt: new Date() },
    create: { key, valueJson, updatedById: me },
  });
  await audit(me, 'SETTING_CHANGED', key, before, c.value);
  res.json({ ok: true, changed: true });
});

/** Put a setting back to its default. */
settingsRouter.delete('/:key', requireAuth, async (req: AuthedRequest, res) => {
  const key = String(req.params.key);
  if (!isSettingKey(key)) return fail(res, 404, 'UNKNOWN_SETTING', 'No such setting');
  const me = req.auth!.personId;
  if (!(await powers(me)).canChange) return fail(res, 403, 'NOT_ALLOWED', 'Only the Church Leader, Catechist and Church Secretary change settings');
  const before = resolve(await loadSettingRows())[key];
  const had = ((await prisma.setting.findMany({ where: { key } })) as unknown[]).length > 0;
  if (!had) return res.json({ ok: true, changed: false });
  await prisma.setting.deleteMany({ where: { key } });
  await audit(me, 'SETTING_RESET', key, before, DEFAULTS[key]);
  res.json({ ok: true, changed: true });
});
