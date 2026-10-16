import { type FormEvent, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { TextField } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { pickScripture } from '../lib/scriptures';
import { useT } from '../i18n/I18nContext';
import type { MessageKey } from '../i18n/translate';
import { LanguageSwitch } from './LanguageSwitch';
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
  const scripture = useMemo(() => pickScripture(), []);
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
    <div className="login-page login-split">
      <aside className="login-hero-pane" aria-label={t('login.welcome')}>
        <img
          className="login-hero-media"
          src="/brand/church-building.png?v=2"
          alt="ADEPR Kacyiru church building"
          decoding="async"
          fetchPriority="high"
        />
        <div className="login-hero-shade" aria-hidden />
        <div className="login-hero-copy">
          <p className="login-hero-brand">“{scripture.text}”</p>
          <p className="login-hero-line">{scripture.ref}</p>
        </div>
        <div className="login-hero-wave" aria-hidden />
      </aside>

      <div className="login-form-pane">
        <div className="login-card stack">
          <LanguageSwitch className="lang-switch-login" />
          <div className="login-brand">
            <img src="/brand/adepr-logo.png" alt="ADEPR" width={76} height={76} />
            <div>
              <h1>ADEPR Kacyiru</h1>
              <p className="muted" style={{ margin: 0 }}>
                {t('login.subtitleMain')}
              </p>
            </div>
          </div>

          <form className="stack" onSubmit={onSubmit} aria-busy={busy}>
            <TextField label={t('login.username')} name="username" id="username" autoComplete="username" autoCapitalize="none" required disabled={busy} />
            <TextField label={t('login.password')} name="password" id="password" type="password" autoComplete="current-password" required disabled={busy} />
            {error && (
              <div className="error" role="alert">
                {t(error)}
              </div>
            )}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? (
                <>
                  <Spinner label={t('login.signingInLabel')} />
                  {t('login.signingIn')}
                </>
              ) : (
                t('login.signIn')
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
