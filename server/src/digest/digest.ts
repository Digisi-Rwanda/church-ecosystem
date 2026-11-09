/**
 * The daily digest (slice 4.4): one short message a day with what is waiting for a person, by the channel they
 * chose (email, SMS or WhatsApp). The message is composed here; how it travels is a Gateway, so the church can
 * plug in any provider (a webhook) without a code change. With no gateway the digest is only logged.
 */
import type { Notice } from '../notifications/rules.js';

export const DIGEST_CHANNELS = ['OFF', 'EMAIL', 'SMS', 'WHATSAPP'] as const;
export type DigestChannel = (typeof DIGEST_CHANNELS)[number];

const MAX_LINES = 10;

/** The day in Kigali (UTC+2, no daylight saving), as YYYY-MM-DD: the unit "once a day" is counted in. */
export const kigaliDay = (now: Date): string => new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);

export interface Digest { count: number; waiting: number; subject: string; text: string }

/** Unread things only, the ones waiting for the person first. Nothing unread means no digest (null). */
export function composeDigest(notices: Notice[], appUrl: string): Digest | null {
  const unread = notices.filter((n) => !n.read);
  if (unread.length === 0) return null;
  const waiting = unread.filter((n) => n.kind === 'WAITING_FOR_ME');
  const info = unread.filter((n) => n.kind !== 'WAITING_FOR_ME');
  const ordered = [...waiting, ...info];
  const lines = ordered.slice(0, MAX_LINES).map((n) => `- ${n.title}`);
  if (ordered.length > MAX_LINES) lines.push(`- and ${ordered.length - MAX_LINES} more`);
  const head = waiting.length > 0
    ? `${waiting.length} ${waiting.length === 1 ? 'thing needs' : 'things need'} your attention${info.length ? `, and ${info.length} for information` : ''}.`
    : `${info.length} for your information.`;
  return {
    count: unread.length,
    waiting: waiting.length,
    subject: `ADEPR Kacyiru: ${head.replace(/\.$/, '')}`,
    text: `${head}\n\n${lines.join('\n')}\n\nOpen the app: ${appUrl.replace(/\/$/, '')}/notifications\n`,
  };
}

export interface Outgoing { channel: Exclude<DigestChannel, 'OFF'>; to: string; subject: string; text: string }
export interface Gateway { name: string; send(msg: Outgoing): Promise<'SENT' | 'LOGGED'> }

/** Logs only. The default, so nothing leaves the server until the church has chosen a provider. */
export const logGateway: Gateway = {
  name: 'log',
  async send(msg) {
    console.log(`[digest] would send by ${msg.channel} to ${msg.to.replace(/.(?=.{3})/g, '*')}: ${msg.subject}`);
    return 'LOGGED';
  },
};

/** Posts each message as JSON to one URL (Make, Zapier, an SMS or WhatsApp provider's relay, a small mail service). */
export function webhookGateway(url: string, secret?: string, post: typeof fetch = fetch): Gateway {
  return {
    name: 'webhook',
    async send(msg) {
      const res = await post(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-digest-secret': secret } : {}) },
        body: JSON.stringify(msg),
      });
      if (!res.ok) throw new Error(`gateway answered ${res.status}`);
      return 'SENT';
    },
  };
}

export function gatewayFromEnv(env: NodeJS.ProcessEnv = process.env): Gateway {
  return env.DIGEST_WEBHOOK_URL ? webhookGateway(env.DIGEST_WEBHOOK_URL, env.DIGEST_WEBHOOK_SECRET) : logGateway;
}

export interface RunDb {
  preference: { findMany(a?: any): Promise<Array<{ personId: string; digestChannel?: string | null }>> };
  person: { findMany(a?: any): Promise<Array<{ id: string; email?: string | null; phone?: string | null; archivedAt?: Date | null; status?: string }>> };
  digestLog: { findFirst(a: any): Promise<unknown>; create(a: any): Promise<unknown> };
}

export interface RunResult { considered: number; sent: number; logged: number; empty: number; noContact: number; failed: number; skipped: number }

/** Sends today's digest to everyone who chose one and has not had it yet. Safe to call as often as you like. */
export async function runDigests(
  db: RunDb,
  load: (personId: string) => Promise<Notice[]>,
  gateway: Gateway,
  opts: { now?: Date; appUrl: string },
): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const day = kigaliDay(now);
  const out: RunResult = { considered: 0, sent: 0, logged: 0, empty: 0, noContact: 0, failed: 0, skipped: 0 };
  const prefs = (await db.preference.findMany()).filter((p) => p.digestChannel && p.digestChannel !== 'OFF');
  const people = new Map((await db.person.findMany()).map((p) => [p.id, p]));
  for (const pref of prefs) {
    const person = people.get(pref.personId);
    if (!person || person.archivedAt || person.status === 'INACTIVE') continue;
    out.considered++;
    if (await db.digestLog.findFirst({ where: { personId: pref.personId, day } })) { out.skipped++; continue; }
    const channel = pref.digestChannel as Exclude<DigestChannel, 'OFF'>;
    const log = (status: string, count = 0) => db.digestLog.create({ data: { personId: pref.personId, day, channel, status, count } });
    const to = channel === 'EMAIL' ? person.email : person.phone;
    if (!to) { await log('NO_CONTACT'); out.noContact++; continue; }
    const digest = composeDigest(await load(pref.personId), opts.appUrl);
    if (!digest) { await log('EMPTY'); out.empty++; continue; }
    try {
      const status = await gateway.send({ channel, to, subject: digest.subject, text: digest.text });
      await log(status, digest.count);
      if (status === 'SENT') out.sent++; else out.logged++;
    } catch (e) {
      console.warn('digest failed:', e instanceof Error ? e.message : e);
      await log('FAILED', digest.count);
      out.failed++;
    }
  }
  return out;
}
