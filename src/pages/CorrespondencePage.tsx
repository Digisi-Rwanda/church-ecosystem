import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isChurchLeader } from '../domain/churchLeadership';
import type {
  CorrespondenceLetterType,
  DocumentOrigin,
} from '../domain/types';
import { correspondenceService, orgService, peopleService } from '../services';
import { downloadLetterPdf } from '../services/letterPdf';
import { EmptyState, StatusPill } from '../components/ui/StatusPill';
import { SelectField, TextField } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { canSubmitForSignature } from './correspondenceActions';

function nameOf(id: string | undefined) {
  if (!id) return '—';
  return (
    peopleService.getById(id)?.preferredName ||
    peopleService.getById(id)?.fullName ||
    id
  );
}

function statusTone(
  status: string,
): 'success' | 'warn' | 'danger' | 'neutral' | undefined {
  if (status === 'FINALIZED' || status === 'DELIVERED') return 'success';
  if (status === 'AWAITING_SIGNATURE' || status === 'NEEDS_INFORMATION')
    return 'warn';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger';
  return 'neutral';
}

export function CorrespondencePage() {
  const { account, roles, can } = useAuth();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'awaiting' | 'open' | 'done' | 'incoming' | 'requests'
  >('all');

  const canDesk =
    can('CORRESPONDENCE', 'VIEW') ||
    can('CORRESPONDENCE', 'CREATE') ||
    can('CORRESPONDENCE', 'MANAGE');
  const canPrepare =
    can('CORRESPONDENCE', 'CREATE') || can('CORRESPONDENCE', 'MANAGE');
  const leader = isChurchLeader(roles);

  const docs = useMemo(() => {
    void tick;
    const all = correspondenceService.listDocuments();
    if (filter === 'awaiting')
      return all.filter((d) => d.status === 'AWAITING_SIGNATURE');
    if (filter === 'incoming')
      return all.filter((d) => d.letterType === 'INCOMING');
    if (filter === 'requests')
      return all.filter((d) => d.status === 'SUBMITTED');
    if (filter === 'open')
      return all.filter((d) =>
        [
          'SUBMITTED',
          'IN_PREPARATION',
          'NEEDS_INFORMATION',
          'AWAITING_SIGNATURE',
        ].includes(d.status),
      );
    if (filter === 'done')
      return all.filter(
        (d) => d.status === 'FINALIZED' || d.status === 'DELIVERED',
      );
    return all;
  }, [tick, filter]);

  const people = peopleService.list().filter((p) => p.status === 'ACTIVE');
  const ministries = orgService
    .list()
    .filter((o) => o.type === 'MINISTRY' || o.type === 'TEAM');

  const [letterType, setLetterType] =
    useState<CorrespondenceLetterType>('RECOMMENDATION');
  const [personId, setPersonId] = useState(people[0]?.id ?? '');
  const [origin, setOrigin] = useState<DocumentOrigin>('CHURCH_GENERATED');
  const [destinationChurch, setDestinationChurch] = useState('');
  const [purpose, setPurpose] = useState('');
  const [uploadText, setUploadText] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadDataUrl, setUploadDataUrl] = useState('');
  const [bodyEntryMode, setBodyEntryMode] = useState<'file' | 'paste'>('file');
  const [originDetail, setOriginDetail] = useState('');
  const [orgUnitId, setOrgUnitId] = useState(ministries[0]?.id ?? '');
  const [officeTitle, setOfficeTitle] = useState('Secretary');
  const [senderName, setSenderName] = useState('');
  const [senderOrg, setSenderOrg] = useState('');
  const [incomingTitle, setIncomingTitle] = useState('');
  const [previewEdit, setPreviewEdit] = useState('');
  const [previewTouched, setPreviewTouched] = useState(false);
  const [letterHeadOrg, setLetterHeadOrg] = useState('ADEPR Kacyiru');
  const [letterHeadTagline, setLetterHeadTagline] = useState(
    'Official letter — view & edit',
  );
  const [letterHeadDocLine, setLetterHeadDocLine] = useState('');
  const [letterHeadTouched, setLetterHeadTouched] = useState(false);
  /** Focused writing surface: plain text or Word-like page. */
  const [letterWorkspace, setLetterWorkspace] = useState<
    null | 'text' | 'word'
  >(null);
  const letterEditorRef = useRef<HTMLTextAreaElement | null>(null);

  const showTemplatePreview =
    letterType !== 'INCOMING' &&
    (letterType === 'MINISTRY_APPOINTMENT' ||
      origin === 'CHURCH_GENERATED');

  /** Document preview pane: office template always; other origins only after Paste text. */
  const showPasteBodyPreview =
    letterType !== 'INCOMING' &&
    letterType !== 'MINISTRY_APPOINTMENT' &&
    origin !== 'CHURCH_GENERATED' &&
    bodyEntryMode === 'paste';
  const showDocumentPreview =
    showTemplatePreview ||
    letterType === 'INCOMING' ||
    showPasteBodyPreview;

  const liveTemplate = useMemo(() => {
    if (!showTemplatePreview || !personId) return '';
    const ministry = ministries.find((m) => m.id === orgUnitId);
    return correspondenceService.previewTemplate({
      letterType,
      personId,
      purpose: purpose.trim() || undefined,
      destinationChurch:
        letterType === 'TRANSFER_OUT'
          ? destinationChurch.trim() || undefined
          : undefined,
      orgUnitName: ministry?.name,
      officeTitle:
        letterType === 'MINISTRY_APPOINTMENT'
          ? officeTitle.trim() || undefined
          : undefined,
    });
  }, [
    showTemplatePreview,
    letterType,
    personId,
    purpose,
    destinationChurch,
    orgUnitId,
    officeTitle,
    ministries,
  ]);

  const defaultDocLine = useMemo(() => {
    const typeLabel = correspondenceService.LETTER_TYPE_LABELS[letterType];
    return purpose.trim() ? `${typeLabel} · ${purpose.trim()}` : typeLabel;
  }, [letterType, purpose]);

  const displayHeadOrg = letterHeadTouched ? letterHeadOrg : 'ADEPR Kacyiru';
  const displayHeadTagline = letterHeadTouched
    ? letterHeadTagline
    : 'Official letter — view & edit';
  const displayHeadDocLine = letterHeadTouched
    ? letterHeadDocLine
    : defaultDocLine;

  /** What the user sees / saves: edited draft or live stock template. */
  const letterPreviewBody = previewTouched ? previewEdit : liveTemplate;

  function composeLetterDocument(body = letterPreviewBody) {
    return [
      displayHeadOrg.trim() || 'ADEPR Kacyiru',
      displayHeadTagline.trim(),
      '',
      displayHeadDocLine.trim(),
      '',
      body.trim(),
    ]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n')
      .trim();
  }

  useEffect(() => {
    if (!showTemplatePreview) {
      setPreviewTouched(false);
      setPreviewEdit('');
      setLetterHeadTouched(false);
      setLetterWorkspace(null);
    }
  }, [showTemplatePreview]);

  useEffect(() => {
    if (!letterWorkspace) return;
    const t = window.setTimeout(() => letterEditorRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLetterWorkspace(null);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('letter-workspace-open');
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('letter-workspace-open');
    };
  }, [letterWorkspace]);

  function resetTemplatePreview() {
    setPreviewTouched(false);
    setPreviewEdit('');
    setLetterHeadTouched(false);
    setLetterHeadOrg('ADEPR Kacyiru');
    setLetterHeadTagline('Official letter — view & edit');
    setLetterHeadDocLine(defaultDocLine);
    setMsg('Restored stock template from current person and fields');
  }

  function onLetterBodyChange(value: string) {
    setPreviewTouched(true);
    setPreviewEdit(value);
  }

  function onLetterHeadChange(
    field: 'org' | 'tagline' | 'docLine',
    value: string,
  ) {
    if (!letterHeadTouched) {
      setLetterHeadOrg(displayHeadOrg);
      setLetterHeadTagline(displayHeadTagline);
      setLetterHeadDocLine(displayHeadDocLine);
      setLetterHeadTouched(true);
    }
    if (field === 'org') setLetterHeadOrg(value);
    if (field === 'tagline') setLetterHeadTagline(value);
    if (field === 'docLine') setLetterHeadDocLine(value);
  }

  function downloadPreviewPdf() {
    const body = letterPreviewBody;
    if (!body.trim() && !displayHeadOrg.trim()) {
      setMsg('Nothing to preview as PDF yet');
      return;
    }
    downloadLetterPdf(`${letterType.toLowerCase()}-preview.pdf`, {
      title: displayHeadOrg.trim() || 'ADEPR Kacyiru',
      subtitle: [displayHeadTagline, displayHeadDocLine]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' · '),
      bodyText: body.trim() || '(empty body)',
      footerLines: ['Preview — not yet created or signed'],
    });
    setMsg('Downloaded letter preview PDF');
  }

  if (!account || !canDesk) {
    return (
      <div className="panel">
        <h1>Correspondence</h1>
        <p className="muted">
          Letters desk for Church Leader, secretary, and catechist.
        </p>
        <Link to="/" className="btn secondary">
          Home
        </Link>
      </div>
    );
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!account) return;

    if (letterType === 'INCOMING') {
      const opened = correspondenceService.registerIncoming({
        actorPersonId: account.personId,
        title: incomingTitle.trim() || purpose.trim() || 'Incoming letter',
        senderName: senderName.trim(),
        senderOrg: senderOrg.trim() || undefined,
        purpose: purpose.trim() || undefined,
        personId: personId || undefined,
        bodyText: uploadText.trim() || undefined,
      });
      if (!opened.ok) {
        setMsg(opened.reason);
        return;
      }
      setMsg(`Registered: ${opened.document.title}`);
      setIncomingTitle('');
      setSenderName('');
      setSenderOrg('');
      setUploadText('');
      refresh();
      return;
    }

    const ministry = ministries.find((m) => m.id === orgUnitId);
    const fromPreview =
      showTemplatePreview && letterPreviewBody.trim().length > 0;
    if (origin === 'OTHER' && !originDetail.trim()) {
      setMsg('Enter the origin when Other is selected');
      return;
    }
    if (
      !showTemplatePreview &&
      !fromPreview &&
      !uploadText.trim() &&
      !uploadDataUrl &&
      !uploadName.trim()
    ) {
      setMsg('Upload a letter file or paste the letter text');
      return;
    }
    const resolvedOrigin: DocumentOrigin =
      letterType === 'MINISTRY_APPOINTMENT' ? 'MINISTRY_UPLOADED' : origin;
    const opened = correspondenceService.openLetter({
      letterType,
      personId,
      actorPersonId: account.personId,
      origin: resolvedOrigin,
      originDetail:
        resolvedOrigin === 'OTHER' ? originDetail.trim() : undefined,
      purpose: purpose.trim() || undefined,
      destinationChurch:
        letterType === 'TRANSFER_OUT' ? destinationChurch.trim() : undefined,
      orgUnitId:
        letterType === 'MINISTRY_APPOINTMENT' ? orgUnitId : undefined,
      orgUnitName: ministry?.name,
      officeTitle:
        letterType === 'MINISTRY_APPOINTMENT' ? officeTitle.trim() : undefined,
      useTemplate: showTemplatePreview && !fromPreview,
      upload: fromPreview
        ? {
            fileName: `${letterType.toLowerCase()}-draft.txt`,
            bodyText: composeLetterDocument(letterPreviewBody),
          }
        : !showTemplatePreview &&
            (uploadText.trim() || uploadDataUrl || uploadName.trim())
          ? {
              fileName: uploadName.trim() || 'uploaded-letter.txt',
              bodyText:
                uploadText.trim() ||
                (uploadDataUrl
                  ? `[File on record: ${uploadName.trim() || 'upload'}]`
                  : undefined),
              fileDataUrl: uploadDataUrl || undefined,
            }
          : undefined,
    });
    if (!opened.ok) {
      setMsg(opened.reason);
      return;
    }
    if (
      letterType === 'TRANSFER_OUT' ||
      letterType === 'MINISTRY_APPOINTMENT' ||
      origin === 'MEMBER_UPLOADED' ||
      origin === 'OTHER' ||
      origin === 'MINISTRY_UPLOADED'
    ) {
      correspondenceService.submitForSignature(opened.document.id);
    }
    setMsg(`Opened ${opened.document.title}`);
    setPurpose('');
    setDestinationChurch('');
    setUploadText('');
    setUploadName('');
    setUploadDataUrl('');
    setOriginDetail('');
    setBodyEntryMode('file');
    setPreviewEdit('');
    setPreviewTouched(false);
    setLetterHeadTouched(false);
    setLetterWorkspace(null);
    refresh();
  }

  return (
    <div className="stack">
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Letters & correspondence</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Transfer, membership confirmation, and recommendation — request →
              draft → Leader sign → deliver.
            </p>
          </div>
          <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All'],
                ['requests', 'Member requests'],
                ['incoming', 'Incoming'],
                ['awaiting', 'Awaiting signature'],
                ['open', 'Open'],
                ['done', 'Finalized'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn ghost sm${filter === id ? ' active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {docs.length === 0 ? (
          <EmptyState title="No letters in this filter" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Letter</th>
                <th>Person</th>
                <th>Type</th>
                <th>Status</th>
                <th>Ref</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link to={`/correspondence/${d.id}`}>{d.title}</Link>
                  </td>
                  <td>
                    <Link to={`/people/${d.personId}`}>
                      {nameOf(d.personId)}
                    </Link>
                  </td>
                  <td>
                    {correspondenceService.LETTER_TYPE_LABELS[d.letterType]}
                  </td>
                  <td>
                    <StatusPill status={d.status} tone={statusTone(d.status)}>
                      {d.status}
                    </StatusPill>
                  </td>
                  <td>{d.referenceNumber ?? '—'}</td>
                  <td>
                    <Link
                      className={
                        leader && d.status === 'AWAITING_SIGNATURE'
                          ? 'btn sm'
                          : 'btn ghost sm'
                      }
                      to={`/correspondence/${d.id}`}
                    >
                      {leader && d.status === 'AWAITING_SIGNATURE'
                        ? 'View'
                        : 'Open'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canPrepare ? (
        <form className="panel letter-intake" onSubmit={onCreate}>
          <div className="letter-intake-header">
            <div>
              <h2 style={{ margin: 0 }}>New letter / intake</h2>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                {showDocumentPreview
                  ? 'Fill details on the left — the document preview updates live on the right.'
                  : 'Upload a file, or choose Paste text instead to open the document preview.'}
              </p>
            </div>
          </div>

          <div
            className={`letter-intake-split${
              !showDocumentPreview ? ' letter-intake-split--form-only' : ''
            }${
              showDocumentPreview &&
              (letterWorkspace === 'word' || letterWorkspace === 'text')
                ? ' letter-intake-split--focus'
                : ''
            }`}
          >
            <div className="letter-intake-form">
              <h3 className="letter-intake-pane-title">Letter details</h3>

              <SelectField
                label="Letter type"
                value={letterType}
                onChange={(e) => {
                  setLetterType(e.target.value as CorrespondenceLetterType);
                  setPreviewTouched(false);
                  setPreviewEdit('');
                  setLetterHeadTouched(false);
                  setLetterWorkspace(null);
                }}
              >
                <option value="TRANSFER_OUT">Transfer out</option>
                <option value="MEMBERSHIP_CONFIRMATION">
                  Membership confirmation
                </option>
                <option value="RECOMMENDATION">Recommendation</option>
                <option value="MINISTRY_APPOINTMENT">
                  Ministry appointment
                </option>
                <option value="INCOMING">Incoming correspondence</option>
              </SelectField>

              {letterType === 'INCOMING' ? (
                <TextField
                  label="Title"
                  value={incomingTitle}
                  onChange={(e) => setIncomingTitle(e.target.value)}
                  required
                  placeholder="District annual report request"
                />
              ) : (
                <SelectField
                  label="Person"
                  value={personId}
                  onChange={(e) => {
                    setPersonId(e.target.value);
                    setPreviewTouched(false);
                    setPreviewEdit('');
                    setLetterHeadTouched(false);
                    setLetterWorkspace(null);
                  }}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.preferredName || p.fullName}
                    </option>
                  ))}
                </SelectField>
              )}

              {letterType === 'INCOMING' ? (
                <>
                  <TextField
                    label="Sender name"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    required
                  />
                  <TextField
                    label="Sender org"
                    value={senderOrg}
                    onChange={(e) => setSenderOrg(e.target.value)}
                    placeholder="ADEPR Kigali District"
                  />
                </>
              ) : null}

              {letterType !== 'INCOMING' &&
              letterType !== 'MINISTRY_APPOINTMENT' ? (
                <>
                  <SelectField
                    label="Origin"
                    value={origin}
                    onChange={(e) => {
                      const next = e.target.value as DocumentOrigin;
                      setOrigin(next);
                      setPreviewTouched(false);
                      setLetterWorkspace(null);
                      if (next !== 'OTHER') setOriginDetail('');
                      // Non-template origins start on file upload — no preview until Paste.
                      if (next !== 'CHURCH_GENERATED') {
                        setBodyEntryMode('file');
                      }
                    }}
                  >
                    <option value="CHURCH_GENERATED">Office template</option>
                    <option value="MEMBER_UPLOADED">Member brought file</option>
                    <option value="MINISTRY_UPLOADED">Ministry upload</option>
                    <option value="OTHER">Other</option>
                  </SelectField>
                  {origin === 'OTHER' ? (
                    <TextField
                      label="Specify origin"
                      value={originDetail}
                      onChange={(e) => setOriginDetail(e.target.value)}
                      required
                      placeholder="e.g. District courier, lawyer, school office…"
                    />
                  ) : null}
                </>
              ) : null}

              {letterType === 'MINISTRY_APPOINTMENT' ? (
                <>
                  <SelectField
                    label="Ministry / team"
                    value={orgUnitId}
                    onChange={(e) => setOrgUnitId(e.target.value)}
                  >
                    {ministries.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Office title"
                    value={officeTitle}
                    onChange={(e) => setOfficeTitle(e.target.value)}
                    placeholder="Secretary"
                  />
                </>
              ) : null}

              {letterType === 'TRANSFER_OUT' ? (
                <>
                  <TextField
                    label="Destination church"
                    value={destinationChurch}
                    onChange={(e) => setDestinationChurch(e.target.value)}
                    required
                  />
                  <TextField
                    label="Note / reason"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </>
              ) : letterType !== 'INCOMING' ? (
                <TextField
                  label="Purpose / notes"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              ) : null}

              {letterType === 'INCOMING' ||
              (origin !== 'CHURCH_GENERATED' &&
                letterType !== 'MINISTRY_APPOINTMENT') ? (
                <div className="stack" style={{ gap: '0.65rem' }}>
                  {letterType === 'INCOMING' ? (
                    <label className="field">
                      <span>Letter body / summary</span>
                      <textarea
                        rows={6}
                        value={uploadText}
                        onChange={(e) => setUploadText(e.target.value)}
                        placeholder="Paste or summarize the received letter…"
                      />
                    </label>
                  ) : (
                    <>
                      <div
                        className="row"
                        style={{ gap: '0.5rem', flexWrap: 'wrap' }}
                      >
                        <button
                          type="button"
                          className={`btn sm${bodyEntryMode === 'file' ? '' : ' ghost'}`}
                          onClick={() => {
                            setBodyEntryMode('file');
                            setLetterWorkspace(null);
                          }}
                        >
                          Upload file
                        </button>
                        <button
                          type="button"
                          className={`btn sm${bodyEntryMode === 'paste' ? '' : ' ghost'}`}
                          onClick={() => setBodyEntryMode('paste')}
                        >
                          Paste text instead
                        </button>
                      </div>
                      {bodyEntryMode === 'file' ? (
                        <label className="field">
                          <span>Upload letter</span>
                          <input
                            type="file"
                            accept=".txt,.pdf,.doc,.docx,.rtf,text/*,application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadName(file.name);
                              const isText =
                                file.type.startsWith('text/') ||
                                /\.(txt|rtf|md|csv)$/i.test(file.name);
                              if (isText) {
                                void file.text().then((t) => {
                                  setUploadText(t);
                                  setUploadDataUrl('');
                                });
                              } else {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  setUploadDataUrl(String(reader.result ?? ''));
                                  setUploadText('');
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                          {uploadName ? (
                            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                              Selected: {uploadName}
                            </p>
                          ) : null}
                        </label>
                      ) : (
                        <label className="field">
                          <span>Paste letter text</span>
                          <textarea
                            rows={6}
                            value={uploadText}
                            onChange={(e) => {
                              setUploadText(e.target.value);
                              setUploadDataUrl('');
                              if (!uploadName.trim()) {
                                setUploadName('pasted-letter.txt');
                              }
                            }}
                            placeholder="Paste the letter body brought by the member…"
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {showTemplatePreview ? (
                <label className="field">
                  <span>Letter text</span>
                  <textarea
                    ref={letterEditorRef}
                    className="letter-intake-body-editor"
                    rows={12}
                    value={previewTouched ? previewEdit : liveTemplate}
                    onChange={(e) => onLetterBodyChange(e.target.value)}
                    placeholder="Write or edit the letter body…"
                  />
                  <div
                    className="row"
                    style={{
                      gap: '0.35rem',
                      flexWrap: 'wrap',
                      marginTop: '0.5rem',
                    }}
                  >
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={resetTemplatePreview}
                    >
                      Reset template
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={downloadPreviewPdf}
                    >
                      Download PDF
                    </button>
                  </div>
                </label>
              ) : null}
            </div>

            {showDocumentPreview ? (
              <div className="letter-intake-preview">
                <div className="letter-intake-preview-toolbar">
                  <div>
                    <h3 className="letter-intake-pane-title">Document preview</h3>
                    <p
                      className="muted"
                      style={{ margin: 0, fontSize: '0.85rem' }}
                    >
                      {showTemplatePreview
                        ? 'Live Word-like page — click fields to edit'
                        : 'Preview of pasted letter text — edit on the left or here'}
                    </p>
                  </div>
                  <div
                    className="row"
                    style={{ gap: '0.35rem', flexWrap: 'wrap' }}
                  >
                    {showTemplatePreview ? (
                      <button
                        type="button"
                        className={`btn ghost sm${letterWorkspace === 'word' ? ' active' : ''}`}
                        onClick={() =>
                          setLetterWorkspace((w) =>
                            w === 'word' ? null : 'word',
                          )
                        }
                      >
                        {letterWorkspace === 'word'
                          ? 'Exit focus'
                          : 'Focus preview'}
                      </button>
                    ) : null}
                    <span className="letter-zoom-pill">100%</span>
                  </div>
                </div>

                <div className="letter-intake-preview-stage">
                  <article className="letter-sheet letter-sheet--editable letter-sheet--live">
                    <header className="letter-sheet-masthead">
                      <img
                        src="/brand/adepr-logo.png"
                        alt=""
                        width={44}
                        height={44}
                      />
                      <div className="letter-sheet-head-fields">
                        <input
                          className="letter-sheet-input letter-sheet-input--org"
                          value={
                            showTemplatePreview
                              ? displayHeadOrg
                              : 'ADEPR Kacyiru'
                          }
                          onChange={(e) =>
                            showTemplatePreview &&
                            onLetterHeadChange('org', e.target.value)
                          }
                          readOnly={!showTemplatePreview}
                          aria-label="Organisation name"
                        />
                        <input
                          className="letter-sheet-input letter-sheet-input--tagline"
                          value={
                            showTemplatePreview
                              ? displayHeadTagline
                              : letterType === 'INCOMING'
                                ? 'Incoming correspondence'
                                : 'Pasted letter'
                          }
                          onChange={(e) =>
                            showTemplatePreview &&
                            onLetterHeadChange('tagline', e.target.value)
                          }
                          readOnly={!showTemplatePreview}
                          aria-label="Letter subtitle"
                        />
                      </div>
                    </header>
                    <input
                      className="letter-sheet-input letter-sheet-input--doc"
                      value={
                        showTemplatePreview
                          ? displayHeadDocLine
                          : letterType === 'INCOMING'
                            ? incomingTitle || 'Incoming letter'
                            : correspondenceService.LETTER_TYPE_LABELS[
                                letterType
                              ] ?? ''
                      }
                      onChange={(e) =>
                        showTemplatePreview &&
                        onLetterHeadChange('docLine', e.target.value)
                      }
                      readOnly={!showTemplatePreview}
                      aria-label="Letter type and purpose"
                    />
                    {showTemplatePreview ? (
                      <textarea
                        className="letter-sheet-textarea"
                        value={previewTouched ? previewEdit : liveTemplate}
                        onChange={(e) => onLetterBodyChange(e.target.value)}
                        placeholder="Letter body appears here as you write…"
                        aria-label="Letter body preview"
                      />
                    ) : (
                      <textarea
                        className="letter-sheet-textarea"
                        value={uploadText}
                        onChange={(e) => {
                          setUploadText(e.target.value);
                          setUploadDataUrl('');
                          if (!uploadName.trim()) {
                            setUploadName('pasted-letter.txt');
                          }
                        }}
                        placeholder="Pasted letter text appears here…"
                        aria-label="Pasted letter preview"
                      />
                    )}
                    <footer className="letter-sheet-footer">
                      {showTemplatePreview
                        ? previewTouched || letterHeadTouched
                          ? 'Edited draft — not signed yet'
                          : 'Stock template — updates with person and fields'
                        : 'Paste mode — document preview'}
                    </footer>
                  </article>
                </div>
              </div>
            ) : null}
          </div>

          <div className="letter-intake-footer">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setPreviewTouched(false);
                setPreviewEdit('');
                setLetterHeadTouched(false);
                setUploadText('');
                setUploadName('');
                setUploadDataUrl('');
                setPurpose('');
                setMsg('');
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn">
              {letterType === 'INCOMING' ? 'Register incoming' : 'Create letter'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function CorrespondenceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { account, roles, can } = useAuth();
  const { push: toast } = useToast();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [msg, setMsg] = useState('');
  const [wetInkName, setWetInkName] = useState('signed-scan.txt');
  const [wetInkBody, setWetInkBody] = useState('');
  const [infoNote, setInfoNote] = useState('');
  const [showInfoForm, setShowInfoForm] = useState(false);
  const [responseNote, setResponseNote] = useState('');
  const [responseBody, setResponseBody] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [draftBody, setDraftBody] = useState('');
  const [editingDraft, setEditingDraft] = useState(false);

  const canDesk =
    can('CORRESPONDENCE', 'VIEW') ||
    can('CORRESPONDENCE', 'CREATE') ||
    can('CORRESPONDENCE', 'MANAGE');
  const canPrepare =
    can('CORRESPONDENCE', 'CREATE') || can('CORRESPONDENCE', 'MANAGE');
  const leader = isChurchLeader(roles);

  const doc = useMemo(() => {
    void tick;
    return id ? correspondenceService.getDocument(id) : null;
  }, [id, tick]);

  const versions = useMemo(() => {
    void tick;
    return id ? correspondenceService.versionsFor(id) : [];
  }, [id, tick]);

  const signatures = useMemo(() => {
    void tick;
    return id ? correspondenceService.signaturesFor(id) : [];
  }, [id, tick]);

  const current = doc?.currentVersionId
    ? versions.find((v) => v.id === doc.currentVersionId)
    : null;
  const hasDraftBody = Boolean(current?.bodyText?.trim());
  const linkedRequest = useMemo(() => {
    void tick;
    return doc?.requestId
      ? correspondenceService.getRequest(doc.requestId)
      : null;
  }, [doc?.requestId, tick]);
  const memberRequested =
    doc?.origin === 'MEMBER_REQUESTED' ||
    linkedRequest?.origin === 'MEMBER_REQUESTED';

  const isSubject = Boolean(
    account && doc && account.personId === doc.personId,
  );
  const canViewThis = canDesk || isSubject;
  /** Only the letter subject answers an information request as “member”. */
  const showMemberInfoReply =
    Boolean(account) &&
    doc?.status === 'NEEDS_INFORMATION' &&
    isSubject;
  /** Desk / Leader who asked for info — waiting, not answering themselves. */
  const showOfficeInfoWaiting =
    Boolean(account) &&
    doc?.status === 'NEEDS_INFORMATION' &&
    !isSubject &&
    (canPrepare || canDesk || leader);
  const infoRequestedByMe = Boolean(
    account &&
      doc?.infoRequestedByPersonId &&
      account.personId === doc.infoRequestedByPersonId,
  );

  function openDraftEditor(seed?: string) {
    const text =
      seed ??
      current?.bodyText ??
      correspondenceService.previewTemplate({
        letterType: doc!.letterType,
        personId: doc!.personId,
        purpose: doc!.purpose,
        destinationChurch: doc!.destinationChurch,
      });
    setDraftBody(text);
    setEditingDraft(true);
  }

  function runPrepareFromTemplate() {
    if (!doc || !account) return;
    const r = correspondenceService.prepareFromTemplate(
      doc.id,
      account.personId,
    );
    if (r.ok) {
      toast({ title: 'Letter draft prepared', tone: 'success' });
      const next = correspondenceService.currentVersion(doc.id);
      setDraftBody(next?.bodyText ?? '');
      setEditingDraft(true);
      refresh();
    } else {
      toast({ title: r.reason ?? 'Could not prepare letter', tone: 'danger' });
    }
  }

  function runSubmitForSignature() {
    if (!doc) return;
    if (!hasDraftBody) {
      toast({
        title: 'Prepare or edit the letter first',
        detail: 'Submit for signature needs a draft body on file.',
        tone: 'danger',
      });
      return;
    }
    const r = correspondenceService.submitForSignature(doc.id);
    if (r.ok) {
      toast({ title: 'Submitted for signature', tone: 'success' });
      refresh();
    } else {
      toast({ title: r.reason ?? 'Could not submit', tone: 'danger' });
    }
  }

  function exportPdf() {
    if (!doc) return;
    const payload = correspondenceService.letterPdfPayload(doc.id);
    if (!payload.ok) {
      setMsg(payload.reason);
      return;
    }
    downloadLetterPdf(payload.filename, {
      title: payload.title,
      subtitle: payload.subtitle,
      referenceNumber: payload.referenceNumber,
      bodyText: payload.bodyText,
      footerLines: payload.footerLines,
    });
    setMsg(`Downloaded ${payload.filename}`);
  }

  if (!account || !canViewThis) {
    return (
      <div className="panel">
        <p className="muted">You cannot open this letter.</p>
        <Link to="/">Home</Link>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="panel">
        <EmptyState title="Letter not found" />
        <Link to={canDesk ? '/correspondence' : '/people'} className="btn secondary">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      {msg ? <p className="muted">{msg}</p> : null}
      <div className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <p className="muted" style={{ margin: 0 }}>
              {canDesk ? (
                <Link to="/correspondence">Correspondence</Link>
              ) : (
                <Link to={`/people/${doc.personId}`}>My profile</Link>
              )}
            </p>
            <h2 style={{ margin: '0.25rem 0 0' }}>{doc.title}</h2>
          </div>
          <StatusPill status={doc.status} tone={statusTone(doc.status)}>
            {doc.status}
          </StatusPill>
        </div>
        <p style={{ margin: 0 }}>
          Person:{' '}
          <Link to={`/people/${doc.personId}`}>{nameOf(doc.personId)}</Link>
          {' · '}
          {correspondenceService.LETTER_TYPE_LABELS[doc.letterType]}
          {doc.destinationChurch ? ` · → ${doc.destinationChurch}` : ''}
        </p>
        <p className="muted" style={{ margin: 0 }}>
          {memberRequested
            ? 'Requested by member'
            : `Origin ${doc.origin}`}
          {doc.originDetail ? ` · ${doc.originDetail}` : ''}
          {doc.senderName
            ? ` · From ${doc.senderName}${doc.senderOrg ? ` (${doc.senderOrg})` : ''}`
            : ''}
          {doc.referenceNumber ? ` · Ref ${doc.referenceNumber}` : ''}
          {doc.purpose ? ` · Purpose: ${doc.purpose}` : ''}
        </p>

        {doc.status === 'NEEDS_INFORMATION' && showMemberInfoReply ? (
          <div className="panel stack letter-info-needed">
            <h3 style={{ margin: 0 }}>
              The church office needs this from you
            </h3>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {doc.infoRequestNote?.trim() ||
                'The office asked for more information. Please contact the church secretary if you are unsure what to send.'}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Requested
              {doc.infoRequestedOn ? ` ${doc.infoRequestedOn}` : ''}
              {doc.infoRequestedByPersonId
                ? ` by ${nameOf(doc.infoRequestedByPersonId)}`
                : ''}
              {doc.purpose ? ` · Your purpose: ${doc.purpose}` : ''}
            </p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const r = correspondenceService.respondToInfoRequest({
                  documentId: doc.id,
                  actorPersonId: account.personId,
                  responseNote,
                  bodyText: responseBody.trim() || undefined,
                });
                if (r.ok) {
                  toast({
                    title: 'Reply sent — office will continue your letter',
                    tone: 'success',
                  });
                  setResponseNote('');
                  setResponseBody('');
                } else {
                  toast({
                    title: r.reason ?? 'Could not send reply',
                    tone: 'danger',
                  });
                }
                refresh();
              }}
            >
              <TextField
                label="Your reply"
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                required
                placeholder="Answer what the office asked for above"
                hint="Write the missing details here so the office can finish the letter."
              />
              <button type="submit" className="btn">
                Send my information
              </button>
            </form>
          </div>
        ) : null}

        {doc.status === 'NEEDS_INFORMATION' && showOfficeInfoWaiting ? (
          <div className="panel stack letter-info-needed">
            <h3 style={{ margin: 0 }}>
              {infoRequestedByMe
                ? 'Waiting for the member to reply'
                : 'Waiting for member information'}
            </h3>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              You asked {nameOf(doc.personId)} for:{' '}
              <strong>{doc.infoRequestNote?.trim() || '(no details recorded)'}</strong>
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Requested
              {doc.infoRequestedOn ? ` ${doc.infoRequestedOn}` : ''}
              {doc.infoRequestedByPersonId
                ? ` by ${nameOf(doc.infoRequestedByPersonId)}`
                : ''}
              {infoRequestedByMe ? ' (you)' : ''}
              {doc.purpose
                ? ` · Member’s purpose: ${doc.purpose}`
                : ''}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {nameOf(doc.personId)} will see this ask on their profile / letter.
              When they reply, status returns to preparation. If you already have
              the answer, edit the letter below and continue — or record it on
              their behalf.
            </p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const r = correspondenceService.respondToInfoRequest({
                  documentId: doc.id,
                  actorPersonId: account.personId,
                  responseNote:
                    responseNote.trim() ||
                    'Recorded by office on behalf of member',
                  bodyText: responseBody.trim() || undefined,
                });
                if (r.ok) {
                  toast({
                    title: 'Recorded — letter back in preparation',
                    tone: 'success',
                  });
                  setResponseNote('');
                  setResponseBody('');
                } else {
                  toast({
                    title: r.reason ?? 'Could not record',
                    tone: 'danger',
                  });
                }
                refresh();
              }}
            >
              <TextField
                label="Record answer on behalf of member (optional)"
                value={responseNote}
                onChange={(e) => setResponseNote(e.target.value)}
                placeholder={`e.g. Full name confirmed: ${nameOf(doc.personId)}`}
                hint="Use only if the member already told the office, or you verified it in their record."
              />
              <label className="field">
                <span>Updated letter draft (optional)</span>
                <textarea
                  rows={4}
                  value={responseBody}
                  onChange={(e) => setResponseBody(e.target.value)}
                  placeholder="Paste corrected letter text if you fixed it now…"
                />
              </label>
              <button type="submit" className="btn secondary">
                Record & continue preparation
              </button>
            </form>
          </div>
        ) : null}

        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          {canPrepare &&
          doc.letterType !== 'INCOMING' &&
          ['SUBMITTED', 'IN_PREPARATION', 'NEEDS_INFORMATION'].includes(
            doc.status,
          ) ? (
            <button
              type="button"
              className={hasDraftBody ? 'btn secondary' : 'btn'}
              onClick={runPrepareFromTemplate}
            >
              {hasDraftBody
                ? 'Re-prepare from template'
                : 'Prepare letter from template'}
            </button>
          ) : null}
          {canPrepare &&
          doc.letterType !== 'INCOMING' &&
          ['IN_PREPARATION', 'NEEDS_INFORMATION', 'AWAITING_SIGNATURE'].includes(
            doc.status,
          ) ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                if (editingDraft) {
                  setEditingDraft(false);
                  return;
                }
                openDraftEditor();
              }}
            >
              {editingDraft ? 'Close editor' : 'View / edit letter'}
            </button>
          ) : null}
          {canSubmitForSignature(canPrepare, leader) &&
          doc.letterType !== 'INCOMING' &&
          doc.status === 'IN_PREPARATION' ? (
            <button
              type="button"
              className="btn"
              onClick={runSubmitForSignature}
              disabled={!hasDraftBody}
              title={
                hasDraftBody
                  ? 'Send to Church Leader for signature'
                  : 'Prepare or edit the letter draft first'
              }
            >
              Submit for signature
            </button>
          ) : null}
          {(canPrepare || leader) &&
          ['IN_PREPARATION', 'AWAITING_SIGNATURE', 'SUBMITTED'].includes(
            doc.status,
          ) &&
          doc.letterType !== 'INCOMING' ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setShowInfoForm((v) => !v);
                setShowReject(false);
              }}
            >
              Request corrections
            </button>
          ) : null}
          {canPrepare && doc.letterType === 'INCOMING' && doc.status !== 'FINALIZED' && doc.status !== 'DELIVERED' && doc.status !== 'CANCELLED' ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const r = correspondenceService.archiveIncoming(
                  doc.id,
                  account.personId,
                );
                setMsg(
                  r.ok
                    ? `Archived · ${r.referenceNumber}`
                    : r.reason ?? 'Failed',
                );
                refresh();
              }}
            >
              Archive incoming
            </button>
          ) : null}
          {current?.bodyText ? (
            <button type="button" className="btn ghost" onClick={exportPdf}>
              Download PDF
            </button>
          ) : null}
          {canPrepare && doc.status === 'FINALIZED' ? (
            <>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  const r = correspondenceService.deliver({
                    documentId: doc.id,
                    actorPersonId: account.personId,
                    method: 'COLLECTED_AT_OFFICE',
                  });
                  setMsg(r.ok ? 'Marked collected at office' : r.reason ?? '');
                  refresh();
                }}
              >
                Deliver · collected
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const r = correspondenceService.deliver({
                    documentId: doc.id,
                    actorPersonId: account.personId,
                    method: 'DOWNLOAD',
                  });
                  if (r.ok) exportPdf();
                  setMsg(r.ok ? 'Delivered · PDF downloaded' : r.reason ?? '');
                  refresh();
                }}
              >
                Deliver · download PDF
              </button>
            </>
          ) : null}
          {(canPrepare || leader) &&
          !['DELIVERED', 'CANCELLED', 'REJECTED', 'FINALIZED'].includes(
            doc.status,
          ) ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setShowReject((v) => !v);
                setShowInfoForm(false);
              }}
            >
              Reject
            </button>
          ) : null}
          {canPrepare &&
          !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(doc.status) ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                correspondenceService.cancel(doc.id);
                setMsg('Cancelled');
                refresh();
                navigate('/correspondence');
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>

        {canPrepare &&
        doc.letterType !== 'INCOMING' &&
        doc.status === 'IN_PREPARATION' &&
        !hasDraftBody ? (
          <p className="muted" style={{ margin: '0.5rem 0 0' }}>
            No letter draft on file yet. Use{' '}
            <strong>Prepare letter from template</strong> or{' '}
            <strong>View / edit letter</strong>, then submit for signature.
          </p>
        ) : null}

        {showInfoForm ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const r = correspondenceService.markNeedsInformation(
                doc.id,
                infoNote,
                account.personId,
              );
              setMsg(
                r.ok
                  ? 'Marked needs information — office / member notified'
                  : r.reason ?? 'Failed',
              );
              if (r.ok) {
                setInfoNote('');
                setShowInfoForm(false);
              }
              refresh();
            }}
          >
            <label className="field">
              <span>What is missing or must be corrected?</span>
              <textarea
                rows={3}
                value={infoNote}
                onChange={(e) => setInfoNote(e.target.value)}
                placeholder="e.g. Confirm destination parish name and attach ID copy"
                required
              />
            </label>
            <button type="submit" className="btn">
              Send information request
            </button>
          </form>
        ) : null}

        {showReject ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const r = correspondenceService.rejectLetter(
                doc.id,
                account.personId,
                rejectReason,
              );
              setMsg(r.ok ? 'Letter rejected' : r.reason ?? 'Failed');
              if (r.ok) {
                setShowReject(false);
                setRejectReason('');
              }
              refresh();
            }}
          >
            <label className="field">
              <span>Rejection reason</span>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn">
              Confirm reject
            </button>
          </form>
        ) : null}
      </div>

      {canPrepare &&
      doc.status === 'SUBMITTED' &&
      doc.letterType !== 'INCOMING' ? (
        <div className="panel stack">
          <div
            className="row"
            style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Template preview</h3>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                What Prepare from template will create. Review or download PDF
                before preparing.
              </p>
            </div>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                const text = correspondenceService.previewTemplate({
                  letterType: doc.letterType,
                  personId: doc.personId,
                  purpose: doc.purpose,
                  destinationChurch: doc.destinationChurch,
                });
                downloadLetterPdf(`${doc.id}-template-preview.pdf`, {
                  title: doc.title,
                  subtitle:
                    correspondenceService.LETTER_TYPE_LABELS[doc.letterType],
                  bodyText: text,
                  footerLines: ['Preview — not yet prepared'],
                });
                setMsg('Downloaded template preview PDF');
              }}
            >
              Preview PDF
            </button>
          </div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              margin: 0,
              fontFamily: 'inherit',
              fontSize: '0.95rem',
            }}
          >
            {correspondenceService.previewTemplate({
              letterType: doc.letterType,
              personId: doc.personId,
              purpose: doc.purpose,
              destinationChurch: doc.destinationChurch,
            })}
          </pre>
        </div>
      ) : null}

      {doc.infoResponseNote && doc.status !== 'NEEDS_INFORMATION' ? (
        <div className="panel">
          <p className="muted" style={{ margin: 0 }}>
            Last reply to information request: {doc.infoResponseNote}
          </p>
        </div>
      ) : null}

      <div className="panel stack" id="letter-draft">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>Letter draft</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              {hasDraftBody
                ? 'Review the text below. Edit anytime before the Leader signs.'
                : 'No draft yet — prepare from template or write one.'}
            </p>
          </div>
          <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
            {current?.bodyText ? (
              <button type="button" className="btn ghost sm" onClick={exportPdf}>
                PDF
              </button>
            ) : null}
            {canPrepare &&
            ['IN_PREPARATION', 'NEEDS_INFORMATION', 'AWAITING_SIGNATURE', 'SUBMITTED'].includes(
              doc.status,
            ) &&
            doc.letterType !== 'INCOMING' ? (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  if (editingDraft) {
                    setEditingDraft(false);
                    return;
                  }
                  openDraftEditor();
                }}
              >
                {editingDraft ? 'Close editor' : 'View / edit letter'}
              </button>
            ) : null}
          </div>
        </div>
        {editingDraft ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draftBody.trim()) {
                toast({
                  title: 'Letter body cannot be empty',
                  tone: 'danger',
                });
                return;
              }
              const r = correspondenceService.addVersion({
                documentId: doc.id,
                actorPersonId: account.personId,
                fileName: `draft-edit-${doc.id}.txt`,
                bodyText: draftBody,
                note: 'Office edited draft',
              });
              if (r.ok) {
                toast({ title: 'Letter draft saved', tone: 'success' });
                setEditingDraft(false);
              } else {
                toast({ title: r.reason ?? 'Could not save', tone: 'danger' });
              }
              refresh();
            }}
          >
            <textarea
              rows={14}
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              style={{ width: '100%', fontFamily: 'inherit' }}
              placeholder="Letter body…"
            />
            <div className="row" style={{ gap: '0.5rem' }}>
              <button type="submit" className="btn">
                Save letter
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setEditingDraft(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : current ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              v{current.versionNumber} · {current.fileName}
              {current.isFinal ? ' · final' : ''}
            </p>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                margin: 0,
                fontFamily: 'inherit',
                fontSize: '0.95rem',
              }}
            >
              {current.bodyText || '(binary / scan on file)'}
            </pre>
          </>
        ) : (
          <EmptyState
            title="No letter draft yet"
            detail="Prepare from template or open the editor to write the letter."
          />
        )}

        {leader &&
        doc.status === 'AWAITING_SIGNATURE' &&
        doc.letterType !== 'INCOMING' ? (
          <div
            className="stack"
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--line)',
            }}
          >
            <p className="muted" style={{ margin: 0 }}>
              Review the letter text above. Sign only after you are satisfied
              with the wording.
            </p>
            <button
              type="button"
              className="btn"
              disabled={!hasDraftBody}
              title={
                hasDraftBody
                  ? 'Finalize with Church Leader signature'
                  : 'No letter body to sign'
              }
              onClick={() => {
                if (!hasDraftBody) {
                  toast({
                    title: 'Open or prepare the letter before signing',
                    tone: 'danger',
                  });
                  return;
                }
                const r = correspondenceService.sign(
                  doc.id,
                  account.personId,
                );
                if (r.ok) {
                  toast({
                    title: `Signed · ${r.referenceNumber}`,
                    tone: 'success',
                  });
                  refresh();
                } else {
                  toast({
                    title: r.reason ?? 'Could not sign',
                    tone: 'danger',
                  });
                }
              }}
            >
              Sign as Church Leader
            </button>
          </div>
        ) : null}
      </div>

      {canPrepare &&
      (doc.status === 'FINALIZED' || doc.status === 'DELIVERED') ? (
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            const r = correspondenceService.uploadWetInk({
              documentId: doc.id,
              actorPersonId: account.personId,
              fileName: wetInkName.trim() || 'signed-scan.txt',
              bodyText: wetInkBody.trim() || 'Wet-ink signed scan on file',
            });
            setMsg(r.ok ? 'Wet-ink copy archived' : r.reason ?? '');
            setWetInkBody('');
            refresh();
          }}
        >
          <h3 style={{ margin: 0 }}>Upload wet-ink scan</h3>
          <TextField
            label="File name"
            value={wetInkName}
            onChange={(e) => setWetInkName(e.target.value)}
          />
          <label className="field">
            <span>Note / OCR text (demo)</span>
            <textarea
              rows={3}
              value={wetInkBody}
              onChange={(e) => setWetInkBody(e.target.value)}
            />
          </label>
          <button type="submit" className="btn secondary">
            Archive wet-ink
          </button>
        </form>
      ) : null}

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Versions</h3>
        <ul className="rail-list" style={{ margin: 0 }}>
          {versions.map((v) => (
            <li key={v.id}>
              v{v.versionNumber} · {v.fileName} · {v.uploadedOn}
              {v.isFinal ? ' · final' : ''} · {nameOf(v.uploadedByPersonId)}
            </li>
          ))}
        </ul>
        {signatures.length > 0 ? (
          <>
            <h3 style={{ margin: '0.75rem 0 0' }}>Signatures</h3>
            <ul className="rail-list" style={{ margin: 0 }}>
              {signatures.map((s) => (
                <li key={s.id}>
                  {s.kind} · {nameOf(s.signedByPersonId)} · {s.signedOn} ·{' '}
                  {s.authorityRole}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
