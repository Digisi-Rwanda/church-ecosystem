import {
  CHURCH_HEADING, PROTOCOL_CHURCH_HEADING, PROTOCOL_NB, ddmmyyyy, musicTitle, musicWeeks, numberedTeam, protocolColumns, protocolTitle, weekRows, weekTitle,
  type BulletinService, type ProtocolBulletinService,
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

function TeamBlock({ service }: { service: ProtocolBulletinService }) {
  return (
    <section className="bl-team">
      <h4><span aria-hidden>▸ </span>{service.label} ({ddmmyyyy(service.date)})</h4>
      <ol>
        {numberedTeam(service.team).map((member) => (
          <li key={member.n}>{member.name}{member.tag && <> <strong>({member.tag})</strong></>}</li>
        ))}
      </ol>
      {service.choirs.length > 0 && <p><strong>Choir:</strong> {service.choirs.join(', ')}</p>}
    </section>
  );
}

export function ProtocolBulletin({ month, services }: { month: string; services: ProtocolBulletinService[] }) {
  const columns = protocolColumns(services);
  return (
    <article id="protocol-schedule-bulletin" className="bl-sheet bl-protocol print-sheet" aria-label={protocolTitle(month)}>
      <header className="bl-head">
        <p className="bl-church">{PROTOCOL_CHURCH_HEADING}</p>
        <img src="/brand/adepr-logo.png" alt="" width={64} height={64} />
        <h3 className="bl-title bl-blue">{protocolTitle(month)}</h3>
      </header>
      <div className="bl-pservices">
        {columns.map(([code, occurrences]) => (
          <div key={code} className="bl-pservice">
            {occurrences.map((service) => <TeamBlock key={service.id} service={service} />)}
          </div>
        ))}
      </div>
      <footer className="bl-pfoot">
        <p><strong>Note:</strong> (L) = Team Leader · (VL) = Vice Team Leader</p>
        <p>{PROTOCOL_NB}</p>
      </footer>
    </article>
  );
}
