import { useT } from '../i18n/I18nContext';
import { AnnouncementsStrip } from './AnnouncementsStrip';
import { useFrontDoor } from './FrontDoorContext';
import { GlanceDashboard } from './GlanceDashboard';
import { myUnits } from './portalHome';
import { SystemCards } from './SystemCards';
import { UrgentTile } from './UrgentTile';

/**
 * The church-wide Home: what concerns the whole church, then a way into the units this person
 * belongs to or leads. Each block of this frame shows only what the person's letters allow.
 */
export function ChurchHome({ systemId }: { systemId: string }) {
  const t = useT();
  const { portal } = useFrontDoor();
  const units = myUnits(portal);
  return (
    <section className="door-block" aria-labelledby="door-church-title">
      <div>
        <h2 id="door-church-title">{t('door.home.title')}</h2>
        <p className="muted">{t('door.home.subtitle')}</p>
      </div>
      <AnnouncementsStrip />
      <UrgentTile systemId={systemId} />
      <GlanceDashboard systemId={systemId} />
      <div>
        <h3>{t('door.home.myUnits')}</h3>
        <p className="muted">{t('door.home.myUnits.hint')}</p>
        {units.length === 0 ? <p className="muted">{t('door.home.myUnits.none')}</p> : <SystemCards systems={units} />}
      </div>
    </section>
  );
}
