import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type RegisterClient = Pick<Prisma.TransactionClient, 'configVersion' | 'musicChoir' | 'choirCategory' | 'choirCategoryLink'>;
const REGISTER_TYPES = new Set(['PRIMARY', 'SECONDARY', 'CHILDREN', 'WORSHIP']);

/** Reconcile register types only into editable drafts; saved active/history pins stay untouched. */
export async function syncChoirRegisterDrafts(db: RegisterClient = prisma, options: { versionId?: string; choirId?: string } = {}) {
  const versions = await db.configVersion.findMany({ where: { systemId: 'sys-music', status: 'DRAFT', ...(options.versionId ? { id: options.versionId } : {}) } });
  const choirs = await db.musicChoir.findMany({ where: { active: true, ...(options.choirId ? { id: options.choirId } : {}) } });
  for (const version of versions) {
    const scope = { systemId: 'sys-music', configVersionId: version.id };
    const [categories, links] = await Promise.all([
      db.choirCategory.findMany({ where: { ...scope, active: true } }),
      db.choirCategoryLink.findMany({ where: scope }),
    ]);
    for (const choir of choirs) {
      const category = categories.find(row => row.code.toUpperCase() === choir.role.toUpperCase());
      if (!category) continue; // A leader must supply the matching category; never invent one.
      const prior = links.filter(row => row.choirId === choir.id);
      if (prior.length === 0) {
        await db.choirCategoryLink.create({ data: { ...scope, choirId: choir.id, categoryId: category.id, active: true, effectiveFrom: new Date(), effectiveTo: null, supersedesId: null, eligibleOverrideJson: '{}', frequencyOverrideJson: '{}', createdByPersonId: version.createdByPersonId } });
      } else if (prior.length === 1 && prior[0]!.active) {
        const link = prior[0]!;
        const previousCategory = categories.find(row => row.id === link.categoryId);
        // Explicit custom-category choices and disabled links remain under leader control.
        if (previousCategory && REGISTER_TYPES.has(previousCategory.code.toUpperCase()) && link.categoryId !== category.id) {
          await db.choirCategoryLink.update({ where: { id: link.id }, data: { categoryId: category.id } });
        }
      }
    }
  }
}
