import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';

/** The Portal: one card per system this person may enter, as the server answers. */
export function PortalPage() {
  const t = useT();
  const { status, personName, portal, signOut, reload } = useFrontDoor();

  return (
    <main className="door-page">
      <header className="door-top">
        <div>
          <h1>{t('door.portal.title')}</h1>
          <p className="muted">{t('door.portal.subtitle')}</p>
        </div>
        <div className="door-top-actions">
          {personName && <span className="muted">{t('door.portal.welcome', { name: personName })}</span>}
          <ThemeToggle />
          <button type="button" className="btn secondary sm" onClick={signOut}>
            {t('shell.signOut')}
          </button>
        </div>
      </header>

      {status === 'loading' && (
        <div className="door-center" role="status">
          <Spinner size="lg" label={t('door.portal.loading')} />
        </div>
      )}
      {status === 'error' && (
        <EmptyState
          variant="error"
          title={t('door.portal.errorTitle')}
          detail={t('door.portal.errorDetail')}
          action={
            <button type="button" className="btn" onClick={() => void reload()}>
              {t('door.portal.retry')}
            </button>
          }
        />
      )}
      {status === 'in' && portal.length === 0 && (
        <EmptyState title={t('door.portal.emptyTitle')} detail={t('door.portal.emptyDetail')} />
      )}
      {status === 'in' && portal.length > 0 && (
        <ul className="door-cards">
          {portal.map((s) => (
            <li key={s.id}>
              <Link
                className="panel door-system-card"
                to={`/s/${s.id}`}
                aria-label={t('door.portal.open', { system: s.name })}
              >
                <strong>{s.shortName}</strong>
                <span className="muted">{s.name}</span>
                <span className="door-role">{t('door.portal.role', { role: s.role })}</span>
                {s.unreadCount > 0 && (
                  <span className="door-unread">{t('door.portal.unread', { count: s.unreadCount })}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
