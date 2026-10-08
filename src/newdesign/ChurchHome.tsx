import { useT } from '../i18n/I18nContext';
import { AnnouncementsStrip } from './AnnouncementsStrip';
import { GlanceDashboard } from './GlanceDashboard';
import { UrgentTile } from './UrgentTile';
import { PageHeader } from './kit';

/**
 * The church-wide Home: what concerns the whole church, then a way into the units this person
 * belongs to or leads. Each block of this frame shows only what the person's letters allow.
 */
export function ChurchHome({ systemId }: { systemId: string }) {
  const t = useT();
  return (
    <section className="door-block" aria-labelledby="door-church-title">
      <div>
        <PageHeader id="door-church-title" title={t('door.home.title')} />
        <p className="muted">{t('door.home.subtitle')}</p>
      </div>
      <AnnouncementsStrip />
      <UrgentTile systemId={systemId} />
      <GlanceDashboard systemId={systemId} />
    </section>
  );
}
