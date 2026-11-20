import { fetchFunds } from '../api/frontDoorApi';
import { SelectField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { useLoad } from './useLoad';

/** What a sum of money is for: free to use, tied to one activity, or tied to one kind of spending. The value is the purpose key the server stores. */
export function PurposeField({ systemId, value, onChange, name = 'purpose' }: { systemId: string; value: string; onChange: (v: string) => void; name?: string }) {
  const t = useT();
  const { data } = useLoad(() => fetchFunds(systemId), `purposes|${systemId}`);
  return (
    <SelectField label={t('door.funds.purposeLabel')} name={name} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('door.funds.for.none')}</option>
      {(data?.purposes.activities.length ?? 0) > 0 && (
        <optgroup label={t('door.funds.forActivityGroup')}>
          {data!.purposes.activities.map((a) => <option key={a.id} value={`A:${a.id}`}>{a.title}</option>)}
        </optgroup>
      )}
      <optgroup label={t('door.funds.forCategoryGroup')}>
        {(data?.purposes.categories ?? []).map((c) => <option key={c} value={`C:${c}`}>{t(`door.money.cat.${c}` as 'door.money.cat.EVENT')}</option>)}
      </optgroup>
    </SelectField>
  );
}
