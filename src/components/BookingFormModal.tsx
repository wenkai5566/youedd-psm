import { useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Lock, RotateCcw, UserCheck, X } from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  BUILDING_LABELS,
  WEEKDAY_ZH,
} from '../constants/labels';
import {
  addDaysISO,
  calculateRoomOptionStayPrice,
  findBookingConflict,
  findReturningGuestByPhone,
  findRoomBlockConflictForBooking,
  formatCurrencyTWD,
  formatShortDateZh,
  formatTaiwanPhone,
  getNightsCount,
  getRoomRateOptions,
  getTodayISO,
  syncRoomAllocations,
  validateBookingInput,
} from '../domain/bookingLogic';
import type {
  Booking,
  BookingInput,
  BookingStatus,
  PaymentStatus,
  Room,
  RoomAllocation,
  RoomBlock,
} from '../types/domain';
import { SmartDateInput } from './SmartDateInput';

export interface BookingDraftPreset {
  roomIds?: string[];
  checkInDate?: string;
  checkOutDate?: string;
}

interface BookingFormModalProps {
  rooms: Room[];
  bookings: Booking[];
  roomBlocks: RoomBlock[];
  specialHolidayDates: string[];
  editingBooking: Booking | null;
  preset?: BookingDraftPreset | null;
  onClose: () => void;
  onSubmit: (input: BookingInput, existingBookingId?: string) => Promise<void>;
}

interface RoomConflictBadge {
  kind: 'booking' | 'block';
  detail: string;
}

