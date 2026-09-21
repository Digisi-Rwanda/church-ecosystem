import type {
  ChurchDocument,
  DocumentRequest,
  DocumentSignature,
  DocumentVersion,
} from '../domain/types';

export let DOCUMENT_REQUESTS: DocumentRequest[] = [];

export let CHURCH_DOCUMENTS: ChurchDocument[] = [];

export let DOCUMENT_VERSIONS: DocumentVersion[] = [];

export let DOCUMENT_SIGNATURES: DocumentSignature[] = [];

export function pushDocumentRequest(r: DocumentRequest) {
  DOCUMENT_REQUESTS = [r, ...DOCUMENT_REQUESTS];
}

export function updateDocumentRequest(
  id: string,
  patch: Partial<DocumentRequest>,
) {
  DOCUMENT_REQUESTS = DOCUMENT_REQUESTS.map((r) =>
    r.id === id ? { ...r, ...patch } : r,
  );
}

export function pushChurchDocument(d: ChurchDocument) {
  CHURCH_DOCUMENTS = [d, ...CHURCH_DOCUMENTS];
}

export function updateChurchDocument(
  id: string,
  patch: Partial<ChurchDocument>,
) {
  CHURCH_DOCUMENTS = CHURCH_DOCUMENTS.map((d) =>
    d.id === id ? { ...d, ...patch } : d,
  );
}

export function pushDocumentVersion(v: DocumentVersion) {
  DOCUMENT_VERSIONS = [v, ...DOCUMENT_VERSIONS];
}

export function updateDocumentVersion(
  id: string,
  patch: Partial<DocumentVersion>,
) {
  DOCUMENT_VERSIONS = DOCUMENT_VERSIONS.map((v) =>
    v.id === id ? { ...v, ...patch } : v,
  );
}

export function pushDocumentSignature(s: DocumentSignature) {
  DOCUMENT_SIGNATURES = [s, ...DOCUMENT_SIGNATURES];
}
