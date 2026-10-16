import { describe, expect, it, vi } from 'vitest';
import { composeDigest, kigaliDay, runDigests, webhookGateway, type Gateway, type RunDb } from '../src/digest/digest';
import type { Notice } from '../src/notifications/rules';

const n = (over: Partial<Notice>): Notice => ({ key: 'k', kind: 'FOR_INFORMATION', source: 'STORED', title: 't', body: null, href: null, systemId: 'sys-main', createdAt: '2026-10-01T00:00:00Z', important: false, read: false, rank: 5, ...over });

function db(prefs: Array<{ personId: string; digestChannel: string }>, people: any[]) {
  const logs: any[] = [];
  const d: RunDb = {
    preference: { findMany: async () => prefs },
    person: { findMany: async () => people },
    digestLog: {
      findFirst: async ({ where }: any) => logs.find((l) => l.personId === where.personId && l.day === where.day) ?? null,
      create: async ({ data }: any) => { logs.push(data); return data; },
    },
  };
  return { d, logs };
}
const ok: Gateway = { name: 'x', send: vi.fn(async () => 'SENT' as const) };

describe('digest', () => {
  it('counts the day in Kigali time', () => {
    expect(kigaliDay(new Date('2026-10-07T23:30:00Z'))).toBe('2026-10-08');
  });

  it('says nothing when nothing is unread, and puts waiting items first', () => {
    expect(composeDigest([n({ read: true })], 'https://x')).toBeNull();
    const d = composeDigest([n({ title: 'Info' }), n({ kind: 'WAITING_FOR_ME', title: 'Approve budget' })], 'https://x/')!;
    expect(d.count).toBe(2);
    expect(d.text.indexOf('Approve budget')).toBeLessThan(d.text.indexOf('Info'));
    expect(d.text).toContain('https://x/notifications');
  });

  it('caps the list and says how many more', () => {
    const d = composeDigest(Array.from({ length: 14 }, (_, i) => n({ title: `T${i}` })), 'https://x')!;
    expect(d.text).toContain('and 4 more');
  });

  it('sends once a day, records no-contact and empty, and ignores people who chose Off', async () => {
    const { d, logs } = db(
      [{ personId: 'a', digestChannel: 'EMAIL' }, { personId: 'b', digestChannel: 'SMS' }, { personId: 'c', digestChannel: 'EMAIL' }, { personId: 'd', digestChannel: 'OFF' }],
      [{ id: 'a', email: 'a@x.org' }, { id: 'b', phone: null }, { id: 'c', email: 'c@x.org' }, { id: 'd', email: 'd@x.org' }],
    );
    const load = async (id: string) => (id === 'c' ? [] : [n({})]);
    const now = new Date('2026-10-08T06:00:00Z');
    const first = await runDigests(d, load, ok, { now, appUrl: 'https://x' });
    expect(first).toMatchObject({ considered: 3, sent: 1, noContact: 1, empty: 1 });
    const again = await runDigests(d, load, ok, { now, appUrl: 'https://x' });
    expect(again).toMatchObject({ sent: 0, skipped: 3 });
    expect(logs).toHaveLength(3);
  });

  it('records a failed send without stopping the others', async () => {
    const { d } = db([{ personId: 'a', digestChannel: 'EMAIL' }, { personId: 'b', digestChannel: 'EMAIL' }], [{ id: 'a', email: 'a@x' }, { id: 'b', email: 'b@x' }]);
    let i = 0;
    const flaky: Gateway = { name: 'f', send: async () => { if (i++ === 0) throw new Error('down'); return 'SENT'; } };
    const r = await runDigests(d, async () => [n({})], flaky, { appUrl: 'https://x' });
    expect(r).toMatchObject({ failed: 1, sent: 1 });
  });

  it('the webhook gateway posts JSON and fails on a bad answer', async () => {
    const post = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;
    const g = webhookGateway('https://hook', 's', post);
    expect(await g.send({ channel: 'EMAIL', to: 'a@x', subject: 's', text: 't' })).toBe('SENT');
    const bad = webhookGateway('https://hook', undefined, (async () => new Response('', { status: 500 })) as unknown as typeof fetch);
    await expect(bad.send({ channel: 'SMS', to: '1', subject: 's', text: 't' })).rejects.toThrow();
  });
});
