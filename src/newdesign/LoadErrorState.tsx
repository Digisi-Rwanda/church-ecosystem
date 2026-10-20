import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import type { ApiErrorKind } from '../api/client';
import { useFrontDoor } from './FrontDoorContext';

/**
 * What a screen shows when its data did not load. Each kind says what happened and offers the one useful next step:
 * try again only where trying again can help, sign in when the session ended, go back when the answer will not change.
 * A record the person may not see and a record that does not exist read the same, so nothing is revealed.
 */
export function LoadErrorState({ kind, retry }: { kind: ApiErrorKind | true; retry?: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { signOut } = useFrontDoor();
  const k: ApiErrorKind = kind === true ? 'server' : kind;
  const back = (
    <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
      {t('door.err.back')}
    </button>
  );
  const again = retry ? (
    <button type="button" className="btn" onClick={retry}>
      {t('door.people.retry')}
    </button>
  ) : undefined;
  switch (k) {
    case 'auth':
      return (
        <EmptyState
          variant="error"
          title={t('door.err.auth.title')}
          detail={t('door.err.auth.detail')}
          action={<button type="button" className="btn" onClick={signOut}>{t('door.err.auth.action')}</button>}
        />
      );
    case 'forbidden':
      return <EmptyState variant="error" title={t('door.err.forbidden.title')} detail={t('door.err.forbidden.detail')} action={back} />;
    case 'notFound':
      return <EmptyState variant="error" title={t('door.err.notFound.title')} detail={t('door.err.notFound.detail')} action={back} />;
    case 'invalid':
      return <EmptyState variant="error" title={t('door.err.invalid.title')} detail={t('door.err.invalid.detail')} action={back} />;
    case 'offline':
      return <EmptyState variant="error" title={t('door.err.offline.title')} detail={t('door.err.offline.detail')} action={again} />;
    default:
      return <EmptyState variant="error" title={t('door.err.server.title')} detail={t('door.err.server.detail')} action={again} />;
  }
}

/**
 * The compact form for an optional section of a page: one line and, where trying again can help, a Retry.
 * The rest of the page stays usable. A section the person may not see is hidden by its owner, not shown here.
 */
export function LoadErrorInline({ kind, retry }: { kind: ApiErrorKind | true; retry?: () => void }) {
  const t = useT();
  const { signOut } = useFrontDoor();
  const k: ApiErrorKind = kind === true ? 'server' : kind;
  const text = t(`door.err.${k === 'auth' ? 'auth' : k}.title` as 'door.err.server.title');
  const can = k === 'offline' || k === 'server';
  return (
    <p className="inline-error" role="alert">
      <span>{text}</span>
      {can && retry ? (
        <button type="button" className="btn ghost sm" onClick={retry}>
          {t('door.people.retry')}
        </button>
      ) : null}
      {k === 'auth' ? (
        <button type="button" className="btn ghost sm" onClick={signOut}>
          {t('door.err.auth.action')}
        </button>
      ) : null}
    </p>
  );
}
