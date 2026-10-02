import { useEffect, useRef, useState } from 'react';
import type { Person } from '../../domain/types';
import { fileToSourceDataUrl } from '../../lib/photo';
import { deleteSource, loadSource, saveSource } from '../../lib/photoStore';
import { useToast } from '../ui/Toast';
import { PersonAvatar } from './PersonAvatar';
import { PhotoEditor } from './PhotoEditor';

export type PhotoChange = { photoUrl: string | undefined };

/**
 * The avatar on a profile. Click it to see the photo larger; people who can
 * edit the record can also edit, change or remove it from there.
 */
export function ProfilePhoto({
  person,
  canEdit,
  onChange,
  size = 84,
}: {
  person: Person;
  canEdit: boolean;
  onChange: (change: PhotoChange) => void;
  size?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState(false);
  const [editSource, setEditSource] = useState<string | null>(null);
  const { push: toast } = useToast();
  const [hiRes, setHiRes] = useState<string | null>(null);

  // Show the full-quality copy when the photo is opened.
  useEffect(() => {
    if (!viewing) return;
    let live = true;
    void loadSource(person.id).then((v) => {
      if (live) setHiRes(v);
    });
    return () => {
      live = false;
    };
  }, [viewing, person.id, person.photoUrl]);

  async function startEdit() {
    setEditSource(
      (await loadSource(person.id)) ??
        person.photoSource ??
        person.photoUrl ??
        null,
    );
    setViewing(false);
  }

  const hasPhoto = Boolean(person.photoUrl);
  const clickable = hasPhoto || canEdit;

  async function onPick(file: File | undefined) {
    if (!file) return;
    try {
      setEditSource(await fileToSourceDataUrl(file));
      setViewing(false);
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : 'Could not use that image',
        tone: 'danger',
      });
    }
  }

  function onAvatarClick() {
    if (hasPhoto) setViewing(true);
    else if (canEdit) fileRef.current?.click();
  }

  return (
    <>
      {clickable ? (
        <button
          type="button"
          className="photo-trigger"
          onClick={onAvatarClick}
          aria-label={hasPhoto ? 'View photo' : 'Add a photo'}
          title={hasPhoto ? 'View photo' : 'Add a photo'}
        >
          <PersonAvatar person={person} size={size} />
        </button>
      ) : (
        <PersonAvatar person={person} size={size} />
      )}

      {canEdit ? (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          aria-label="Choose photo"
          onChange={(e) => {
            void onPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      ) : null}

      {viewing && person.photoUrl ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewing(false);
          }}
        >
          <div
            className="modal photo-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={`Photo of ${person.fullName}`}
          >
            <img
              className="pv-image"
              src={hiRes ?? person.photoSource ?? person.photoUrl}
              alt={person.fullName}
            />
            <p className="pv-name">{person.fullName}</p>
            <div className="modal-actions">
              {canEdit ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void startEdit()}
                  >
                    Edit photo
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Change photo
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      void deleteSource(person.id);
                      setHiRes(null);
                      onChange({ photoUrl: undefined });
                      setViewing(false);
                    }}
                  >
                    Remove
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn secondary"
                onClick={() => setViewing(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editSource ? (
        <PhotoEditor
          source={editSource}
          onCancel={() => setEditSource(null)}
          onApply={(r) => {
            void saveSource(person.id, r.photoSource);
            setHiRes(r.photoSource);
            onChange({ photoUrl: r.photoUrl });
            setEditSource(null);
          }}
        />
      ) : null}
    </>
  );
}
