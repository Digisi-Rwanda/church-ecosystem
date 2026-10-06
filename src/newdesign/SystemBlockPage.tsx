import { useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { isSharedBlock, lettersFor } from './menu';
import { UrgentTile } from './UrgentTile';

/**
 * One of the six shared blocks of a system. The blocks are empty frames for now: each
 * module fills its block in a later slice. What this screen already shows is exactly
 * which letters the person holds here, straight from the server.
 */
export function SystemBlockPage() {
  const t = useT();
  const { systemId = '', block: blockParam } = useParams();
  const { portal, capabilities } = useFrontDoor();
  const block = blockParam ?? 'home';
  const system = portal.find((s) => s.id === systemId);
  const systemName = system?.name ?? systemId;

  if (!isSharedBlock(block)) {
    return <EmptyState variant="no-results" title={t('door.block.noAccessTitle')} />;
  }
  const blockName = t(`door.block.${block}` as const);
  const letters = lettersFor(capabilities, systemId, block);

  if (letters.length === 0) {
    return (
      <EmptyState
        variant="error"
        title={t('door.block.noAccessTitle')}
        detail={t('door.block.noAccessDetail', { block: blockName, system: systemName })}
      />
    );
  }

  return (
    <section className="door-block" aria-labelledby="door-block-title">
      <h2 id="door-block-title">{blockName}</h2>
      {block === 'home' && <UrgentTile systemId={systemId} />}
      <div className="panel">
        <h3>{t('door.block.letters')}</h3>
        <ul className="door-letters">
          {letters.map((l) => (
            <li key={l}>
              <span className="door-letter" aria-hidden="true">
                {l}
              </span>
              <span>
                <strong>{t(`door.letter.${l}.name` as const)}</strong>
                <span className="muted"> — {t(`door.letter.${l}.meaning` as const)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <EmptyState
        title={t('door.block.emptyTitle')}
        detail={t('door.block.emptyDetail', { block: blockName.toLowerCase(), system: systemName })}
      />
    </section>
  );
}
