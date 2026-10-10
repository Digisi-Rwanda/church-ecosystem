import { useParams } from 'react-router-dom';
import { fetchContributionLists } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { DonationsPanel } from './DonationsPanel';
import { PageHeader } from './kit';
import { LoadState } from './LoadState';
import { currentMonth } from './money';
import { useLoad } from './useLoad';

/** Donations: its own screen under Contributions; the treasurer records, the president approves. */
export function DonationsPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { loading, failed, data, reload } = useLoad(() => fetchContributionLists(systemId, currentMonth()), `donations-gate|${systemId}`);
  const allowed = !!data && (data.canWrite || data.canApprove);
  return (
    <section className="door-block" aria-labelledby="door-donations-title">
      <PageHeader id="door-donations-title" title={t('door.money.donations')} purpose={t('door.money.donations.purpose')} />
      <LoadState loading={loading} failed={failed} retry={reload}>
        {allowed ? <DonationsPanel systemId={systemId} /> : <EmptyState title={t('door.block.noAccessTitle')} />}
      </LoadState>
    </section>
  );
}
