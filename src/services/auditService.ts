import type { AuditEntry, AuthzDecision, SessionState } from '../domain/types';

const AUDIT_KEY = 'adepr.access.audit';
const MAX_ENTRIES = 80;

function readAll(): AuditEntry[] {
  try {
    const raw = sessionStorage.getItem(AUDIT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: AuditEntry[]) {
  sessionStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export const auditService = {
  list(): AuditEntry[] {
    return readAll();
  },

  record(
    decision: AuthzDecision,
    entryMode?: SessionState['entryMode'],
  ): AuditEntry {
    const entry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: decision.evaluatedAt,
      personId: decision.personId,
      systemId: decision.systemId,
      resource: decision.resource,
      action: decision.action,
      allowed: decision.allowed,
      reason: decision.reason,
      entryMode,
    };
    const next = [entry, ...readAll()].slice(0, MAX_ENTRIES);
    writeAll(next);
    return entry;
  },

  clear() {
    sessionStorage.removeItem(AUDIT_KEY);
  },
};
