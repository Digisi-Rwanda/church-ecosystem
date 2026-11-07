import { PROFILE_COLUMNS } from './personRegistration';

/** The columns the import understands, with the headings people tend to use for them. */
export const IMPORT_FIELDS = ['fullName', 'preferredName', 'nationalId', 'phone', 'email', 'dateOfBirth', 'gender', 'status', 'joinedChurchOn', 'address', 'CONTACT', 'EMPLOYMENT', 'EDUCATION', 'CALLING', 'FAMILY', 'BAPTISM', 'MARRIAGE'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
const ALIASES: Record<ImportField, string[]> = {
  preferredName:['preferred name'], nationalId:['national id'],
  CONTACT: [], EMPLOYMENT: [], EDUCATION: [], CALLING: [], FAMILY: [], BAPTISM: [], MARRIAGE: [],
  fullName: ['fullname', 'name', 'names', 'izina', 'nom', 'full name'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'telefoni', 'téléphone'],
  email: ['email', 'e-mail', 'mail'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate', 'birth date', 'date of birth', 'birthday', 'itariki y amavuko'],
  gender: ['gender', 'sex', 'igitsina', 'sexe'],
  status: ['status', 'statut'],
  joinedChurchOn: ['joinedchurchon', 'joined', 'joined on', 'date joined', 'membership date', 'joined church on'],
  address: ['address', 'adresse', 'aderesi'],
};

export type Mapped = { rows: Array<Record<string, string>>; unknown: string[]; hasName: boolean };

/** Turn the cells under their headings into rows the server understands. Unknown headings are reported, not guessed. */
export function mapImport(cells: string[][]): Mapped {
  const [head = [], ...body] = cells;
  const norm = (h: string) => h.normalize('NFC').trim().toLowerCase();
  const field = (h: string): string | null => IMPORT_FIELDS.find((f) => norm(h) === f.toLowerCase() || ALIASES[f].includes(norm(h))) ?? PROFILE_COLUMNS.find(column=>norm(h)===norm(column.header) || norm(h)===norm(column.key))?.key ?? null;
  const cols = head.map(field);
  const unknown = head.filter((_, i) => !cols[i] && head[i].trim() !== '');
  const rows = body.map((r) => {
    const o: Record<string, string> = {};
    cols.forEach((f, i) => {
      if (f && (r[i] ?? '') !== '') o[f] = f === 'gender' ? genderOf(r[i]) : f === 'status' ? r[i].toUpperCase() : r[i];
    });
    return o;
  });
  return { rows, unknown, hasName: cols.includes('fullName') };
}

const genderOf = (v: string): string => {
  const x = v.trim().toLowerCase();
  if (['m', 'male', 'gabo', 'homme'].includes(x)) return 'MALE';
  if (['f', 'female', 'gore', 'femme'].includes(x)) return 'FEMALE';
  return v.toUpperCase();
};

