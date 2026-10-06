import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchLetter, fetchLetterOptions, printLetter, type LetterPrint } from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { DeliverForm, LetterForm, WithdrawForm } from './LetterParts';
import { errorCode, govErrorKey } from './governance';
import { LoadState } from './LoadState';
import { dayLabel } from './notices';
import { useLoad } from './useLoad';

/** The page a letter prints on: church heading, reference, recipient, subject, text and a line for the signature. */
export function PrintSheet({ sheet }: { sheet: LetterPrint }) {
  const t = useT();
  return (
    <article className="door-print-sheet" aria-label={t('door.letters.print.sheet')}>
      <header>
        <h2>{sheet.church.name}</h2>
        {sheet.church.address && <p>{sheet.church.address}</p>}
        {sheet.church.phone && <p>{sheet.church.phone}</p>}
      </header>
      <p className="door-print-ref">
        {t('door.letters.print.ref')}: {sheet.reference} · {sheet.date}
      </p>
      <p>
        <strong>{sheet.recipientName}</strong>
        {sheet.recipientNote && (
          <>
            <br />
            {sheet.recipientNote}
          </>
        )}
      </p>
      <h3>{sheet.subject}</h3>
      <p className="door-print-body">{sheet.body}</p>
      <div className="door-print-sign">
        <div className="door-print-line" />
        <p>{sheet.unitName}</p>
      </div>
    </article>
  );
}

export function LetterPage() {
  const t = useT();
  const { systemId = '', letterId = '' } = useParams();
  const { data: l, loading, failed, reload } = useLoad(() => fetchLetter(letterId), `letter|${letterId}`);
  const options = useLoad(fetchLetterOptions, 'letter-options');
  const [panel, setPanel] = useState<'edit' | 'deliver' | 'withdraw' | null>(null);
  const [sheet, setSheet] = useState<LetterPrint | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const done = (message: string) => {
    setPanel(null);
    setNotice(message);
    reload();
  };
  const print = async () => {
    setError('');
    try {
      setSheet(await printLetter(letterId));
      reload();
    } catch (err) {
      setError(t(govErrorKey(errorCode(err)) as 'door.people.actionFailed'));
    }
  };

  return (
    <>
      <Link className="btn ghost sm door-back" to={`/s/${systemId}/governance/letters`}>
        {t('door.letters.back')}
      </Link>
      <LoadState loading={loading} failed={failed && !l} retry={reload}>
        {!l ? (
          <EmptyState variant="no-results" title={t('door.letters.none')} />
        ) : (
          <>
            <div className="panel door-no-print">
              <div className="door-row">
                <h3>{l.subject}</h3>
                <span className={`door-chip${l.status === 'DRAFT' ? ' warn' : ''}`}>{t(`door.letters.status.${l.status}` as const)}</span>
              </div>
              <p className="muted door-notice-meta">
                {l.reference} · {l.typeName} · {l.unitName} · {t('door.letters.by', { name: l.authorName || '—' })}
                {l.createdAt && ` · ${dayLabel(l.createdAt).date}`}
              </p>
              <p>
                <strong>{t('door.letters.to', { name: l.recipientName })}</strong>
                {l.recipientNote && <span className="muted"> — {l.recipientNote}</span>}
              </p>
              <p className="door-announce-body">{l.body}</p>
              {l.printedAt && l.printedByName && <p className="muted door-notice-meta">{t('door.letters.printedBy', { name: l.printedByName, date: dayLabel(l.printedAt).date })}</p>}
              {l.status === 'DELIVERED' && l.deliveryMethod && l.deliveredOn && (
                <p className="door-ok">
                  {t('door.letters.deliveredRecord', { method: t(`door.letters.method.${l.deliveryMethod}` as const), date: l.deliveredOn, name: l.deliveredByName || '—' })}
                  {l.deliveryNote && ` · ${l.deliveryNote}`}
                </p>
              )}
              {l.status === 'WITHDRAWN' && l.withdrawnReason && <p className="door-error">{t('door.letters.withdrawnWhy', { reason: l.withdrawnReason })}</p>}
            </div>
            {notice && (
              <p className="door-ok door-no-print" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="door-error door-no-print" role="alert">
                {error}
              </p>
            )}
            {l.status === 'DRAFT' && !panel && (
              <div className="door-row door-no-print">
                {l.canSend && (
                  <button type="button" className="btn" onClick={() => void print()}>
                    {l.printed ? t('door.letters.printAgain') : t('door.letters.print')}
                  </button>
                )}
                {l.canSend && l.printed && (
                  <button type="button" className="btn secondary" onClick={() => { setPanel('deliver'); setNotice(''); }}>
                    {t('door.letters.deliver')}
                  </button>
                )}
                {l.canEdit && !l.printed && (
                  <button type="button" className="btn secondary" onClick={() => { setPanel('edit'); setNotice(''); }}>
                    {t('door.letters.edit')}
                  </button>
                )}
                {l.canWithdraw && (
                  <button type="button" className="btn ghost" onClick={() => { setPanel('withdraw'); setNotice(''); }}>
                    {t('door.letters.withdraw')}
                  </button>
                )}
              </div>
            )}
            {l.status === 'DRAFT' && !l.printed && l.canSend === false && <p className="muted door-no-print">{t('door.letters.waitsForSender')}</p>}
            {sheet && (
              <div className="door-print-wrap">
                <div className="door-row door-no-print">
                  <button type="button" className="btn" onClick={() => window.print()}>
                    {t('door.letters.print.now')}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setSheet(null)}>
                    {t('door.letters.print.close')}
                  </button>
                </div>
                <p className="muted door-no-print">{t('door.letters.print.hint')}</p>
                <PrintSheet sheet={sheet} />
              </div>
            )}
            {panel === 'edit' && options.data && <LetterForm options={options.data} existing={l} onCancel={() => setPanel(null)} onDone={() => done(t('door.letters.saved'))} />}
            {panel === 'deliver' && options.data && <DeliverForm letter={l} methods={options.data.deliveryMethods} onCancel={() => setPanel(null)} onDone={() => done(t('door.letters.deliveredDone'))} />}
            {panel === 'withdraw' && <WithdrawForm id={l.id} onCancel={() => setPanel(null)} onDone={() => done(t('door.letters.withdrawnDone'))} />}
          </>
        )}
      </LoadState>
    </>
  );
}
