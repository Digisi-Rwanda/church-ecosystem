import { type FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type {
  FamilyRelation,
  Person,
  PersonEducationRecord,
  PersonEmploymentRecord,
  PersonTalentSkill,
  PersonTimelineEvent,
} from '../domain/types';
import { isAdeprKacyiruBaptismPlace } from '../data/personProfileSeed';
import { peopleService, participationService } from '../services';
import {
  SelectField,
  TextAreaField,
  TextField,
} from '../components/ui/Field';
import { PersonAvatar } from '../components/people/PersonAvatar';
import { PhotoEditor } from '../components/people/PhotoEditor';
import { useToast } from '../components/ui/Toast';
import { fileToSourceDataUrl } from '../lib/photo';
import { deleteSource, loadSource, saveSource } from '../lib/photoStore';

type Tab =
  | 'identity'
  | 'baptism'
  | 'marriage'
  | 'family'
  | 'history'
  | 'employment'
  | 'education'
  | 'talents'
  | 'gifts'
  | 'docs';

/**
 * Pastoral 360 edit — secretary / pastor / assistant with PERSON MANAGE.
 * Household family is record-only (links), not visit workflows.
 */
export function PersonFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const existing = id ? peopleService.getById(id) : null;
  const { canManagePeople, canViewFullRecord, authorize } = useAuth();
  const navigate = useNavigate();
  const { push: toast } = useToast();
  const [tab, setTab] = useState<Tab>('identity');
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [preferredName, setPreferredName] = useState(
    existing?.preferredName ?? '',
  );
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(
    existing?.photoUrl,
  );
  // Full-quality copy picked/edited in this session; saved to IndexedDB on Save.
  const [photoSource, setPhotoSource] = useState<string | undefined>();
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoEditing, setPhotoEditing] = useState<string | null>(null);
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(existing?.dateOfBirth ?? '');
  const [gender, setGender] = useState<Person['gender'] | ''>(() => {
    const g = existing?.gender;
    return g === 'MALE' || g === 'FEMALE' ? g : '';
  });
  const [address, setAddress] = useState(existing?.address ?? '');
  const [nationalId, setNationalId] = useState(existing?.nationalId ?? '');
  const [joinedChurchOn, setJoinedChurchOn] = useState(
    existing?.joinedChurchOn ?? '',
  );
  const [pastoralNotes, setPastoralNotes] = useState(
    existing?.pastoralNotes ?? '',
  );
  const [status, setStatus] = useState<Person['status']>(
    existing?.status ?? 'ACTIVE',
  );

  const baptism = id ? peopleService.baptism(id) : null;
  const [bapOn, setBapOn] = useState(baptism?.baptizedOn ?? '');
  const [bapPlace, setBapPlace] = useState(baptism?.place ?? '');
  const [bapMinister, setBapMinister] = useState(baptism?.ministerName ?? '');
  const [bapCert, setBapCert] = useState(baptism?.certificateRef ?? '');
  const [bapNotes, setBapNotes] = useState(baptism?.notes ?? '');

  const marriage = id ? peopleService.marriage(id) : null;
  const [marSpouse, setMarSpouse] = useState(marriage?.spouseName ?? '');
  const [marOn, setMarOn] = useState(marriage?.marriedOn ?? '');
  const [marPlace, setMarPlace] = useState(marriage?.place ?? '');
  const [marStatus, setMarStatus] = useState(marriage?.status ?? 'MARRIED');
  const [marCert, setMarCert] = useState(marriage?.certificateRef ?? '');
  const [marNotes, setMarNotes] = useState(marriage?.notes ?? '');

  const [famRelated, setFamRelated] = useState('');
  const [famRelation, setFamRelation] = useState<FamilyRelation>('OTHER');
  const [famNotes, setFamNotes] = useState('');

  const [tlAt, setTlAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [tlKind, setTlKind] =
    useState<PersonTimelineEvent['kind']>('NOTE');
  const [tlTitle, setTlTitle] = useState('');
  const [tlDetail, setTlDetail] = useState('');
  const [tlEditId, setTlEditId] = useState<string | null>(null);

  const [empEmployer, setEmpEmployer] = useState('');
  const [empTitle, setEmpTitle] = useState('');
  const [empSector, setEmpSector] = useState('');
  const [empStatus, setEmpStatus] =
    useState<PersonEmploymentRecord['status']>('CURRENT');
  const [empStarted, setEmpStarted] = useState('');
  const [empEnded, setEmpEnded] = useState('');
  const [empNotes, setEmpNotes] = useState('');
  const [empEditId, setEmpEditId] = useState<string | null>(null);

  const [eduInstitution, setEduInstitution] = useState('');
  const [eduLevel, setEduLevel] = useState('');
  const [eduField, setEduField] = useState('');
  const [eduStatus, setEduStatus] =
    useState<PersonEducationRecord['status']>('COMPLETED');
  const [eduStarted, setEduStarted] = useState('');
  const [eduEnded, setEduEnded] = useState('');
  const [eduNotes, setEduNotes] = useState('');
  const [eduEditId, setEduEditId] = useState<string | null>(null);

  const [talKind, setTalKind] = useState<PersonTalentSkill['kind']>('SKILL');
  const [talName, setTalName] = useState('');
  const [talProficiency, setTalProficiency] = useState<
    PersonTalentSkill['proficiency'] | ''
  >('');
  const [talNotes, setTalNotes] = useState('');
  const [talEditId, setTalEditId] = useState<string | null>(null);

  const [giftName, setGiftName] = useState('');
  const [giftEvidence, setGiftEvidence] = useState('');
  const [giftNotes, setGiftNotes] = useState('');
  const [giftEditId, setGiftEditId] = useState<string | null>(null);

  const [docLabel, setDocLabel] = useState('');
  const [docKind, setDocKind] = useState<
    'CERTIFICATE' | 'ID' | 'LETTER' | 'OTHER'
  >('CERTIFICATE');
  const [docIssued, setDocIssued] = useState('');
  const [docNote, setDocNote] = useState('');

  const peopleOptions = useMemo(
    () => peopleService.list().filter((p) => p.id !== id),
    [id],
  );

  if (!canManagePeople) {
    return (
      <div className="panel">
        <h2>Not authorized</h2>
        <Link to="/people">Back</Link>
      </div>
    );
  }

  if (isEdit && !existing) {
    return (
      <div className="panel">
        <h2>Person not found</h2>
        <Link to="/people">Back</Link>
      </div>
    );
  }

  function gate(): boolean {
    const decision = authorize('PERSON', 'MANAGE');
    if (!decision.allowed) {
      toast({ title: decision.reason, tone: 'danger' });
      return false;
    }
    return true;
  }

  function ensureChurchMembership(personId: string): boolean {
    const already = participationService
      .membershipsFor(personId)
      .some((m) => m.type === 'CHURCH_MEMBER' && m.status === 'ACTIVE');
    if (already) return false;
    participationService.createMembership({
      personId,
      type: 'CHURCH_MEMBER',
      label: 'Church member',
    });
    return true;
  }

  async function openPhotoEditor() {
    setPhotoEditing(
      photoSource ??
        (id ? await loadSource(id) : null) ??
        existing?.photoSource ??
        photoUrl ??
        null,
    );
  }

  /** Store (or clear) the full-quality copy once the person has an id. */
  function persistPhotoSource(personId: string) {
    if (photoSource) void saveSource(personId, photoSource);
    else if (photoRemoved || !photoUrl) void deleteSource(personId);
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhotoEditing(await fileToSourceDataUrl(file));
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Could not use that image',
        tone: 'danger',
      });
    }
  }

  function onSaveIdentity(e: FormEvent) {
    e.preventDefault();
    if (!gate()) return;
    if (!fullName.trim()) {
      toast({ title: 'Full name is required', tone: 'danger' });
      return;
    }
    try {
      const payload = {
        fullName: fullName.trim(),
        preferredName: preferredName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
        address: address || undefined,
        nationalId: nationalId || undefined,
        joinedChurchOn: joinedChurchOn || undefined,
        pastoralNotes: pastoralNotes || undefined,
        photoUrl,
        photoSource: undefined,
        status,
      };
      if (isEdit && id) {
        peopleService.update(id, payload);
        persistPhotoSource(id);
        toast({ title: 'Identity saved', tone: 'success' });
        refresh();
        return;
      }
      const created = peopleService.create(payload);
      persistPhotoSource(created.id);
      toast({ title: 'Person created', tone: 'success' });
      window.setTimeout(() => navigate(`/people/${created.id}/edit`), 600);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Could not save person',
        tone: 'danger',
      });
    }
  }

  function onSaveBaptism(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord) return;
    if (!bapOn) {
      toast({ title: 'Baptism date required', tone: 'danger' });
      return;
    }
    try {
      peopleService.saveBaptism({
        personId: id,
        baptizedOn: bapOn,
        place: bapPlace || undefined,
        mode: 'IMMERSION',
        ministerName: bapMinister || undefined,
        certificateRef: bapCert || undefined,
        notes: bapNotes || undefined,
      });
      peopleService.addTimelineEvent({
        personId: id,
        at: bapOn,
        kind: 'BAPTISM',
        title: 'Baptism record updated',
        detail: bapCert ? `Certificate ${bapCert}` : undefined,
      });
      const addedMembership =
        isAdeprKacyiruBaptismPlace(bapPlace) && ensureChurchMembership(id);
      toast({
        title: addedMembership
          ? 'Person created · church membership added'
          : 'Baptism saved',
        tone: 'success',
      });
      refresh();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Could not save baptism',
        tone: 'danger',
      });
    }
  }

  function onSaveMarriage(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord) return;
    if (!marOn) {
      toast({ title: 'Marriage date required', tone: 'danger' });
      return;
    }
    peopleService.saveMarriage({
      personId: id,
      spouseName: marSpouse || undefined,
      marriedOn: marOn,
      place: marPlace || undefined,
      status: marStatus,
      certificateRef: marCert || undefined,
      notes: marNotes || undefined,
    });
    peopleService.addTimelineEvent({
      personId: id,
      at: marOn,
      kind: 'MARRIAGE',
      title: 'Marriage record updated',
      detail: marSpouse ? `Spouse: ${marSpouse}` : undefined,
    });
    toast({ title: 'Marriage saved', tone: 'success' });
    refresh();
  }

  function onAddFamily(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord || !famRelated) return;
    peopleService.addFamilyLink({
      personId: id,
      relatedPersonId: famRelated,
      relation: famRelation,
      notes: famNotes || undefined,
    });
    setFamRelated('');
    setFamNotes('');
    toast({ title: 'Family link added (record only)', tone: 'success' });
    refresh();
  }

  function clearHistoryForm() {
    setTlEditId(null);
    setTlAt(new Date().toISOString().slice(0, 10));
    setTlKind('NOTE');
    setTlTitle('');
    setTlDetail('');
  }

  function beginEditHistory(ev: PersonTimelineEvent) {
    setTlEditId(ev.id);
    setTlAt(ev.at);
    setTlKind(ev.kind);
    setTlTitle(ev.title);
    setTlDetail(ev.detail ?? '');
  }

  function onSaveHistory(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord || !tlTitle.trim()) return;
    const payload = {
      at: tlAt,
      kind: tlKind,
      title: tlTitle.trim(),
      detail: tlDetail.trim() || undefined,
    };
    if (tlEditId) {
      const updated = peopleService.updateTimelineEvent(tlEditId, payload);
      if (!updated) {
        toast({ title: 'History event not found', tone: 'danger' });
        return;
      }
      toast({ title: 'History event updated', tone: 'success' });
    } else {
      peopleService.addTimelineEvent({
        personId: id,
        ...payload,
      });
      toast({ title: 'History event added', tone: 'success' });
    }
    clearHistoryForm();
    refresh();
  }

  function clearEmploymentForm() {
    setEmpEditId(null);
    setEmpEmployer('');
    setEmpTitle('');
    setEmpSector('');
    setEmpStatus('CURRENT');
    setEmpStarted('');
    setEmpEnded('');
    setEmpNotes('');
  }

  function beginEditEmployment(job: PersonEmploymentRecord) {
    setEmpEditId(job.id);
    setEmpEmployer(job.employer);
    setEmpTitle(job.title ?? '');
    setEmpSector(job.sector ?? '');
    setEmpStatus(job.status);
    setEmpStarted(job.startedOn ?? '');
    setEmpEnded(job.endedOn ?? '');
    setEmpNotes(job.notes ?? '');
  }

  function onSaveEmployment(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord || !empEmployer.trim()) return;
    const payload = {
      employer: empEmployer.trim(),
      title: empTitle.trim() || undefined,
      sector: empSector.trim() || undefined,
      status: empStatus,
      startedOn: empStarted || undefined,
      endedOn: empEnded || undefined,
      notes: empNotes.trim() || undefined,
    };
    if (empEditId) {
      const updated = peopleService.updateEmployment(empEditId, payload);
      if (!updated) {
        toast({ title: 'Employment not found', tone: 'danger' });
        return;
      }
      toast({ title: 'Employment updated', tone: 'success' });
    } else {
      peopleService.addEmployment({
        personId: id,
        ...payload,
      });
      toast({ title: 'Employment saved', tone: 'success' });
    }
    clearEmploymentForm();
    refresh();
  }

  function clearEducationForm() {
    setEduEditId(null);
    setEduInstitution('');
    setEduLevel('');
    setEduField('');
    setEduStatus('COMPLETED');
    setEduStarted('');
    setEduEnded('');
    setEduNotes('');
  }

  function beginEditEducation(ed: PersonEducationRecord) {
    setEduEditId(ed.id);
    setEduInstitution(ed.institution);
    setEduLevel(ed.level ?? '');
    setEduField(ed.field ?? '');
    setEduStatus(ed.status);
    setEduStarted(ed.startedOn ?? '');
    setEduEnded(ed.endedOn ?? '');
    setEduNotes(ed.notes ?? '');
  }

  function onSaveEducation(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord || !eduInstitution.trim()) return;
    const payload = {
      institution: eduInstitution.trim(),
      level: eduLevel.trim() || undefined,
      field: eduField.trim() || undefined,
      status: eduStatus,
      startedOn: eduStarted || undefined,
      endedOn: eduEnded || undefined,
      notes: eduNotes.trim() || undefined,
    };
    if (eduEditId) {
      const updated = peopleService.updateEducation(eduEditId, payload);
      if (!updated) {
        toast({ title: 'Education not found', tone: 'danger' });
        return;
      }
      toast({ title: 'Education updated', tone: 'success' });
    } else {
      peopleService.addEducation({
        personId: id,
        ...payload,
      });
      toast({ title: 'Education saved', tone: 'success' });
    }
    clearEducationForm();
    refresh();
  }

  function clearTalentForm() {
    setTalEditId(null);
    setTalKind('SKILL');
    setTalName('');
    setTalProficiency('');
    setTalNotes('');
  }

  function beginEditTalent(t: PersonTalentSkill) {
    setTalEditId(t.id);
    setTalKind(t.kind);
    setTalName(t.name);
    setTalProficiency(t.proficiency ?? '');
    setTalNotes(t.notes ?? '');
  }

  function onSaveTalent(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord || !talName.trim()) return;
    const payload = {
      kind: talKind,
      name: talName.trim(),
      proficiency: talProficiency || undefined,
      notes: talNotes.trim() || undefined,
    };
    if (talEditId) {
      const updated = peopleService.updateTalentSkill(talEditId, payload);
      if (!updated) {
        toast({ title: 'Talent / skill not found', tone: 'danger' });
        return;
      }
      toast({ title: 'Talent / skill updated', tone: 'success' });
    } else {
      peopleService.addTalentSkill({
        personId: id,
        ...payload,
      });
      toast({ title: 'Talent / skill saved', tone: 'success' });
    }
    clearTalentForm();
    refresh();
  }

  function clearGiftForm() {
    setGiftEditId(null);
    setGiftName('');
    setGiftEvidence('');
    setGiftNotes('');
  }

  function beginEditGift(g: {
    id: string;
    gift: string;
    evidence?: string;
    notes?: string;
  }) {
    setGiftEditId(g.id);
    setGiftName(g.gift);
    setGiftEvidence(g.evidence ?? '');
    setGiftNotes(g.notes ?? '');
  }

  function onSaveGift(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord || !giftName.trim()) return;
    const payload = {
      gift: giftName.trim(),
      evidence: giftEvidence.trim() || undefined,
      notes: giftNotes.trim() || undefined,
    };
    if (giftEditId) {
      const updated = peopleService.updateSpiritualGift(giftEditId, payload);
      if (!updated) {
        toast({ title: 'Spiritual gift not found', tone: 'danger' });
        return;
      }
      toast({ title: 'Spiritual gift updated', tone: 'success' });
    } else {
      peopleService.addSpiritualGift({
        personId: id,
        ...payload,
      });
      toast({ title: 'Spiritual gift saved', tone: 'success' });
    }
    clearGiftForm();
    refresh();
  }

  function onAddDoc(e: FormEvent) {
    e.preventDefault();
    if (!id || !gate() || !canViewFullRecord || !docLabel) return;
    try {
      peopleService.addDocument({
        personId: id,
        label: docLabel,
        kind: docKind,
        issuedOn: docIssued || undefined,
        note: docNote || undefined,
      });
      setDocLabel('');
      setDocNote('');
      toast({ title: 'Document meta saved', tone: 'success' });
      refresh();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Could not save document',
        tone: 'danger',
      });
    }
  }

  function onUploadDocument(docId: string, file: File | undefined) {
    if (!file || !gate()) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const updated = peopleService.updateDocument(docId, {
          fileName: file.name,
          fileMime: file.type || 'application/octet-stream',
          fileDataUrl: String(reader.result ?? ''),
        });
        if (!updated) {
          toast({ title: 'Document not found', tone: 'danger' });
          return;
        }
        toast({ title: 'Document uploaded', tone: 'success' });
        refresh();
      } catch (err) {
        toast({
          title: err instanceof Error ? err.message : 'Upload failed',
          tone: 'danger',
        });
      }
    };
    reader.onerror = () => {
      toast({ title: 'Could not read file', tone: 'danger' });
    };
    reader.readAsDataURL(file);
  }

  const family = id ? peopleService.familyLinks(id) : [];
  const timeline = id ? peopleService.timeline(id) : [];
  const documents = id ? peopleService.documents(id) : [];
  const employment = id ? peopleService.employment(id) : [];
  const education = id ? peopleService.education(id) : [];
  const talents = id ? peopleService.talents(id) : [];
  const spiritualGifts = id ? peopleService.spiritualGifts(id) : [];

  const tabs: { id: Tab; label: string; needsFull?: boolean }[] = [
    { id: 'identity', label: 'Identity' },
    { id: 'baptism', label: 'Baptism', needsFull: true },
    { id: 'marriage', label: 'Marriage', needsFull: true },
    { id: 'family', label: 'Family', needsFull: true },
    { id: 'history', label: 'History', needsFull: true },
    { id: 'employment', label: 'Employment', needsFull: true },
    { id: 'education', label: 'Education', needsFull: true },
    { id: 'talents', label: 'Talents & skills', needsFull: true },
    { id: 'gifts', label: 'Spiritual gifts', needsFull: true },
    { id: 'docs', label: 'Documents', needsFull: true },
  ];

  return (
    <div className="stack">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>
              {isEdit ? `Edit · ${existing?.fullName}` : 'Add person'}
            </h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Pastoral 360 fields — household family is record only
            </p>
          </div>
          <Link
            to={id ? `/people/${id}` : '/people'}
            className="btn ghost"
          >
            {id ? 'View profile' : 'Cancel'}
          </Link>
        </div>
        <div className="tabs" role="tablist" aria-label="Person sections" style={{ marginTop: '0.75rem' }}>
          {tabs
            .filter((t) => !t.needsFull || (isEdit && canViewFullRecord))
            .map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
        </div>
      </div>

      {tab === 'identity' && (
        <form className="panel stack" onSubmit={onSaveIdentity}>
          <div className="photo-field">
            <button
              type="button"
              className="photo-trigger"
              aria-label={photoUrl ? 'Edit photo' : 'Choose photo'}
              title={photoUrl ? 'Edit photo' : 'Choose photo'}
              onClick={() =>
                photoUrl
                  ? void openPhotoEditor()
                  : document.getElementById('photo-input')?.click()
              }
            >
              <PersonAvatar
                person={{ fullName: fullName || '?', preferredName, photoUrl }}
                size={72}
              />
            </button>
            <div className="stack" style={{ gap: '0.35rem' }}>
              <strong>Profile picture</strong>
              <div className="row">
                <label className="btn secondary sm" htmlFor="photo-input">
                  {photoUrl ? 'Change photo' : 'Choose photo'}
                </label>
                {photoUrl ? (
                  <>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => void openPhotoEditor()}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setPhotoUrl(undefined);
                        setPhotoSource(undefined);
                        setPhotoRemoved(true);
                      }}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
              <input
                id="photo-input"
                type="file"
                accept="image/*"
                className="visually-hidden"
                onChange={(e) => {
                  void onPickPhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Saved with the person when you press Save.
              </span>
            </div>
          </div>
          {photoEditing ? (
            <PhotoEditor
              source={photoEditing}
              onCancel={() => setPhotoEditing(null)}
              onApply={(r) => {
                setPhotoUrl(r.photoUrl);
                setPhotoSource(r.photoSource);
                setPhotoRemoved(false);
                setPhotoEditing(null);
              }}
            />
          ) : null}
          <TextField
            label="Full name"
            name="fullName"
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Jean Baptiste Uwimana"
            required
          />
          <TextField
            label="Preferred name"
            name="preferredName"
            id="preferredName"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder="e.g. Jean"
          />
          <div className="grid-2">
            <TextField
              label="Phone"
              name="phone"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0788 123 456"
            />
            <TextField
              label="Email"
              name="email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. jean@example.com"
            />
          </div>
          <div className="grid-2">
            <TextField
              label="Date of birth"
              name="dob"
              id="dob"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
            <SelectField
              label="Gender"
              name="gender"
              id="gender"
              value={gender}
              onChange={(e) =>
                setGender(e.target.value as Person['gender'] | '')
              }
            >
              <option value="">—</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </SelectField>
          </div>
          <TextField
            label="Address"
            name="address"
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. KG 15 Ave, Kacyiru, Kigali"
          />
          <div className="grid-2">
            <TextField
              label="National ID"
              name="nid"
              id="nid"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="e.g. 1199080123456789"
            />
            <TextField
              label="Joined church"
              name="joined"
              id="joined"
              type="date"
              value={joinedChurchOn}
              onChange={(e) => setJoinedChurchOn(e.target.value)}
            />
          </div>
          <SelectField
            label="Status"
            name="status"
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Person['status'])}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="VISITOR">Visitor</option>
          </SelectField>
          {canViewFullRecord && (
            <TextAreaField
              label="Pastoral notes"
              name="notes"
              id="notes"
              value={pastoralNotes}
              onChange={(e) => setPastoralNotes(e.target.value)}
              placeholder="e.g. New visitor referred by cell leader…"
              rows={3}
            />
          )}
          <button type="submit" className="btn">
            Save identity
          </button>
        </form>
      )}

      {tab === 'baptism' && id && canViewFullRecord && (
        <form className="panel stack" onSubmit={onSaveBaptism}>
          <p className="muted" style={{ marginTop: 0 }}>
            One baptism record per person (upsert). Mode is immersion only.
            Church membership is added automatically only when place is ADEPR
            Kacyiru.
          </p>
          <TextField
            label="Baptized on"
            name="bapOn"
            id="bapOn"
            type="date"
            value={bapOn}
            onChange={(e) => setBapOn(e.target.value)}
            required
          />
          <TextField
            label="Place"
            name="bapPlace"
            id="bapPlace"
            value={bapPlace}
            onChange={(e) => setBapPlace(e.target.value)}
            placeholder="e.g. ADEPR Kacyiru"
            hint="Type ADEPR Kacyiru to grant church membership"
          />
          <div className="grid-2">
            <TextField
              label="Minister"
              name="bapMinister"
              id="bapMinister"
              value={bapMinister}
              onChange={(e) => setBapMinister(e.target.value)}
              placeholder="e.g. Pst. Habimana"
            />
            <TextField
              label="Certificate ref"
              name="bapCert"
              id="bapCert"
              value={bapCert}
              onChange={(e) => setBapCert(e.target.value)}
              placeholder="e.g. BAP-2024-0142"
            />
          </div>
          <TextAreaField
            label="Notes"
            name="bapNotes"
            id="bapNotes"
            value={bapNotes}
            onChange={(e) => setBapNotes(e.target.value)}
            rows={2}
          />
          <button type="submit" className="btn">
            Save baptism
          </button>
        </form>
      )}

      {tab === 'marriage' && id && canViewFullRecord && (
        <form className="panel stack" onSubmit={onSaveMarriage}>
          <TextField
            label="Spouse name"
            name="marSpouse"
            id="marSpouse"
            value={marSpouse}
            onChange={(e) => setMarSpouse(e.target.value)}
            placeholder="e.g. Marie Claire Mukamana"
          />
          <div className="grid-2">
            <TextField
              label="Married on"
              name="marOn"
              id="marOn"
              type="date"
              value={marOn}
              onChange={(e) => setMarOn(e.target.value)}
              required
            />
            <SelectField
              label="Status"
              name="marStatus"
              id="marStatus"
              value={marStatus}
              onChange={(e) =>
                setMarStatus(
                  e.target.value as
                    | 'MARRIED'
                    | 'WIDOWED'
                    | 'DIVORCED'
                    | 'SEPARATED',
                )
              }
            >
              <option value="MARRIED">Married</option>
              <option value="WIDOWED">Widowed</option>
              <option value="DIVORCED">Divorced</option>
              <option value="SEPARATED">Separated</option>
            </SelectField>
          </div>
          <div className="grid-2">
            <TextField
              label="Place"
              name="marPlace"
              id="marPlace"
              value={marPlace}
              onChange={(e) => setMarPlace(e.target.value)}
              placeholder="e.g. ADEPR Kacyiru"
            />
            <TextField
              label="Certificate ref"
              name="marCert"
              id="marCert"
              value={marCert}
              onChange={(e) => setMarCert(e.target.value)}
            />
          </div>
          <TextAreaField
            label="Notes"
            name="marNotes"
            id="marNotes"
            value={marNotes}
            onChange={(e) => setMarNotes(e.target.value)}
            rows={2}
          />
          <button type="submit" className="btn">
            Save marriage
          </button>
        </form>
      )}

      {tab === 'family' && id && canViewFullRecord && (
        <div className="stack">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Household links</h3>
            <p className="muted">Record only — no visit workflows</p>
            {family.length === 0 ? (
              <p className="muted">No links</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Relation</th>
                    <th>Person</th>
                    <th>Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {family.map((l) => (
                    <tr key={l.id}>
                      <td>{l.displayRelation}</td>
                      <td>{l.otherName}</td>
                      <td>{l.notes ?? '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => {
                            if (!gate()) return;
                            peopleService.removeFamilyLink(l.id);
                            toast({ title: 'Link removed', tone: 'success' });
                            refresh();
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <form className="panel stack" onSubmit={onAddFamily}>
            <h3 style={{ margin: 0 }}>Add link</h3>
            <SelectField
              label="Related person"
              name="famRel"
              id="famRel"
              value={famRelated}
              onChange={(e) => setFamRelated(e.target.value)}
              required
            >
              <option value="">— select —</option>
              {peopleOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Relation"
              name="famRelation"
              id="famRelation"
              value={famRelation}
              onChange={(e) =>
                setFamRelation(e.target.value as FamilyRelation)
              }
            >
              <option value="SPOUSE">Spouse</option>
              <option value="CHILD">Child</option>
              <option value="PARENT">Parent</option>
              <option value="SIBLING">Sibling</option>
              <option value="GUARDIAN">Guardian</option>
              <option value="OTHER">Other</option>
            </SelectField>
            <TextField
              label="Notes"
              name="famNotes"
              id="famNotes"
              value={famNotes}
              onChange={(e) => setFamNotes(e.target.value)}
            />
            <button type="submit" className="btn">
              Add family link
            </button>
          </form>
        </div>
      )}

      {tab === 'history' && id && canViewFullRecord && (
        <div className="stack">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>History</h3>
            {timeline.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No history events.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {timeline.map((ev) => (
                  <li key={ev.id} style={{ marginBottom: '0.45rem' }}>
                    <strong>{ev.at}</strong> · {ev.kind} · {ev.title}
                    {ev.detail ? (
                      <div className="muted">{ev.detail}</div>
                    ) : null}
                    <div
                      className="row"
                      style={{
                        display: 'inline-flex',
                        gap: '0.35rem',
                        marginLeft: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => beginEditHistory(ev)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => {
                          peopleService.removeTimelineEvent(ev.id);
                          if (tlEditId === ev.id) clearHistoryForm();
                          toast({ title: 'History event removed', tone: 'success' });
                          refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="panel stack" onSubmit={onSaveHistory}>
            <h3 style={{ margin: 0 }}>
              {tlEditId ? 'Edit event' : 'Add event'}
            </h3>
            <div className="grid-2">
              <TextField
                label="Date"
                name="tlAt"
                id="tlAt"
                type="date"
                value={tlAt}
                onChange={(e) => setTlAt(e.target.value)}
                required
              />
              <SelectField
                label="Kind"
                name="tlKind"
                id="tlKind"
                value={tlKind}
                onChange={(e) =>
                  setTlKind(e.target.value as PersonTimelineEvent['kind'])
                }
              >
                <option value="NOTE">Note</option>
                <option value="MEMBERSHIP">Membership</option>
                <option value="BAPTISM">Baptism</option>
                <option value="MARRIAGE">Marriage</option>
                <option value="MINISTRY">Ministry</option>
                <option value="DISCIPLINE">Discipline</option>
                <option value="OTHER">Other</option>
              </SelectField>
            </div>
            <TextField
              label="Title"
              name="tlTitle"
              id="tlTitle"
              value={tlTitle}
              onChange={(e) => setTlTitle(e.target.value)}
              required
            />
            <TextAreaField
              label="Detail"
              name="tlDetail"
              id="tlDetail"
              value={tlDetail}
              onChange={(e) => setTlDetail(e.target.value)}
              rows={2}
            />
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn">
                {tlEditId ? 'Save changes' : 'Add history event'}
              </button>
              {tlEditId ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={clearHistoryForm}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </div>
      )}

      {tab === 'employment' && id && canViewFullRecord && (
        <div className="stack">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Employment</h3>
            {employment.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No employment on file.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {employment.map((job) => (
                  <li key={job.id} style={{ marginBottom: '0.45rem' }}>
                    <strong>{job.title ?? 'Role'}</strong> · {job.employer}{' '}
                    <span className="muted">({job.status})</span>
                    {job.sector ? (
                      <span className="muted"> · {job.sector}</span>
                    ) : null}
                    <div
                      className="row"
                      style={{
                        display: 'inline-flex',
                        gap: '0.35rem',
                        marginLeft: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => beginEditEmployment(job)}
                      >
                        Edit
                      </button>
                      {job.status === 'CURRENT' ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => {
                            peopleService.updateEmployment(job.id, {
                              status: 'FORMER',
                              endedOn:
                                job.endedOn ||
                                new Date().toISOString().slice(0, 10),
                            });
                            if (empEditId === job.id) {
                              setEmpStatus('FORMER');
                              setEmpEnded(
                                job.endedOn ||
                                  new Date().toISOString().slice(0, 10),
                              );
                            }
                            toast({ title: 'Marked as former', tone: 'success' });
                            refresh();
                          }}
                        >
                          Mark former
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => {
                          peopleService.removeEmployment(job.id);
                          if (empEditId === job.id) clearEmploymentForm();
                          toast({ title: 'Employment removed', tone: 'success' });
                          refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="panel stack" onSubmit={onSaveEmployment}>
            <h3 style={{ margin: 0 }}>
              {empEditId ? 'Edit employment' : 'Add employment'}
            </h3>
            <TextField
              label="Employer"
              value={empEmployer}
              onChange={(e) => setEmpEmployer(e.target.value)}
              required
            />
            <div className="grid-2">
              <TextField
                label="Job title"
                value={empTitle}
                onChange={(e) => setEmpTitle(e.target.value)}
              />
              <TextField
                label="Sector"
                value={empSector}
                onChange={(e) => setEmpSector(e.target.value)}
              />
            </div>
            <div className="grid-2">
              <SelectField
                label="Status"
                value={empStatus}
                onChange={(e) =>
                  setEmpStatus(
                    e.target.value as PersonEmploymentRecord['status'],
                  )
                }
              >
                <option value="CURRENT">Current</option>
                <option value="FORMER">Former</option>
              </SelectField>
              <TextField
                label="Started"
                type="date"
                value={empStarted}
                onChange={(e) => setEmpStarted(e.target.value)}
              />
            </div>
            <div className="grid-2">
              <TextField
                label="Ended"
                type="date"
                value={empEnded}
                onChange={(e) => setEmpEnded(e.target.value)}
                hint="Set when marking a role as former."
              />
              <TextField
                label="Notes"
                value={empNotes}
                onChange={(e) => setEmpNotes(e.target.value)}
              />
            </div>
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn">
                {empEditId ? 'Save changes' : 'Add employment'}
              </button>
              {empEditId ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={clearEmploymentForm}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </div>
      )}

      {tab === 'education' && id && canViewFullRecord && (
        <div className="stack">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Education</h3>
            {education.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No education on file.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {education.map((ed) => (
                  <li key={ed.id} style={{ marginBottom: '0.45rem' }}>
                    <strong>{ed.institution}</strong>
                    {ed.level ? ` · ${ed.level}` : ''}
                    {ed.field ? ` · ${ed.field}` : ''}{' '}
                    <span className="muted">({ed.status})</span>
                    <div
                      className="row"
                      style={{
                        display: 'inline-flex',
                        gap: '0.35rem',
                        marginLeft: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => beginEditEducation(ed)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => {
                          peopleService.removeEducation(ed.id);
                          if (eduEditId === ed.id) clearEducationForm();
                          toast({ title: 'Education removed', tone: 'success' });
                          refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="panel stack" onSubmit={onSaveEducation}>
            <h3 style={{ margin: 0 }}>
              {eduEditId ? 'Edit education' : 'Add education'}
            </h3>
            <TextField
              label="Institution"
              value={eduInstitution}
              onChange={(e) => setEduInstitution(e.target.value)}
              required
            />
            <div className="grid-2">
              <TextField
                label="Level"
                value={eduLevel}
                onChange={(e) => setEduLevel(e.target.value)}
                placeholder="Bachelor, Diploma…"
              />
              <TextField
                label="Field of study"
                value={eduField}
                onChange={(e) => setEduField(e.target.value)}
              />
            </div>
            <div className="grid-2">
              <SelectField
                label="Status"
                value={eduStatus}
                onChange={(e) =>
                  setEduStatus(
                    e.target.value as PersonEducationRecord['status'],
                  )
                }
              >
                <option value="COMPLETED">Completed</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="INCOMPLETE">Incomplete</option>
              </SelectField>
              <TextField
                label="Started"
                type="date"
                value={eduStarted}
                onChange={(e) => setEduStarted(e.target.value)}
              />
            </div>
            <div className="grid-2">
              <TextField
                label="Ended / graduated"
                type="date"
                value={eduEnded}
                onChange={(e) => setEduEnded(e.target.value)}
              />
              <TextField
                label="Notes"
                value={eduNotes}
                onChange={(e) => setEduNotes(e.target.value)}
              />
            </div>
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn">
                {eduEditId ? 'Save changes' : 'Add education'}
              </button>
              {eduEditId ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={clearEducationForm}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </div>
      )}

      {tab === 'talents' && id && canViewFullRecord && (
        <div className="stack">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Talents and skills</h3>
            {talents.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No talents or skills on file.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {talents.map((t) => (
                  <li key={t.id} style={{ marginBottom: '0.45rem' }}>
                    {t.kind} · <strong>{t.name}</strong>
                    {t.proficiency ? ` · ${t.proficiency}` : ''}
                    <div
                      className="row"
                      style={{
                        display: 'inline-flex',
                        gap: '0.35rem',
                        marginLeft: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => beginEditTalent(t)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => {
                          peopleService.removeTalentSkill(t.id);
                          if (talEditId === t.id) clearTalentForm();
                          toast({ title: 'Removed', tone: 'success' });
                          refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="panel stack" onSubmit={onSaveTalent}>
            <h3 style={{ margin: 0 }}>
              {talEditId ? 'Edit talent or skill' : 'Add talent or skill'}
            </h3>
            <div className="grid-2">
              <SelectField
                label="Kind"
                value={talKind}
                onChange={(e) =>
                  setTalKind(e.target.value as PersonTalentSkill['kind'])
                }
              >
                <option value="TALENT">Talent</option>
                <option value="SKILL">Skill</option>
              </SelectField>
              <SelectField
                label="Proficiency"
                value={talProficiency}
                onChange={(e) =>
                  setTalProficiency(
                    e.target.value as PersonTalentSkill['proficiency'] | '',
                  )
                }
              >
                <option value="">—</option>
                <option value="BEGINNER">Beginner</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
                <option value="EXPERT">Expert</option>
              </SelectField>
            </div>
            <TextField
              label="Name"
              value={talName}
              onChange={(e) => setTalName(e.target.value)}
              required
            />
            <TextField
              label="Notes"
              value={talNotes}
              onChange={(e) => setTalNotes(e.target.value)}
            />
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn">
                {talEditId ? 'Save changes' : 'Add'}
              </button>
              {talEditId ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={clearTalentForm}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </div>
      )}

      {tab === 'gifts' && id && canViewFullRecord && (
        <div className="stack">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Spiritual gifts</h3>
            {spiritualGifts.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No spiritual gifts on file.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {spiritualGifts.map((g) => (
                  <li key={g.id} style={{ marginBottom: '0.45rem' }}>
                    <strong>{g.gift}</strong>
                    {g.evidence ? (
                      <div className="muted">{g.evidence}</div>
                    ) : null}
                    <div
                      className="row"
                      style={{
                        display: 'inline-flex',
                        gap: '0.35rem',
                        marginTop: '0.25rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => beginEditGift(g)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => {
                          peopleService.removeSpiritualGift(g.id);
                          if (giftEditId === g.id) clearGiftForm();
                          toast({ title: 'Gift removed', tone: 'success' });
                          refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form className="panel stack" onSubmit={onSaveGift}>
            <h3 style={{ margin: 0 }}>
              {giftEditId ? 'Edit spiritual gift' : 'Add spiritual gift'}
            </h3>
            <TextField
              label="Gift"
              value={giftName}
              onChange={(e) => setGiftName(e.target.value)}
              required
              placeholder="Teaching, hospitality, music…"
            />
            <TextAreaField
              label="Evidence"
              value={giftEvidence}
              onChange={(e) => setGiftEvidence(e.target.value)}
              rows={2}
            />
            <TextField
              label="Notes"
              value={giftNotes}
              onChange={(e) => setGiftNotes(e.target.value)}
            />
            <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn">
                {giftEditId ? 'Save changes' : 'Add gift'}
              </button>
              {giftEditId ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={clearGiftForm}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </div>
      )}

      {tab === 'docs' && id && canViewFullRecord && (
        <div className="stack">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Documents</h3>
            <p className="muted">
              Add metadata first, then upload the file. You can view the file
              after it is uploaded.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Kind</th>
                  <th>Issued</th>
                  <th>Note</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>{d.label}</td>
                    <td>{d.kind}</td>
                    <td>{d.issuedOn ?? '—'}</td>
                    <td>{d.note ?? '—'}</td>
                    <td>
                      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                        {d.fileDataUrl ? (
                          <a
                            className="btn ghost sm"
                            href={d.fileDataUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View{d.fileName ? ` · ${d.fileName}` : ''}
                          </a>
                        ) : (
                          <span className="muted">No file yet</span>
                        )}
                        <label className="btn sm ghost" style={{ cursor: 'pointer' }}>
                          {d.fileDataUrl ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              onUploadDocument(d.id, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="panel stack" onSubmit={onAddDoc}>
            <h3 style={{ margin: 0 }}>Add document meta</h3>
            <TextField
              label="Label"
              name="docLabel"
              id="docLabel"
              value={docLabel}
              onChange={(e) => setDocLabel(e.target.value)}
              placeholder="e.g. Baptism certificate"
              required
            />
            <div className="grid-2">
              <SelectField
                label="Kind"
                name="docKind"
                id="docKind"
                value={docKind}
                onChange={(e) =>
                  setDocKind(
                    e.target.value as
                      | 'CERTIFICATE'
                      | 'ID'
                      | 'LETTER'
                      | 'OTHER',
                  )
                }
              >
                <option value="CERTIFICATE">Certificate</option>
                <option value="ID">ID</option>
                <option value="LETTER">Letter</option>
                <option value="OTHER">Other</option>
              </SelectField>
              <TextField
                label="Issued on"
                name="docIssued"
                id="docIssued"
                type="date"
                value={docIssued}
                onChange={(e) => setDocIssued(e.target.value)}
              />
            </div>
            <TextField
              label="Note"
              name="docNote"
              id="docNote"
              value={docNote}
              onChange={(e) => setDocNote(e.target.value)}
              placeholder="e.g. Scanned copy from parish office"
            />
            <button type="submit" className="btn">
              Add document
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
