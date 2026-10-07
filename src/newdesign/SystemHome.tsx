import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/ui/Icon';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { buildMenu, buildOwnMenu } from './menu';
import { GlanceDashboard } from './GlanceDashboard';
import { UrgentTile } from './UrgentTile';

const SHARED_ICON: Record<string, IconName> = { people: 'users', work: 'task', schedule: 'calendar', money: 'wallet', reports: 'chart' };
const OWN_ICON: Record<string, IconName> = {
  central: 'building', governance: 'board', settings: 'settings', groups: 'users', couples: 'users', visits: 'pastoral',
  watches: 'hand', contacts: 'user', pulpit: 'pastoral', collections: 'wallet', monthplan: 'calendar', choirs: 'users', oversight: 'chart', rehearsals: 'calendar', repertoire: 'folder', sponsorship: 'hand', roster: 'users', teams: 'calendar', mine: 'task', deaconreports: 'folder', moves: 'users',
};

/**
 * The home of a ministry system: what is waiting for this person, then one tile for each place
 * they can go here. The tiles come from the same server answer as the menu, so none leads nowhere.
 */
export function SystemHome({ systemId, systemName }: { systemId: string; systemName: string }) {
  const t = useT();
  const { capabilities } = useFrontDoor();
  const shared = buildMenu(capabilities, systemId).filter((m) => m.block !== 'home');
  const own = buildOwnMenu(capabilities, systemId);
  const tiles = [
    ...shared.map((m) => ({
      key: m.block, to: `/s/${systemId}/${m.block}`, icon: SHARED_ICON[m.block] ?? 'folder',
      title: t(`door.block.${m.block}` as 'door.block.people'), text: t(`door.tile.${m.block}` as 'door.tile.people'),
    })),
    ...own.map((o) => ({
      key: `own-${o.block}`, to: `/s/${systemId}/${o.block}`, icon: OWN_ICON[o.block] ?? 'folder',
      title: t(`door.own.${o.block}${o.variant ? `.${o.variant}` : ''}` as 'door.own.governance'), text: t(`door.tile.own.${o.block}` as 'door.tile.own.groups'),
    })),
  ];
  return (
    <section className="door-block" aria-labelledby="door-home-title">
      <div>
        <h2 id="door-home-title">{systemName}</h2>
        <p className="muted">{t('door.tile.intro')}</p>
      </div>
      <UrgentTile systemId={systemId} />
      <GlanceDashboard systemId={systemId} />
      <ul className="door-tiles">
        {tiles.map((x) => (
          <li key={x.key}>
            <Link className="panel door-tile" to={x.to}>
              <span className="door-tile-icon" aria-hidden="true">
                <Icon name={x.icon} size={22} />
              </span>
              <strong>{x.title}</strong>
              <span className="muted">{x.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
