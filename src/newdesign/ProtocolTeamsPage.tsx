import { useState } from 'react';
import {
  acknowledgeProtocolMusic, addProtocolSlot, approveProtocolRoles, fetchProtocolHistory, fetchProtocolMonth, generateProtocolTeams, overrideProtocolIssue, publishProtocolMonth,
  relaxProtocolTuesday, removeProtocolSlot, replaceProtocolSlot, returnProtocolMonth, setProtocolRole, submitProtocolMonth, type ProtocolMonthView, type ProtocolRole,
  type ProtocolServiceView,
} from '../api/frontDoorApi';
import { SelectField, TextField } from '../components/ui/Field';
import { useI18n, useT } from '../i18n/I18nContext';
import { errorCode } from './governance';
import { LoadState } from './LoadState';
import { shiftMonth, thisMonth } from './music';
import { ROLES, STEPS, candidatesFor, issuesOfService, openBlocking, protocolErrorKey, sortIssues, stepIndex } from './protocol';
import { useLoad } from './useLoad';

type Act = (job: () => Promise<unknown>) => void;

/** One service: the choirs Music placed, and the team with its leaders. The Coordinator can add, replace, remove and set leaders. */
function ServiceTeamCard({ month, view, svc, act }: { month: string; view: ProtocolMonthView; svc: ProtocolServiceView; act: Act }) {
  const t = useT();
  const { locale } = useI18n();
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${svc.date}T00:00:00Z`));
  const edit = view.can.edit;
  const free = candidatesFor(view.roster, svc.team);
  const mine = issuesOfService(view.issues, svc.id);
  return (
    <li className="panel door-notice">
      <div className="door-notice-main">
        <div className="door-row">
          <strong>{day}</strong>
          <span className="door-chip">{t(`door.music.kind.${svc.kind}` as 'door.music.kind.SS1')}</span>
          <span className={`door-chip${svc.team.filter((x) => x.slotKind !== 'FILL_IN').length < svc.target ? ' warn' : ''}`}>
            {t('door.protocol.teamSize', { count: String(svc.team.filter((x) => x.slotKind !== 'FILL_IN').length), target: String(svc.target) })}
          </span>
        </div>
        <p className="muted">{svc.music.length ? t('door.protocol.musicOn', { names: svc.music.join(', ') }) : t('door.protocol.musicNone')}</p>
        {mine.length > 0 && (
          <ul className="door-list">
            {mine.map((i) => <li key={i.key} className={i.severity === 'BLOCKING' && !i.overridden ? 'door-error' : 'muted'}>{i.message}</li>)}
          </ul>
        )}
        <ul className="door-list">
          {svc.team.map((m) => (
            <li key={m.id} className="door-row">
              <span>
                {m.name}
                {m.role !== 'MEMBER' && <> <span className="door-chip">{t(`door.protocol.role.${m.role}` as 'door.protocol.role.MEMBER')}</span></>}
                {m.role === 'MEMBER' && m.recommendedRole && m.recommendedRole !== 'MEMBER' && <> <span className="door-chip">{t('door.protocol.recommended', { role: t(`door.protocol.role.${m.recommendedRole}` as 'door.protocol.role.MEMBER') })}</span></>}
                {m.slotKind !== 'REGULAR' && <> <span className="door-chip">{t(`door.protocol.slot.${m.slotKind}` as 'door.protocol.slot.EXTRA')}</span></>}
                <span className="muted"> · {t('door.protocol.load', { count: String(m.load) })}</span>
              </span>
              {edit && (
                <span className="door-row">
                  <SelectField label={t('door.protocol.setRole')} name={`role-${m.id}`} value={m.role} onChange={(e) => act(() => setProtocolRole(month, m.id, e.target.value as ProtocolRole))}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(`door.protocol.role.${r}` as 'door.protocol.role.MEMBER')}</option>)}
                  </SelectField>
                  {free.length > 0 && (
                    <SelectField label={t('door.protocol.replaceWith')} name={`rep-${m.id}`} value="" onChange={(e) => e.target.value && act(() => replaceProtocolSlot(month, m.id, e.target.value))}>
                      <option value="">{t('door.gov.meeting.choose')}</option>
                      {free.map((r) => <option key={r.personId} value={r.personId}>{r.name}</option>)}
                    </SelectField>
                  )}
                  <button type="button" className="btn ghost" onClick={() => act(() => removeProtocolSlot(month, m.id))}>{t('door.groups.remove')}</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {edit && free.length > 0 && (
          <SelectField label={t('door.protocol.addPerson')} name={`add-${svc.id}`} value="" onChange={(e) => e.target.value && act(() => addProtocolSlot(month, svc.id, e.target.value))}>
            <option value="">{t('door.gov.meeting.choose')}</option>
            {free.map((r) => <option key={r.personId} value={r.personId}>{`${r.name} (${r.load})`}</option>)}
          </SelectField>
        )}
      </div>
    </li>
  );
}

/** The month's Protocol teams, built by the old engine from Music's planned month, reviewed by the President, then published. */
export function ProtocolTeamsPage() {
  const t = useT();
  const { locale } = useI18n();
  const [month, setMonth] = useState(thisMonth());
  const data = useLoad(() => fetchProtocolMonth(month), `protocol-month|${month}`);
  const history = useLoad(() => fetchProtocolHistory(month), `protocol-history|${month}`);
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [relax, setRelax] = useState('');
  const act: Act = (job) => {
    setError('');
    job().then(() => { data.reload(); history.reload(); }).catch((err: unknown) => setError(t(protocolErrorKey(errorCode(err)) as 'door.people.actionFailed')));
  };
  const v = data.data;
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const blocking = v ? openBlocking(v.issues) : 0;
  return (
    <section className="door-block" aria-labelledby="door-teams-title">
      <div>
        <h2 id="door-teams-title">{t('door.own.teams')}</h2>
        <p className="muted">{t('door.protocol.teams.intro')}</p>
      </div>
      <div className="door-row">
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={t('door.music.plan.prev')}>‹</button>
        <strong>{monthName}</strong>
        <button type="button" className="btn ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={t('door.music.plan.next')}>›</button>
      </div>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={data.loading} failed={data.failed} retry={data.reload}>
        {v && (
          <>
            <ol className="door-steps" aria-label={t('door.protocol.steps')}>
              {STEPS.map((s) => (
                <li key={s} className={s === v.step ? 'current' : stepIndex(s) < stepIndex(v.step) ? 'done' : undefined} aria-current={s === v.step ? 'step' : undefined}>
                  {t(`door.protocol.step.${s}` as 'door.protocol.step.BUILD')}
                </li>
              ))}
            </ol>
            <p>{t(`door.protocol.next.${v.step}` as 'door.protocol.next.BUILD')}</p>
            {v.music && <p className="muted">{t('door.protocol.musicState', { state: t(`door.protocol.musicState.${v.music.state}` as 'door.protocol.musicState.PUBLISHED'), version: String(v.music.version) })}</p>}
            {v.stale.length > 0 && (
              <div className="panel door-notice" role="status">
                <div className="door-notice-main">
                  <strong>{t('door.protocol.stale.title')}</strong>
                  <p>{t('door.protocol.stale.body', { count: String(v.stale.length) })}</p>
                </div>
                {v.can.edit || v.can.reopen ? <button type="button" className="btn" onClick={() => act(() => acknowledgeProtocolMusic(month))}>{t('door.protocol.stale.ack')}</button> : null}
              </div>
            )}
            <div className="door-row">
              {v.can.build && <button type="button" className="btn" onClick={() => act(() => generateProtocolTeams(month))}>{v.step === 'BUILD' ? t('door.protocol.build') : t('door.protocol.rebuild')}</button>}
              {v.can.edit && v.services.some((s) => s.team.some((m) => m.recommendedRole && m.recommendedRole !== 'MEMBER' && m.role === 'MEMBER')) && (
                <button type="button" className="btn ghost" onClick={() => act(() => approveProtocolRoles(month))}>{t('door.protocol.approveRoles')}</button>
              )}
              {v.can.edit && v.status === 'DRAFT' && <button type="button" className="btn" disabled={blocking > 0} onClick={() => act(() => submitProtocolMonth(month))}>{t('door.protocol.submit')}</button>}
              {v.can.review && <button type="button" className="btn" onClick={() => act(() => publishProtocolMonth(month))}>{t('door.protocol.publish')}</button>}
              {(v.can.reopen || v.can.review) && <button type="button" className="btn ghost" onClick={() => act(() => returnProtocolMonth(month))}>{t('door.protocol.return')}</button>}
            </div>
            {v.can.edit && (
              <div className="panel door-form">
                <strong>{t('door.protocol.relax.title')}</strong>
                <p className="muted">{t('door.protocol.relax.hint')}</p>
                {v.relax.tuesday ? (
                  <div className="door-row">
                    <span>{t('door.protocol.relax.on', { reason: v.relax.reason ?? '' })}</span>
                    <button type="button" className="btn ghost" onClick={() => act(() => relaxProtocolTuesday(month, false))}>{t('door.protocol.relax.off')}</button>
                  </div>
                ) : (
                  <div className="door-row">
                    <TextField label={t('door.protocol.reason')} name="relax-reason" value={relax} onChange={(e) => setRelax(e.target.value)} />
                    <button type="button" className="btn ghost" onClick={() => act(() => relaxProtocolTuesday(month, true, relax))}>{t('door.protocol.relax.apply')}</button>
                  </div>
                )}
              </div>
            )}
            {v.issues.length > 0 && (
              <div className="panel">
                <h3>{t('door.protocol.issues')}</h3>
                <ul className="door-list">
                  {sortIssues(v.issues).map((i) => (
                    <li key={i.key} className="door-row">
                      <span className={i.severity === 'BLOCKING' && !i.overridden ? 'door-error' : 'muted'}>
                        <span className="door-chip">{t(i.overridden ? 'door.protocol.issue.allowed' : (`door.protocol.issue.${i.severity}` as 'door.protocol.issue.BLOCKING'))}</span> {i.message}
                      </span>
                      {v.can.edit && i.canOverride && !i.overridden && (
                        <span className="door-row">
                          <TextField label={t('door.protocol.reason')} name={`ov-${i.key}`} value={reasons[i.key] ?? ''} onChange={(e) => setReasons({ ...reasons, [i.key]: e.target.value })} />
                          <button type="button" className="btn ghost" onClick={() => act(() => overrideProtocolIssue(month, i.key, reasons[i.key] ?? ''))}>{t('door.protocol.allow')}</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {v.services.length === 0 ? <p className="muted">{t('door.protocol.noServices')}</p> : (
              <ul className="door-list">
                {v.services.map((s) => <ServiceTeamCard key={s.id} month={month} view={v} svc={s} act={act} />)}
              </ul>
            )}
            {history.data && history.data.versions.length > 0 && (
              <div className="panel">
                <h3>{t('door.protocol.history')}</h3>
                <ul className="door-list">
                  {history.data.versions.map((h) => (
                    <li key={h.version}>{t('door.protocol.historyRow', { version: String(h.version), by: h.by, date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(h.publishedAt)), slots: String(h.slots) })}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </LoadState>
    </section>
  );
}
