import { fetchRunSheet, fetchServiceDetail, type RunSheetView, type ServiceDetail } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { PrintButton } from './kit';
import { useLoad } from './useLoad';

/** The bulletin of one service: the programme with times, then who preaches, which choirs sing and the Protocol team. Made to be printed or saved as PDF. */
export function ServiceBulletin({ date, code, onBack }: { date: string; code: string; onBack: () => void }) {
  const t = useT();
  const k = (s: string) => t(s as 'door.svc.bulletin.title');
  const { locale } = useI18n();
  const detail = useLoad<ServiceDetail>(() => fetchServiceDetail(date, code), `svc-${date}-${code}`);
  const run = useLoad<RunSheetView>(() => fetchRunSheet(date, code), `run-${date}-${code}`);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const d = detail.data;
  const r = run.data;
  const entries = (d?.pulpit.entries ?? []).filter((e) => e.status !== 'CANCELLED');
  return (
    <section className="door-block" aria-labelledby="door-bulletin-title">
      <div className="door-row door-no-print">
        <button type="button" className="btn ghost" onClick={onBack}>{k('door.svc.bulletin.back')}</button>
        <PrintButton />
      </div>
      <LoadState loading={detail.loading || run.loading} failed={detail.failed || run.failed} retry={() => { detail.reload(); run.reload(); }}>
        {d && r && (
          <article className="door-print-sheet bulletin">
            <header className="bulletin-head">
              <p className="bulletin-kicker muted">{k('door.svc.bulletin.title')}</p>
              <h2 id="door-bulletin-title">{d.service.label}</h2>
              <p className="bulletin-when">{day}{d.service.time ? ` · ${d.service.time}` : ''}</p>
            </header>

            <h3>{k('door.svc.run.title')}</h3>
            {r.items.length === 0 ? <p className="muted">{k('door.svc.bulletin.noProgramme')}</p> : (
              <table className="bulletin-table">
                <thead>
                  <tr><th scope="col">{k('door.svc.bulletin.time')}</th><th scope="col">{k('door.svc.run.activity')}</th><th scope="col">{k('door.svc.run.owner')}</th></tr>
                </thead>
                <tbody>
                  {r.items.map((i) => (
                    <tr key={i.id}>
                      <td className="bulletin-time">{i.startTime}–{i.endTime}</td>
                      <td>{i.title}{i.note ? <span className="muted"> · {i.note}</span> : null}</td>
                      <td>{i.ownerKind === 'PROTOCOL' ? k('door.svc.run.protocolTeam') : i.ownerName || <span className="muted">{k('door.svc.run.tbd')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="bulletin-cols">
              <div>
                <h3>{k('door.svc.pulpit')}</h3>
                {entries.length === 0 ? <p className="muted">{k('door.svc.bulletin.nothing')}</p> : (
                  <ul className="bulletin-list">
                    {entries.map((e) => (
                      <li key={e.id}>
                        <strong>{e.roleName}</strong>: {e.name || k('door.svc.run.tbd')}
                        {(e.theme || e.bibleText) && <span className="muted"> · {[e.theme, e.bibleText].filter(Boolean).join(' · ')}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3>{k('door.svc.choir')}</h3>
                {!d.choir.required ? <p className="muted">{k('door.svc.notNeeded')}</p>
                  : d.choir.state !== 'PUBLISHED' || d.choir.choirs.length === 0 ? <p className="muted">{k('door.svc.bulletin.toBeAnnounced')}</p>
                  : <ul className="bulletin-list">{d.choir.choirs.map((c) => <li key={c.id}>{c.name}</li>)}</ul>}
                <h3>{k('door.svc.protocol')}</h3>
                {!d.protocol.required ? <p className="muted">{k('door.svc.notNeeded')}</p>
                  : d.protocol.state !== 'PUBLISHED' || d.protocol.team.length === 0 ? <p className="muted">{k('door.svc.bulletin.toBeAnnounced')}</p>
                  : <ul className="bulletin-list">{d.protocol.team.map((p) => <li key={`${p.personId}-${p.role}`}>{p.name}{p.role ? <span className="muted"> · {p.role}</span> : null}</li>)}</ul>}
              </div>
            </div>
          </article>
        )}
      </LoadState>
    </section>
  );
}
