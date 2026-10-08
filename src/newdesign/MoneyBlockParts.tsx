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

function Side({ title, side }: { title: string; side: AccountingSideView }) {
  const t = useT();
  return (
    <div className="door-table-wrap">
      <h3>{title}</h3>
      <table className="door-table door-stack">
        <thead>
          <tr>
            <th>{t('door.money.col.category')}</th>
            <th>{t('door.money.col.planned')}</th>
            <th>{t('door.money.col.actual')}</th>
            <th>{t('door.money.col.difference')}</th>
            <th>{t('door.money.col.progress')}</th>
          </tr>
        </thead>
        <tbody>
          {side.rows.map((r) => (
            <tr key={r.category}>
              <th scope="row">{t(categoryKey(r.category) as 'door.money.cat.OTHER')}</th>
              <td data-label={t('door.money.col.planned')}>{formatRwf(r.planned)}</td>
              <td data-label={t('door.money.col.actual')}>{formatRwf(r.actual)}</td>
              <td data-label={t('door.money.col.difference')}>{r.difference > 0 ? '+' : ''}{formatRwf(r.difference)}</td>
              <td data-label={t('door.money.col.progress')}>
                <meter min={0} max={100} value={progress(r.actual, r.planned)} aria-label={t('door.money.col.progress')} />
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">{t('door.money.total')}</th>
            <td data-label={t('door.money.col.planned')}><strong>{formatRwf(side.planned)}</strong></td>
            <td data-label={t('door.money.col.actual')}><strong>{formatRwf(side.actual)}</strong></td>
            <td data-label={t('door.money.col.difference')}><strong>{side.actual - side.planned > 0 ? '+' : ''}{formatRwf(side.actual - side.planned)}</strong></td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Planned against actual, income then spending, then what is left. Totals are computed, never typed. */
export function PlanVsActual({ view }: { view: AccountingView }) {
  const t = useT();
  const empty = view.income.rows.length === 0 && view.spending.rows.length === 0;
  if (empty) return <p className="muted">{t('door.money.pva.empty')}</p>;
  return (
    <div className="door-form" style={{ maxWidth: 'none' }}>
      <Side title={t('door.money.kind.INCOME')} side={view.income} />
      <Side title={t('door.money.kind.SPENDING')} side={view.spending} />
      <p>
        <strong>{t('door.money.net')}</strong> {t('door.money.col.planned')}: {formatRwf(view.net.planned)} · {t('door.money.col.actual')}: {formatRwf(view.net.actual)}
      </p>
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
