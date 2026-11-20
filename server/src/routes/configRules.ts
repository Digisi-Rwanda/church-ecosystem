/**
 * Rules as an API resource (Music only). The rest of the app speaks Rules; only `scheduling/ruleModel.ts`
 * knows which tables sit behind them.
 *
 *   GET    /api/scheduling/config/rules              every rule, expanded from the tables (+ warnings)
 *   POST   /api/scheduling/config/rules              create a rule
 *   PATCH  /api/scheduling/config/rules/:id          change a rule     body { patch }
 *   DELETE /api/scheduling/config/rules/:id          remove a rule (needs the edit lock, like every write)
 *   GET    /api/scheduling/config/choirs             choirs with their one category (null = Unassigned)
 *   PUT    /api/scheduling/config/choirs/:id/category   body { categoryId }
 *
 * EVERY write goes through `saveConfigChange`: SCHEDULING W check (403), edit lock (409 LOCKED), reference
 * checks, the full generation validator (422 { errors }), one transaction with audit entries. This file builds
 * a ConfigOp and maps the refusal to HTTP; it never touches a table.
 *
 * Mounted from scheduling/configRouter.ts (`configRouter.use(configRulesRouter)`), so the paths above sit
 * beside the other /config routes and share their auth.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest, pathParam } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { canReadConfig } from '../scheduling/rules.js';
import { FrequencyPeriodSchema } from '../scheduling/musicConfigRules.js';
import { ConfigError, MUSIC_SYSTEM, readRuleModel, saveConfigChange, type ConfigOp } from '../scheduling/saveConfigChange.js';

export const configRulesRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code, errors: [error] });
const Id = z.string().min(1);
const Count = z.number().int().nonnegative();

const Frequency = z.object({
  kind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']),
  target: z.number().int().positive(),
  period: FrequencyPeriodSchema.nullable().default(null), // null: follows the period chosen when generating
  counting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).default('ASSIGNMENTS'),
}).strict();

const Exception = z.object({
  choirId: Id,
  eligible: z.boolean().optional(),
  frequency: z.object({
    kind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']).optional(),
    target: z.number().int().positive().optional(),
    period: FrequencyPeriodSchema.optional(),
    counting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).optional(),
  }).strict().optional(),
}).strict();

export const RuleSchema = z.object({
  scope: z.array(Id).min(1).max(40),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('category'), categoryId: Id }).strict(),
    z.object({ kind: z.literal('choir'), choirId: Id }).strict(),
  ]),
  arrangement: z.enum(['FIXED', 'ROTATION', 'MANUAL']),
  minCount: Count.nullable().optional(),
  maxCount: Count.nullable().optional(),
  frequency: Frequency.nullable().optional(),
  requireAll: z.boolean().optional(),
  exceptions: z.array(Exception).max(200).optional(),
});

async function readGate(req: AuthedRequest, res: Res): Promise<boolean> {
  const me = req.auth!.personId;
  if (!canReadConfig(me, MUSIC_SYSTEM, (await loadAccessData(me)).data)) { fail(res, 404, 'NOT_FOUND', 'Not found'); return false; }
  return true;
}

async function save(req: AuthedRequest, res: Res, op: ConfigOp, created = false) {
  try {
    const { results } = await saveConfigChange(MUSIC_SYSTEM, req.auth!.personId, { ops: [op] });
    const main = results.find((r) => r.op === op.op);
    return res.status(created ? 201 : 200).json({ ok: true, status: main?.status, rules: Array.isArray(main?.row) ? main!.row : [] });
  } catch (error) {
    if (error instanceof ConfigError) return res.status(error.status).json(error.body);
    throw error;
  }
}

configRulesRouter.get('/config/rules', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res))) return;
  const { rules, warnings } = await readRuleModel();
  res.json({ rules, warnings });
});

configRulesRouter.get('/config/choirs', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res))) return;
  res.json({ choirs: (await readRuleModel()).choirs });
});

configRulesRouter.post('/config/rules', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = RuleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the rule fields');
  return save(req, res, { op: 'musicRule.create', data: parsed.data }, true);
});

configRulesRouter.patch('/config/rules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  const parsed = z.object({ patch: RuleSchema.partial() }).safeParse(req.body);
  if (!id || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the rule fields');
  return save(req, res, { op: 'musicRule.update', id, patch: parsed.data.patch });
});

configRulesRouter.delete('/config/rules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  if (!id) return fail(res, 400, 'BAD_INPUT', 'Invalid rule id');
  return save(req, res, { op: 'musicRule.delete', id });
});

configRulesRouter.put('/config/choirs/:id/category', requireAuth, async (req: AuthedRequest, res) => {
  const choirId = pathParam(req, 'id');
  const parsed = z.object({ categoryId: Id.nullable() }).safeParse(req.body);
  if (!choirId || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a category');
  return save(req, res, { op: 'choir.setCategory', choirId, categoryId: parsed.data.categoryId });
});