export function BookingFormModal({
  rooms,
  bookings,
  roomBlocks,
  specialHolidayDates,
  editingBooking,
  preset,
  onClose,
  onSubmit,
}: BookingFormModalProps) {
  const todayISO = getTodayISO();

  const activeRooms = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.isActive ||
          (editingBooking && editingBooking.roomIds.includes(r.id))
      ),
    [rooms, editingBooking]
  );

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const [form, setForm] = useState<BookingInput>(() => {
    if (editingBooking) {
      const syncedAllocations = syncRoomAllocations(
        editingBooking.roomIds,
        rooms,
        editingBooking.checkInDate,
        editingBooking.checkOutDate,
        editingBooking.roomAllocations,
        specialHolidayDates
      );
      return {
        roomIds: [...editingBooking.roomIds],
        roomAllocations: syncedAllocations,
        guestName: editingBooking.guestName,
        guestPhone: editingBooking.guestPhone,
        checkInDate: editingBooking.checkInDate,
        checkOutDate: editingBooking.checkOutDate,
        adults: editingBooking.adults,
        children: editingBooking.children,
        totalAmount: editingBooking.totalAmount,
        depositPaid: editingBooking.depositPaid,
        depositDueDate: editingBooking.depositDueDate || addDaysISO(todayISO, 2),
        transferLastFour: editingBooking.transferLastFour || '',
        paymentStatus: editingBooking.paymentStatus,
        status: editingBooking.status,
        notes: editingBooking.notes,
      };
    }

    const defaultCheckIn = preset?.checkInDate || todayISO;
    const defaultCheckOut = preset?.checkOutDate || addDaysISO(defaultCheckIn, 1);
    const initialRoomIds =
      preset?.roomIds && preset.roomIds.length > 0 ? preset.roomIds : [];
    const allocations = syncRoomAllocations(
      initialRoomIds,
      rooms,
      defaultCheckIn,
      defaultCheckOut,
      [],
      specialHolidayDates
    );
    const totalAmount = allocations.reduce((sum, a) => sum + a.adjustedPrice, 0);
    const initialGuests = allocations.reduce((sum, a) => sum + a.guests, 0) || 2;

    return {
      roomIds: initialRoomIds,
      roomAllocations: allocations,
      guestName: '',
      guestPhone: '',
      checkInDate: defaultCheckIn,
      checkOutDate: defaultCheckOut,
      adults: initialGuests,
      children: 0,
      totalAmount,
      depositPaid: 0,
      depositDueDate: addDaysISO(todayISO, 2),
      transferLastFour: '',
      paymentStatus: 'unpaid',
      status: 'confirmed',
      notes: '',
    };
  });

  /* Once staff manually enters actual adults/children, room changes never overwrite them */
  const [hasCustomGuestCount, setHasCustomGuestCount] = useState<boolean>(
    Boolean(editingBooking)
  );
  const [manualTotalOverride, setManualTotalOverride] = useState<boolean>(() => {
    if (!editingBooking) return false;
    const sumAdjusted = editingBooking.roomAllocations.reduce(
      (sum, a) => sum + a.adjustedPrice,
      0
    );
    return sumAdjusted > 0 && editingBooking.totalAmount !== sumAdjusted;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nights = getNightsCount(form.checkInDate, form.checkOutDate);

  /* Live conflict check (both guest bookings and maintenance/owner room blocks) */
  const roomConflictMap = useMemo(() => {
    const map = new Map<string, RoomConflictBadge>();
    if (nights <= 0) {
      return map;
    }
    for (const room of activeRooms) {
      const candidate = {
        roomIds: [room.id],
        checkInDate: form.checkInDate,
        checkOutDate: form.checkOutDate,
        status: form.status,
      };
      const conflict = findBookingConflict(
        candidate,
        bookings,
        editingBooking?.id
      );
      if (conflict) {
        map.set(room.id, {
          kind: 'booking',
          detail: `${conflict.overlappingDates[0]} ${conflict.conflictingBooking.guestName}`,
        });
        continue;
      }
      const blockConflict = findRoomBlockConflictForBooking(
        candidate,
        roomBlocks
      );
      if (blockConflict) {
        map.set(room.id, {
          kind: 'block',
          detail: `${blockConflict.overlappingDates[0]} 鎖房（${blockConflict.conflictingBlock.reason}）`,
        });
      }
    }
    return map;
  }, [
    activeRooms,
    bookings,
    roomBlocks,
    editingBooking?.id,
    form.checkInDate,
    form.checkOutDate,
    form.status,
    nights,
  ]);

  const selectedConflicts = useMemo(() => {
    const list: Array<{ roomCode: string; kind: 'booking' | 'block'; detail: string }> = [];
    for (const roomId of form.roomIds) {
      const conflict = roomConflictMap.get(roomId);
      if (conflict) {
        const room = roomMap.get(roomId);
        list.push({
          roomCode: room ? room.code : roomId,
          kind: conflict.kind,
          detail: conflict.detail,
        });
      }
    }
    return list;
  }, [form.roomIds, roomConflictMap, roomMap]);

  const originalSubtotal = useMemo(
    () => form.roomAllocations.reduce((sum, a) => sum + a.originalPrice, 0),
    [form.roomAllocations]
  );

  const roomsAdjustedSubtotal = useMemo(
    () => form.roomAllocations.reduce((sum, a) => sum + a.adjustedPrice, 0),
    [form.roomAllocations]
  );

  const totalDiscount = Math.max(0, originalSubtotal - form.totalAmount);

  const balanceDue =
    form.paymentStatus === 'paid_in_full'
      ? 0
      : Math.max(0, form.totalAmount - form.depositPaid);

  const applyAllocationsUpdate = (
    nextRoomIds: string[],
    nextAllocations: RoomAllocation[],
    nextCheckIn = form.checkInDate,
    nextCheckOut = form.checkOutDate,
    forceResetTotal = false
  ) => {
    const sumAdjusted = nextAllocations.reduce((s, a) => s + a.adjustedPrice, 0);
    const defaultGuests = nextAllocations.reduce((s, a) => s + a.guests, 0);

    setForm((prev) => {
      const nextTotal =
        forceResetTotal || !manualTotalOverride ? sumAdjusted : prev.totalAmount;
      const nextDeposit =
        prev.paymentStatus === 'paid_in_full' ? nextTotal : prev.depositPaid;
      return {
        ...prev,
        roomIds: nextRoomIds,
        roomAllocations: nextAllocations,
        checkInDate: nextCheckIn,
        checkOutDate: nextCheckOut,
        adults: hasCustomGuestCount
          ? prev.adults
          : Math.max(1, defaultGuests - prev.children),
        totalAmount: nextTotal,
        depositPaid: nextDeposit,
      };
    });
  };

  const returningGuest = useMemo(
    () =>
      findReturningGuestByPhone(
        form.guestPhone,
        bookings,
        editingBooking?.id
      ),
    [form.guestPhone, bookings, editingBooking?.id]
  );

  const toggleRoomSelection = (roomId: string) => {
    const exists = form.roomIds.includes(roomId);
    const nextRoomIds = exists
      ? form.roomIds.filter((id) => id !== roomId)
      : [...form.roomIds, roomId];

    const nextAllocations = syncRoomAllocations(
      nextRoomIds,
      rooms,
      form.checkInDate,
      form.checkOutDate,
      form.roomAllocations,
      specialHolidayDates
    );
    applyAllocationsUpdate(nextRoomIds, nextAllocations);
  };

  const updateDates = (nextIn: string, nextOut: string) => {
    const safeOut =
      getNightsCount(nextIn, nextOut) <= 0 ? addDaysISO(nextIn, 1) : nextOut;
    const nextAllocations = syncRoomAllocations(
      form.roomIds,
      rooms,
      nextIn,
      safeOut,
      form.roomAllocations,
      specialHolidayDates
    );
    applyAllocationsUpdate(form.roomIds, nextAllocations, nextIn, safeOut);
  };

  const selectRoomRateOption = (roomId: string, optionKey: string) => {
    const room = roomMap.get(roomId);
    if (!room) return;
    const option = getRoomRateOptions(room).find((o) => o.key === optionKey);
    if (!option) return;

    const recalculated = calculateRoomOptionStayPrice(
      option,
      form.checkInDate,
      form.checkOutDate,
      specialHolidayDates
    );

    const nextAllocations = form.roomAllocations.map((alloc) =>
      alloc.roomId === roomId
        ? {
            ...alloc,
            rateOptionKey: option.key,
            rateOptionLabel: option.label,
            guests: option.guests,
            extraBed: option.extraBed,
            originalPrice: recalculated,
            adjustedPrice: recalculated,
          }
        : alloc
    );
    applyAllocationsUpdate(form.roomIds, nextAllocations);
  };

  const updateRoomAdjustedPrice = (roomId: string, price: number) => {
    const safePrice = Math.max(0, Number.isNaN(price) ? 0 : Math.round(price));
    const nextAllocations = form.roomAllocations.map((alloc) =>
      alloc.roomId === roomId ? { ...alloc, adjustedPrice: safePrice } : alloc
    );
    setManualTotalOverride(false);
    applyAllocationsUpdate(
      form.roomIds,
      nextAllocations,
      form.checkInDate,
      form.checkOutDate,
      true
    );
  };

  const handlePaymentModeChange = (mode: PaymentStatus) => {
    setForm((prev) => {
      if (mode === 'unpaid') {
        return {
          ...prev,
          paymentStatus: 'unpaid',
          depositPaid: 0,
          depositDueDate: prev.depositDueDate || addDaysISO(todayISO, 2),
        };
      }
      if (mode === 'paid_in_full') {
        return {
          ...prev,
          paymentStatus: 'paid_in_full',
          depositPaid: prev.totalAmount,
        };
      }
      const suggestedHalf =
        prev.depositPaid > 0
          ? prev.depositPaid
          : Math.round(prev.totalAmount * 0.5);
      return {
        ...prev,
        paymentStatus: 'deposit_paid',
        depositPaid: suggestedHalf,
      };
    });
  };

  const handleResetPricesToOriginal = () => {
    const resetAllocations = form.roomAllocations.map((a) => ({
      ...a,
      adjustedPrice: a.originalPrice,
    }));
    setManualTotalOverride(false);
    applyAllocationsUpdate(
      form.roomIds,
      resetAllocations,
      form.checkInDate,
      form.checkOutDate,
      true
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const formattedForm: BookingInput = {
      ...form,
      guestPhone: formatTaiwanPhone(form.guestPhone),
    };

    const validationError = validateBookingInput(formattedForm);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    if (selectedConflicts.length > 0 && formattedForm.status !== 'cancelled') {
      const first = selectedConflicts[0];
      setSubmitError(
        first.kind === 'block'
          ? `鎖房衝突：「${first.roomCode}」於 ${first.detail}`
          : `重複訂房衝突：「${first.roomCode}」於 ${first.detail} 已有訂房`
      );
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(formattedForm, editingBooking?.id);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '儲存訂房失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal-card modal-card-workbench"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 id="booking-modal-title" style={{ fontSize: 17, fontWeight: 700 }}>
              {editingBooking ? '編輯訂房' : '新增訂房'}
            </h2>
            {nights > 0 && form.roomIds.length > 0 && (
              <span className="pill pill-confirmed tabular-nums">
                {form.roomIds.length} 間・{nights} 晚・
                {formatCurrencyTWD(form.totalAmount)}
              </span>
            )}
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

        <div className="modal-body workbench-modal-body">
          {(submitError || selectedConflicts.length > 0) && (
            <div className="alert-box alert-danger" role="alert">
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                {submitError ||
                  selectedConflicts
                    .map((c) =>
                      c.kind === 'block'
                        ? `「${c.roomCode}」於 ${c.detail}`
                        : `「${c.roomCode}」於 ${c.detail} 已有訂房`
                    )
                    .join('；')}
              </div>
            </div>
          )}

          <div className="booking-workbench-grid">
            {/* LEFT PANE: Stay Dates + Physical Floorplan Multi-Room Picker */}
            <div className="wb-left-pane">
              <div className="form-grid-2">
                <div className="field-group">
                  <label htmlFor="input-checkin-date" className="field-label">
                    <span>
                      入住日期<span className="field-required">*</span>
                    </span>
                  </label>
                  <SmartDateInput
                    id="input-checkin-date"
                    ariaLabel="入住日期"
                    value={form.checkInDate}
                    required
                    onChange={(nextIn) => updateDates(nextIn, form.checkOutDate)}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="input-checkout-date" className="field-label">
                    <span>
                      退房日期<span className="field-required">*</span>
                    </span>
                    {nights > 0 && (
                      <span style={{ color: 'var(--accent-pine)', fontWeight: 700 }}>
                        {nights} 晚
                      </span>
                    )}
                  </label>
                  <SmartDateInput
                    id="input-checkout-date"
                    ariaLabel="退房日期"
                    value={form.checkOutDate}
                    min={addDaysISO(form.checkInDate, 1)}
                    required
                    onChange={(nextOut) => updateDates(form.checkInDate, nextOut)}
                  />
                </div>
              </div>

              <div className="field-group">
                <div className="field-label">
                  <span>
                    點選房間（可複選）<span className="field-required">*</span>
                  </span>
                  <span
                    className="tabular-nums"
                    style={{ color: 'var(--accent-pine)', fontWeight: 700 }}
                  >
                    已選 {form.roomIds.length} 間
                  </span>
                </div>

                {(() => {
                  const renderPickBtn = (room: Room) => {
                    const isSelected = form.roomIds.includes(room.id);
                    const conflict = roomConflictMap.get(room.id);
                    const isBlocked = conflict?.kind === 'block';
                    const isDisabled =
                      Boolean(conflict) &&
                      !isSelected &&
                      form.status !== 'cancelled';

                    return (
                      <button
                        key={room.id}
                        type="button"
                        disabled={isDisabled}
                        className={`fp-pick-tile ${isSelected ? 'selected' : ''} ${
                          conflict ? (isBlocked ? 'blocked' : 'conflicted') : ''
                        }`}
                        title={
                          conflict
                            ? isBlocked
                              ? conflict.detail
                              : `已預訂：${conflict.detail}`
                            : room.name
                        }
                        onClick={() => toggleRoomSelection(room.id)}
                      >
                        <div className="fp-pick-top">
                          <span className="fp-pick-code">{room.code}</span>
                          {isSelected ? (
                            <Check size={14} />
                          ) : conflict ? (
                            <span className="fp-pick-badge">
                              {isBlocked ? (
                                <Lock size={10} style={{ verticalAlign: '-1px' }} />
                              ) : (
                                '已訂'
                              )}
                            </span>
                          ) : (
                            <span className="fp-pick-cap tabular-nums">
                              {room.rateTiers
                                ? `${room.standardCapacity}~${room.maxCapacity}人`
                                : `${room.standardCapacity}人`}
                            </span>
                          )}
                        </div>
                        <div className="fp-pick-rate tabular-nums">
                          {conflict
                            ? isBlocked
                              ? '鎖房'
                              : '已售'
                            : room.rateTiers
                              ? `$${room.standardRate.toLocaleString()} 起`
                              : `$${room.standardRate.toLocaleString()}`}
                        </div>
                      </button>
                    );
                  };

                  const xinyueRooms = activeRooms.filter(
                    (r) => r.building === 'xinyue'
                  );
                  const youdeRooms = activeRooms.filter(
                    (r) => r.building === 'youde'
                  );

                  return (
                    <div className="room-btn-picker">
                      {xinyueRooms.length > 0 && (
                        <div className="room-btn-group">
                          <div className="room-btn-group-title">
                            <span>{BUILDING_LABELS.xinyue}</span>
                            <span>{xinyueRooms.length} 間</span>
                          </div>
                          <div className="room-btn-grid">
                            {xinyueRooms.map(renderPickBtn)}
                          </div>
                        </div>
                      )}

                      {youdeRooms.length > 0 && (
                        <div className="room-btn-group">
                          <div className="room-btn-group-title">
                            <span>{BUILDING_LABELS.youde}</span>
                            <span>{youdeRooms.length} 間</span>
                          </div>
                          <div className="room-btn-grid is-youde">
                            {youdeRooms.map(renderPickBtn)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* RIGHT PANE: Guest Identity, Pricing Options, Deposit & Notes */}
            <div className="wb-right-pane">
              {/* Guest Identity */}
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">
                    <span>
                      旅客姓名<span className="field-required">*</span>
                    </span>
                  </span>
                  <input
                    id="input-guest-name"
                    type="text"
                    className="input"
                    placeholder="姓名"
                    value={form.guestName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, guestName: e.target.value }))
                    }
                    required
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">
                    <span>
                      聯絡電話<span className="field-required">*</span>
                    </span>
                  </span>
                  <input
                    id="input-guest-phone"
                    type="tel"
                    inputMode="tel"
                    className="input tabular-nums"
                    placeholder="直接輸入數字（自動排版）"
                    value={form.guestPhone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, guestPhone: e.target.value }))
                    }
                    onBlur={() =>
                      setForm((prev) => ({
                        ...prev,
                        guestPhone: formatTaiwanPhone(prev.guestPhone),
                      }))
                    }
                    required
                  />
                </label>
              </div>

              {/* Returning Guest Auto-Recognition Banner */}
              {returningGuest && (
                <div className="returning-guest-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <UserCheck size={16} style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: 13 }}>
                      <strong>老顧客：{returningGuest.guestName}</strong>
                      <span style={{ marginLeft: 6, opacity: 0.85 }} className="tabular-nums">
                        曾入住 {returningGuest.visitCount} 次（最近{' '}
                        {formatShortDateZh(returningGuest.lastCheckIn, WEEKDAY_ZH)}）
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        guestName: returningGuest.guestName,
                        notes: prev.notes || returningGuest.lastNotes,
                      }))
                    }
                  >
                    帶入資料
                  </button>
                </div>
              )}

              {/* Per-Room Pricing Option Selector & Independent Guest Counts */}
              {form.roomAllocations.length > 0 ? (
                <div className="allocations-box">
                  <div className="allocations-header">
                    <strong style={{ fontSize: 13.5 }}>
                      客房價位與加床（{form.roomAllocations.length} 間）
                    </strong>
                    {(totalDiscount > 0 || manualTotalOverride) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={handleResetPricesToOriginal}
                      >
                        <RotateCcw size={13} />
                        恢復原價
                      </button>
                    )}
                  </div>

                  <div className="allocations-list">
                    {form.roomAllocations.map((alloc) => {
                      const room = roomMap.get(alloc.roomId);
                      if (!room) return null;
                      const options = getRoomRateOptions(room);
                      const roomDiff = alloc.originalPrice - alloc.adjustedPrice;

                      return (
                        <div key={alloc.roomId} className="allocation-row">
                          <div className="allocation-room-info">
                            <span className="room-code-chip">{room.code}</span>
                            <div>
                              <div
                                className="tier-toggle-group"
                                role="group"
                                aria-label={`${room.code} 計價方案`}
                              >
                                {options.map((opt) => (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    className={`tier-toggle-btn ${
                                      alloc.rateOptionKey === opt.key ? 'active' : ''
                                    }`}
                                    onClick={() =>
                                      selectRoomRateOption(room.id, opt.key)
                                    }
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                              {roomDiff > 0 && (
                                <div
                                  className="tabular-nums"
                                  style={{
                                    fontSize: 11.5,
                                    color: 'var(--tone-awaiting-ink)',
                                    fontWeight: 700,
                                    marginTop: 3,
                                  }}
                                >
                                  原價 {formatCurrencyTWD(alloc.originalPrice)}（折{' '}
                                  {formatCurrencyTWD(roomDiff)}）
                                </div>
                              )}
                            </div>
                          </div>

                          <label className="alloc-mini-field">
                            <span>金額</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              className="input alloc-price-input tabular-nums"
                              value={alloc.adjustedPrice}
                              onChange={(e) =>
                                updateRoomAdjustedPrice(
                                  room.id,
                                  Number(e.target.value)
                                )
                              }
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  {/* Independent Actual Guest Counts + Editable Total */}
                  <div className="allocations-total-bar">
                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: 'var(--ink-secondary)',
                        }}
                      >
                        實際人數
                      </span>
                      <label className="alloc-mini-field">
                        <span>大人</span>
                        <input
                          id="input-adults"
                          type="number"
                          min={1}
                          max={30}
                          step={1}
                          inputMode="numeric"
                          className="input alloc-num-input tabular-nums"
                          value={form.adults}
                          onChange={(e) => {
                            setHasCustomGuestCount(true);
                            setForm((prev) => ({
                              ...prev,
                              adults: Math.max(1, Number(e.target.value) || 1),
                            }));
                          }}
                        />
                      </label>
                      <label className="alloc-mini-field">
                        <span>孩童</span>
                        <input
                          id="input-children"
                          type="number"
                          min={0}
                          max={20}
                          step={1}
                          inputMode="numeric"
                          className="input alloc-num-input tabular-nums"
                          value={form.children}
                          onChange={(e) => {
                            setHasCustomGuestCount(true);
                            setForm((prev) => ({
                              ...prev,
                              children: Math.max(0, Number(e.target.value) || 0),
                            }));
                          }}
                        />
                      </label>
                    </div>

                    <div className="total-price-editor">
                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: 'var(--ink-secondary)',
                          }}
                        >
                          實收總額
                        </div>
                        {originalSubtotal > 0 && totalDiscount > 0 && (
                          <div
                            className="tabular-nums"
                            style={{
                              fontSize: 11.5,
                              color: 'var(--tone-awaiting-ink)',
                              fontWeight: 700,
                            }}
                          >
                            折抵 {formatCurrencyTWD(totalDiscount)}
                          </div>
                        )}
                      </div>
                      <input
                        id="input-total-amount"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className="input total-amount-input tabular-nums"
                        value={form.totalAmount}
                        onChange={(e) => {
                          const nextTotal = Math.max(
                            0,
                            Number(e.target.value) || 0
                          );
                          setManualTotalOverride(
                            nextTotal !== roomsAdjustedSubtotal
                          );
                          setForm((prev) => ({
                            ...prev,
                            totalAmount: nextTotal,
                            depositPaid:
                              prev.paymentStatus === 'paid_in_full'
                                ? nextTotal
                                : prev.depositPaid,
                          }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="wb-empty-rooms">
                  請先於左側平面圖點選至少 1 間客房，右側將即時顯示計價與加床選項
                </div>
              )}

              {/* 3-Stage Deposit Selector */}
              <div className="deposit-workflow-box">
                <span className="field-label">訂金狀態</span>

                <div
                  className="payment-mode-tabs"
                  role="radiogroup"
                  aria-label="訂金狀態"
                >
                  <button
                    type="button"
                    className={`payment-mode-tab ${
                      form.paymentStatus === 'unpaid' ? 'active is-awaiting' : ''
                    }`}
                    onClick={() => handlePaymentModeChange('unpaid')}
                  >
                    <strong>待付訂金</strong>
                  </button>

                  <button
                    type="button"
                    className={`payment-mode-tab ${
                      form.paymentStatus === 'deposit_paid' ? 'active is-paid' : ''
                    }`}
                    onClick={() => handlePaymentModeChange('deposit_paid')}
                  >
                    <strong>已付訂金</strong>
                  </button>

                  <button
                    type="button"
                    className={`payment-mode-tab ${
                      form.paymentStatus === 'paid_in_full' ? 'active is-full' : ''
                    }`}
                    onClick={() => handlePaymentModeChange('paid_in_full')}
                  >
                    <strong>已結清</strong>
                  </button>
                </div>

                {form.paymentStatus === 'unpaid' && (
                  <div className="deposit-subpanel">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div className="alloc-mini-field">
                        <span>匯款期限</span>
                        <SmartDateInput
                          id="input-deposit-due-date"
                          ariaLabel="匯款期限"
                          value={form.depositDueDate}
                          className="smart-date-compact"
                          onChange={(nextDue) =>
                            setForm((prev) => ({
                              ...prev,
                              depositDueDate: nextDue,
                            }))
                          }
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { label: '明天', days: 1 },
                          { label: '後天', days: 2 },
                          { label: '3天後', days: 3 },
                        ].map((opt) => {
                          const targetDate = addDaysISO(todayISO, opt.days);
                          return (
                            <button
                              key={opt.days}
                              type="button"
                              className={`btn btn-sm ${
                                form.depositDueDate === targetDate
                                  ? 'btn-primary'
                                  : 'btn-secondary'
                              }`}
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  depositDueDate: targetDate,
                                }))
                              }
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {form.paymentStatus === 'deposit_paid' && (
                  <div className="deposit-subpanel">
                    <div className="form-grid-2">
                      <label className="field-group">
                        <span className="field-label">實收訂金（NT$）</span>
                        <input
                          id="input-deposit-paid"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          className="input tabular-nums"
                          value={form.depositPaid}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setForm((prev) => ({
                              ...prev,
                              depositPaid: val,
                              paymentStatus:
                                prev.totalAmount > 0 && val >= prev.totalAmount
                                  ? 'paid_in_full'
                                  : 'deposit_paid',
                            }));
                          }}
                        />
                      </label>

                      <label className="field-group">
                        <span className="field-label">帳號後四碼</span>
                        <input
                          id="input-transfer-last4"
                          type="text"
                          maxLength={8}
                          className="input tabular-nums"
                          placeholder="選填"
                          value={form.transferLastFour || ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              transferLastFour: e.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13.5,
                      }}
                    >
                      <span style={{ color: 'var(--ink-secondary)' }}>待收尾款</span>
                      <strong
                        className="tabular-nums"
                        style={{ color: 'var(--danger-fg)', fontSize: 15 }}
                      >
                        {formatCurrencyTWD(balanceDue)}
                      </strong>
                    </div>
                  </div>
                )}

                {form.paymentStatus === 'paid_in_full' && (
                  <div className="deposit-subpanel">
                    <div className="form-grid-2" style={{ alignItems: 'center' }}>
                      <div
                        className="tabular-nums"
                        style={{
                          fontSize: 13.5,
                          color: 'var(--success-fg)',
                          fontWeight: 700,
                        }}
                      >
                        全額已結清 {formatCurrencyTWD(form.totalAmount)}
                      </div>
                      <input
                        type="text"
                        maxLength={12}
                        className="input tabular-nums"
                        placeholder="後四碼 / 付款方式（選填）"
                        value={form.transferLastFour || ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            transferLastFour: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {editingBooking && (
                <label className="field-group">
                  <span className="field-label">住房狀態</span>
                  <select
                    id="select-booking-status"
                    className="select"
                    value={form.status}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        status: e.target.value as BookingStatus,
                      }))
                    }
                  >
                    {(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map(
                      (st) => (
                        <option key={st} value={st}>
                          {BOOKING_STATUS_LABELS[st]}
                        </option>
                      )
                    )}
                  </select>
                </label>
              )}

              <label className="field-group">
                <span className="field-label">備註（飲食需求／素食將自動標示於今日早餐）</span>
                <textarea
                  id="textarea-booking-notes"
                  className="textarea"
                  style={{ minHeight: 64 }}
                  placeholder="抵達時間、素食早餐、過敏、加被等..."
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </label>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            id="btn-submit-booking"
            type="submit"
            className="btn btn-primary"
            disabled={
              submitting ||
              form.roomIds.length === 0 ||
              (selectedConflicts.length > 0 && form.status !== 'cancelled')
            }
          >
            {submitting
              ? '儲存中...'
              : editingBooking
                ? '儲存變更'
                : `確認訂房（${form.roomIds.length} 間）`}
          </button>
        </div>
      </form>
    </div>
  );
}
