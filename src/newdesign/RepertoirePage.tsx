import { useState, type FormEvent } from 'react';
import { addSong, fetchSongs, markSongSung, retireSong } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { choirWorkErrorKey, daysSince, restedFirst } from './choirWork';
import { ChoirSelect } from './ChoirSelect';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';

const today = () => new Date().toISOString().slice(0, 10);

function Songs({ choirId }: { choirId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const data = useLoad(() => fetchSongs(choirId), `songs|${choirId}`);
  const [form, setForm] = useState(false);
  const [v, setV] = useState({ title: '', composer: '', songKey: '' });
  const [error, setError] = useState('');
  const run = async (job: () => Promise<void>, after?: () => void) => {
    setError('');
    try {
      await job();
      after?.();
      data.reload();
    } catch (err) {
      setError(t(choirWorkErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return setError(t('door.caring.err.input'));
    void run(() => addSong({ choirId, title: v.title.trim(), composer: v.composer.trim() || null, songKey: v.songKey.trim() || null }), () => { setForm(false); setV({ title: '', composer: '', songKey: '' }); });
  };
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const canWrite = !!data.data?.canWrite;
  return (
    <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
      {error && <p className="door-error" role="alert">{error}</p>}
      {canWrite && !form && <div className="door-row"><button type="button" className="btn" onClick={() => setForm(true)}>{t('door.choirwork.song.new')}</button></div>}
      {form && (
        <form className="panel door-form" onSubmit={submit} noValidate>
          <h3>{t('door.choirwork.song.new')}</h3>
          <TextField label={t('door.choirwork.song.title')} name="s-title" value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} />
          <TextField label={t('door.choirwork.song.composer')} name="s-comp" value={v.composer} maxLength={80} onChange={(e) => setV({ ...v, composer: e.target.value })} />
          <TextField label={t('door.choirwork.song.key')} name="s-key" value={v.songKey} maxLength={12} onChange={(e) => setV({ ...v, songKey: e.target.value })} />
          <div className="door-row">
            <button type="submit" className="btn">{t('door.choirwork.song.save')}</button>
            <button type="button" className="btn ghost" onClick={() => setForm(false)}>{t('door.settings.cancel')}</button>
          </div>
        </form>
      )}
      {(data.data?.songs ?? []).length === 0 ? (
        <EmptyState title={t('door.choirwork.song.none')} detail={canWrite ? t('door.choirwork.song.noneDetail') : undefined} />
      ) : (
        <ul className="door-notices">
          {restedFirst(data.data!.songs).map((s) => {
            const ago = daysSince(s.lastSungOn, today());
            return (
              <li key={s.id} className="panel door-notice">
                <div className="door-notice-main">
                  <strong>{s.title}</strong>
                  <p className="muted">{[s.composer, s.songKey && t('door.choirwork.song.inKey', { key: s.songKey })].filter(Boolean).join(' · ')}</p>
                  <p className="muted">{s.lastSungOn ? t('door.choirwork.song.lastSung', { day: fmt(s.lastSungOn), days: String(ago ?? 0) }) : t('door.choirwork.song.neverSung')}</p>
                  {canWrite && (
                    <div className="door-row">
                      <button type="button" className="btn ghost" onClick={() => void run(() => markSongSung(s.id, today()))}>{t('door.choirwork.song.sungToday')}</button>
                      <button type="button" className="btn ghost" onClick={() => void run(() => retireSong(s.id))}>{t('door.choirwork.song.retire')}</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </LoadState>
  );
}

/** The repertoire: songs a choir knows, with the ones rested longest first. Singers can read it; leaders change it. */
export function RepertoirePage() {
  const t = useT();
  const [choir, setChoir] = useState('');
  return (
    <section className="door-block" aria-labelledby="door-rep-title">
      <div>
        <h2 id="door-rep-title">{t('door.own.repertoire')}</h2>
        <p className="muted">{t('door.choirwork.song.intro')}</p>
      </div>
      <ChoirSelect value={choir} onChange={setChoir} forRepertoire>{(id) => <Songs key={id} choirId={id} />}</ChoirSelect>
    </section>
  );
}
