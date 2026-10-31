import {
  CHURCH_HEADING, PROTOCOL_CHURCH_HEADING, PROTOCOL_NB, ddmmyyyy, musicTitle, musicWeeks, protocolTitle, protocolWeeks, weekRows, weekTitle,
  type BulletinService, type ProtocolBulletinService, type ProtocolTeamBlock,
} from './bulletins';

/** The choir schedule as the church pins it up: one table per week, Tuesday, Friday, then the two Sunday services. */
export function MusicBulletin({ month, services }: { month: string; services: BulletinService[] }) {
  const { weeks, specials } = musicWeeks(services);
  return (
    <article id="music-schedule-bulletin" className="bl-sheet print-sheet" aria-label={musicTitle(month)}>
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
                <th className="bl-tue">TUESDAY</th>
                <th className="bl-fri">FRIDAY</th>
                <th colSpan={2} className="bl-sun">{w.sunday ? `ON SUNDAY: ${ddmmyyyy(w.sunday.date)}` : 'ON SUNDAY'}</th>
              </tr>
              <tr className="bl-dates">
                <th>{w.tuesday ? ddmmyyyy(w.tuesday.date) : ''}</th>
                <th>{w.friday ? ddmmyyyy(w.friday.date) : ''}</th>
                <th className="bl-left">FIRST SERVICE</th>
                <th className="bl-left">SECOND SERVICE</th>
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
          <h4>{`HOLY COMMUNION ON ${ddmmyyyy(s.date)}`}</h4>
          {s.names.length === 0 ? <p>-</p> : s.names.map((n) => <p key={n}>{`Chorale ${n}`}</p>)}
        </section>
      ))}
    </article>
  );
}

function TeamBlock({ block }: { block: ProtocolTeamBlock }) {
  return (
    <section className="bl-team">
      <h4 className={block.kind === 'IGABURO' ? 'bl-igaburo' : undefined}><span aria-hidden>➤ </span>{block.heading}</h4>
      <ol>
        {block.members.map((m) => (
          <li key={`${block.id}-${m.n}`}>{m.name}{m.tag && <> <strong>({m.tag})</strong></>}</li>
        ))}
      </ol>
    </section>
  );
}

/** The protocol teams as weekly columns, matching the church's printed Protocol_Schedule PDF. */
export function ProtocolBulletin({ month, services }: { month: string; services: ProtocolBulletinService[] }) {
  const weeks = protocolWeeks(services);
  return (
    <article id="protocol-schedule-bulletin" className="bl-sheet bl-protocol print-sheet" aria-label={protocolTitle(month)}>
      <header className="bl-head">
        <p className="bl-church">{PROTOCOL_CHURCH_HEADING}</p>
        <img src="/brand/adepr-logo.png" alt="" width={64} height={64} />
        <h3 className="bl-title bl-blue">{protocolTitle(month)}</h3>
      </header>
      <div className="bl-pweeks" style={{ gridTemplateColumns: `repeat(${Math.max(weeks.length, 1)}, minmax(11rem, 1fr))` }}>
        {weeks.map((w) => (
          <div key={w.from} className="bl-pweek">
            <h4 className="bl-pweek-title">{w.heading}</h4>
            {w.services.map((b) => <TeamBlock key={b.id} block={b} />)}
          </div>
        ))}
      </div>
      <p className="bl-pfoot">{PROTOCOL_NB}</p>
    </article>
  );
}
