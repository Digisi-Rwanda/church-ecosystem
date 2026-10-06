import { type FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { TextField } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/translate';
import { useFrontDoor, type SignInResult } from './FrontDoorContext';

const ERROR_KEY: Record<Exclude<SignInResult, 'ok'>, MessageKey> = {
  refused: 'door.signIn.refused',
  unreachable: 'door.signIn.unreachable',
  failed: 'door.signIn.failed',
};

export function NewSignInPage() {
  const t = useT();
  const { status, signIn } = useFrontDoor();
  const location = useLocation();
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  if (status === 'in') return <Navigate to={from ?? '/portal'} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Browser autofill can fill the boxes without telling React, so read the form itself.
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    setError(null);
    setBusy(true);
    const result = await signIn(username, password);
    setBusy(false);
    if (result !== 'ok') setError(ERROR_KEY[result]);
  }

  return (
    <main className="door-center">
      <form className="panel door-card" onSubmit={onSubmit} aria-busy={busy}>
        <div className="door-card-head">
          <h1>{t('door.signIn.title')}</h1>
          <ThemeToggle />
        </div>
        <p className="muted">{t('door.signIn.subtitle')}</p>
        <TextField
          label={t('door.signIn.username')}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          required
          disabled={busy}
        />
        <TextField
          label={t('door.signIn.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={busy}
        />
        {error && (
          <p className="door-error" role="alert">
            {t(error)}
          </p>
        )}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? (
            <>
              <Spinner size="sm" label={t('door.signIn.busy')} /> {t('door.signIn.busy')}
            </>
          ) : (
            t('door.signIn.submit')
          )}
        </button>
      </form>
    </main>
  );
}
