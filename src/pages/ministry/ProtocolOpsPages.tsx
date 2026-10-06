import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PageHead } from '../../components/ui/FilterBar';
import { ForbiddenState } from '../../components/ui/StatusPill';
import { protocolService } from '../../services';

const SYS = 'sys-protocol' as const;

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MonthPicker({
  monthKey,
  onChange,
}: {
  monthKey: string;
  onChange: (m: string) => void;
}) {
  return (
    <select value={monthKey} onChange={(e) => onChange(e.target.value)}>
      {protocolService.allowedMonths().map((m) => (
        <option key={m} value={m}>
          {protocolService.monthLabel(m)}
        </option>
      ))}
    </select>
  );
}

export function ProtocolExportPage() {
  const { can } = useAuth();
  const canView = can('PROTOCOL_SCHEDULE', 'VIEW', SYS);
  const [monthKey, setMonthKey] = useState(protocolService.liveMonthKey());
  const bulletin = protocolService.bulletinText(monthKey);

  if (!canView) {
    return (
      <div className="panel">
        <h2>Exports</h2>
        <ForbiddenState resource="PROTOCOL_SCHEDULE" />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel">
        <PageHead
          title="Exports"
          subtitle="CSV downloads and bulletin-style print view"
          actions={<MonthPicker monthKey={monthKey} onChange={setMonthKey} />}
        />
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadText(
                `protocol-schedule-${monthKey}.csv`,
                protocolService.scheduleCsv(monthKey),
                'text/csv;charset=utf-8',
              )
            }
          >
            Schedule CSV
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              downloadText(
                `protocol-attendance-${monthKey}.csv`,
                protocolService.attendanceCsv(monthKey),
                'text/csv;charset=utf-8',
              )
            }
          >
            Attendance CSV
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              downloadText(
                `protocol-bulletin-${monthKey}.txt`,
                bulletin,
                'text/plain;charset=utf-8',
              )
            }
          >
            Bulletin (.txt)
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>Bulletin preview</h3>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            margin: 0,
            fontSize: '0.95rem',
          }}
        >
          {bulletin}
        </pre>
      </div>
    </div>
  );
}
