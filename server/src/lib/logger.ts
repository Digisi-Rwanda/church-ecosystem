/**
 * Minimal structured logger: one JSON object per line, so Render's log search
 * can filter by level, request id or route. No dependency; swap for pino later
 * without touching callers (same `log.info(msg, fields)` shape).
 */
type Fields = Record<string, unknown>;

function write(level: 'info' | 'warn' | 'error', msg: string, fields?: Fields) {
  if (process.env.NODE_ENV === 'test' && process.env.LOG_IN_TESTS !== '1') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

export const log = {
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};

/** Error -> loggable fields (message and stack, never the request body). */
export function errorFields(err: unknown): Fields {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  return { error: String(err) };
}
