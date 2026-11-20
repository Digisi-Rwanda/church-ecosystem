import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { officeOf } from './offices.js';

/** Operator-only first-role setup. Reuses an existing account and never changes its password. */
export async function firstChiefAdministrator(db: PrismaClient, input: { username: string; apply?: boolean; expectedPersonId?: string; allowExisting?: boolean }) {
  return db.$transaction(async tx => {
    const positions = await tx.position.findMany();
    // Historical or expired chief appointments require recovery, not another bootstrap.
    const account = await tx.account.findUnique({where: {username: input.username.trim().toLowerCase()}});
    if (!account) throw new Error('No account matches that username. Register the person and arrange their sign-in first.');
    const person = await tx.person.findUnique({where: {id: account.personId}});
    if (!person || person.archivedAt || person.status !== 'ACTIVE') throw new Error('The account must belong to an active, unarchived person.');
    const chiefs = positions.filter(p => officeOf(p) === 'ADMINISTRATOR');
    if (chiefs.length) {
      // Repeatable deployment seed: acknowledge only the exact, still-live holder.
      const now = new Date();
      const existing = chiefs.find(p => p.personId === person.id && p.status === 'ACTIVE'
        && (!p.startDate || new Date(p.startDate) <= now) && (!p.endDate || new Date(p.endDate) > now));
      if (input.allowExisting && input.expectedPersonId === person.id && existing) {
        return {applied: false, alreadyExists: true, username: account.username, personId: person.id, fullName: person.fullName, positionId: existing.id};
      }
      throw new Error('A Chief Administrator appointment already exists. Use the normal appointment or recovery process.');
    }
    const system = await tx.churchSystem.findUnique({where: {id: 'sys-media'}});
    const unit = system?.orgUnitId ? await tx.orgUnit.findUnique({where: {id: system.orgUnitId}}) : null;
    if (!unit || unit.systemId !== 'sys-media') throw new Error('Media needs a valid organizational unit before the Chief Administrator can be appointed.');
    const plan = {username: account.username, personId: person.id, fullName: person.fullName, systemId: 'sys-media', orgUnitId: unit.id};
    if (!input.apply) return {applied: false, ...plan};
    if (input.expectedPersonId !== person.id) throw new Error('Confirm the exact person ID from the dry run before applying.');
    const position = await tx.position.create({data: {id: `pos-chief-${randomUUID()}`,personId: person.id,systemId: 'sys-media',orgUnitId: unit.id,title: 'Chief Administrator',office: 'ADMINISTRATOR',systemAdmin: true,grantsAllSystems: false,status: 'ACTIVE',startDate: new Date()}});
    await tx.auditEvent.create({data: {actorId: person.id,systemId: 'sys-media',action: 'FIRST_CHIEF_ADMINISTRATOR_BOOTSTRAPPED',resource: 'POSITION',detail: 'First Chief Administrator appointed through operator-only setup',metaJson: JSON.stringify({...plan,positionId:position.id})}});
    return {applied: true, ...plan, positionId: position.id};
  }, {isolationLevel: 'Serializable'});
}
