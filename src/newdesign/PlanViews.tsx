import type { ActivityMoney } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { StatusChip } from './kit';
import { formatRwf } from './money';

const phaseName = (t: ReturnType<typeof useT>, id: string | null, title: string) => (id === null ? t('door.pm.phase.general') : title);

/** A project's cost by phase: General first, then each milestone. */
export function PhaseTable({ m }: { m: ActivityMoney }) {
  const t = useT();
  if (!m.phases || m.phases.length === 0) return null;
  return (
    <div className="panel-inset">
      <h4>{t('door.pm.phase.title')}</h4>
      <p className="muted">{t('door.pm.phase.hint')}</p>
      <div className="door-table-wrap">
        <table className="door-table door-stack">
          <thead><tr><th scope="col">{t('door.pm.phase.pick')}</th><th scope="col">{t('door.pm.phase.planned')}</th><th scope="col">{t('door.pm.phase.spent')}</th><th scope="col">{t('door.pm.phase.left')}</th></tr></thead>
          <tbody>
            {m.phases.map((r) => (
              <tr key={r.id ?? 'general'}>
                <th scope="row">{phaseName(t, r.id, r.title)}</th>
                <td data-label={t('door.pm.phase.planned')}>{formatRwf(r.planned)}</td>
                <td data-label={t('door.pm.phase.spent')}>{formatRwf(r.spent)}</td>
                <td data-label={t('door.pm.phase.left')}>{formatRwf(r.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The phase a cost line belongs to: a choice among the project's phases, General being "none". */
export function PhasePick({ m, value, onChange, name, phases }: { m: ActivityMoney; value: string; onChange: (v: string) => void; name: string; phases: Array<{ id: string; title: string }> }) {
  const t = useT();
  if (m.planType !== 'PROJECT' || phases.length === 0) return null;
  return (
    <SelectField label={t('door.pm.phase.pick')} name={name} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('door.pm.phase.general')}</option>
      {phases.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
    </SelectField>
  );
}

/** A program's burn rate: how fast the budget goes against how much of the year has passed. */
export function BurnPanel({ m }: { m: ActivityMoney }) {
  const t = useT();
  const b = m.burn;
  if (!b) return null;
  const used = b.planned > 0 ? Math.min(100, Math.round((b.spent / b.planned) * 100)) : 0;
  const tone = b.pace === 'FAST' ? 'warn' : b.pace === 'ON_TRACK' ? 'success' : 'neutral';
  return (
    <div className="panel-inset">
      <h4>{t('door.pm.burn.title')}</h4>
      <div className="door-row">
        <StatusChip tone={tone}>{t(`door.pm.burn.pace.${b.pace}` as 'door.pm.burn.pace.NONE')}</StatusChip>
        <span className="muted">{t('door.pm.burn.month', { n: b.elapsed, total: b.months })}</span>
      </div>
      <progress max={100} value={used} aria-label={t('door.pm.burn.title')} />
      <div className="stat-tiles">
        <div className="stat-tile"><span className="muted">{t('door.pm.phase.spent')}</span><strong>{formatRwf(b.spent)}</strong></div>
        <div className="stat-tile"><span className="muted">{t('door.pm.burn.perMonth')}</span><strong>{formatRwf(b.perMonth)}</strong></div>
        <div className="stat-tile"><span className="muted">{t('door.pm.burn.projected')}</span><strong>{formatRwf(b.projected)}</strong></div>
      </div>
      {b.runway !== null && <p className="muted">{t('door.pm.burn.runway', { n: b.runway })}</p>}
      {b.pace === 'NONE' && <p className="muted">{t('door.pm.burn.none')}</p>}
      {b.pace === 'FAST' && b.projected > b.planned && <p className="door-error">{t('door.pm.burn.fastNote')}</p>}
    </div>
  );
}
