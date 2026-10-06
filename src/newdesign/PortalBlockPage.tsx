import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { isPortalBlock, systemsWithBlock } from './menu';

/**
 * A Portal bar item. A shared block lists the systems where the person holds it, each a
 * link into that system's block. Announcements and Notifications have their own routes.
 */
export function PortalBlockPage() {
  const t = useT();
  const { block = '' } = useParams();
  const { portal, capabilities } = useFrontDoor();

  if (!isPortalBlock(block)) {
    return <EmptyState variant="no-results" title={t('door.portal.unknown')} />;
  }

  const blockName = t(`door.block.${block}` as const);
  const where = systemsWithBlock(capabilities, portal, block);
  return (
    <section className="door-block" aria-labelledby="door-portal-block">
      <div>
        <h2 id="door-portal-block">{t('door.portal.block.title', { block: blockName })}</h2>
        <p className="muted">{t('door.portal.block.subtitle')}</p>
      </div>
      {where.length === 0 ? (
        <EmptyState title={t('door.portal.block.none', { block: blockName })} />
      ) : (
        <ul className="door-cards">
          {where.map(({ systemId, letters }) => {
            const system = portal.find((s) => s.id === systemId);
            const name = system?.name ?? systemId;
            return (
              <li key={systemId}>
                <Link
                  className="panel door-system-card"
                  to={`/s/${systemId}/${block}`}
                  aria-label={t('door.portal.block.openIn', { system: name })}
                >
                  <strong>{system?.shortName ?? name}</strong>
                  <span className="muted">{name}</span>
                  <span className="door-letters-inline">
                    {letters.map((l) => (
                      <span key={l} className="door-letter" title={t(`door.letter.${l}.name` as const)}>
                        {l}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
