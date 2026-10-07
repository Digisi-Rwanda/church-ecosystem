import { useState } from 'react';
import { moveContributionList, saveContributionLines, type ContributionListView } from '../api/frontDoorApi';
import { TextAreaField, TextField } from '../components/ui/Field';
import { useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { formatRwf, moneyErrorKey } from './money';
import { blankLine, cleanLines, draftTotal, listStatusKey, toLineDraft, type LineDraft } from './moneyBlock';
import { PersonPicker } from './PersonPicker';

/** One contribution list: read it, or write its lines while it is still with the person who keeps it. */
export function ContributionList({ list, onChange }: { list: ContributionListView; onChange: () => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<LineDraft[]>([]);
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const fail = (e: unknown) => setError(t(moneyErrorKey(errorCode(e)) as 'door.people.actionFailed'));
  const run = async (job: () => Promise<void>) => {
    setError('');
    try {
      await job();
      setEditing(false);
      setAsk(false);
      onChange();
    } catch (e) {
      fail(e);
    }
  };
  const start = () => {
    setRows(list.lines.length ? list.lines.map(toLineDraft) : [blankLine()]);
    setEditing(true);
  };
  const save = async (andSubmit: boolean) => {
    const c = cleanLines(rows);
    if (!c.ok) return setError(t(c.error as 'door.money.lines.err.name'));
    await run(async () => {
      await saveContributionLines(list.id, c.lines);
      if (andSubmit) await moveContributionList(list.id, 'submit');
    });
  };
  const set = (i: number, patch: Partial<LineDraft>) => setRows((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const unit = list.level === 'UNIT';
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{list.typeName}</strong>
          <span>{list.month}</span>
          <span className="door-chip">{unit ? t('door.money.list.unit') : list.teamName}</span>
          <span className={`door-chip${list.status === 'SUBMITTED' ? ' warn' : ''}`}>{t(listStatusKey(list.status))}</span>
        </div>
        <p className="muted">
          {formatRwf(list.total)}
          {list.fromTeams > 0 && ` · ${t('door.money.list.fromTeams', { n: String(list.fromTeams) })}`}
          {list.goal && ` · ${t('door.money.list.goal', { amount: formatRwf(list.goal.amount), per: t(`door.sset.per.${list.goal.per ?? 'MEMBER'}` as 'door.sset.per.MEMBER') })}`}
        </p>
        {list.decisionNote && <p className="muted">{t('door.money.list.returned', { reason: list.decisionNote })}</p>}
        {editing ? (
          <div className="door-form" style={{ maxWidth: 'none' }}>
            {rows.map((r, i) => (
              <div key={i} className="door-row">
                <TextField label={t('door.money.lines.name')} name={`cl-name-${list.id}-${i}`} maxLength={80} value={r.name} onChange={(e) => set(i, { name: e.target.value, personId: r.personId && e.target.value === r.name ? r.personId : null })} />
                <TextField label={t('door.money.lines.amount')} name={`cl-amt-${list.id}-${i}`} inputMode="numeric" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} />
                {unit && r.team && <span className="muted">{r.team}</span>}
                <button type="button" className="btn ghost sm" onClick={() => setRows((all) => all.filter((_, n) => n !== i))}>
                  {t('door.money.lines.remove')}
                </button>
              </div>
            ))}
            <div className="door-row">
              <button type="button" className="btn ghost sm" onClick={() => setRows((all) => [...all, blankLine()])}>
                {t('door.money.lines.add')}
              </button>
            </div>
            <PersonPicker label={t('door.money.lines.fromDirectory')} name={`cl-pick-${list.id}`} onPick={(p) => setRows((all) => [...all.filter((r) => r.name.trim() || r.amount.trim()), { name: p.fullName, personId: p.id, team: null, amount: '' }])} />
            <p>
              <strong>{t('door.money.total')}</strong> {formatRwf(draftTotal(rows))}
            </p>
            <div className="door-row">
              <button type="button" className="btn" onClick={() => void save(false)}>
                {t('door.money.lines.save')}
              </button>
              <button type="button" className="btn secondary" onClick={() => void save(true)}>
                {t('door.money.lines.saveSubmit', { to: unit ? t('door.money.list.toPresident') : t('door.money.list.toTreasurer') })}
              </button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </div>
        ) : (
          list.lines.length > 0 && (
            <div className="door-table-wrap">
              <table className="door-table door-stack">
                <thead>
                  <tr>
                    <th>{t('door.money.lines.name')}</th>
                    {unit && <th>{t('door.money.lines.team')}</th>}
                    <th>{t('door.money.lines.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.lines.map((l) => (
                    <tr key={l.id}>
                      <th scope="row">{l.name}</th>
                      {unit && <td data-label={t('door.money.lines.team')}>{l.team ?? '—'}</td>}
                      <td data-label={t('door.money.lines.amount')}>{formatRwf(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {!editing && list.goals.length > 0 && (
          <p className="muted">{t('door.money.list.goalsMet', { met: String(list.goals.filter((g) => g.met).length), all: String(list.goals.length) })}</p>
        )}
        {ask && (
          <div className="door-form">
            <TextAreaField label={t('door.money.reason')} name={`cl-reason-${list.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="door-row">
              <button type="button" className="btn" onClick={() => void run(() => moveContributionList(list.id, 'return', reason))}>
                {t('door.money.list.return')}
              </button>
              <button type="button" className="btn ghost" onClick={() => setAsk(false)}>
                {t('door.settings.cancel')}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="door-error" role="alert">
            {error}
          </p>
        )}
        {!editing && !ask && (
          <div className="door-row">
            {list.canEdit && (
              <button type="button" className="btn sm" onClick={start}>
                {t('door.money.lines.edit')}
              </button>
            )}
            {list.canSubmit && (
              <button type="button" className="btn secondary sm" onClick={() => void run(() => moveContributionList(list.id, 'submit'))}>
                {t('door.money.list.submit', { to: unit ? t('door.money.list.toPresident') : t('door.money.list.toTreasurer') })}
              </button>
            )}
            {list.canApprove && (
              <button type="button" className="btn sm" onClick={() => void run(() => moveContributionList(list.id, 'approve'))}>
                {t('door.money.entry.approve')}
              </button>
            )}
            {list.canReturn && (
              <button type="button" className="btn ghost sm" onClick={() => setAsk(true)}>
                {t('door.money.list.return')}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

