import { ImportLink } from './imports/ImportLink';
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
import { PageHeader, Segmented, SidePanel, StatusChip } from './kit';

type View = 'mine' | 'all';
type Show = 'open' | 'DONE' | 'all';
type Layout = 'list' | 'board';

/** The Work block: my work, or everything I may see in this system. Light work for now. */
export function WorkPage() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { capabilities } = useFrontDoor();
  const [view, setView] = useState<View>('mine');
  const [show, setShow] = useState<Show>('open');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [layout, setLayout] = useState<Layout>('list');
  const allowed = lettersFor(capabilities, systemId, 'work').length > 0;
  const list = useLoad(() => fetchWork({ systemId, view, status: show, q: q.trim() || undefined }), `work|${systemId}|${view}|${show}|${q.trim()}`);
  const options = useLoad(fetchWorkOptions, 'work-options');
  if (!allowed) return <EmptyState variant="error" title={t('door.block.noAccessTitle')} />;
  const canCreate = !!options.data && options.data.units.some((u) => u.systemId === systemId);
  const items = sortWork(list.data ?? []);

  return (
    <section className="door-block" aria-labelledby="door-work-title">
      <PageHeader
        id="door-work-title"
        title={t('door.work.tasks')}
        purpose={t('door.purpose.work')}
        primary={canCreate ? <button type="button" className="btn" onClick={() => setCreating(true)}>{t('door.work.new')}</button> : undefined}
        actions={canCreate ? <ImportLink systemId={systemId} target="tasks" /> : undefined}
      />
      <>
      <div className="view-bar">
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
      </div>
      <Segmented
        label={t('door.work.layout')}
        value={layout}
        onChange={setLayout}
        items={[{ key: 'list', label: t('door.work.layout.list') }, { key: 'board', label: t('door.work.layout.board') }]}
      />
      </div>
      <SidePanel open={creating && !!options.data} title={t('door.work.form.new')} purpose={t('door.work.form.purpose')} onClose={() => setCreating(false)}>
        {options.data && (
          <div className="side-form">
            <WorkForm options={options.data} systemId={systemId} onDone={() => { setCreating(false); list.reload(); }} onCancel={() => setCreating(false)} />
          </div>
        )}
      </SidePanel>
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {items.length === 0 ? (
          <EmptyState title={t('door.work.none')} detail={t(view === 'mine' ? 'door.work.noneMine' : 'door.work.noneAll')} />
        ) : layout === 'board' ? (
          <div className="board">
            {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map((st) => {
              const col = items.filter((w) => w.status === st);
              return (
                <div key={st} className="board-col" role="group" aria-label={t(`door.work.status.${st}` as const)}>
                  <h3>
                    {t(`door.work.status.${st}` as const)} <span>{col.length}</span>
                  </h3>
                  {col.map((w) => (
                    <div key={w.id} className="board-card">
                      <strong>{w.title}</strong>
                      <span className="muted">{w.ownerName}{w.dueDate ? ` · ${w.dueDate.slice(0, 10)}` : ''}</span>
                      {w.overdue && <StatusChip tone="danger">{t('door.work.overdue')}</StatusChip>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
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
