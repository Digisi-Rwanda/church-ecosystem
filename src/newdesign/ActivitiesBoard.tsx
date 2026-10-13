import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchBoard, type BoardItem } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { EmptyState, PageHeader, SearchBox, Segmented, StatusChip, matchesText } from './kit';
import { formatRwf } from './money';
import { levelKeyOf } from './planLevels';
import { planStatusKey, sortPlans, stateTone } from './plans';
import { useLoad } from './useLoad';
import { whenSummary } from './when';

type Filter = 'me' | 'waiting' | 'approved' | 'all';
const mineToDecide = (p: BoardItem) => p.canApprove || p.canCheckMoney;

/** The Church Leader's and the Catechist's overview: every activity as a row, with its approval steps and who decided each one. */
export function ActivitiesBoard() {
  const t = useT();
  const { locale } = useI18n();
  const { systemId = '' } = useParams();
  const load = useLoad(() => fetchBoard(systemId), `board|${systemId}`);
  const [pick, setPick] = useState<Filter | null>(null);
  const [text, setText] = useState('');
  const all = sortPlans(load.data ?? []) as BoardItem[];
  const counts = {
    me: all.filter(mineToDecide).length,
    waiting: all.filter((p) => p.state === 'WAITING').length,
    approved: all.filter((p) => p.state === 'APPROVED').length,
    all: all.length,
  };
  const filter: Filter = pick ?? (counts.me > 0 ? 'me' : 'all');
  const shown = all
    .filter((p) => (filter === 'me' ? mineToDecide(p) : filter === 'waiting' ? p.state === 'WAITING' : filter === 'approved' ? p.state === 'APPROVED' : true))
    .filter((p) => matchesText(text, p.title, p.leaderName, p.unitName, p.planType));
  const status = (p: BoardItem) =>
    p.state === 'WAITING' && p.waitingLevel
      ? t('door.state.waitingFor', { who: t(`door.level.${levelKeyOf(p.waitingLevel)}` as 'door.level.UNIT') })
      : p.state === 'APPROVED' ? t(planStatusKey(p.status, p.planType)) : t(`door.state.${p.state}` as 'door.state.DRAFT');
  return (
    <section className="door-block" aria-labelledby="door-board-title">
      <PageHeader id="door-board-title" title={t('door.board.title')} purpose={t('door.board.purpose')} />
      <Segmented
        label={t('door.board.filter')}
        value={filter}
        onChange={setPick}
        items={[
          { key: 'me', label: t('door.board.f.me', { n: counts.me }) },
          { key: 'waiting', label: t('door.board.f.waiting', { n: counts.waiting }) },
          { key: 'approved', label: t('door.board.f.approved', { n: counts.approved }) },
          { key: 'all', label: t('door.board.f.all', { n: counts.all }) },
        ]}
      />
      <SearchBox value={text} onChange={setText} label={t('door.board.search')} clearLabel={t('door.search.clear')} />
      <LoadState loading={load.loading} failed={load.failed} retry={load.reload}>
        {shown.length === 0 ? (
          <EmptyState title={t(text ? 'door.search.noMatch' : 'door.board.none')} />
        ) : (
          <ul className="board-list">
            {shown.map((p) => (
              <li key={p.id} className="board-row">
                <div className="board-main">
                  <Link className="board-title" to={`/s/${p.systemId}/work/plans/${p.id}`}>{p.title}</Link>
                  <span className="muted">{p.unitName} · {p.leaderName}</span>
                </div>
                <dl className="board-facts">
                  <div><dt>{t('door.board.date')}</dt><dd>{whenSummary(p, t, locale)}</dd></div>
                  <div><dt>{t('door.board.amount')}</dt><dd>{p.amount > 0 ? `${formatRwf(p.amount)}${p.perMonth ? ` ${t('door.board.perMonth')}` : ''}` : '—'}</dd></div>
                  <div><dt>{t('door.plan.type')}</dt><dd>{t(`door.plan.type.${p.planType}` as 'door.plan.type.EVENT')}</dd></div>
                  <div><dt>{t('door.board.status')}</dt><dd><StatusChip tone={stateTone(p.state)}>{status(p)}</StatusChip></dd></div>
                </dl>
                {p.levels.length > 0 && (
                  <ol className="board-steps" aria-label={t('door.board.steps')}>
                    {p.levels.map((l) => {
                      const waiting = l.status === 'PENDING' && l === p.levels.find((x) => x.status === 'PENDING');
                      return (
                        <li key={l.levelKey} className={`board-step ${l.status === 'APPROVED' ? 'done' : waiting ? 'now' : ''}`}>
                          <strong>{t(`door.level.${l.levelKey}` as 'door.level.UNIT')}</strong>
                          <span>{l.byName || (waiting ? t('door.board.waiting') : t('door.board.later'))}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
