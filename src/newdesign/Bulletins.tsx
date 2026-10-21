import { useState } from 'react';
import { CHURCH_HEADING, PROTOCOL_CHURCH_HEADING, ddmmyyyy, monthWord, musicTitle, musicWeeks, protocolColumns, protocolTitle, weekRows, weekTitle, type BulletinService, type ProtocolBulletinService, type ProtocolTeamBlock } from './bulletins';

/** The choir schedule as the church pins it up: one table per week, Tuesday, Friday, then the two Sunday services. */
export function MusicBulletin({ month, services }: { month: string; services: BulletinService[] }) {
  const { weeks, specials } = musicWeeks(services);
  return (
    <article className="bl-sheet print-sheet" aria-label={musicTitle(month)}>
      <header className="bl-head">
        <p className="bl-church">{CHURCH_HEADING}</p>
        <img src="/brand/adepr-logo.png" alt="" width={72} height={72} />
        <h3 className="bl-title">{musicTitle(month)}</h3>
      </header>
      {weeks.map((w, wi) => {
        const rows = weekRows(w);
        return (
          <table key={w.from} className={`bl-week bl-t${wi % 4}`}>
            <thead>
              <tr><th colSpan={4} className="bl-band">{weekTitle(w)}</th></tr>
              <tr>
                <th className="bl-tue">KUWA KABIRI</th>
                <th className="bl-fri">KUWA GATANU</th>
                <th colSpan={2} className="bl-sun">{w.sunday ? `KU CYUMWERU: ${ddmmyyyy(w.sunday.date)}` : 'KU CYUMWERU'}</th>
              </tr>
              <tr className="bl-dates">
                <th>{w.tuesday ? ddmmyyyy(w.tuesday.date) : ''}</th>
                <th>{w.friday ? ddmmyyyy(w.friday.date) : ''}</th>
                <th className="bl-left">ITERANIRO RYA MBERE</th>
                <th className="bl-left">ITERANIRO RYA KABIRI</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => (
                <tr key={i}>
                  <td>{w.tuesday?.names[i] ?? ''}</td>
                  <td>{w.friday?.names[i] ?? ''}</td>
                  <td>{w.sunday?.first[i] ?? ''}</td>
                  <td>{w.sunday?.second[i] ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
      {specials.map((s) => (
        <section key={s.id} className="bl-special">
          <h4>{`IGABURO RYERA RYO KU WA ${ddmmyyyy(s.date)}`}</h4>
          {s.names.length === 0 ? <p>-</p> : s.names.map((n) => <p key={n}>{`Chorale ${n}`}</p>)}
        </section>
      ))}
    </article>
  );
}

function TeamColumn({ blocks, tone }: { blocks: ProtocolTeamBlock[]; tone: string }) {
  return (
    <div className={`bl-col ${tone}`}>
      {blocks.map((b) => (
        <section key={b.id} className="bl-team">
          <h4><span aria-hidden>➤ </span>{b.heading}</h4>
          {b.members.length === 0 ? <p>-</p> : (
            <ol>
              {b.members.map((m) => <li key={`${m.n}-${m.name}`}>{m.name}{m.tag && <> <strong>({m.tag})</strong></>}</li>)}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

const NOTES_KEY = (month: string) => `moriah.protocolAnnouncements.${month}`;

/** The protocol teams as one sheet of four columns, with a column for announcements the team writes in. */
export function ProtocolBulletin({ month, services }: { month: string; services: ProtocolBulletinService[] }) {
  const cols = protocolColumns(services);
  const [notes, setNotes] = useState(() => {
    try { return window.localStorage.getItem(NOTES_KEY(month)) ?? ''; } catch { return ''; }
  });
  const save = (v: string) => {
    setNotes(v);
    try { window.localStorage.setItem(NOTES_KEY(month), v); } catch { /* kept on this page only */ }
  };
  return (
    <article className="bl-sheet bl-protocol print-sheet" aria-label={protocolTitle(month)}>
      <header className="bl-head">
        <p className="bl-church">{PROTOCOL_CHURCH_HEADING}</p>
        <h3 className="bl-title bl-blue">{protocolTitle(month)}</h3>
      </header>
      <div className="bl-cols">
        <TeamColumn blocks={cols.weekday} tone="bl-c1" />
        <TeamColumn blocks={cols.first} tone="bl-c2" />
        <TeamColumn blocks={cols.second} tone="bl-c3" />
        <div className="bl-col bl-c4">
          <h4 className="bl-announce"><span aria-hidden>➤ </span>ITANGAZO</h4>
          <textarea className="bl-notes" aria-label="ITANGAZO" value={notes} onChange={(e) => save(e.target.value)} rows={8} placeholder={monthWord(month)} />
          <div className="bl-notes-print">{notes}</div>
        </div>
      </div>
    </article>
  );
}
