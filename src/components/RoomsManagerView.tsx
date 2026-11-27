import { useState, type FormEvent } from 'react';
import { Edit3, Plus, Trash2, X } from 'lucide-react';
import { BUILDING_LABELS } from '../constants/labels';
import { formatCurrencyTWD } from '../domain/bookingLogic';
import type { BuildingZone, RateTier, Room, RoomInput } from '../types/domain';

interface RoomsManagerViewProps {
  rooms: Room[];
  onSaveRoom: (input: RoomInput, existingRoomId?: string) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
}

const EMPTY_ROOM_INPUT: RoomInput = {
  code: '',
  name: '',
  building: 'xinyue',
  floorLabel: '1F',
  roomType: '',
  standardCapacity: 2,
  maxCapacity: 3,
  standardRate: 2500,
  weekendRate: 3000,
  rateTiers: [],
  connectingRoomId: undefined,
  housekeepingStatus: 'clean',
  sortOrder: 15,
  notes: '',
  isActive: true,
};

export function RoomsManagerView({
  rooms,
  onSaveRoom,
  onDeleteRoom,
}: RoomsManagerViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState<RoomInput>(EMPTY_ROOM_INPUT);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingRoom(null);
    setForm({
      ...EMPTY_ROOM_INPUT,
      sortOrder: rooms.length + 1,
    });
    setModalOpen(true);
  };

  const openEdit = (room: Room) => {
    setEditingRoom(room);
    setForm({
      code: room.code,
      name: room.name,
      building: room.building,
      floorLabel: room.floorLabel,
      roomType: room.roomType,
      standardCapacity: room.standardCapacity,
      maxCapacity: room.maxCapacity,
      standardRate: room.standardRate,
      weekendRate: room.weekendRate,
      rateTiers: room.rateTiers ? room.rateTiers.map((t) => ({ ...t })) : [],
      connectingRoomId: room.connectingRoomId,
      housekeepingStatus: room.housekeepingStatus,
      sortOrder: room.sortOrder,
      notes: room.notes,
      isActive: room.isActive,
    });
    setModalOpen(true);
  };

  const updateTier = (index: number, patch: Partial<RateTier>) => {
    setForm((prev) => {
      const next = [...(prev.rateTiers || [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, rateTiers: next };
    });
  };

  const addTier = () => {
    setForm((prev) => ({
      ...prev,
      rateTiers: [
        ...(prev.rateTiers || []),
        {
          label: '4人入住',
          maxGuests: Math.max(4, prev.maxCapacity),
          standardRate: prev.standardRate + 500,
          weekendRate: prev.weekendRate + 500,
        },
      ],
    }));
  };

  const removeTier = (index: number) => {
    setForm((prev) => ({
      ...prev,
      rateTiers: (prev.rateTiers || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.roomType.trim()) {
      return;
    }
    try {
      setSaving(true);
      const cleanedTiers = (form.rateTiers || []).filter(
        (t) => t.label.trim() && t.maxGuests > 0
      );
      await onSaveRoom(
        {
          ...form,
          code: form.code.trim(),
          name: form.name.trim(),
          roomType: form.roomType.trim(),
          floorLabel: form.floorLabel.trim() || '1F',
          notes: form.notes.trim(),
          rateTiers: cleanedTiers.length > 0 ? cleanedTiers : undefined,
          connectingRoomId: form.connectingRoomId || undefined,
        },
        editingRoom?.id
      );
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (room: Room) => {
    if (window.confirm(`確定要刪除房型「${room.name}」嗎？`)) {
      void onDeleteRoom(room.id);
    }
  };

  const xinyueRooms = rooms.filter((r) => r.building === 'xinyue');
  const youdeRooms = rooms.filter((r) => r.building === 'youde');

  return (
    <section aria-label="房型與房價管理">
      <div className="preno-settings-bar">
        <div style={{ fontSize: 14.5, color: 'var(--ink-secondary)' }}>
          管理中房型：
          <strong className="tabular-nums" style={{ color: 'var(--ink-primary)' }}>
            共 {rooms.length} 間
          </strong>
        </div>

        <button
          id="btn-add-room"
          type="button"
          className="btn btn-primary"
          onClick={openCreate}
        >
          <Plus size={16} />
          新增房型
        </button>
      </div>

      {[
        { title: BUILDING_LABELS.xinyue, list: xinyueRooms },
        { title: BUILDING_LABELS.youde, list: youdeRooms },
      ].map((section) => (
        <div key={section.title} className="preno-room-group">
          <div className="preno-list-section-header">
            {section.title}（{section.list.length} 間）
          </div>

          <div className="preno-flat-list">
            {section.list.map((room) => (
              <div
                key={room.id}
                className={`preno-flat-row preno-room-mgr-row ${
                  room.isActive ? '' : 'is-inactive'
                }`}
              >
                <div className="preno-room-mgr-main">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="preno-room-tag">{room.floorLabel}</span>
                    <strong style={{ fontSize: 15.5 }}>{room.code}</strong>
                    <span style={{ fontSize: 14, color: 'var(--ink-secondary)' }}>
                      {room.name}
                    </span>
                    {!room.isActive && (
                      <span className="pill pill-cancelled">已停用</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 2 }}>
                    標準 {room.standardCapacity} 人（上限 {room.maxCapacity} 人）
                  </div>
                </div>

                <div className="preno-room-mgr-rates tabular-nums">
                  {room.rateTiers && room.rateTiers.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                      {room.rateTiers.map((tier) => (
                        <span key={tier.label} style={{ fontSize: 13 }}>
                          <strong>{tier.label}</strong> 平 {formatCurrencyTWD(tier.standardRate)} ／ 假{' '}
                          {formatCurrencyTWD(tier.weekendRate)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13.5 }}>
                      平日 <strong>{formatCurrencyTWD(room.standardRate)}</strong>
                      <span style={{ margin: '0 6px', color: 'var(--border-strong)' }}>|</span>
                      假日 <strong>{formatCurrencyTWD(room.weekendRate)}</strong>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEdit(room)}
                  >
                    <Edit3 size={14} />
                    編輯
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    style={{ color: 'var(--status-overdue)' }}
                    title="刪除房型"
                    aria-label={`刪除 ${room.code}`}
                    onClick={() => handleDelete(room)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {modalOpen && (
        <div
          className="overlay-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <form className="modal-card" onSubmit={(e) => void handleSubmit(e)}>
            <div className="modal-header">
              <h2 id="room-modal-title" style={{ fontSize: 17, fontWeight: 700 }}>
                {editingRoom ? '編輯房型' : '新增房型'}
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label="關閉"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid-3">
                <label className="field-group">
                  <span className="field-label">
                    房號<span className="field-required">*</span>
                  </span>
                  <input
                    type="text"
                    className="input"
                    value={form.code}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, code: e.target.value }))
                    }
                    required
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">館別</span>
                  <select
                    className="select"
                    value={form.building}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        building: e.target.value as BuildingZone,
                      }))
                    }
                  >
                    <option value="xinyue">{BUILDING_LABELS.xinyue}</option>
                    <option value="youde">{BUILDING_LABELS.youde}</option>
                  </select>
                </label>

                <label className="field-group">
                  <span className="field-label">樓層</span>
                  <input
                    type="text"
                    className="input"
                    value={form.floorLabel}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, floorLabel: e.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">
                    房型名稱<span className="field-required">*</span>
                  </span>
                  <input
                    type="text"
                    className="input"
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">
                    分類<span className="field-required">*</span>
                  </span>
                  <input
                    type="text"
                    className="input"
                    value={form.roomType}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, roomType: e.target.value }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">平日價（NT$）</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    className="input tabular-nums"
                    value={form.standardRate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        standardRate: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">假日價（NT$）</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    className="input tabular-nums"
                    value={form.weekendRate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        weekendRate: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </label>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    人數階梯價（選填）
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={addTier}
                  >
                    <Plus size={13} />
                    新增級距
                  </button>
                </div>

                {(form.rateTiers || []).map((tier, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 0.7fr 1fr 1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      placeholder="名稱"
                      value={tier.label}
                      onChange={(e) => updateTier(idx, { label: e.target.value })}
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      className="input tabular-nums"
                      placeholder="人數"
                      value={tier.maxGuests}
                      onChange={(e) =>
                        updateTier(idx, {
                          maxGuests: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="input tabular-nums"
                      placeholder="平日"
                      value={tier.standardRate}
                      onChange={(e) =>
                        updateTier(idx, {
                          standardRate: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className="input tabular-nums"
                      placeholder="假日"
                      value={tier.weekendRate}
                      onChange={(e) =>
                        updateTier(idx, {
                          weekendRate: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label="移除級距"
                      onClick={() => removeTier(idx)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">標準人數</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    className="input tabular-nums"
                    value={form.standardCapacity}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        standardCapacity: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">人數上限</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    className="input tabular-nums"
                    value={form.maxCapacity}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        maxCapacity: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                  />
                </label>
              </div>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                />
                開放排房
              </label>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
