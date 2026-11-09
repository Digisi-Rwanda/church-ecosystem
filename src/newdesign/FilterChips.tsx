import { useT } from '../i18n/I18nContext';
import type { FilterLabels } from './filterLabels';
import type { Condition } from './filterModel';

function Chip({ text, remove, join }: { text: string; remove: () => void; join?: string }) {
  const t = useT();
  return (
    <span className="pf-chip" data-join={join}>
      <span className="pf-chip-text">{text}</span>
      <button type="button" className="pf-chip-x" aria-label={t('door.pf.removeChip', { filter: text })} onClick={remove}>×</button>
    </span>
  );
}

/**
 * The conditions in force, as short readable chips. Conditions in the top row all have to hold ("and");
 * a boxed group needs only one of its chips ("or"). Each chip, and each group, can be taken off on its own.
 */
export function FilterChips({ all, groups, labels, onRemove, onRemoveFromGroup, onRemoveGroup, onClear, onEdit }: {
  all: Condition[]; groups: Condition[][]; labels: FilterLabels;
  onRemove: (index: number) => void; onRemoveFromGroup: (group: number, index: number) => void; onRemoveGroup: (group: number) => void;
  onClear: () => void; onEdit: () => void;
}) {
  const t = useT();
  if (all.length === 0 && groups.length === 0) return null;
  return (
    <div className="pf-chips" role="group" aria-label={t('door.pf.active')}>
      <p className="pf-chips-lead">{all.length > 0 && groups.length > 0 ? t('door.pf.lead.both') : groups.length > 0 ? t('door.pf.lead.groups') : t('door.pf.lead.all')}</p>
      <div className="pf-chip-list">
        {all.map((c, i) => <Chip key={`a${i}`} text={labels.sentence(c)} join={i > 0 ? t('door.pf.and') : undefined} remove={() => onRemove(i)} />)}
        {groups.map((g, gi) => (
          <div key={`g${gi}`} className="pf-chipgroup" role="group" aria-label={t('door.pf.group.title', { n: gi + 1 })} data-join={all.length > 0 || gi > 0 ? t('door.pf.and') : undefined}>
            <span className="pf-chipgroup-label">{t('door.pf.anyOf')}</span>
            {g.map((c, i) => <Chip key={`g${gi}-${i}`} text={labels.sentence(c)} join={i > 0 ? t('door.pf.or') : undefined} remove={() => onRemoveFromGroup(gi, i)} />)}
            <button type="button" className="pf-chip-x" aria-label={t('door.pf.removeGroupNamed', { n: gi + 1 })} onClick={() => onRemoveGroup(gi)}>×</button>
          </div>
        ))}
      </div>
      <div className="pf-chips-actions">
        <button type="button" className="btn ghost sm" onClick={onEdit}>{t('door.pf.edit')}</button>
        <button type="button" className="btn ghost sm" onClick={onClear}>{t('door.pf.clearAll')}</button>
      </div>
    </div>
  );
}
