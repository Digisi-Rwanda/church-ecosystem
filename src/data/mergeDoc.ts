/**
 * Three-way merge of shared schedule documents.
 *
 * base   = what the server had when this browser last synced
 * local  = this browser's data now
 * remote = what the server has now
 *
 * Changes made on only one side are kept. Lists of rows with an `id` are merged
 * row by row (rows added on either side are kept; a row deleted on one side is
 * deleted unless the other side edited it). When both sides changed the very
 * same value, the server (remote) value wins and the conflict is counted so the
 * person can be told.
 */
export type MergeResult<T = unknown> = { value: T; conflicts: number };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isRowList = (v: unknown): v is Array<Record<string, unknown>> =>
  Array.isArray(v) &&
  v.every((x) => isObj(x) && typeof x.id === 'string');

export function merge3(base: unknown, local: unknown, remote: unknown): MergeResult {
  if (same(local, remote)) return { value: remote, conflicts: 0 };
  if (same(local, base)) return { value: remote, conflicts: 0 };
  if (same(remote, base)) return { value: local, conflicts: 0 };

  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, unknown> = {};
    let conflicts = 0;
    const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
    for (const k of keys) {
      const inL = k in local;
      const inR = k in remote;
      const inB = k in b;
      if (inL && inR) {
        const r = merge3(b[k], local[k], remote[k]);
        out[k] = r.value;
        conflicts += r.conflicts;
      } else if (inR) {
        // local removed it: keep removal only if remote did not change it
        if (inB && same(b[k], remote[k])) continue;
        out[k] = remote[k];
        if (inB) conflicts += 1;
      } else {
        if (inB && same(b[k], local[k])) continue; // remote removed, local untouched
        out[k] = local[k];
        if (inB) conflicts += 1;
      }
    }
    return { value: out, conflicts };
  }

  if (isRowList(local) && isRowList(remote) && (base == null || isRowList(base))) {
    const b = new Map((base as Array<Record<string, unknown>> | undefined ?? []).map((r) => [r.id as string, r]));
    const l = new Map(local.map((r) => [r.id as string, r]));
    const rm = new Map(remote.map((r) => [r.id as string, r]));
    const out: Array<Record<string, unknown>> = [];
    let conflicts = 0;
    for (const row of remote) {
      const id = row.id as string;
      const lr = l.get(id);
      const br = b.get(id);
      if (lr) {
        const r = merge3(br, lr, row);
        out.push(r.value as Record<string, unknown>);
        conflicts += r.conflicts;
      } else if (br && same(br, row)) {
        // deleted locally, untouched remotely → stays deleted
      } else {
        out.push(row); // added remotely, or edited remotely while deleted locally
        if (br) conflicts += 1;
      }
    }
    for (const row of local) {
      const id = row.id as string;
      if (rm.has(id)) continue;
      const br = b.get(id);
      if (br && same(br, row)) continue; // deleted remotely, untouched locally
      out.push(row); // added locally, or edited locally while deleted remotely
      if (br) conflicts += 1;
    }
    return { value: out, conflicts };
  }

  // Same value changed differently on both sides (or lists without ids).
  return { value: remote, conflicts: 1 };
}
