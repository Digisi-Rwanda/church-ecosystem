import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getLoginNote } from '../api/loginNote';
import { useAuth } from '../auth/AuthContext';
import { isChoirOrgUnitId, choirName } from '../domain/choirCatalog';
import type { SystemId } from '../domain/types';
import { systemsService, authService } from '../services';
import { Spinner } from '../components/ui/Spinner';
import { TextField } from '../components/ui/Field';

const DEMO_HINTS = [
  { user: 'pastor', pass: 'pastor123', note: 'Church Leader' },
  { user: 'pastor2', pass: 'pastor2123', note: 'Pastor (ordained)' },
  { user: 'catechist', pass: 'catechist123', note: 'Catechist / Umwarimu' },
  { user: 'secretary', pass: 'secret123', note: 'Church Secretary' },
  { user: 'treasurer', pass: 'treas123', note: 'Church Treasurer' },
  { user: 'patrick', pass: 'member123', note: 'Member (flows: baptism, transfer, wedding)' },
  { user: 'youth', pass: 'youth123', note: 'Youth President (ministry programs/events)' },
  { user: 'music', pass: 'music123', note: 'Music President' },
];

const SCRIPTURES = [
  {
    text: 'The Lord is my shepherd; I shall not want.',
    ref: 'Psalm 23:1',
  },
  {
    text: 'I can do all things through Christ who strengthens me.',
    ref: 'Philippians 4:13',
  },
  {
    text: 'Trust in the Lord with all your heart, and lean not on your own understanding.',
    ref: 'Proverbs 3:5',
  },
  {
    text: 'For God so loved the world that He gave His only begotten Son.',
    ref: 'John 3:16',
  },
  {
    text: 'Be still, and know that I am God.',
    ref: 'Psalm 46:10',
  },
  {
    text: 'Let us not grow weary in doing good, for in due season we shall reap.',
    ref: 'Galatians 6:9',
  },
  {
    text: 'The Lord your God is with you wherever you go.',
    ref: 'Joshua 1:9',
  },
  {
    text: 'Love one another as I have loved you.',
    ref: 'John 13:34',
  },
  {
    text: 'This is the day that the Lord has made; let us rejoice and be glad in it.',
    ref: 'Psalm 118:24',
  },
  {
    text: 'Commit your work to the Lord, and your plans will be established.',
    ref: 'Proverbs 16:3',
  },
  {
    text: 'Serve the Lord with gladness; come before His presence with singing.',
    ref: 'Psalm 100:2',
  },
  {
    text: 'And let the peace of God rule in your hearts.',
    ref: 'Colossians 3:15',
  },
];

function pickScripture() {
  return SCRIPTURES[Math.floor(Math.random() * SCRIPTURES.length)]!;
}

export function LoginPage() {
  const { account, login, setActiveChoir } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDemos, setShowDemos] = useState(false);
  const scripture = useMemo(() => pickScripture(), []);

  const targetSystemId = (params.get('system') as SystemId | null) ?? 'sys-main';
  const choirOrgUnitId = params.get('choir');
  /** Demo accounts: DEV builds or `?demo=1`. */
  const showOpsChrome =
    import.meta.env.DEV || params.get('demo') === '1';
  const targetSystem = useMemo(
    () =>
      systemsService.getById(targetSystemId) ??
      systemsService.getById('sys-main'),
    [targetSystemId],
  );

  const systemTitle =
    choirOrgUnitId && isChoirOrgUnitId(choirOrgUnitId)
      ? choirName(choirOrgUnitId)
      : targetSystem?.kind === 'MAIN'
        ? 'ADEPR Kacyiru'
        : (targetSystem?.shortName ?? targetSystem?.name ?? 'ADEPR Kacyiru');

  useEffect(() => {
    if (
      !account ||
      targetSystemId !== 'sys-choir' ||
      !choirOrgUnitId ||
      !isChoirOrgUnitId(choirOrgUnitId)
    ) {
      return;
    }
    // Avoid refresh loops when already scoped.
    const current = authService.getSession()?.activeChoirOrgUnitId;
    if (current === choirOrgUnitId) return;
    setActiveChoir(choirOrgUnitId);
  }, [account, targetSystemId, choirOrgUnitId, setActiveChoir]);

  if (account) {
    const dest =
      targetSystemId === 'sys-main'
        ? '/'
        : (systemsService.getById(targetSystemId)?.basePath ?? '/');
    return <Navigate to={dest} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Browser autofill can fill the boxes without telling React, so read what
    // is really in the form (before the inputs are disabled while signing in).
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const typedUser = String(fd.get('username') ?? username).trim();
    const typedPass = String(fd.get('password') ?? password);
    setError('');
    setBusy(true);
    try {
      const ok = await login(typedUser, typedPass, targetSystemId);
      if (!ok) {
        setError(
          getLoginNote() ||
            'Invalid credentials or you are not entitled to this system.',
        );
        return;
      }
      if (
        targetSystemId === 'sys-choir' &&
        choirOrgUnitId &&
        isChoirOrgUnitId(choirOrgUnitId)
      ) {
        setActiveChoir(choirOrgUnitId);
      }
      const dest =
        targetSystemId === 'sys-main'
          ? '/'
          : (systemsService.getById(targetSystemId)?.basePath ?? '/');
      navigate(dest, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page login-split">
      <aside className="login-hero-pane" aria-label="Welcome">
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
          <div className="login-brand">
            <img src="/brand/adepr-logo.png" alt="ADEPR" width={76} height={76} />
            <div>
              <h1>{systemTitle}</h1>
              <p className="muted" style={{ margin: 0 }}>
                {targetSystem?.kind === 'MAIN'
                  ? 'Sign in to continue to your account'
                  : choirOrgUnitId && isChoirOrgUnitId(choirOrgUnitId)
                    ? `Direct login to this choir. Same account as Main Church.`
                    : `Direct login to ${targetSystem?.name}. Same account as Main Church.`}
              </p>
            </div>
          </div>

          <form className="stack" onSubmit={onSubmit}>
            <TextField
              label="Username"
              name="username"
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={busy}
            />
            <TextField
              label="Password"
              name="password"
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button type="submit" className="btn" disabled={busy}>
              {busy ? (
                <>
                  <Spinner label="Signing in" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {showOpsChrome ? (
            <details
              className="login-demos"
              open={showDemos}
              onToggle={(e) =>
                setShowDemos((e.target as HTMLDetailsElement).open)
              }
            >
              <summary>Demo accounts</summary>
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Password</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_HINTS.map((d) => (
                    <tr key={`${d.user}-${d.note}`}>
                      <td>{d.user}</td>
                      <td>{d.pass}</td>
                      <td>{d.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
