/**
 * Minimal in-memory stand-in for PrismaClient. Good enough for RBAC route
 * tests: equality / in / contains / OR / AND / NOT / gte / lte / null filters.
 */
type Row = Record<string, any>;
let seq = 0;

function matchValue(actual: any, cond: any): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    if ('in' in cond) return cond.in.includes(actual);
    if ('notIn' in cond) return !cond.notIn.includes(actual);
    if ('contains' in cond)
      return String(actual ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
    if ('not' in cond) return !matchValue(actual, cond.not);
    if ('gte' in cond && !(actual >= cond.gte)) return false;
    if ('lte' in cond && !(actual <= cond.lte)) return false;
    if ('gt' in cond && !(actual > cond.gt)) return false;
    if ('lt' in cond && !(actual < cond.lt)) return false;
    if ('equals' in cond) return actual === cond.equals;
    return true;
  }
  if (cond === undefined) return true;
  if (cond === null) return actual === null || actual === undefined;
  return actual === cond;
}

function matches(row: Row, where?: Row): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as Row[]).some((w) => matches(row, w))) return false;
    } else if (k === 'AND') {
      if (!(Array.isArray(v) ? v : [v]).every((w: Row) => matches(row, w))) return false;
    } else if (k === 'NOT') {
      if ((Array.isArray(v) ? v : [v]).some((w: Row) => matches(row, w))) return false;
    } else if (!matchValue(row[k], v)) return false;
  }
  return true;
}

function model(store: Row[]) {
  const api: Record<string, any> = {
    findMany: async (a: Row = {}) => {
      let out = store.filter((r) => matches(r, a.where));
      if (a.skip) out = out.slice(a.skip);
      if (a.take) out = out.slice(0, a.take);
      return out.map((r) => ({ ...r }));
    },
    findFirst: async (a: Row = {}) => {
      const r = store.find((x) => matches(x, a.where));
      return r ? { ...r } : null;
    },
    findUnique: async (a: Row) => {
      const r = store.find((x) => matches(x, a.where));
      return r ? { ...r } : null;
    },
    count: async (a: Row = {}) => store.filter((r) => matches(r, a.where)).length,
    create: async (a: Row) => {
      const row = { id: `gen-${++seq}`, createdAt: new Date(), startDate: new Date(), status: 'ACTIVE', ...a.data };
      store.push(row);
      return { ...row };
    },
    update: async (a: Row) => {
      const r = store.find((x) => matches(x, a.where));
      if (!r) throw new Error('Record not found');
      Object.assign(r, a.data);
      return { ...r };
    },
    updateMany: async (a: Row) => {
      const rs = store.filter((x) => matches(x, a.where));
      rs.forEach((r) => Object.assign(r, a.data));
      return { count: rs.length };
    },
    upsert: async (a: Row) => {
      const r = store.find((x) => matches(x, a.where));
      if (r) { Object.assign(r, a.update); return { ...r }; }
      return api.create({ data: { ...a.where, ...a.create } });
    },
    delete: async (a: Row) => {
      const i = store.findIndex((x) => matches(x, a.where));
      if (i >= 0) return store.splice(i, 1)[0];
      throw new Error('Record not found');
    },
    deleteMany: async (a: Row = {}) => {
      const keep = store.filter((r) => !matches(r, a.where));
      const n = store.length - keep.length;
      store.splice(0, store.length, ...keep);
      return { count: n };
    },
  };
  return api;
}

export function createFakePrisma() {
  const db: Record<string, Row[]> = {};
  const models: Record<string, any> = {};
  const client: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === '$transaction')
          return async (arg: any) =>
            typeof arg === 'function' ? arg(client) : Promise.all(arg);
        if (prop === '__db') return db;
        if (prop === '__reset') return () => Object.keys(db).forEach((k) => (db[k].length = 0));
        if (prop === 'then') return undefined;
        db[prop] ??= [];
        return (models[prop] ??= model(db[prop]));
      },
    },
  );
  return client as any;
}
