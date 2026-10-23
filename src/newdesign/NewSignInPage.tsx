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

function UserIcon() {
  return (
    <svg className="login-input-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 7.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="login-input-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 11V8.4a4.5 4.5 0 0 1 9 0V11M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-7A1.5 1.5 0 0 1 6.5 11Z"
      />
    </svg>
  );
}

export function NewSignInPage() {
  const t = useT();
  const { status, signIn, sessionEnded } = useFrontDoor();
  const location = useLocation();
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
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
        <div className="login-hero-copy">
          <div className="login-moriah">
            <img src="/brand/moriah-logo.png" alt={t('login.moriahAlt')} width={233} height={135} />
            <p className="login-moriah-system">{t('login.product')}</p>
          </div>
          <blockquote className="login-quote">
            <p className="login-hero-brand">“{scripture.text}”</p>
            <p className="login-hero-line">{scripture.ref}</p>
          </blockquote>
        </div>
      </aside>

      <div className="login-form-pane">
        <LanguageSwitch className="lang-switch-login" />
        <div className="login-card stack">
          <div className="login-brand">
            <img src="/brand/adepr-logo.png" alt={t('login.churchAlt')} width={56} height={56} />
            <div>
              <h1>ADEPR Kacyiru</h1>
              <p className="muted login-card-sub">{t('login.subtitleMain')}</p>
            </div>
          </div>

          <form className="stack login-form" onSubmit={onSubmit} aria-busy={busy}>
            <div className="login-input">
              <UserIcon />
              <TextField
                label={t('login.username')}
                name="username"
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                placeholder={t('login.usernamePlaceholder')}
                required
                disabled={busy}
              />
            </div>
            <div className="login-input">
              <LockIcon />
              <TextField
                label={t('login.password')}
                name="password"
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder={t('login.passwordPlaceholder')}
                required
                disabled={busy}
              />
            </div>
            <button type="button" className="login-forgot" onClick={() => setForgotOpen((open) => !open)}>
              {t('login.forgot')}
            </button>
            {forgotOpen && (
              <p className="login-forgot-hint" role="status">
                {t('login.forgotHint')}
              </p>
            )}
            {sessionEnded && !error && (
              <div className="session-notice" role="status">
                {t('door.signIn.expired')}
              </div>
            )}
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
