import { type FormEvent, useState } from 'react';
import { Drawer } from './ui/Drawer';
import {
  requiredDeliveryOpen,
  type DeliveryItemKind,
  type DeliveryItemTier,
} from '../domain/stewardship';
import type { MissionStewardKind } from '../services/missionService';
import { missionService } from '../services';

type Props = {
  kind: MissionStewardKind;
  id: string;
  canEdit: boolean;
  /** Opens close-out drawer from parent End / Mark DONE buttons. */
  closeOpen?: boolean;
  onCloseOpenChange?: (open: boolean) => void;
  personId: string;
  onChanged: () => void;
  /** Extra context for project task soft-block in close form. */
  openTaskCount?: number;
};

/** What has to be delivered, and the close-out report. Money lives in Money. */
export function DeliveryPanel({
  kind,
  id,
  canEdit,
  closeOpen = false,
  onCloseOpenChange,
  personId,
  onChanged,
  openTaskCount = 0,
}: Props) {
  const steward = missionService.stewardshipOf(kind, id) ?? {};
  const live =
    kind === 'PROGRAM'
      ? missionService.getProgram(id)
      : missionService.getProject(id);
  const isClosing = live?.status === 'CLOSING';
  const closed = !!steward.closeout;
  const openRequired = requiredDeliveryOpen(steward);
  const needsForce = openRequired.length > 0 || openTaskCount > 0;

  const [delTitle, setDelTitle] = useState('');
  const [delKind, setDelKind] = useState<DeliveryItemKind>('ACTIVITY');
  const [delTier, setDelTier] = useState<DeliveryItemTier>('PLANNED');

  const [waiveId, setWaiveId] = useState<string | null>(null);
  const [waiveNote, setWaiveNote] = useState('');

  const [workSummary, setWorkSummary] = useState('');
  const [narrative, setNarrative] = useState('');
  const [forceClose, setForceClose] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [localMsg, setLocalMsg] = useState('');

  function addDelivery(e: FormEvent) {
    e.preventDefault();
    const r = missionService.addDeliveryItem(kind, id, {
      kind: delKind,
      tier: delTier,
      title: delTitle,
    });
    setLocalMsg(r.ok ? 'Delivery item added' : (r.reason ?? 'Failed'));
    if (r.ok) setDelTitle('');
    onChanged();
  }

  function markDone(itemId: string) {
    missionService.setDeliveryItemStatus(kind, id, itemId, 'DONE');
    setLocalMsg('Marked done');
    onChanged();
  }

  function submitWaive(e: FormEvent) {
    e.preventDefault();
    if (!waiveId) return;
    const r = missionService.setDeliveryItemStatus(kind, id, waiveId, 'WAIVED', {
      waiveNote,
      waivedByPersonId: personId,
    });
    setLocalMsg(r.ok ? 'Waived' : (r.reason ?? 'Failed'));
    if (r.ok) {
      setWaiveId(null);
      setWaiveNote('');
    }
    onChanged();
  }

  function submitClose(e: FormEvent) {
    e.preventDefault();
    if (!workSummary.trim()) {
      setLocalMsg('A summary of the work is required');
      return;
    }
    if (needsForce && !forceClose) {
      setLocalMsg('Resolve required delivery / open tasks, or check force close');
      return;
    }
    if (needsForce && forceClose && forceReason.trim().length < 8) {
      setLocalMsg('Force close requires a reason (at least 8 characters)');
      return;
    }
    const closeoutBase = {
      closedByPersonId: personId,
      workSummary: workSummary.trim(),
      narrative: narrative.trim() || undefined,
      forceReason: needsForce && forceClose ? forceReason.trim() : undefined,
    };
    const r =
      kind === 'PROGRAM'
        ? missionService.endProgram(id, {
            closeout: closeoutBase,
            forceClose,
            forceReason: needsForce && forceClose ? forceReason.trim() : undefined,
          })
        : missionService.completeProject(id, {
            closeout: closeoutBase,
            forceClose,
            forceReason: needsForce && forceClose ? forceReason.trim() : undefined,
            outcomeNote: narrative.trim() || undefined,
          });
    setLocalMsg(r.ok ? 'Closed with a close-out report' : (r.reason ?? 'Failed'));
    if (r.ok) {
      onCloseOpenChange?.(false);
      setForceClose(false);
      setForceReason('');
    }
    onChanged();
  }

  const byTier = (tier: DeliveryItemTier) =>
    (steward?.deliveryItems ?? []).filter((d) => d.tier === tier);

  return (
    <div className="stack stewardship-panel">
      {isClosing && !closed && (
        <div className="steward-banner warn">
          CLOSING phase — finish the required delivery and write the close-out
          report below.
        </div>
      )}

      {localMsg && <p className="badge">{localMsg}</p>}

      <div className="panel">
        <h3>Delivery</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Required defines integrity; planned is this season; possible is
          parking lot. Close needs all required done or waived.
        </p>
        {openRequired.length > 0 && !closed && (
          <p className="steward-banner warn">
            {openRequired.length} required item(s) still open — blocks close
            unless waived or forced.
          </p>
        )}
        {(['REQUIRED', 'PLANNED', 'POSSIBLE'] as DeliveryItemTier[]).map(
          (tier) => {
            const items = byTier(tier);
            return (
              <div key={tier} style={{ marginTop: '0.75rem' }}>
                <h4 style={{ margin: '0 0 0.35rem' }}>
                  {tier} ({items.length})
                </h4>
                {items.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    None
                  </p>
                ) : (
                  <ul className="steward-list">
                    {items.map((d) => (
                      <li key={d.id}>
                        <div>
                          <strong>{d.title}</strong>{' '}
                          <span className="muted">
                            · {d.kind} · {d.status}
                          </span>
                          {d.waiveNote && (
                            <span className="muted"> — {d.waiveNote}</span>
                          )}
                        </div>
                        {canEdit && !closed && d.status === 'TODO' && (
                          <div className="row">
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => markDone(d.id)}
                            >
                              Done
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => setWaiveId(d.id)}
                            >
                              Waive
                            </button>
                            {tier === 'POSSIBLE' && (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => {
                                  missionService.promoteDeliveryItem(
                                    kind,
                                    id,
                                    d.id,
                                  );
                                  setLocalMsg('Promoted to PLANNED');
                                  onChanged();
                                }}
                              >
                                Promote → planned
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          },
        )}

        {canEdit && !closed && (
          <form className="row" style={{ marginTop: '0.75rem' }} onSubmit={addDelivery}>
            <select
              value={delTier}
              onChange={(e) => setDelTier(e.target.value as DeliveryItemTier)}
            >
              <option value="REQUIRED">Required</option>
              <option value="PLANNED">Planned</option>
              <option value="POSSIBLE">Possible</option>
            </select>
            <select
              value={delKind}
              onChange={(e) => setDelKind(e.target.value as DeliveryItemKind)}
            >
              <option value="ACTIVITY">Activity</option>
              <option value="EVENT">Event</option>
            </select>
            <input
              placeholder="Title"
              value={delTitle}
              onChange={(e) => setDelTitle(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn ghost" disabled={!delTitle.trim()}>
              Add
            </button>
          </form>
        )}
      </div>

      {steward?.closeout && (
        <div className="panel">
          <h3>Close-out report</h3>
          <p>
            <strong>Work:</strong> {steward.closeout.workSummary}
          </p>
          {steward.closeout.narrative && (
            <p>
              <strong>Narrative:</strong> {steward.closeout.narrative}
            </p>
          )}
        </div>
      )}

      <Drawer
        open={!!waiveId}
        title="Waive required / planned item"
        onClose={() => setWaiveId(null)}
      >
        <form className="stack" onSubmit={submitWaive}>
          <div className="field">
            <label>Reason (required)</label>
            <textarea
              rows={3}
              value={waiveNote}
              onChange={(e) => setWaiveNote(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn">
            Record waiver
          </button>
        </form>
      </Drawer>

      <Drawer
        open={closeOpen}
        title={kind === 'PROGRAM' ? 'End program — close-out' : 'Mark DONE — close-out'}
        onClose={() => onCloseOpenChange?.(false)}
        wide
      >
        <form className="stack" onSubmit={submitClose}>
          <p className="muted" style={{ marginTop: 0 }}>
            Required delivery must be done or waived. Write a short, honest
            summary of what was done.
          </p>
          {openRequired.length > 0 && (
            <div className="steward-banner warn">
              {openRequired.length} required still open:{' '}
              {openRequired.map((d) => d.title).join(', ')}
            </div>
          )}
          {openTaskCount > 0 && (
            <div className="steward-banner warn">
              {openTaskCount} open task(s) linked to this project.
            </div>
          )}
          <div className="field">
            <label>Work summary (planned vs done)</label>
            <textarea
              rows={2}
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Short narrative (optional)</label>
            <textarea
              rows={2}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
            />
          </div>
          {needsForce && (
            <div className="stack" style={{ gap: '0.5rem' }}>
              <label className="row">
                <input
                  type="checkbox"
                  checked={forceClose}
                  onChange={(e) => setForceClose(e.target.checked)}
                />
                Force close despite required delivery / open tasks
              </label>
              {forceClose && (
                <div className="field">
                  <label>Force reason (required)</label>
                  <textarea
                    rows={2}
                    value={forceReason}
                    onChange={(e) => setForceReason(e.target.value)}
                    placeholder="Why are you closing with open items?"
                    required
                  />
                </div>
              )}
            </div>
          )}
          <div className="row">
            <button type="submit" className="btn">
              {kind === 'PROGRAM' ? 'End with report' : 'Mark DONE with report'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => onCloseOpenChange?.(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
