import type { PlanDetail } from '../api/frontDoorApi';
import { useI18n, useT } from '../i18n/I18nContext';
import { AnnualReview } from './AnnualReview';
import { ProgramCases } from './ProgramCases';
import { ProgramCohorts } from './ProgramCohorts';
import { SeasonPanel } from './SeasonPanel';

/** A program's own overview, shaped by its kind: what it is, how long it runs, who is on it and how it is doing. */
export function ProgramOverview({ p, onChange }: { p: PlanDetail; onChange: () => void }) {
  const t = useT();
  const { locale } = useI18n();
  const k = p.kind;
  if (p.planType !== 'PROGRAM' || !p.programKind || !k) return null;
  const month = (m: number) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 1)));
  const facts: Array<[string, string]> = [[t('door.ac.programKind'), t(`door.ac.kind.${p.programKind}` as 'door.ac.kind.ONGOING')]];
  if (p.purposeTag) facts.push([t('door.ac.purposeTag'), t(`door.ac.purpose.${p.purposeTag}` as 'door.ac.purpose.MINISTRY')]);
  if (p.programKind === 'CASE' && k.caseType) facts.push([t('door.ac.caseType'), t(`door.ac.caseType.${k.caseType}` as 'door.ac.caseType.SICK_CARE')]);
  if (p.programKind === 'ONGOING' && k.schedule) facts.push([t('door.ac.recurring'), k.schedule]);
  if (p.programKind === 'FIXED_TERM') {
    facts.push([t('door.pk.years'), `${k.startYear} – ${k.endYear}`]);
    facts.push([t('door.pk.yearsRemaining'), String(k.yearsRemaining ?? 0)]);
  }
  if (p.programKind === 'COHORT' && k.cohort) {
    if (k.cohort.frequency) facts.push([t('door.ac.cohort.frequency'), k.cohort.frequency]);
    if (k.cohort.duration) facts.push([t('door.ac.cohort.duration'), k.cohort.duration]);
    if (k.cohort.schedule) facts.push([t('door.ac.cohort.schedule'), k.cohort.schedule]);
    if (k.cohort.target) facts.push([t('door.ac.cohort.target'), String(k.cohort.target)]);
  }
  if (p.programKind === 'SEASONAL' && k.annualMonth) facts.push([t('door.pk.nextOccurrence'), `${month(k.annualMonth)} ${new Date().getFullYear()}`]);
  const indicators = p.program?.indicators ?? [];
  return (
    <>
    <div className="panel" aria-label={t('door.pk.overview')}>
      <h3>{t('door.pk.overview')}</h3>
      <dl className="door-facts">
        {facts.map(([label, value]) => <div key={label}><dt className="muted">{label}</dt><dd>{value}</dd></div>)}
        {!p.hasMoney && <div><dt className="muted">{t('door.ac.hasMoney')}</dt><dd>{t('door.ac.no')}</dd></div>}
      </dl>
      {p.levels.length > 0 && (
        <p><strong>{t('door.plan.approvals')}:</strong> {p.levels.map((l) => `${l.label}${l.status === 'APPROVED' ? ' ✓' : ''}`).join(' → ')}</p>
      )}
      {p.team.length > 0 && <p><strong>{t('door.pk.team')}:</strong> {p.team.map((m) => `${m.name} (${m.role})`).join(', ')}</p>}
      {indicators.length > 0 && (
        <>
          <h4>{t('door.pk.indicators')}</h4>
          <ul className="door-list">
            {indicators.map((i) => <li key={i.id}>{i.name}: <strong>{i.current ?? '—'}</strong> / {i.target} {i.unit}</li>)}
          </ul>
        </>
      )}
    </div>
      {p.programKind === 'CASE' && (p.state === 'APPROVED' || p.state === 'DONE') && <ProgramCases p={p} onChange={onChange} />}
      {p.programKind === 'COHORT' && (p.state === 'APPROVED' || p.state === 'DONE') && <ProgramCohorts p={p} onChange={onChange} />}
      {p.programKind === 'SEASONAL' && p.state === 'APPROVED' && <SeasonPanel p={p} onChange={onChange} />}
      {(p.state === 'APPROVED' || p.state === 'DONE') && <AnnualReview p={p} onChange={onChange} />}
    </>
  );
}
