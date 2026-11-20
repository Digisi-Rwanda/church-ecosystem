import { Link } from 'react-router-dom';
import { useT } from '../../i18n/I18nContext';
import type { TargetKey } from './targets';

/** The "Import" button a list page shows beside its "Add" button, to people who may add there. */
export function ImportLink({ systemId, target }: { systemId: string; target: TargetKey }) {
  const t = useT();
  return <Link className="btn ghost no-print" to={`/s/${systemId}/import/${target}`}>{t('door.import.link')}</Link>;
}
