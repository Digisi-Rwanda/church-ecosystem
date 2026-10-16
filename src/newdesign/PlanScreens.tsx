import { useT } from '../i18n/I18nContext';
import { FLOWS, OPTIONS, type FlowKind } from './actionPlanFlows';
import { categoryKey } from './money';
import { type PlanDetail } from '../api/frontDoorApi';

/** What was written on the Action plan screens for this event, project or program, read-only, screen by screen. */
export function PlanDetailsView({ p }: { p: PlanDetail }) {
  const t = useT();
  const kind = p.planType.toLowerCase() as FlowKind;
  const flow = FLOWS[kind];
  const d = p.details ?? {};
  const shown = (key: string, opts?: keyof typeof OPTIONS) => {
    const v = d[key];
    if (!v) return '';
    if (opts) return t(`door.ap.o.${opts}.${v}` as 'door.ap.o.purpose.OTHER');
    return key === 'budgetTag' ? t(categoryKey(v) as 'door.money.cat.OTHER') : v;
  };
  const rows = (s: (typeof flow.steps)[number]) =>
    s.fields.flatMap((f): Array<[string, string]> => {
      const v =
        f.map === 'name' ? p.title : f.map === 'leader' ? p.leaderName : f.map === 'venue' ? p.location : f.map === 'needs' ? p.needs
        : f.map === 'date' ? (p.startsOn ? new Date(p.startsOn).toISOString().slice(0, 10) : '') : shown(f.key, f.opts);
      return v ? [[t(`door.ap.f.${kind}.${f.key}` as 'door.ap.f.event.name'), v]] : [];
    });
  const any = flow.steps.some((s) => rows(s).length > 0);
  return (
    <>
      {!any && <p className="muted">{t('door.ap.noDetails')}</p>}
      {flow.steps.map((s) => {
        const r = rows(s);
        return r.length === 0 ? null : (
          <section key={s.id} className="panel">
            <h3>{t(`door.ap.s.${kind}.${s.id}.heading` as 'door.ap.s.event.define.heading')}</h3>
            <dl className="door-facts">
              {r.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
            </dl>
          </section>
        );
      })}
    </>
  );
}
