import { prisma } from '../lib/prisma.js';
import { CHOIR_PARENT_ORG, choirSystemId } from '../lib/ministryOrgs.js';

const slugOf = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'choir';

/**
 * Every choir is a system of its own, with its own unit under the Choir Ministry, so it has its own President, Secretary
 * and Treasurer, people, work, money and reports. Adding a choir makes both; the ids come from the name.
 */
export async function createChoirSystem(name: string): Promise<{ systemId: string; orgUnitId: string }> {
  const base = slugOf(name);
  let slug = base;
  for (let n = 2; await prisma.churchSystem.findUnique({ where: { id: choirSystemId(`ou-choir-${slug}`) } }); n += 1) slug = `${base}-${n}`;
  const orgUnitId = `ou-choir-${slug}`;
  const systemId = choirSystemId(orgUnitId);
  const parent = (await prisma.orgUnit.findUnique({ where: { id: CHOIR_PARENT_ORG.id } })) as { id: string } | null;
  await prisma.orgUnit.create({ data: { id: orgUnitId, name, type: 'TEAM', kind: 'TEAM', parentId: parent?.id ?? null, systemId } });
  await prisma.churchSystem.create({
    data: { id: systemId, code: `CHOIR-${slug.toUpperCase()}`, name, shortName: name, kind: 'MINISTRY', basePath: `/systems/choir/${slug}`, description: 'A choir with its own system', orgUnitId },
  });
  return { systemId, orgUnitId };
}
