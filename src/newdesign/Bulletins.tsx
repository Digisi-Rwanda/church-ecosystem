import {
  CHURCH_HEADING, PROTOCOL_CHURCH_HEADING, PROTOCOL_NB, ddmmyyyy, musicTitle, musicWeeks, protocolTitle, protocolWeeks, weekRows, weekTitle,
  type BulletinService, type ProtocolBulletinService, type ProtocolTeamBlock,
} from './bulletins';

/** The choir schedule as the church pins it up, with one column for each scheduled service. */
export function MusicBulletin({ month, services, onEdit, editLabel }: {
  month: string;
  services: BulletinService[];
  onEdit?: (id: string) => void;
  editLabel?: string;
}) {
  const { weeks, specials } = musicWeeks(services);
  const editButton = (service: BulletinService) => onEdit && service.editable && (
    <button type="button" className="btn ghost sm no-print" aria-label={`${editLabel} ${service.label}`} onClick={() => onEdit(service.id)}>{editLabel}</button>
  );
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
              <tr><th colSpan={w.services.length} className="bl-band">{weekTitle(w)}</th></tr>
              <tr>
                {w.services.map((service) => (
                  <th key={service.id} scope="col">{service.label}<small className="bl-date">{ddmmyyyy(service.date)}</small>{editButton(service)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => (
                <tr key={i}>
                  {w.services.map((service) => <td key={service.id}>{service.names[i] ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
      {specials.map((s) => (
        <section key={s.id} className="bl-special">
          <h4>{s.label} · {ddmmyyyy(s.date)}</h4>
          {editButton(s)}
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
