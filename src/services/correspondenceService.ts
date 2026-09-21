import {
  CHURCH_DOCUMENTS,
  DOCUMENT_REQUESTS,
  DOCUMENT_SIGNATURES,
  DOCUMENT_VERSIONS,
  pushChurchDocument,
  pushDocumentRequest,
  pushDocumentSignature,
  pushDocumentVersion,
  updateChurchDocument,
  updateDocumentRequest,
  updateDocumentVersion,
} from '../data/correspondenceSeed';
import { scheduleLocalDomainPersist } from '../data/localDomainStore';
import { notifyInboxItem } from './inboxNotify';
import {
  pushTransferLetter,
  updateTransferLetter,
} from '../data/pastoralOpsSeed';
import { isChurchLeader } from '../domain/churchLeadership';
import { rolesFromPositions } from '../domain/participation';
import { POSITIONS } from '../data/seed';
import type {
  ChurchDocument,
  CorrespondenceLetterType,
  CorrespondenceStatus,
  DocumentDeliveryMethod,
  DocumentOrigin,
  DocumentRequest,
  DocumentSignature,
  DocumentVersion,
  SystemRole,
  TransferLetterOut,
} from '../domain/types';
import { peopleService } from './authService';

function nid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function rolesFor(personId: string): SystemRole[] {
  return rolesFromPositions(POSITIONS.filter((p) => p.personId === personId));
}

function personLabel(personId: string) {
  const p = peopleService.getById(personId);
  return p?.preferredName || p?.fullName || personId;
}

const LETTER_TYPE_LABELS: Record<CorrespondenceLetterType, string> = {
  TRANSFER_OUT: 'Transfer letter out',
  MEMBERSHIP_CONFIRMATION: 'Membership confirmation',
  RECOMMENDATION: 'Recommendation / introduction',
  INCOMING: 'Incoming correspondence',
  PROGRAM_CERTIFICATE: 'Program certificate',
  MINISTRY_APPOINTMENT: 'Ministry appointment letter',
};

const REF_PREFIX: Record<CorrespondenceLetterType, string> = {
  TRANSFER_OUT: 'TRF',
  MEMBERSHIP_CONFIRMATION: 'MCF',
  RECOMMENDATION: 'REC',
  INCOMING: 'IN',
  PROGRAM_CERTIFICATE: 'CERT',
  MINISTRY_APPOINTMENT: 'APT',
};

const MEMBER_REQUESTABLE: CorrespondenceLetterType[] = [
  'TRANSFER_OUT',
  'MEMBERSHIP_CONFIRMATION',
  'RECOMMENDATION',
];

function defaultSensitivity(
  letterType: CorrespondenceLetterType,
): ChurchDocument['sensitivity'] {
  if (letterType === 'MEMBERSHIP_CONFIRMATION') return 'INTERNAL';
  if (letterType === 'PROGRAM_CERTIFICATE') return 'INTERNAL';
  if (letterType === 'INCOMING') return 'INTERNAL';
  if (letterType === 'MINISTRY_APPOINTMENT') return 'INTERNAL';
  return 'CONFIDENTIAL';
}

function buildTemplateBody(
  letterType: CorrespondenceLetterType,
  personId: string,
  opts: {
    destinationChurch?: string;
    purpose?: string;
    programName?: string;
    orgUnitName?: string;
    officeTitle?: string;
  },
): string {
  const name = personLabel(personId);
  const purpose = opts.purpose?.trim() || '—';
  if (letterType === 'TRANSFER_OUT') {
    return `ADEPR Kacyiru\n\nTRANSFER LETTER\n\nTo: ${
      opts.destinationChurch?.trim() || '[Destination church]'
    }\n\nThis confirms that ${name} is a member in good standing at ADEPR Kacyiru and is transferring to your congregation.\n\nReason: ${purpose}\n\nPrepared by the Church Office.`;
  }
  if (letterType === 'MEMBERSHIP_CONFIRMATION') {
    return `ADEPR Kacyiru\n\nMEMBERSHIP CONFIRMATION\n\nThis confirms that ${name} is a registered member of ADEPR Kacyiru.\n\nPurpose: ${purpose}\n\nPrepared by the Church Office.`;
  }
  if (letterType === 'PROGRAM_CERTIFICATE') {
    return `ADEPR Kacyiru\n\nCERTIFICATE OF COMPLETION\n\nThis certifies that ${name} has completed:\n${
      opts.programName?.trim() || '[Program]'
    }\n\nIssued by ADEPR Kacyiru.`;
  }
  if (letterType === 'MINISTRY_APPOINTMENT') {
    return `ADEPR Kacyiru\n\nMINISTRY APPOINTMENT LETTER\n\nThis confirms the appointment of ${name} as ${
      opts.officeTitle?.trim() || '[Office]'
    } in ${opts.orgUnitName?.trim() || '[Ministry]'}.\n\nPurpose: ${purpose}\n\nPrepared by the Church Office.`;
  }
  if (letterType === 'INCOMING') {
    return purpose;
  }
  return `ADEPR Kacyiru\n\nLETTER OF RECOMMENDATION / INTRODUCTION\n\nTo Whom It May Concern,\n\nWe recommend ${name}, a member of ADEPR Kacyiru, for the purpose stated below.\n\nPurpose: ${purpose}\n\nPrepared by the Church Office.`;
}

