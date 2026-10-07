import { fetchChoirChoices } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

/** Picks the choir a Choir screen is about. One choir is chosen for you; with several you choose. */
export function ChoirSelect({ value, onChange, forRepertoire = false, children }: {
  value: string; onChange: (id: string) => void; forRepertoire?: boolean; children: (choirId: string) => React.ReactNode;
}) {
  const t = useT();
  const list = useLoad(() => fetchChoirChoices(forRepertoire), `choir-choices|${forRepertoire}`);
  const choirs = list.data?.choirs ?? [];
  const chosen = choirs.some((c) => c.id === value) ? value : choirs[0]?.id ?? '';
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {choirs.length === 0 ? (
        <EmptyState title={t('door.choirwork.noChoir')} detail={t('door.choirwork.noChoirDetail')} />
      ) : (
        <>
          {choirs.length > 1 && (
            <SelectField label={t('door.choirwork.choir')} name="cw-choir" value={chosen} onChange={(e) => onChange(e.target.value)}>
              {choirs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
          )}
          {choirs.length === 1 && <p className="muted">{choirs[0].name}</p>}
          {children(chosen)}
        </>
      )}
    </LoadState>
  );
}
