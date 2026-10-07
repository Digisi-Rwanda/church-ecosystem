import { useI18n, useT } from '../i18n/I18nContext';
import type { ScheduleEdit, ScheduleService } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { addableUnits } from './music';

type Unit = { id: string; name: string; kind: ScheduleService['units'][number]['kind'] };

/** One service of a schedule with its choirs: add, replace or take one off. Read-only when `onEdit` is missing. */
export function ScheduleServiceCard({ service, units, onEdit }: { service: ScheduleService; units: Unit[]; onEdit?: (e: ScheduleEdit) => void }) {
  const t = useT();
  const { locale } = useI18n();
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${service.date}T00:00:00Z`));
  const free = addableUnits(units, service);
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{day}</strong>
          <span className="door-chip">{t(`door.music.kind.${service.kind}` as 'door.music.kind.SS1')}</span>
        </div>
        {service.units.length === 0 ? (
          <p className="muted">{t('door.music.noChoirYet')}</p>
        ) : (
          <ul className="door-list">
            {service.units.map((u) => {
              const swaps = free.filter((x) => x.kind === u.kind);
              return (
                <li key={u.unitId} className="door-row">
                  <span>
                    {u.name} <span className="muted">· {t(`door.music.role.${u.kind}` as 'door.music.role.PRIMARY')}</span>
                  </span>
                  {onEdit && (
                    <span className="door-row">
                      {swaps.length > 0 && (
                        <SelectField label={t('door.music.sched.replaceWith')} name={`r-${service.id}-${u.unitId}`} value="" onChange={(e) => e.target.value && onEdit({ serviceId: service.id, action: 'replace', unitId: u.unitId, toUnitId: e.target.value })}>
                          <option value="">{t('door.gov.meeting.choose')}</option>
                          {swaps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </SelectField>
                      )}
                      <button type="button" className="btn ghost" onClick={() => onEdit({ serviceId: service.id, action: 'remove', unitId: u.unitId })}>{t('door.groups.remove')}</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {onEdit && free.length > 0 && (
          <SelectField label={t('door.music.addChoir')} name={`a-${service.id}`} value="" onChange={(e) => e.target.value && onEdit({ serviceId: service.id, action: 'add', unitId: e.target.value })}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {free.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </SelectField>
        )}
      </div>
    </li>
  );
}
