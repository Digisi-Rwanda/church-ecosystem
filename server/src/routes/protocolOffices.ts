import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';

/**
 * Who holds each Protocol office (Coordinator, President, Vice President,
 * Secretary, Treasurer), straight from the server's Positions. The app reads
 * this so a person's Protocol role is the same in every browser, and so it
 * matches what the server itself uses to check permissions.
 */
export const protocolOfficesRouter = Router();

protocolOfficesRouter.get('/', requireAuth, async (_req: AuthedRequest, res) => {
  const now = new Date();
  const positions = (
    await prisma.position.findMany({
      where: { systemId: 'sys-protocol', status: 'ACTIVE' },
    })
  ).filter(
    (p: { protocolOffice: string | null; startDate: Date; endDate: Date | null }) =>
      Boolean(p.protocolOffice) &&
      p.startDate <= now &&
      (!p.endDate || p.endDate >= now),
  );
  const ids = [...new Set(positions.map((p: { personId: string }) => p.personId))] as string[];
  const people = ids.length
    ? await prisma.person.findMany({ where: { id: { in: ids } } })
    : [];
  const byId = new Map(
    people.map((p: { id: string }) => [p.id, p] as const),
  );
  res.json({
    offices: positions.map(
      (p: {
        id: string;
        personId: string;
        title: string;
        protocolOffice: string | null;
        startDate: Date;
      }) => {
        const person = byId.get(p.personId) as
          | { id: string; fullName: string; preferredName: string | null; email: string | null }
          | undefined;
        return {
          id: p.id,
          personId: p.personId,
          title: p.title,
          protocolOffice: p.protocolOffice,
          startDate: p.startDate.toISOString().slice(0, 10),
          person: person
            ? {
                id: person.id,
                fullName: person.fullName,
                preferredName: person.preferredName,
                email: person.email,
              }
            : null,
        };
      },
    ),
  });
});
