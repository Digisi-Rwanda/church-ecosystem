import {
  mergeStewardship,
  parseStewardship,
  serializeStewardship,
} from './stewardshipJson.js';
import { prisma } from '../lib/prisma.js';

/**
 * Close a program activity session; mark linked REQUIRED delivery DONE.
 */
export async function closeActivitySession(
  activityId: string,
  opts?: { completeLinkedDelivery?: boolean },
) {
  const activity = await prisma.programActivity.findUnique({
    where: { id: activityId },
  });
  if (!activity) {
    return { ok: false as const, status: 404, error: 'Activity not found' };
  }
  if (activity.sessionClosedAt) {
    return {
      ok: true as const,
      activity,
      alreadyClosed: true,
      deliveryCompleted: false,
    };
  }
  const closed = await prisma.programActivity.update({
    where: { id: activityId },
    data: { sessionClosedAt: new Date() },
  });

  let deliveryCompleted = false;
  if (opts?.completeLinkedDelivery !== false) {
    const program = await prisma.program.findUnique({
      where: { id: activity.programId },
    });
    if (program) {
      const s = parseStewardship(program.stewardshipJson);
      const items = [...(s.deliveryItems ?? [])];
      let changed = false;
      for (const d of items) {
        if (
          d.activityId === activityId &&
          d.tier === 'REQUIRED' &&
          d.status === 'TODO'
        ) {
          d.status = 'DONE';
          changed = true;
          deliveryCompleted = true;
        }
      }
      if (changed) {
        const next = mergeStewardship(s, { deliveryItems: items });
        await prisma.program.update({
          where: { id: program.id },
          data: {
            stewardshipJson: serializeStewardship(next),
            stewardshipVersion: { increment: 1 },
          },
        });
      }
    }
  }

  return {
    ok: true as const,
    activity: closed,
    alreadyClosed: false,
    deliveryCompleted,
  };
}
