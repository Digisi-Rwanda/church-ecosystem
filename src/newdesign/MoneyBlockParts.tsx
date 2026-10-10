import { SelectField } from '../components/ui/Field';
import { fetchPlanLinks, type AccountingSideView, type AccountingView } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { categoryKey, formatRwf } from './money';
import { progress, yearChoices } from './moneyBlock';
import { useLoad } from './useLoad';

export function YearSelect({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const t = useT();
  return (
    <SelectField label={t('door.money.year')} name="m-year" value={String(year)} onChange={(e) => onChange(Number(e.target.value))}>
      {yearChoices().map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </SelectField>
  );
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatRwf(Math.abs(n))}`;

/** A thin progress line, drawn in SVG so it needs no inline style; it fills to the share of the plan reached. */
function Line({ pct, tone, label }: { pct: number; tone: string; label: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <svg className={`pva-line ${tone}`} viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={`${label}: ${Math.round(w)}%`}>
      <rect className="pva-track" x="0" y="0" width="100" height="4" rx="2" />
      {w > 0 && <rect className="pva-fill" x="0" y="0" width={w} height="4" rx="2" />}
    </svg>
  );
}

/** Good news is green: more money in than planned, less money out than planned. Overspending is red. */
function toneOf(kind: 'in' | 'out', actual: number, planned: number): string {
  if (actual === planned) return 'flat';
  if (kind === 'in') return actual > planned ? 'good' : 'low';
  return actual > planned ? 'bad' : 'good';
}

function Side({ title, side, kind }: { title: string; side: AccountingSideView; kind: 'in' | 'out' }) {
  const t = useT();
  return (
    <section className={`pva-card ${kind}`} aria-label={title}>
      <header className="pva-head">
        <h3>{title}</h3>
        <span className="pva-total">{formatRwf(side.actual)}</span>
      </header>
      <div className="door-table-wrap">
        <table className="pva-table">
          <thead>
            <tr>
              <th>{t('door.money.col.category')}</th>
              <th className="num">{t('door.money.col.planned')}</th>
              <th className="num">{t('door.money.col.actual')}</th>
              <th className="num">{t('door.money.col.difference')}</th>
              <th className="bar">{t('door.money.col.progress')}</th>
            </tr>
          </thead>
          <tbody>
            {side.rows.map((r) => {
              const tone = toneOf(kind, r.actual, r.planned);
              return (
                <tr key={r.category}>
                  <th scope="row">{t(categoryKey(r.category) as 'door.money.cat.OTHER')}</th>
                  <td className="num" data-label={t('door.money.col.planned')}>{formatRwf(r.planned)}</td>
                  <td className="num" data-label={t('door.money.col.actual')}>{formatRwf(r.actual)}</td>
                  <td className={`num diff ${tone}`} data-label={t('door.money.col.difference')}>{signed(r.difference)}</td>
                  <td className="bar" data-label={t('door.money.col.progress')}><Line pct={progress(r.actual, r.planned)} tone={tone} label={t('door.money.col.progress')} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('door.money.total')}</th>
              <td className="num" data-label={t('door.money.col.planned')}>{formatRwf(side.planned)}</td>
              <td className="num" data-label={t('door.money.col.actual')}>{formatRwf(side.actual)}</td>
              <td className={`num diff ${toneOf(kind, side.actual, side.planned)}`} data-label={t('door.money.col.difference')}>{signed(side.actual - side.planned)}</td>
              <td className="bar"><Line pct={progress(side.actual, side.planned)} tone={toneOf(kind, side.actual, side.planned)} label={t('door.money.col.progress')} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** Planned against actual, income then spending, then what is left. Totals are computed, never typed. */
export function PlanVsActual({ view }: { view: AccountingView }) {
  const t = useT();
  const empty = view.income.rows.length === 0 && view.spending.rows.length === 0;
  if (empty) return <p className="muted">{t('door.money.pva.empty')}</p>;
  return (
    <div className="pva">
      <div className="pva-net" role="group" aria-label={t('door.money.net')}>
        <span className="pva-net-title">{t('door.money.net')}</span>
        <div>
          <span className="pva-net-label">{t('door.money.col.planned')}</span>
          <strong className={view.net.planned < 0 ? 'bad' : ''}>{signed(view.net.planned)}</strong>
        </div>
        <div>
          <span className="pva-net-label">{t('door.money.col.actual')}</span>
          <strong className={view.net.actual < 0 ? 'bad' : 'good'}>{signed(view.net.actual)}</strong>
        </div>
      </div>
      <div className="pva-grid">
        <Side title={t('door.money.kind.INCOME')} side={view.income} kind="in" />
        <Side title={t('door.money.kind.SPENDING')} side={view.spending} kind="out" />
      </div>
    </div>
  );
}

/** Choose the program, project or event a piece of money is for (optional). */
export function PlanSelect({ systemId, value, onChange, name }: { systemId: string; value: string; onChange: (v: string) => void; name: string }) {
  const t = useT();
  const links = useLoad(() => fetchPlanLinks(systemId), `plan-links|${systemId}`);
  return (
    <SelectField label={t('door.money.plan.for')} name={name} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('door.money.plan.forNone')}</option>
      {(links.data ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
        </option>
      ))}
    </SelectField>
  );
}
