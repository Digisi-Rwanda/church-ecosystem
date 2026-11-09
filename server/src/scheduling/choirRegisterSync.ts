import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type RegisterClient = Pick<Prisma.TransactionClient, 'musicChoir' | 'choirCategory' | 'choirCategoryLink'>;

/**
 * Give a choir its category link when it has none, from its register type.
 * Name kept (it used to reconcile DRAFT versions) so routes/music.ts does not change.
 *
 * With live configuration there is no draft to fill, so this now only ever ADDS a missing link
 * to the live config. It never moves an existing link and never invents a category.
 * Adding a link cannot make a valid configuration invalid, so it skips the edit lock and
 * validation by design. TODO(confirm): previously a register-type change also re-pointed a
 * link inside the draft; that reclassification is dropped because it would silently change live rules.
 */
export async function syncChoirRegisterDrafts(db: RegisterClient = prisma, options: { choirId?: string } = {}) {
  const choirs = await db.musicChoir.findMany({ where: { active: true, ...(options.choirId ? { id: options.choirId } : {}) } });
  const [categories, links] = await Promise.all([
    db.choirCategory.findMany({ where: { systemId: 'sys-music', active: true } }),
    db.choirCategoryLink.findMany({ where: { systemId: 'sys-music', active: true } }),
  ]);
  for (const choir of choirs) {
    const category = categories.find((row) => row.code.toUpperCase() === choir.role.toUpperCase());
    if (!category) continue; // A leader must supply the matching category; never invent one.
    if (links.some((row) => row.choirId === choir.id)) continue;
    await db.choirCategoryLink.create({
      data: {
        systemId: 'sys-music', choirId: choir.id, categoryId: category.id, active: true,
        eligibleOverrideJson: '{}', frequencyOverrideJson: '{}', createdByPersonId: choir.createdById ?? 'system',
      },
    });
  }
}
