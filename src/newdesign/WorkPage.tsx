import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchWork, fetchWorkOptions } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SelectField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { lettersFor } from './menu';
import { sortWork } from './work';
import { WorkCard, WorkForm } from './WorkParts';
import { useLoad } from './useLoad';
import { PageHeader } from './kit';

type View = 'mine' | 'all';
type Show = 'open' | 'DONE' | 'all';

/** The Work block: my work, or everything I may see in this system. Light work for now. */
export function WorkPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [view, setView] = useState<View>('mine');
  const [show, setShow] = useState<Show>('open');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const allowed = lettersFor(capabilities, systemId, 'work').length > 0;
  const list = useLoad(() => fetchWork({ systemId, view, status: show, q: q.trim() || undefined }), `work|${systemId}|${view}|${show}|${q.trim()}`);
  const options = useLoad(fetchWorkOptions, 'work-options');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const canCreate = !!options.data && options.data.units.some((u) => u.systemId === systemId);
  const items = sortWork(list.data ?? []);

  return (
    <section className="door-block" aria-labelledby="door-work-title">
      <PageHeader id="door-work-title" title={t('door.work.tasks')} purpose={t('door.purpose.work')} />
      <>
      <div className="door-filters">
        <SelectField label={t('door.work.view')} name="w-view" value={view} onChange={(e) => setView(e.target.value as View)}>
          <option value="mine">{t('door.work.view.mine')}</option>
          <option value="all">{t('door.work.view.all')}</option>
        </SelectField>
        <SelectField label={t('door.work.show')} name="w-show" value={show} onChange={(e) => setShow(e.target.value as Show)}>
          <option value="open">{t('door.work.show.open')}</option>
          <option value="DONE">{t('door.work.show.done')}</option>
          <option value="all">{t('door.work.show.all')}</option>
        </SelectField>
        <TextField label={t('door.work.search')} name="w-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        {canCreate && !creating && (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            {t('door.work.new')}
          </button>
        )}
      </div>
      {creating && options.data && (
        <WorkForm options={options.data} systemId={systemId} onDone={() => { setCreating(false); list.reload(); }} onCancel={() => setCreating(false)} />
      )}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {items.length === 0 ? (
          <EmptyState title={t('door.work.none')} detail={t(view === 'mine' ? 'door.work.noneMine' : 'door.work.noneAll')} />
        ) : (
          <ul className="door-notices">
            {items.map((w) => (
              <WorkCard key={w.id} item={w} options={options.data} systemId={systemId} onChange={list.reload} />
            ))}
          </ul>
        )}
      </LoadState>
      </>
    </section>
  );
}
