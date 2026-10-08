import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createAdminAccount, fetchAdminAccounts, fetchAdminAudit, fetchAdminOverview, resetAdminPassword, unlockAdminAccount,
  type AdminAccount,
} from '../api/frontDoorApi';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { PersonPicker } from './PersonPicker';
import { useFrontDoor } from './FrontDoorContext';
import { isAdministrator } from './menu';
import { useLoad } from './useLoad';
import { ConfirmDialog, EmptyState, ListRow, PageHeader, RowList, SidePanel, StatusChip, Tabs } from './kit';

type Tab = 'overview' | 'accounts' | 'history';
type Secret = { username: string; temporaryPassword: string; why: 'reset' | 'created' };

const ERR: Record<string, string> = {
  USERNAME_TAKEN: 'door.admin.err.taken',
  ALREADY_HAS_ACCOUNT: 'door.admin.err.hasAccount',
  PERSON_NOT_ACTIVE: 'door.access.err.personNotActive',
  SELF: 'door.admin.err.self',
  BAD_INPUT: 'door.admin.err.input',
  NOT_FOUND: 'door.work.err.gone',
};

/** The Administrator console: accounts and password resets, health, and the review trail, in one place. */
export function AdminPage() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [tab, setTab] = useState<Tab>('overview');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [username, setUsername] = useState('');
  const [confirm, setConfirm] = useState<AdminAccount | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = isAdministrator(capabilities);
  const overview = useLoad(fetchAdminOverview, 'admin-overview');
  const accounts = useLoad(() => fetchAdminAccounts(q.trim()), `admin-accounts|${q.trim()}`);
  const audit = useLoad(() => fetchAdminAudit(50), 'admin-audit');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const o = overview.data;
  const fail = (err: unknown) => setError(t((ERR[errorCode(err) ?? ''] ?? 'door.people.actionFailed') as 'door.people.actionFailed'));
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '—');

  const reset = async (a: AdminAccount) => {
    setBusy(true);
    setError('');
    try {
      const r = await resetAdminPassword(a.personId);
      setSecret({ ...r, why: 'reset' });
      setConfirm(null);
      accounts.reload();
      audit.reload();
    } catch (err) {
      fail(err);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (!pick || username.trim().length < 3) return setError(t('door.admin.err.input'));
    setBusy(true);
    setError('');
    try {
      const r = await createAdminAccount({ personId: pick.id, username: username.trim() });
      setSecret({ ...r, why: 'created' });
      setCreating(false);
      setPick(null);
      setUsername('');
      accounts.reload();
      overview.reload();
      audit.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const unlock = async (a: AdminAccount) => {
    setError('');
    try {
      await unlockAdminAccount(a.personId);
      accounts.reload();
      overview.reload();
    } catch (err) {
      fail(err);
    }
  };
  const copy = () => {
    try {
      void navigator.clipboard.writeText(secret?.temporaryPassword ?? '');
    } catch {
      /* the password is on screen to copy by hand */
    }
  };

  return (
    <section className="door-block" aria-labelledby="door-admin-title">
      <PageHeader
        id="door-admin-title"
        title={t('door.admin.title')}
        purpose={t('door.admin.purpose')}
        primary={tab === 'accounts' ? <button type="button" className="btn" onClick={() => { setCreating(true); setError(''); }}>{t('door.admin.newAccount')}</button> : undefined}
        actions={
          <>
            <Link className="btn ghost" to={`/s/${systemId}/people/appointments`}>
              {t('door.people.tab.appointments')}
            </Link>
            <Link className="btn ghost" to={`/s/${systemId}/people/access`}>
              {t('door.people.tab.access')}
            </Link>
          </>
        }
      />
      <Tabs
        label={t('door.admin.tabs')}
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: t('door.admin.tab.overview'), count: o?.locked },
          { key: 'accounts', label: t('door.admin.tab.accounts') },
          { key: 'history', label: t('door.admin.tab.history') },
        ]}
      />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      {secret && (
        <div className="panel" role="status">
          <h3>{t(secret.why === 'reset' ? 'door.admin.secret.reset' : 'door.admin.secret.created', { username: secret.username })}</h3>
          <p>
            <code>{secret.temporaryPassword}</code>
          </p>
          <p className="muted">{t('door.admin.secret.once')}</p>
          <div className="door-row">
            <button type="button" className="btn secondary" onClick={copy}>
              {t('door.admin.secret.copy')}
            </button>
            <button type="button" className="btn ghost" onClick={() => setSecret(null)}>
              {t('door.admin.secret.done')}
            </button>
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <LoadState loading={overview.loading} failed={overview.failed} retry={overview.reload}>
          {o && (
            <div className="queue-grid">
              <div className="panel queue-card">
                <h3>
                  {t('door.admin.card.admins')} <StatusChip tone={o.administrators.count >= o.administrators.minimum ? 'success' : 'danger'}>{o.administrators.count} / {o.administrators.minimum}</StatusChip>
                </h3>
                <p className="muted">{t('door.admin.card.adminsHint', { minimum: o.administrators.minimum })}</p>
              </div>
              <div className="panel queue-card">
                <h3>
                  {t('door.admin.card.accounts')} <span className="muted">{o.accounts}</span>
                </h3>
                <p className="muted">{t('door.admin.card.withoutAccount', { count: o.withoutAccount })}</p>
              </div>
              <div className="panel queue-card">
                <h3>
                  {t('door.admin.card.locked')} <StatusChip tone={o.locked > 0 ? 'warn' : 'success'}>{o.locked}</StatusChip>
                </h3>
                <p className="muted">{t('door.admin.card.lockedHint')}</p>
              </div>
              <div className="panel queue-card">
                <h3>
                  {t('door.admin.card.health')} <StatusChip tone={o.health.db === 'ok' ? 'success' : 'danger'}>{t(o.health.db === 'ok' ? 'door.admin.health.ok' : 'door.admin.health.down')}</StatusChip>
                </h3>
                <p className="muted">{t('door.admin.card.healthHint', { env: o.health.env, time: when(o.health.time) })}</p>
              </div>
              <div className="panel queue-card">
                <h3>
                  {t('door.admin.card.backup')} <StatusChip>{o.backup ? when(o.backup.lastAt) : t('door.admin.backup.unknown')}</StatusChip>
                </h3>
                <p className="muted">{t('door.admin.card.backupHint')}</p>
              </div>
            </div>
          )}
        </LoadState>
      )}

      {tab === 'accounts' && (
        <>
          <TextField label={t('door.admin.search')} name="adm-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          <LoadState loading={accounts.loading} failed={accounts.failed} retry={accounts.reload}>
            {(accounts.data?.accounts ?? []).length === 0 ? (
              <EmptyState title={t('door.admin.none')} />
            ) : (
              <RowList label={t('door.admin.tab.accounts')}>
                {(accounts.data?.accounts ?? []).map((a) => (
                  <ListRow
                    key={a.personId}
                    avatarName={a.name}
                    title={a.name}
                    detail={`${a.username}${a.offices.length ? ` · ${a.offices.join(', ')}` : ''} · ${t('door.admin.changed', { when: when(a.passwordChangedAt) })}`}
                    status={a.locked ? <StatusChip tone="warn">{t('door.admin.lockedChip')}</StatusChip> : a.status === 'ARCHIVED' ? <StatusChip>{t('door.admin.archivedChip')}</StatusChip> : undefined}
                    action={
                      <span className="door-row">
                        {a.locked && (
                          <button type="button" className="btn ghost sm" onClick={() => void unlock(a)}>
                            {t('door.admin.unlock')}
                          </button>
                        )}
                        <button type="button" className="btn ghost sm" onClick={() => setConfirm(a)}>
                          {t('door.admin.reset')}
                        </button>
                      </span>
                    }
                  />
                ))}
              </RowList>
            )}
          </LoadState>
        </>
      )}

      {tab === 'history' && (
        <LoadState loading={audit.loading} failed={audit.failed} retry={audit.reload}>
          {(audit.data ?? []).length === 0 ? (
            <EmptyState title={t('door.admin.history.none')} />
          ) : (
            <RowList label={t('door.admin.tab.history')}>
              {(audit.data ?? []).map((e) => (
                <ListRow key={e.id} title={e.detail || e.action} detail={`${e.actorName ?? '—'} · ${when(e.at)}`} status={<StatusChip>{t(`door.admin.action.${e.action}` as 'door.admin.action.PASSWORD_RESET')}</StatusChip>} />
              ))}
            </RowList>
          )}
        </LoadState>
      )}

      <SidePanel open={creating} title={t('door.admin.newAccount')} purpose={t('door.admin.newAccount.purpose')} onClose={() => setCreating(false)} onSave={() => void create()} saveLabel={t('door.admin.create')} saving={busy} canSave={!!pick && username.trim().length >= 3}>
        <div className="door-form">
          <p>
            <strong>{t('door.admin.person')}:</strong> {pick ? pick.name : <span className="muted">{t('door.work.form.nobody')}</span>}
          </p>
          <PersonPicker label={t('door.admin.pickPerson')} name="adm-person" onPick={(p) => { setPick({ id: p.id, name: p.fullName }); if (!username) setUsername(p.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 30)); }} />
          <TextField label={t('door.admin.username')} name="adm-user" hint={t('door.admin.username.hint')} value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
      </SidePanel>
      <ConfirmDialog
        open={!!confirm}
        title={t('door.admin.reset.title', { name: confirm?.name ?? '' })}
        body={t('door.admin.reset.body')}
        confirmLabel={t('door.admin.reset')}
        busy={busy}
        onConfirm={() => confirm && void reset(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
