import { useId } from 'react';
import type { PeopleFilterOptions } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { dropFilter, FILTER_KINDS, offeredKinds, setFilter, type ActiveFilter, type FieldSpec, type FilterKind } from './peopleFilters';

const EMPLOYMENT = ['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'UNEMPLOYED', 'RETIRED'];
const STATUS = ['ACTIVE', 'INACTIVE', 'VISITOR'];

/** Filters added one after another, each narrowing the list; only what the viewer may use is offered. */
export function PeopleFilterPanel({ options, filters, onChange }: { options: PeopleFilterOptions; filters: ActiveFilter[]; onChange: (next: ActiveFilter[]) => void }) {
  const t = useT();
  const uid = useId();
  const free = offeredKinds(options.criteria).filter((k) => !filters.some((f) => f.kind === k.kind));
  const choices = (src: NonNullable<FieldSpec['source']>): Array<[string, string]> => {
    switch (src) {
      case 'units': return options.units.map((u) => [u.id, u.name]);
      case 'sectors': return options.sectors.map((s) => [s, t(`door.p360.v.${s}` as 'door.p360.v.EMPLOYED')]);
      case 'education': return options.education.filter((l) => l !== 'OTHER').map((l) => [l, t(`door.p360.v.${l}` as 'door.p360.v.EMPLOYED')]);
      case 'employment': return EMPLOYMENT.map((s) => [s, t(`door.p360.v.${s}` as 'door.p360.v.EMPLOYED')]);
      case 'marital': return options.marital.map((m) => [m, t(`door.people.marital.${m}` as 'door.people.marital.WIDOWED')]);
      case 'gender': return [['MALE', t('door.people.gender.MALE')], ['FEMALE', t('door.people.gender.FEMALE')]];
      case 'status': return STATUS.map((s) => [s, t(`door.status.${s}` as 'door.status.ACTIVE')]);
    }
  };
  const label = (kind: FilterKind) => t(`door.people.fk.${kind}` as 'door.people.fk.unit');
  return (
    <section className="people-filters" aria-label={t('door.people.filters.title')}>
      <div className="people-filters-head">
        <strong>{t('door.people.filters.title')}</strong>
        {free.length > 0 && (
          <select
            aria-label={t('door.people.filters.add')}
            value=""
            onChange={(e) => {
              const kind = e.target.value as FilterKind;
              if (kind) onChange(setFilter(filters, kind, {}));
            }}
          >
            <option value="">{t('door.people.filters.add')}</option>
            {free.map((k) => (<option key={k.kind} value={k.kind}>{label(k.kind)}</option>))}
          </select>
        )}
        {filters.length > 0 && <button type="button" className="btn ghost sm" onClick={() => onChange([])}>{t('door.people.filters.clear')}</button>}
      </div>
      {filters.length === 0 ? (
        <p className="muted">{t('door.people.filters.hint')}</p>
      ) : (
        <ul className="people-filter-rows">
          {filters.map((f) => {
            const spec = FILTER_KINDS.find((k) => k.kind === f.kind)!;
            const set = (key: string, v: string) => onChange(setFilter(filters, f.kind, { ...f.values, [key]: v }));
            return (
              <li key={f.kind} className="people-filter-row">
                <span className="people-filter-name">{label(f.kind)}</span>
                {spec.fields.map((fd) => {
                  const id = `${uid}-${f.kind}-${fd.key}`;
                  const aria = fd.type === 'select' ? label(f.kind) : t(`door.people.ff.${f.kind}.${fd.key}` as 'door.people.ff.age.min');
                  return fd.type === 'select' ? (
                    <select key={fd.key} id={id} aria-label={aria} value={f.values[fd.key] ?? ''} onChange={(e) => set(fd.key, e.target.value)}>
                      <option value="">{t('door.gov.meeting.choose')}</option>
                      {choices(fd.source!).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                    </select>
                  ) : (
                    <input
                      key={fd.key} id={id} aria-label={aria} placeholder={aria}
                      type={fd.type === 'number' ? 'number' : 'text'} min={fd.type === 'number' ? 0 : undefined} inputMode={fd.type === 'number' ? 'numeric' : undefined}
                      maxLength={80} value={f.values[fd.key] ?? ''} onChange={(e) => set(fd.key, e.target.value)}
                    />
                  );
                })}
                {f.kind === 'education' && (
                  <label className="control-check">
                    <input type="checkbox" checked={f.values.exact === 'yes'} onChange={(e) => set('exact', e.target.checked ? 'yes' : '')} />
                    <span>{t('door.people.ff.education.exact')}</span>
                  </label>
                )}
                <button type="button" className="btn ghost sm" aria-label={t('door.people.filters.remove', { name: label(f.kind) })} onClick={() => onChange(dropFilter(filters, f.kind))}>×</button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