function nextReferenceNumber(letterType: CorrespondenceLetterType): string {
  const year = new Date().getFullYear();
  const prefix = REF_PREFIX[letterType];
  const count =
    CHURCH_DOCUMENTS.filter(
      (d) =>
        d.letterType === letterType &&
        d.referenceNumber &&
        d.referenceNumber.includes(`/${year}/`),
    ).length + 1;
  return `CH/${prefix}/${year}/${String(count).padStart(4, '0')}`;
}

function syncRequestStatus(documentId: string, status: CorrespondenceStatus) {
  const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
  if (!doc) return;
  updateDocumentRequest(doc.requestId, { status });
}

export const correspondenceService = {
  LETTER_TYPE_LABELS,

  /** Live preview of a template before creating / preparing a letter. */
  previewTemplate(input: {
    letterType: CorrespondenceLetterType;
    personId: string;
    purpose?: string;
    destinationChurch?: string;
    programName?: string;
    orgUnitName?: string;
    officeTitle?: string;
  }): string {
    return buildTemplateBody(input.letterType, input.personId, {
      destinationChurch: input.destinationChurch,
      purpose: input.purpose,
      programName: input.programName,
      orgUnitName: input.orgUnitName,
      officeTitle: input.officeTitle,
    });
  },

  listRequests(filter?: {
    status?: CorrespondenceStatus;
    personId?: string;
  }) {
    return DOCUMENT_REQUESTS.filter((r) => {
      if (filter?.status && r.status !== filter.status) return false;
      if (filter?.personId && r.personId !== filter.personId) return false;
      return true;
    });
  },

  listDocuments(filter?: {
    status?: CorrespondenceStatus | CorrespondenceStatus[];
    personId?: string;
    letterType?: CorrespondenceLetterType;
    awaitingSignature?: boolean;
  }) {
    const statuses = filter?.status
      ? Array.isArray(filter.status)
        ? filter.status
        : [filter.status]
      : null;
    return [...CHURCH_DOCUMENTS]
      .filter((d) => {
        if (statuses && !statuses.includes(d.status)) return false;
        if (filter?.personId && d.personId !== filter.personId) return false;
        if (filter?.letterType && d.letterType !== filter.letterType)
          return false;
        if (filter?.awaitingSignature && d.status !== 'AWAITING_SIGNATURE')
          return false;
        return true;
      })
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
  },

  getDocument(id: string) {
    return CHURCH_DOCUMENTS.find((d) => d.id === id) ?? null;
  },

  getRequest(id: string) {
    return DOCUMENT_REQUESTS.find((r) => r.id === id) ?? null;
  },

  versionsFor(documentId: string) {
    return DOCUMENT_VERSIONS.filter((v) => v.documentId === documentId).sort(
      (a, b) => a.versionNumber - b.versionNumber,
    );
  },

  signaturesFor(documentId: string) {
    return DOCUMENT_SIGNATURES.filter((s) => s.documentId === documentId);
  },

  currentVersion(documentId: string) {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc?.currentVersionId) return null;
    return DOCUMENT_VERSIONS.find((v) => v.id === doc.currentVersionId) ?? null;
  },

  /**
   * Office creates a letter request + document (+ optional first version).
   * Transfer out also keeps TransferLetterOut in sync.
   */
  openLetter(input: {
    letterType: CorrespondenceLetterType;
    personId: string;
    actorPersonId: string;
    origin: DocumentOrigin;
    originDetail?: string;
    purpose?: string;
    destinationChurch?: string;
    note?: string;
    orgUnitId?: string;
    programId?: string;
    programName?: string;
    orgUnitName?: string;
    officeTitle?: string;
    /** When true, generate template body as v1. */
    useTemplate?: boolean;
    /** External / member file (Scenario A). */
    upload?: {
      fileName: string;
      bodyText?: string;
      fileDataUrl?: string;
    };
  }):
    | { ok: true; request: DocumentRequest; document: ChurchDocument }
    | { ok: false; reason: string } {
    if (input.letterType === 'INCOMING') {
      return { ok: false, reason: 'Use registerIncoming for incoming mail' };
    }
    if (input.origin === 'OTHER' && !input.originDetail?.trim()) {
      return { ok: false, reason: 'Enter the origin when Other is selected' };
    }
    if (
      input.letterType === 'TRANSFER_OUT' &&
      !input.destinationChurch?.trim()
    ) {
      return { ok: false, reason: 'Destination church is required' };
    }

    const requestedOn = new Date().toISOString().slice(0, 10);
    const titleBase = LETTER_TYPE_LABELS[input.letterType];
    const title = `${titleBase} — ${personLabel(input.personId)}`;

    const requestId = nid('dreq');
    const documentId = nid('cdoc');

    let transferLetterId: string | undefined;
    if (input.letterType === 'TRANSFER_OUT') {
      const tlo: TransferLetterOut = {
        id: nid('tlo'),
        personId: input.personId,
        destinationChurch: input.destinationChurch!.trim(),
        status: 'AWAITING_LEADER',
        draftedByPersonId: input.actorPersonId,
        draftedOn: requestedOn,
        note: input.note ?? input.purpose,
        documentId,
      };
      pushTransferLetter(tlo);
      transferLetterId = tlo.id;
    }

    const request: DocumentRequest = {
      id: requestId,
      letterType: input.letterType,
      personId: input.personId,
      requestedByPersonId: input.actorPersonId,
      requestedOn,
      status: 'IN_PREPARATION',
      origin: input.origin,
      originDetail: input.originDetail?.trim(),
      purpose: input.purpose,
      destinationChurch: input.destinationChurch?.trim(),
      note: input.note,
      documentId,
    };

    const document: ChurchDocument = {
      id: documentId,
      requestId,
      letterType: input.letterType,
      direction: 'OUT',
      personId: input.personId,
      status: 'IN_PREPARATION',
      origin: input.origin,
      originDetail: input.originDetail?.trim(),
      sensitivity: defaultSensitivity(input.letterType),
      title,
      purpose: input.purpose,
      destinationChurch: input.destinationChurch?.trim(),
      transferLetterId,
      createdByPersonId: input.actorPersonId,
      createdOn: requestedOn,
      orgUnitId: input.orgUnitId,
      programId: input.programId,
    };

    pushDocumentRequest(request);
    pushChurchDocument(document);

    if (input.useTemplate || input.upload) {
      const versionId = nid('dver');
      const bodyText =
        input.upload?.bodyText ??
        (input.useTemplate
          ? buildTemplateBody(input.letterType, input.personId, {
              destinationChurch: input.destinationChurch,
              purpose: input.purpose,
              programName: input.programName,
              orgUnitName: input.orgUnitName,
              officeTitle: input.officeTitle,
            })
          : undefined);
      const version: DocumentVersion = {
        id: versionId,
        documentId,
        versionNumber: 1,
        uploadedByPersonId: input.actorPersonId,
        uploadedOn: requestedOn,
        origin: input.origin,
        fileName:
          input.upload?.fileName ??
          `${input.letterType.toLowerCase()}-${input.personId}.txt`,
        bodyText,
        fileDataUrl: input.upload?.fileDataUrl,
        isFinal: false,
        note: input.upload ? 'Uploaded at the desk' : 'Generated from template',
      };
      pushDocumentVersion(version);
      updateChurchDocument(documentId, { currentVersionId: versionId });
      document.currentVersionId = versionId;
    }

    return { ok: true, request, document };
  },

  /**
   * Member self-request (My Documents). Office prepares; Leader signs.
   * Only the three Phase‑1 letter types.
   */
  memberRequestLetter(input: {
    letterType: CorrespondenceLetterType;
    personId: string;
    purpose?: string;
    destinationChurch?: string;
    note?: string;
  }):
    | { ok: true; request: DocumentRequest; document: ChurchDocument }
    | { ok: false; reason: string } {
    if (!MEMBER_REQUESTABLE.includes(input.letterType)) {
      return {
        ok: false,
        reason: 'Members may only request transfer, confirmation, or recommendation',
      };
    }
    if (
      input.letterType === 'TRANSFER_OUT' &&
      !input.destinationChurch?.trim()
    ) {
      return { ok: false, reason: 'Destination church is required' };
    }
    const requestedOn = new Date().toISOString().slice(0, 10);
    const requestId = nid('dreq');
    const documentId = nid('cdoc');
    const title = `${LETTER_TYPE_LABELS[input.letterType]} — ${personLabel(input.personId)}`;

    const request: DocumentRequest = {
      id: requestId,
      letterType: input.letterType,
      personId: input.personId,
      requestedByPersonId: input.personId,
      requestedOn,
      status: 'SUBMITTED',
      origin: 'MEMBER_REQUESTED',
      purpose: input.purpose,
      destinationChurch: input.destinationChurch?.trim(),
      note: input.note,
      documentId,
    };
    const document: ChurchDocument = {
      id: documentId,
      requestId,
      letterType: input.letterType,
      direction: 'OUT',
      personId: input.personId,
      status: 'SUBMITTED',
      origin: 'MEMBER_REQUESTED',
      sensitivity: defaultSensitivity(input.letterType),
      title,
      purpose: input.purpose,
      destinationChurch: input.destinationChurch?.trim(),
      createdByPersonId: input.personId,
      createdOn: requestedOn,
    };
    pushDocumentRequest(request);
    pushChurchDocument(document);
    notifyInboxItem(`letter-prep-${documentId}`);
    scheduleLocalDomainPersist();
    return { ok: true, request, document };
  },

  /** Office turns a member request into a draft from template (or refreshes the draft). */
  prepareFromTemplate(
    documentId: string,
    actorPersonId: string,
    opts?: {
      programName?: string;
      orgUnitName?: string;
      officeTitle?: string;
    },
  ): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (
      !['SUBMITTED', 'NEEDS_INFORMATION', 'IN_PREPARATION'].includes(doc.status)
    ) {
      return { ok: false, reason: `Cannot prepare from ${doc.status}` };
    }

    let transferLetterId = doc.transferLetterId;
    if (doc.letterType === 'TRANSFER_OUT' && !transferLetterId) {
      const tlo: TransferLetterOut = {
        id: nid('tlo'),
        personId: doc.personId,
        destinationChurch: doc.destinationChurch ?? '',
        status: 'DRAFT',
        draftedByPersonId: actorPersonId,
        draftedOn: new Date().toISOString().slice(0, 10),
        note: doc.purpose,
        documentId: doc.id,
      };
      pushTransferLetter(tlo);
      transferLetterId = tlo.id;
    }

    const bodyText = buildTemplateBody(doc.letterType, doc.personId, {
      destinationChurch: doc.destinationChurch,
      purpose: doc.purpose,
      programName: opts?.programName,
      orgUnitName: opts?.orgUnitName,
      officeTitle: opts?.officeTitle,
    });
    const nextNum =
      DOCUMENT_VERSIONS.filter((v) => v.documentId === doc.id).length + 1;
    const version: DocumentVersion = {
      id: nid('dver'),
      documentId: doc.id,
      versionNumber: nextNum,
      uploadedByPersonId: actorPersonId,
      uploadedOn: new Date().toISOString().slice(0, 10),
      origin: 'CHURCH_GENERATED',
      fileName: `${doc.letterType.toLowerCase()}-${doc.personId}.txt`,
      bodyText,
      isFinal: false,
      note:
        nextNum === 1
          ? 'Prepared from template after member request'
          : 'Re-prepared from template',
    };
    pushDocumentVersion(version);
    updateChurchDocument(doc.id, {
      status: 'IN_PREPARATION',
      currentVersionId: version.id,
      transferLetterId,
      // Keep MEMBER_REQUESTED so the desk still shows who asked for the letter.
    });
    syncRequestStatus(doc.id, 'IN_PREPARATION');
    scheduleLocalDomainPersist();
    return { ok: true };
  },

  /** Register mail received from district / other churches / institutions. */
  registerIncoming(input: {
    actorPersonId: string;
    title: string;
    senderName: string;
    senderOrg?: string;
    purpose?: string;
    /** Optional linked member (subject of the mail). */
    personId?: string;
    bodyText?: string;
    note?: string;
  }):
    | { ok: true; request: DocumentRequest; document: ChurchDocument }
    | { ok: false; reason: string } {
    if (!input.title.trim() || !input.senderName.trim()) {
      return { ok: false, reason: 'Title and sender are required' };
    }
    const requestedOn = new Date().toISOString().slice(0, 10);
    const personId = input.personId?.trim() || input.actorPersonId;
    const requestId = nid('dreq');
    const documentId = nid('cdoc');
    const request: DocumentRequest = {
      id: requestId,
      letterType: 'INCOMING',
      personId,
      requestedByPersonId: input.actorPersonId,
      requestedOn,
      status: 'IN_PREPARATION',
      origin: 'EXTERNAL_INTAKE',
      purpose: input.purpose ?? input.title,
      note: input.note,
      documentId,
      senderName: input.senderName.trim(),
      senderOrg: input.senderOrg?.trim(),
    };
    const document: ChurchDocument = {
      id: documentId,
      requestId,
      letterType: 'INCOMING',
      direction: 'IN',
      personId,
      status: 'IN_PREPARATION',
      origin: 'EXTERNAL_INTAKE',
      sensitivity: 'INTERNAL',
      title: input.title.trim(),
      purpose: input.purpose ?? input.title,
      senderName: input.senderName.trim(),
      senderOrg: input.senderOrg?.trim(),
      createdByPersonId: input.actorPersonId,
      createdOn: requestedOn,
    };
    pushDocumentRequest(request);
    pushChurchDocument(document);
    if (input.bodyText?.trim()) {
      const version: DocumentVersion = {
        id: nid('dver'),
        documentId,
        versionNumber: 1,
        uploadedByPersonId: input.actorPersonId,
        uploadedOn: requestedOn,
        origin: 'EXTERNAL_INTAKE',
        fileName: 'incoming.txt',
        bodyText: input.bodyText.trim(),
        isFinal: false,
        note: 'Registered intake',
      };
      pushDocumentVersion(version);
      updateChurchDocument(documentId, { currentVersionId: version.id });
      document.currentVersionId = version.id;
    }
    return { ok: true, request, document };
  },

  /**
   * Program completion certificate — also keeps PersonDocumentMeta for directory.
   * Auto-finalizes with office actor as preparer; Leader may re-sign later if needed.
   * For Phase 2: creates FINALIZED certificate letter linked to the person.
   */
  issueProgramCertificate(input: {
    personId: string;
    programId: string;
    programName: string;
    actorPersonId: string;
    cohortLabel?: string;
  }):
    | { ok: true; document: ChurchDocument }
    | { ok: false; reason: string } {
    const opened = this.openLetter({
      letterType: 'PROGRAM_CERTIFICATE',
      personId: input.personId,
      actorPersonId: input.actorPersonId,
      origin: 'CHURCH_GENERATED',
      purpose: input.cohortLabel ?? input.programName,
      programId: input.programId,
      programName: input.programName,
      useTemplate: true,
    });
    if (!opened.ok) return opened;
    // Certificates: office-issued artifact — finalize without Leader queue.
    const signedOn = new Date().toISOString().slice(0, 10);
    const referenceNumber = nextReferenceNumber('PROGRAM_CERTIFICATE');
    if (opened.document.currentVersionId) {
      updateDocumentVersion(opened.document.currentVersionId, {
        isFinal: true,
      });
      pushDocumentSignature({
        id: nid('dsig'),
        documentId: opened.document.id,
        versionId: opened.document.currentVersionId,
        signedByPersonId: input.actorPersonId,
        signedOn,
        authorityRole: 'PROGRAM_OFFICE',
        kind: 'SYSTEM_AUTHORITY',
      });
    }
    updateChurchDocument(opened.document.id, {
      status: 'FINALIZED',
      referenceNumber,
      finalizedOn: signedOn,
      finalizedByPersonId: input.actorPersonId,
      title: `Certificate — ${input.programName} — ${personLabel(input.personId)}`,
    });
    syncRequestStatus(opened.document.id, 'FINALIZED');
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === opened.document.id)!;
    return { ok: true, document: doc };
  },

  addVersion(input: {
    documentId: string;
    actorPersonId: string;
    fileName: string;
    bodyText?: string;
    fileDataUrl?: string;
    origin?: DocumentOrigin;
    note?: string;
    markFinal?: boolean;
  }): { ok: true; version: DocumentVersion } | { ok: false; reason: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === input.documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (
      doc.status === 'FINALIZED' ||
      doc.status === 'DELIVERED' ||
      doc.status === 'CANCELLED' ||
      doc.status === 'REJECTED'
    ) {
      return { ok: false, reason: 'Document is closed — cannot add drafts' };
    }
    const nextNum =
      DOCUMENT_VERSIONS.filter((v) => v.documentId === doc.id).length + 1;
    const version: DocumentVersion = {
      id: nid('dver'),
      documentId: doc.id,
      versionNumber: nextNum,
      uploadedByPersonId: input.actorPersonId,
      uploadedOn: new Date().toISOString().slice(0, 10),
      origin: input.origin ?? doc.origin,
      fileName: input.fileName,
      bodyText: input.bodyText,
      fileDataUrl: input.fileDataUrl,
      isFinal: Boolean(input.markFinal),
      note: input.note,
    };
    pushDocumentVersion(version);
    updateChurchDocument(doc.id, { currentVersionId: version.id });
    if (doc.status === 'SUBMITTED' || doc.status === 'AWAITING_SIGNATURE') {
      updateChurchDocument(doc.id, { status: 'IN_PREPARATION' });
      syncRequestStatus(doc.id, 'IN_PREPARATION');
    }
    scheduleLocalDomainPersist();
    return { ok: true, version };
  },

  submitForSignature(
    documentId: string,
  ): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    const version = doc.currentVersionId
      ? DOCUMENT_VERSIONS.find((v) => v.id === doc.currentVersionId)
      : null;
    if (!version?.bodyText?.trim()) {
      return {
        ok: false,
        reason:
          'Prepare or edit the letter draft first, then submit for signature',
      };
    }
    if (
      doc.status !== 'IN_PREPARATION' &&
      doc.status !== 'NEEDS_INFORMATION' &&
      doc.status !== 'SUBMITTED'
    ) {
      return { ok: false, reason: `Cannot submit from ${doc.status}` };
    }
    updateChurchDocument(documentId, { status: 'AWAITING_SIGNATURE' });
    syncRequestStatus(documentId, 'AWAITING_SIGNATURE');
    if (doc.transferLetterId) {
      updateTransferLetter(doc.transferLetterId, {
        status: 'AWAITING_LEADER',
      });
    }
    notifyInboxItem(`letter-sign-${documentId}`);
    scheduleLocalDomainPersist();
    return { ok: true };
  },

  markNeedsInformation(
    documentId: string,
    note: string,
    actorPersonId: string,
  ): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (!note.trim()) {
      return { ok: false, reason: 'Say what information or correction is needed' };
    }
    if (
      !['IN_PREPARATION', 'AWAITING_SIGNATURE', 'SUBMITTED'].includes(doc.status)
    ) {
      return {
        ok: false,
        reason: `Cannot request information from ${doc.status}`,
      };
    }
    updateChurchDocument(documentId, {
      status: 'NEEDS_INFORMATION',
      infoRequestNote: note.trim(),
      infoRequestedByPersonId: actorPersonId,
      infoRequestedOn: new Date().toISOString().slice(0, 10),
      infoResponseNote: undefined,
    });
    syncRequestStatus(documentId, 'NEEDS_INFORMATION');
    updateDocumentRequest(doc.requestId, {
      note: note.trim(),
    });
    notifyInboxItem(`letter-info-you-${documentId}`);
    scheduleLocalDomainPersist();
    return { ok: true };
  },

  /**
   * Office or member answers a corrections request: new draft version + back to preparation.
   */
  respondToInfoRequest(input: {
    documentId: string;
    actorPersonId: string;
    responseNote: string;
    bodyText?: string;
    fileName?: string;
  }): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === input.documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (doc.status !== 'NEEDS_INFORMATION') {
      return { ok: false, reason: 'Letter is not waiting for information' };
    }
    if (!input.responseNote.trim() && !input.bodyText?.trim()) {
      return {
        ok: false,
        reason: 'Add a reply note or an updated letter draft',
      };
    }

    if (input.bodyText?.trim()) {
      const nextNum =
        DOCUMENT_VERSIONS.filter((v) => v.documentId === doc.id).length + 1;
      const version: DocumentVersion = {
        id: nid('dver'),
        documentId: doc.id,
        versionNumber: nextNum,
        uploadedByPersonId: input.actorPersonId,
        uploadedOn: new Date().toISOString().slice(0, 10),
        origin: 'CHURCH_GENERATED',
        fileName:
          input.fileName?.trim() ||
          `corrected-v${nextNum}-${doc.letterType.toLowerCase()}.txt`,
        bodyText: input.bodyText.trim(),
        isFinal: false,
        note: input.responseNote.trim() || 'Updated after information request',
      };
      pushDocumentVersion(version);
      updateChurchDocument(doc.id, { currentVersionId: version.id });
    }

    updateChurchDocument(doc.id, {
      status: 'IN_PREPARATION',
      infoResponseNote: input.responseNote.trim() || 'Updated draft provided',
    });
    syncRequestStatus(doc.id, 'IN_PREPARATION');
    notifyInboxItem(`letter-reply-${doc.id}`);
    scheduleLocalDomainPersist();
    return { ok: true };
  },

  rejectLetter(
    documentId: string,
    actorPersonId: string,
    reason: string,
  ): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (
      ['FINALIZED', 'DELIVERED', 'CANCELLED', 'REJECTED'].includes(doc.status)
    ) {
      return { ok: false, reason: 'Letter is already closed' };
    }
    if (!reason.trim()) {
      return { ok: false, reason: 'Rejection reason is required' };
    }
    updateChurchDocument(documentId, {
      status: 'REJECTED',
      infoRequestNote: reason.trim(),
      infoRequestedByPersonId: actorPersonId,
      infoRequestedOn: new Date().toISOString().slice(0, 10),
    });
    syncRequestStatus(documentId, 'REJECTED');
    if (doc.transferLetterId) {
      updateTransferLetter(doc.transferLetterId, { status: 'CANCELLED' });
    }
    return { ok: true };
  },

  /** Payload for PDF export / print. */
  letterPdfPayload(documentId: string):
    | {
        ok: true;
        filename: string;
        title: string;
        subtitle?: string;
        referenceNumber?: string;
        bodyText: string;
        footerLines: string[];
      }
    | { ok: false; reason: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    const version = doc.currentVersionId
      ? DOCUMENT_VERSIONS.find((v) => v.id === doc.currentVersionId)
      : null;
    if (!version?.bodyText?.trim()) {
      return {
        ok: false,
        reason: 'No letter body to export — prepare or upload a draft first',
      };
    }
    const sigs = DOCUMENT_SIGNATURES.filter((s) => s.documentId === documentId);
    const footerLines: string[] = [];
    if (sigs.length > 0) {
      for (const s of sigs) {
        footerLines.push(
          `Signed (${s.kind}): ${personLabel(s.signedByPersonId)} · ${s.signedOn} · ${s.authorityRole}`,
        );
      }
    } else if (doc.status === 'AWAITING_SIGNATURE') {
      footerLines.push('Awaiting Church Leader signature.');
    } else {
      footerLines.push(`Status: ${doc.status}`);
    }
    if (doc.deliveredOn) {
      footerLines.push(
        `Delivered ${doc.deliveredOn}${doc.deliveryMethod ? ` · ${doc.deliveryMethod}` : ''}`,
      );
    }
    const safeName = (doc.referenceNumber ?? doc.id).replace(/[^\w.-]+/g, '_');
    return {
      ok: true,
      filename: `${safeName}.pdf`,
      title: doc.title,
      subtitle: [
        LETTER_TYPE_LABELS[doc.letterType],
        doc.destinationChurch ? `→ ${doc.destinationChurch}` : null,
        doc.purpose,
      ]
        .filter(Boolean)
        .join(' · '),
      referenceNumber: doc.referenceNumber,
      bodyText: version.bodyText,
      footerLines,
    };
  },

  /**
   * Church Leader system Sign (authority). Finalizes + assigns reference number.
   * Optional wet-ink PDF can still be uploaded afterward as an archive copy.
   */
  sign(
    documentId: string,
    actorPersonId: string,
  ): { ok: boolean; reason?: string; referenceNumber?: string } {
    if (!isChurchLeader(rolesFor(actorPersonId))) {
      return {
        ok: false,
        reason: 'Only the Church Leader may sign these letters',
      };
    }
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (doc.status !== 'AWAITING_SIGNATURE') {
      return { ok: false, reason: 'Letter is not awaiting signature' };
    }
    if (!doc.currentVersionId) {
      return { ok: false, reason: 'No version to sign' };
    }

    const signedOn = new Date().toISOString().slice(0, 10);
    const sig: DocumentSignature = {
      id: nid('dsig'),
      documentId,
      versionId: doc.currentVersionId,
      signedByPersonId: actorPersonId,
      signedOn,
      authorityRole: 'CHURCH_LEADER',
      kind: 'SYSTEM_AUTHORITY',
    };
    pushDocumentSignature(sig);

    const referenceNumber = nextReferenceNumber(doc.letterType);
    updateDocumentVersion(doc.currentVersionId, { isFinal: true });
    updateChurchDocument(documentId, {
      status: 'FINALIZED',
      referenceNumber,
      finalizedOn: signedOn,
      finalizedByPersonId: actorPersonId,
    });
    syncRequestStatus(documentId, 'FINALIZED');

    if (doc.transferLetterId) {
      updateTransferLetter(doc.transferLetterId, {
        status: 'SIGNED',
        signedByPersonId: actorPersonId,
        signedOn,
      });
    }

    scheduleLocalDomainPersist();
    notifyInboxItem(`letter-ready-${documentId}`);
    return { ok: true, referenceNumber };
  },

  uploadWetInk(input: {
    documentId: string;
    actorPersonId: string;
    fileName: string;
    fileDataUrl?: string;
    bodyText?: string;
  }): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === input.documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (doc.status !== 'FINALIZED' && doc.status !== 'DELIVERED') {
      return {
        ok: false,
        reason: 'Sign the letter first, then upload the wet-ink scan',
      };
    }
    const nextNum =
      DOCUMENT_VERSIONS.filter((v) => v.documentId === doc.id).length + 1;
    const version: DocumentVersion = {
      id: nid('dver'),
      documentId: doc.id,
      versionNumber: nextNum,
      uploadedByPersonId: input.actorPersonId,
      uploadedOn: new Date().toISOString().slice(0, 10),
      origin: 'CHURCH_GENERATED',
      fileName: input.fileName,
      fileDataUrl: input.fileDataUrl,
      bodyText: input.bodyText ?? 'Wet-ink signed scan on file',
      isFinal: true,
      note: 'Wet-ink signed copy',
    };
    pushDocumentVersion(version);
    updateChurchDocument(doc.id, { currentVersionId: version.id });
    pushDocumentSignature({
      id: nid('dsig'),
      documentId: doc.id,
      versionId: version.id,
      signedByPersonId: input.actorPersonId,
      signedOn: version.uploadedOn,
      authorityRole: 'CHURCH_LEADER',
      kind: 'WET_INK_UPLOAD',
    });
    return { ok: true };
  },

  deliver(input: {
    documentId: string;
    actorPersonId: string;
    method: DocumentDeliveryMethod;
  }): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === input.documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (doc.status !== 'FINALIZED') {
      return { ok: false, reason: 'Only finalized letters can be delivered' };
    }
    const deliveredOn = new Date().toISOString().slice(0, 10);
    updateChurchDocument(input.documentId, {
      status: 'DELIVERED',
      deliveredOn,
      deliveredByPersonId: input.actorPersonId,
      deliveryMethod: input.method,
    });
    syncRequestStatus(input.documentId, 'DELIVERED');
    if (doc.transferLetterId) {
      updateTransferLetter(doc.transferLetterId, { status: 'SENT' });
    }
    return { ok: true };
  },

  /** Close incoming mail after action taken (no Leader sign required). */
  archiveIncoming(
    documentId: string,
    actorPersonId: string,
  ): { ok: boolean; reason?: string; referenceNumber?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (doc.letterType !== 'INCOMING') {
      return { ok: false, reason: 'Only for incoming correspondence' };
    }
    if (doc.status === 'FINALIZED' || doc.status === 'DELIVERED') {
      return { ok: true, referenceNumber: doc.referenceNumber };
    }
    const signedOn = new Date().toISOString().slice(0, 10);
    const referenceNumber =
      doc.referenceNumber ?? nextReferenceNumber('INCOMING');
    if (doc.currentVersionId) {
      updateDocumentVersion(doc.currentVersionId, { isFinal: true });
    }
    updateChurchDocument(documentId, {
      status: 'FINALIZED',
      referenceNumber,
      finalizedOn: signedOn,
      finalizedByPersonId: actorPersonId,
    });
    syncRequestStatus(documentId, 'FINALIZED');
    return { ok: true, referenceNumber };
  },

  cancel(documentId: string): { ok: boolean; reason?: string } {
    const doc = CHURCH_DOCUMENTS.find((d) => d.id === documentId);
    if (!doc) return { ok: false, reason: 'Document not found' };
    if (doc.status === 'DELIVERED') {
      return { ok: false, reason: 'Already delivered' };
    }
    updateChurchDocument(documentId, { status: 'CANCELLED' });
    syncRequestStatus(documentId, 'CANCELLED');
    if (doc.transferLetterId) {
      updateTransferLetter(doc.transferLetterId, { status: 'CANCELLED' });
    }
    return { ok: true };
  },
};
