// Latency + correctness probe for POST /api/people/search against a STAGING API.
// Usage (PowerShell):  $env:API_URL="https://<staging-api>"; $env:TOKEN="<jwt>"; node server/scripts/searchLatency.mjs
// Optional: RUNS=30  EXPECT='{"five":25}' is not supported; pass expected totals via EXPECT_TOTALS="name=25,other=195"
// Read-only: it only calls the search endpoint. Never point it at production without approval.
const API = (process.env.API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.TOKEN || '';
const RUNS = Number(process.env.RUNS || 20);
if (!API || !TOKEN) { console.error('Set API_URL and TOKEN'); process.exit(2); }
const expected = Object.fromEntries((process.env.EXPECT_TOTALS || '').split(',').filter(Boolean).map((s) => s.split('=')).map(([k, v]) => [k, Number(v)]));
const c = (field, op, value) => ({ field, op, ...(value === undefined ? {} : { value }) });
const QUERIES = {
  five: [c('gender', 'is', 'MALE'), c('baptismYears', 'atLeast', 10), c('education', 'anyMatch', { levelAtLeast: 'BACHELOR' }), c('childCount', 'atLeast', 2)],
  finance5y: [c('employment', 'anyMatch', { sector: ['FINANCE'], yearsAtLeast: 5 })],
  bachelorLaw: [c('education', 'anyMatch', { levelAtLeast: 'BACHELOR', field: 'law' })],
};
const pct = (a, p) => a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
let failed = false;
for (const [name, all] of Object.entries(QUERIES)) {
  const times = []; let total;
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    const res = await fetch(`${API}/api/people/search`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ match: { all }, page: { limit: 25, offset: 0 } }) });
    const body = await res.json().catch(() => ({}));
    times.push(performance.now() - t);
    if (!res.ok) { console.error(name, 'HTTP', res.status, JSON.stringify(body)); failed = true; break; }
    total = body.total;
  }
  times.sort((a, b) => a - b);
  const ok = expected[name] === undefined ? 'n/a' : expected[name] === total ? 'OK' : `MISMATCH (expected ${expected[name]})`;
  if (ok.startsWith('MISMATCH')) failed = true;
  console.log(`${name.padEnd(12)} total=${total} count=${ok}  ms min=${times[0].toFixed(0)} median=${pct(times, 50).toFixed(0)} p95=${pct(times, 95).toFixed(0)} max=${times[times.length - 1].toFixed(0)}  (first run includes cold start: ${times.length ? 'see max' : ''})`);
}
process.exit(failed ? 1 : 0);
