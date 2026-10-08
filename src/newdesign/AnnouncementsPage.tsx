import { useState, type FormEvent } from 'react';
import {
  fetchAnnouncementOptions,
  fetchAnnouncements,
  markAnnouncementsRead,
  postAnnouncement,
  withdrawAnnouncement,
  type AnnouncementItem,
  type AnnouncementOptions,
  type AudienceKind,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { announceErrorKey, audienceKinds, buildAudience, canCompose, dayOf, errorCode, formReady, markedRead, unreadIds } from './announcements';
import { dayLabel } from './notices';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

/** The audience line under a post, in words a member understands. */
export function AudienceLine({ item }: { item: AnnouncementItem }) {
  const t = useT();
  const a = item.audience;
  if (a.kind === 'SYSTEM') return <>{t('door.announce.to.SYSTEM', { system: a.systemName ?? a.systemId ?? '' })}</>;
  if (a.kind === 'OFFICE' && a.office) return <>{t('door.announce.to.OFFICE', { office: t(`door.office.${a.office}` as const) })}</>;
  return <>{t('door.announce.to.WHOLE_CHURCH')}</>;
}

/** Announcements: what reaches me, newest first; and, when I hold the Send letter, a form to post one. */
export function AnnouncementsPage() {
  const t = useT();
  const list = useLoad(fetchAnnouncements, 'announcements');
  const options = useLoad(fetchAnnouncementOptions, 'announce-options');
  const [marked, setMarked] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const items = markedRead(list.data?.items ?? [], marked);
  const unread = unreadIds(items);

  const readOne = async (id: string) => {
    setMarked((m) => [...m, id]);
    try {
      await markAnnouncementsRead({ ids: [id] });
    } catch {
      setMarked((m) => m.filter((x) => x !== id));
      setError(t('door.people.actionFailed'));
    }
  };
  const readAll = async () => {
    const ids = unread;
    setMarked((m) => [...m, ...ids]);
    try {
      await markAnnouncementsRead({ all: true });
    } catch {
      setMarked((m) => m.filter((x) => !ids.includes(x)));
      setError(t('door.people.actionFailed'));
    }
  };

  return (
    <section className="door-block" aria-labelledby="door-announce-title">
      <div className="door-row">
        <div>
          <PageHeader id="door-announce-title" title={t('door.announce.title')} purpose={t('door.purpose.announce')} />
          <p className="muted">{t('door.announce.intro')}</p>
        </div>
        <div className="door-row">
          <button type="button" className="btn secondary" disabled={unread.length === 0} onClick={() => void readAll()}>
            {t('door.announce.markAll')}
          </button>
          {canCompose(options.data) && !composing && (
            <button type="button" className="btn" onClick={() => { setComposing(true); setNotice(''); }}>
              {t('door.announce.new')}
            </button>
          )}
        </div>
      </div>
      {options.data && !canCompose(options.data) && <p className="muted">{t('door.announce.cannotPost')}</p>}
      {notice && (
        <p className="door-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      {composing && options.data && (
        <ComposeForm
          options={options.data}
          onCancel={() => setComposing(false)}
          onDone={() => {
            setComposing(false);
            setNotice(t('door.announce.posted'));
            list.reload();
          }}
        />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {items.length === 0 ? (
          <EmptyState title={t('door.announce.empty')} detail={t('door.announce.emptyDetail')} />
        ) : (
          <ul className="door-notices">
            {items.map((a) => (
              <Post key={a.id} item={a} onRead={() => void readOne(a.id)} onWithdrawn={list.reload} />
            ))}
          </ul>
        )}
      </LoadState>
    </section>
  );
}

function Post({ item, onRead, onWithdrawn }: { item: AnnouncementItem; onRead: () => void; onWithdrawn: () => void }) {
  const t = useT();
  const [taking, setTaking] = useState(false);
  const when = item.publishedAt ? dayLabel(item.publishedAt) : null;
  return (
    <li className={`panel door-notice${item.read ? '' : ' unread'}`}>
      <div className="door-notice-main">
        <div className="door-notice-title">
          {!item.read && <span className="door-dot" role="img" aria-label={t('door.announce.unread')} />}
          <strong>{item.title}</strong>
        </div>
        <p className="door-announce-body">{item.body}</p>
        <p className="muted door-notice-meta">
          <span className="door-chip">
            <AudienceLine item={item} />
          </span>{' '}
          {t('door.announce.by', { name: item.authorName || '—' })}
          {when && ` · ${when.kind === 'date' ? when.date : t(when.kind === 'today' ? 'door.notices.today' : 'door.notices.yesterday')}`}
          {item.expiresAt && ` · ${t('door.announce.until', { date: dayOf(item.expiresAt) })}`}
        </p>
        {taking && <WithdrawForm id={item.id} onDone={onWithdrawn} onCancel={() => setTaking(false)} />}
      </div>
      <div className="door-announce-actions">
        {!item.read && (
          <button type="button" className="btn ghost sm" onClick={onRead}>
            {t('door.announce.markRead')}
          </button>
        )}
        {item.canWithdraw && !taking && (
          <button type="button" className="btn ghost sm" onClick={() => setTaking(true)}>
            {t('door.announce.withdraw')}
          </button>
        )}
      </div>
    </li>
  );
}

function WithdrawForm({ id, onDone, onCancel }: { id: string; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setError(t('door.announce.withdraw.reasonRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await withdrawAnnouncement(id, reason.trim());
      onDone();
    } catch (err) {
      setError(t(announceErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };
  return (
    <form className="door-form door-end" onSubmit={submit} noValidate>
      <TextField label={t('door.announce.withdraw.reason')} name={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn danger" disabled={busy}>
          {t('door.announce.withdraw.confirm')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.announce.form.cancel')}
        </button>
      </div>
    </form>
  );
}

function ComposeForm({ options, onDone, onCancel }: { options: AnnouncementOptions; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const kinds = audienceKinds(options);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<AudienceKind | ''>(kinds.length === 1 ? kinds[0] : '');
  const [systemId, setSystemId] = useState(options.systems.length === 1 ? options.systems[0].id : '');
  const [office, setOffice] = useState('');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audience = buildAudience(kind, systemId, office);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formReady(title, body, audience) || !audience) {
      setError(t('door.announce.form.incomplete'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postAnnouncement({ title: title.trim(), body: body.trim(), audience, expiresAt: expires || undefined });
      onDone();
    } catch (err) {
      setError(t(announceErrorKey(errorCode(err)) as 'door.people.actionFailed'));
      setBusy(false);
    }
  };

  return (
    <form className="panel door-form" onSubmit={submit} noValidate>
      <h3>{t('door.announce.new')}</h3>
      <TextField label={t('door.announce.form.title')} name="title" value={title} maxLength={options.limits.titleMax} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField label={t('door.announce.form.body')} name="body" rows={5} value={body} maxLength={options.limits.bodyMax} onChange={(e) => setBody(e.target.value)} />
      <SelectField label={t('door.announce.form.audience')} name="audience" value={kind} onChange={(e) => setKind(e.target.value as AudienceKind | '')}>
        <option value="">{t('door.announce.form.choose')}</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {t(`door.announce.audience.${k}` as const)}
          </option>
        ))}
      </SelectField>
      {kind === 'SYSTEM' && (
        <SelectField label={t('door.announce.form.system')} name="system" value={systemId} onChange={(e) => setSystemId(e.target.value)}>
          <option value="">{t('door.announce.form.choose')}</option>
          {options.systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shortName}
            </option>
          ))}
        </SelectField>
      )}
      {kind === 'OFFICE' && (
        <SelectField label={t('door.announce.form.office')} name="office" value={office} onChange={(e) => setOffice(e.target.value)}>
          <option value="">{t('door.announce.form.choose')}</option>
          {options.offices.map((o) => (
            <option key={o} value={o}>
              {t(`door.office.${o}` as const)}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label={t('door.announce.form.expires')} name="expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} hint={t('door.announce.form.expiresHint')} />
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <div className="door-row">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? t('door.announce.form.posting') : t('door.announce.form.submit')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          {t('door.announce.form.cancel')}
        </button>
      </div>
    </form>
  );
}
