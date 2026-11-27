import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Lock, Trash2, X } from 'lucide-react';
import { BUILDING_LABELS, ROOM_BLOCK_REASON_PRESETS } from '../constants/labels';
import {
  addDaysISO,
  findConflictForRoomBlock,
  getNightsCount,
  getTodayISO,
  validateRoomBlockInput,
} from '../domain/bookingLogic';
import type {
  Booking,
  Room,
  RoomBlock,
  RoomBlockInput,
} from '../types/domain';
import { SmartDateInput } from './SmartDateInput';

export interface RoomBlockDraftPreset {
  roomId?: string;
  startDate?: string;
  endDate?: string;
}

interface RoomBlockModalProps {
  rooms: Room[];
  bookings: Booking[];
  roomBlocks: RoomBlock[];
  editingBlock: RoomBlock | null;
  preset?: RoomBlockDraftPreset | null;
  onClose: () => void;
  onSubmit: (input: RoomBlockInput, existingBlockId?: string) => Promise<void>;
  onDelete: (blockId: string) => Promise<void>;
}

export function RoomBlockModal({
  rooms,
  bookings,
  roomBlocks,
  editingBlock,
  preset,
  onClose,
  onSubmit,
  onDelete,
}: RoomBlockModalProps) {
  const todayISO = getTodayISO();
  const activeRooms = useMemo(() => rooms.filter((r) => r.isActive), [rooms]);

  const [form, setForm] = useState<RoomBlockInput>(() => {
    if (editingBlock) {
      return {
        roomId: editingBlock.roomId,
        startDate: editingBlock.startDate,
        endDate: editingBlock.endDate,
        reason: editingBlock.reason,
      };
    }
    const start = preset?.startDate || todayISO;
    const end = preset?.endDate || addDaysISO(start, 1);
    return {
      roomId: preset?.roomId || activeRooms[0]?.id || '',
      startDate: start,
      endDate: end,
      reason: ROOM_BLOCK_REASON_PRESETS[0],
    };
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nights = getNightsCount(form.startDate, form.endDate);

  const liveConflict = useMemo(() => {
    if (!form.roomId || nights <= 0) {
      return null;
    }
    return findConflictForRoomBlock(
      form,
      bookings,
      roomBlocks,
      rooms,
      editingBlock?.id
    );
  }, [form, nights, bookings, roomBlocks, rooms, editingBlock?.id]);

  const xinyueRooms = useMemo(
    () => activeRooms.filter((r) => r.building === 'xinyue'),
    [activeRooms]
  );
  const youdeRooms = useMemo(
    () => activeRooms.filter((r) => r.building === 'youde'),
    [activeRooms]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const validationError = validateRoomBlockInput(form);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    if (liveConflict) {
      setErrorMsg(liveConflict);
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit(form, editingBlock?.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '儲存鎖房失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBlock) return;
    try {
      setSubmitting(true);
      await onDelete(editingBlock.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '解除鎖房失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-block-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal-card"
        style={{ maxWidth: 480 }}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={17} style={{ color: 'var(--ink-secondary)' }} />
            <h2
              id="room-block-modal-title"
              style={{ fontSize: 17, fontWeight: 700 }}
            >
              {editingBlock ? '檢視／編輯鎖房' : '鎖房／維修保留'}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="關閉視窗"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
            鎖定後的房型將禁止建立訂房，且不會計入營收或待追訂金清單。
          </p>

          {(errorMsg || liveConflict) && (
            <div className="alert-box alert-danger" role="alert">
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{errorMsg || liveConflict}</span>
            </div>
          )}

          <label className="field-group">
            <span className="field-label">
              <span>
                選擇客房<span className="field-required">*</span>
              </span>
            </span>
            <select
              id="select-block-room"
              className="select"
              value={form.roomId}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, roomId: e.target.value }))
              }
            >
              {xinyueRooms.length > 0 && (
                <optgroup label={BUILDING_LABELS.xinyue}>
                  {xinyueRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.floorLabel}・{r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {youdeRooms.length > 0 && (
                <optgroup label={BUILDING_LABELS.youde}>
                  {youdeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <div className="form-grid-2">
            <div className="field-group">
              <label htmlFor="input-block-start" className="field-label">
                <span>
                  開始日期<span className="field-required">*</span>
                </span>
              </label>
              <SmartDateInput
                id="input-block-start"
                ariaLabel="鎖房開始日期"
                value={form.startDate}
                required
                onChange={(nextStart) => {
                  const safeEnd =
                    getNightsCount(nextStart, form.endDate) <= 0
                      ? addDaysISO(nextStart, 1)
                      : form.endDate;
                  setForm((prev) => ({
                    ...prev,
                    startDate: nextStart,
                    endDate: safeEnd,
                  }));
                }}
              />
            </div>

            <div className="field-group">
              <label htmlFor="input-block-end" className="field-label">
                <span>
                  結束日期（當日可入住）<span className="field-required">*</span>
                </span>
                {nights > 0 && (
                  <span style={{ color: 'var(--accent-pine)', fontWeight: 700 }}>
                    {nights} 晚
                  </span>
                )}
              </label>
              <SmartDateInput
                id="input-block-end"
                ariaLabel="鎖房結束日期"
                value={form.endDate}
                min={addDaysISO(form.startDate, 1)}
                required
                onChange={(nextEnd) =>
                  setForm((prev) => ({ ...prev, endDate: nextEnd }))
                }
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="input-block-reason" className="field-label">
              <span>
                鎖房原因<span className="field-required">*</span>
              </span>
            </label>
            <div className="block-reason-chips">
              {ROOM_BLOCK_REASON_PRESETS.map((presetReason) => (
                <button
                  key={presetReason}
                  type="button"
                  className={`block-reason-chip ${
                    form.reason === presetReason ? 'active' : ''
                  }`}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, reason: presetReason }))
                  }
                >
                  {presetReason}
                </button>
              ))}
            </div>
            <input
              id="input-block-reason"
              type="text"
              className="input"
              placeholder="輸入鎖房原因（例：冷氣清洗、老闆親友留房）"
              value={form.reason}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, reason: e.target.value }))
              }
              required
            />
          </div>
        </div>

        <div
          className="modal-footer"
          style={{
            justifyContent: editingBlock ? 'space-between' : 'flex-end',
          }}
        >
          {editingBlock && (
            <button
              id="btn-delete-room-block"
              type="button"
              className="btn btn-danger-outline"
              disabled={submitting}
              onClick={() => void handleDelete()}
            >
              <Trash2 size={15} />
              解除鎖房
            </button>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={submitting}
              onClick={onClose}
            >
              取消
            </button>
            <button
              id="btn-submit-room-block"
              type="submit"
              className="btn btn-primary"
              disabled={submitting || Boolean(liveConflict)}
            >
              {submitting
                ? '儲存中...'
                : editingBlock
                  ? '更新鎖房'
                  : '確認鎖房'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
