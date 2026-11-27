import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Lock,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  BUILDING_LABELS,
  DEPOSIT_TRACKING_LABELS,
  HOUSEKEEPING_LABELS,
  WEEKDAY_ZH,
} from '../constants/labels';
import {
  addDaysISO,
  findBookingConflict,
  findRoomBlockConflictForBooking,
  formatCurrencyTWD,
  formatShortDateZh,
  generateDateRange,
  getBalanceDue,
  getDepositTrackingState,
  getNightsCount,
  getTodayISO,
  isHolidayNight,
  parseDateISO,
  syncRoomAllocations,
} from '../domain/bookingLogic';
import type {
  Booking,
  BookingInput,
  BuildingZone,
  HousekeepingStatus,
  Room,
  RoomBlock,
} from '../types/domain';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { AvailabilityCalendarView } from './AvailabilityCalendarView';
import type { BookingDraftPreset } from './BookingFormModal';
import { Campus3DFloorplan } from './Campus3DFloorplan';
import { FloorplanRoomMap } from './FloorplanRoomMap';
import type { RoomBlockDraftPreset } from './RoomBlockModal';
import { SmartDateInput } from './SmartDateInput';

interface RoomTimelineViewProps {
  rooms: Room[];
  bookings: Booking[];
  roomBlocks: RoomBlock[];
  specialHolidayDates: string[];
  isDesktop: boolean;
  onCreateBookingAt: (preset?: BookingDraftPreset) => void;
  onInspectBooking: (booking: Booking) => void;
  onMoveBooking: (
    booking: Booking,
    nextInput: BookingInput,
    summaryLabel: string
  ) => Promise<void>;
  onCreateRoomBlock: (preset?: RoomBlockDraftPreset) => void;
  onInspectRoomBlock: (block: RoomBlock) => void;
  onToggleHousekeeping: (
    roomId: string,
    nextStatus: HousekeepingStatus
  ) => Promise<void>;
  onNotifyError: (message: string) => void;
}

type GridDisplayMode = 'grid' | 'calendar' | 'floorplan';
type GanttScale = 'week' | 'fortnight' | 'month';
type PrenoColorMode = 'status' | 'groups' | 'payments' | 'guests';

interface DragCreateState {
  roomId: string;
  anchorDate: string;
  currentDate: string;
}

interface DragMoveState {
  booking: Booking;
  sourceRoomId: string;
  nights: number;
}

interface PendingMoveConfirm {
  booking: Booking;
  nextInput: BookingInput;
  fromRoomsLabel: string;
  toRoomsLabel: string;
  fromDatesLabel: string;
  toDatesLabel: string;
  summaryLabel: string;
}

interface HoverPopoverState {
  booking: Booking;
  left: number;
  top: number;
  placeAbove: boolean;
}

const GROUP_PALETTE_CLASSES = [
  'bar-group-0',
  'bar-group-1',
  'bar-group-2',
  'bar-group-3',
] as const;

function BroomIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m19 3-8 8" />
      <path d="M9.5 11.5 5 16c-1.1 1.1-1 3 .2 4.1 1.1 1.1 3 1.2 4.1.1l4.5-4.5-4.3-4.2Z" />
      <path d="m6.5 17.5 2-2" />
      <path d="m10 19 2-2" />
    </svg>
  );
}

export function RoomTimelineView({
  rooms,
  bookings,
  roomBlocks,
  specialHolidayDates,
  isDesktop,
  onCreateBookingAt,
  onInspectBooking,
  onMoveBooking,
  onCreateRoomBlock,
  onInspectRoomBlock,
  onToggleHousekeeping,
  onNotifyError,
}: RoomTimelineViewProps) {
  const todayISO = getTodayISO();
  const isTabletOrDesktop = useMediaQuery('(min-width: 768px)');
  const [displayMode, setDisplayMode] = useState<GridDisplayMode>('grid');
  const [selectedScale, setSelectedScale] = useState<GanttScale | null>(null);
  const scale: GanttScale = selectedScale ?? (isDesktop ? 'fortnight' : 'week');
  const [colorMode, setColorMode] = useState<PrenoColorMode>('status');
  const [anchorDate, setAnchorDate] = useState<string>(todayISO);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);
  const [popover, setPopover] = useState<HoverPopoverState | null>(null);

  const [dragCreate, setDragCreate] = useState<DragCreateState | null>(null);
  const [dragMove, setDragMove] = useState<DragMoveState | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    roomId: string;
    dateISO: string;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMoveConfirm | null>(null);
  const [movingBusy, setMovingBusy] = useState(false);

  const suppressNextClickRef = useRef(false);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  const activeRooms = useMemo(() => rooms.filter((r) => r.isActive), [rooms]);
  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const activeBookings = useMemo(
    () => bookings.filter((b) => b.status !== 'cancelled'),
    [bookings]
  );

  /* Identify returning guests (>= 2 non-cancelled stays by phone digits) */
  const returningPhoneSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of activeBookings) {
      const digits = b.guestPhone.replace(/\D/g, '');
      if (digits.length >= 8) {
        counts.set(digits, (counts.get(digits) || 0) + 1);
      }
    }
    const set = new Set<string>();
    counts.forEach((c, digits) => {
      if (c >= 2) set.add(digits);
    });
    return set;
  }, [activeBookings]);

  /* Assign deterministic color bucket to multi-room group bookings */
  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const b of activeBookings) {
      if (b.roomIds.length > 1) {
        map.set(
          b.id,
          GROUP_PALETTE_CLASSES[idx % GROUP_PALETTE_CLASSES.length]
        );
        idx += 1;
      }
    }
    return map;
  }, [activeBookings]);

  /* Instant guest search dropdown matches */
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return activeBookings
      .filter((b) => {
        const roomCodes = b.roomIds
          .map((rid) => roomMap.get(rid)?.code.toLowerCase() || '')
          .join(' ');
        return (
          b.guestName.toLowerCase().includes(q) ||
          b.guestPhone.toLowerCase().includes(q) ||
          roomCodes.includes(q) ||
          (b.transferLastFour || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [searchQuery, activeBookings, roomMap]);

  const shiftDate = (direction: -1 | 1) => {
    if (displayMode === 'floorplan') {
      setAnchorDate((d) => addDaysISO(d, direction));
      return;
    }
    if (scale === 'week') {
      setAnchorDate((d) => addDaysISO(d, direction * 7));
      return;
    }
    if (scale === 'fortnight') {
      setAnchorDate((d) => addDaysISO(d, direction * 14));
      return;
    }
    const parsed = parseDateISO(anchorDate);
    const shifted = new Date(
      parsed.getFullYear(),
      parsed.getMonth() + direction,
      1
    );
    setAnchorDate(
      `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-01`
    );
  };

  const parsedAnchor = parseDateISO(anchorDate);
  const monthYear = parsedAnchor.getFullYear();
  const monthIndex = parsedAnchor.getMonth();

  const { ganttStartDate, ganttDates } = useMemo(() => {
    if (scale === 'week') {
      const start = addDaysISO(anchorDate, -1);
      return { ganttStartDate: start, ganttDates: generateDateRange(start, 7) };
    }
    if (scale === 'fortnight') {
      const start = addDaysISO(anchorDate, -1);
      return {
        ganttStartDate: start,
        ganttDates: generateDateRange(start, 14),
      };
    }
    const daysInMonth = new Date(monthYear, monthIndex + 1, 0).getDate();
    const start = `${monthYear}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    return {
      ganttStartDate: start,
      ganttDates: generateDateRange(start, daysInMonth),
    };
  }, [scale, anchorDate, monthYear, monthIndex]);

  const ganttEndExclusive = addDaysISO(ganttStartDate, ganttDates.length);

  /* Auto-scroll month view near today */
  useEffect(() => {
    if (displayMode !== 'grid' || scale !== 'month' || !timelineScrollRef.current) {
      return;
    }
    const todayIdx = ganttDates.indexOf(todayISO);
    if (todayIdx > 2) {
      timelineScrollRef.current.scrollLeft = Math.max(0, (todayIdx - 2) * 52);
    } else {
      timelineScrollRef.current.scrollLeft = 0;
    }
  }, [displayMode, scale, ganttStartDate, ganttDates, todayISO]);

  /* Finalize horizontal drag-to-book */
  useEffect(() => {
    if (!dragCreate) {
      return undefined;
    }
    const handleWindowMouseUp = () => {
      const start =
        dragCreate.anchorDate <= dragCreate.currentDate
          ? dragCreate.anchorDate
          : dragCreate.currentDate;
      const endInclusive =
        dragCreate.anchorDate <= dragCreate.currentDate
          ? dragCreate.currentDate
          : dragCreate.anchorDate;
      const checkOutDate = addDaysISO(endInclusive, 1);

      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 60);

      setDragCreate(null);
      onCreateBookingAt({
        roomIds: [dragCreate.roomId],
        checkInDate: start,
        checkOutDate,
      });
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [dragCreate, onCreateBookingAt]);

  const groupedRooms = useMemo(() => {
    const groups: Array<{ zone: BuildingZone; items: Room[] }> = [];
    const xinyueRooms = activeRooms.filter((r) => r.building === 'xinyue');
    const youdeRooms = activeRooms.filter((r) => r.building === 'youde');
    if (xinyueRooms.length > 0) {
      groups.push({ zone: 'xinyue', items: xinyueRooms });
    }
    if (youdeRooms.length > 0) {
      groups.push({ zone: 'youde', items: youdeRooms });
    }
    return groups;
  }, [activeRooms]);

  /* Available rooms count per column */
  const ganttUnavailableByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const dateISO of ganttDates) {
      const unavailableIds = new Set<string>();
      for (const b of activeBookings) {
        if (b.checkInDate <= dateISO && b.checkOutDate > dateISO) {
          b.roomIds.forEach((rid) => unavailableIds.add(rid));
        }
      }
      for (const blk of roomBlocks) {
        if (blk.startDate <= dateISO && blk.endDate > dateISO) {
          unavailableIds.add(blk.roomId);
        }
      }
      counts.set(dateISO, unavailableIds.size);
    }
    return counts;
  }, [ganttDates, activeBookings, roomBlocks]);

  /* Include checkout-morning tails on ganttStartDate for authentic half-day Preno visual */
  const ganttBookingsByRoom = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of activeBookings) {
      if (b.checkOutDate < ganttStartDate || b.checkInDate >= ganttEndExclusive) {
        continue;
      }
      for (const rid of b.roomIds) {
        const list = map.get(rid) || [];
        list.push(b);
        map.set(rid, list);
      }
    }
    return map;
  }, [activeBookings, ganttStartDate, ganttEndExclusive]);

  const ganttBlocksByRoom = useMemo(() => {
    const map = new Map<string, RoomBlock[]>();
    for (const blk of roomBlocks) {
      if (blk.endDate < ganttStartDate || blk.startDate >= ganttEndExclusive) {
        continue;
      }
      const list = map.get(blk.roomId) || [];
      list.push(blk);
      map.set(blk.roomId, list);
    }
    return map;
  }, [roomBlocks, ganttStartDate, ganttEndExclusive]);

  /* Floorplan day snapshot data */
  const floorplanData = useMemo(() => {
    const stayMap = new Map<string, Booking>();
    const departMap = new Map<string, Booking>();
    const blockMap = new Map<string, RoomBlock>();

    for (const b of activeBookings) {
      if (b.checkInDate <= anchorDate && b.checkOutDate > anchorDate) {
        b.roomIds.forEach((rid) => stayMap.set(rid, b));
      }
      if (b.checkOutDate === anchorDate) {
        b.roomIds.forEach((rid) => departMap.set(rid, b));
      }
    }
    for (const blk of roomBlocks) {
      if (blk.startDate <= anchorDate && blk.endDate > anchorDate) {
        blockMap.set(blk.roomId, blk);
      }
    }
    return { stayMap, departMap, blockMap };
  }, [activeBookings, roomBlocks, anchorDate]);

  /* Drag-to-move drop feasibility */
  const dropPreview = useMemo(() => {
    if (!dragMove || !dropTarget) {
      return null;
    }
    const { booking, sourceRoomId, nights } = dragMove;
    const nextCheckIn = dropTarget.dateISO;
    const nextCheckOut = addDaysISO(nextCheckIn, Math.max(1, nights));

    let nextRoomIds = [...booking.roomIds];
    if (dropTarget.roomId !== sourceRoomId) {
      if (booking.roomIds.length === 1) {
        nextRoomIds = [dropTarget.roomId];
      } else if (!booking.roomIds.includes(dropTarget.roomId)) {
        nextRoomIds = booking.roomIds.map((rid) =>
          rid === sourceRoomId ? dropTarget.roomId : rid
        );
      }
    }

    const candidate = {
      roomIds: nextRoomIds,
      checkInDate: nextCheckIn,
      checkOutDate: nextCheckOut,
      status: booking.status,
    };

    const bookingConflict = findBookingConflict(candidate, bookings, booking.id);
    const blockConflict = findRoomBlockConflictForBooking(candidate, roomBlocks);

    return {
      roomId: dropTarget.roomId,
      startDate: nextCheckIn,
      endDate: nextCheckOut,
      nextRoomIds,
      bookingConflict,
      blockConflict,
      hasConflict: Boolean(bookingConflict || blockConflict),
    };
  }, [dragMove, dropTarget, bookings, roomBlocks]);

  /* On drop: validate conflicts, then open senior-friendly confirmation dialog */
  const handleDropBooking = () => {
    if (!dragMove || !dropPreview) {
      setDragMove(null);
      setDropTarget(null);
      return;
    }

    const { booking } = dragMove;
    const {
      nextRoomIds,
      startDate: nextCheckIn,
      endDate: nextCheckOut,
      bookingConflict,
      blockConflict,
    } = dropPreview;

    setDragMove(null);
    setDropTarget(null);

    const sameDates =
      nextCheckIn === booking.checkInDate &&
      nextCheckOut === booking.checkOutDate;
    const sameRooms =
      nextRoomIds.length === booking.roomIds.length &&
      nextRoomIds.every((id, idx) => id === booking.roomIds[idx]);

    if (sameDates && sameRooms) {
      return;
    }

    if (bookingConflict) {
      const code =
        roomMap.get(bookingConflict.roomId)?.code || bookingConflict.roomId;
      onNotifyError(
        `無法移動：「${code}」於 ${bookingConflict.overlappingDates[0]} 已有「${bookingConflict.conflictingBooking.guestName}」訂房`
      );
      return;
    }
    if (blockConflict) {
      const code =
        roomMap.get(blockConflict.roomId)?.code || blockConflict.roomId;
      onNotifyError(
        `無法移動：「${code}」於 ${blockConflict.overlappingDates[0]} 已被鎖房（${blockConflict.conflictingBlock.reason}）`
      );
      return;
    }

    const nextAllocations = syncRoomAllocations(
      nextRoomIds,
      rooms,
      nextCheckIn,
      nextCheckOut,
      booking.roomAllocations,
      specialHolidayDates
    );
    const oldSum = booking.roomAllocations.reduce(
      (s, a) => s + a.adjustedPrice,
      0
    );
    const hadManualTotal = oldSum > 0 && booking.totalAmount !== oldSum;
    const nextAdjustedSum = nextAllocations.reduce(
      (s, a) => s + a.adjustedPrice,
      0
    );
    const nextTotal = hadManualTotal ? booking.totalAmount : nextAdjustedSum;

    const nextInput: BookingInput = {
      roomIds: nextRoomIds,
      roomAllocations: nextAllocations,
      guestName: booking.guestName,
      guestPhone: booking.guestPhone,
      checkInDate: nextCheckIn,
      checkOutDate: nextCheckOut,
      adults: booking.adults,
      children: booking.children,
      totalAmount: nextTotal,
      depositPaid:
        booking.paymentStatus === 'paid_in_full'
          ? nextTotal
          : Math.min(booking.depositPaid, nextTotal),
      depositDueDate: booking.depositDueDate,
      transferLastFour: booking.transferLastFour || '',
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      notes: booking.notes,
    };

    const fromRoomsLabel = booking.roomIds
      .map((rid) => roomMap.get(rid)?.code || rid)
      .join(' + ');
    const toRoomsLabel = nextRoomIds
      .map((rid) => roomMap.get(rid)?.code || rid)
      .join(' + ');
    const fromDatesLabel = `${formatShortDateZh(
      booking.checkInDate,
      WEEKDAY_ZH
    )} ～ ${formatShortDateZh(booking.checkOutDate, WEEKDAY_ZH)}`;
    const toDatesLabel = `${formatShortDateZh(
      nextCheckIn,
      WEEKDAY_ZH
    )} ～ ${formatShortDateZh(nextCheckOut, WEEKDAY_ZH)}`;

    setPendingMove({
      booking,
      nextInput,
      fromRoomsLabel,
      toRoomsLabel,
      fromDatesLabel,
      toDatesLabel,
      summaryLabel: `已將「${booking.guestName}」移至 ${toRoomsLabel}（${formatShortDateZh(
        nextCheckIn,
        WEEKDAY_ZH
      )}）`,
    });
  };

  const confirmPendingMove = async () => {
    if (!pendingMove) return;
    try {
      setMovingBusy(true);
      await onMoveBooking(
        pendingMove.booking,
        pendingMove.nextInput,
        pendingMove.summaryLabel
      );
      setPendingMove(null);
    } finally {
      setMovingBusy(false);
    }
  };

  /* Resolve Preno native bar color class based on active colorMode */
  const resolveBarColorClass = (booking: Booking): string => {
    const depState = getDepositTrackingState(booking, todayISO);
    const isReturning = returningPhoneSet.has(
      booking.guestPhone.replace(/\D/g, '')
    );

    if (colorMode === 'payments') {
      if (depState === 'paid_in_full') return 'bar-green';
      if (depState === 'deposit_paid') return 'bar-blue';
      if (depState === 'deposit_overdue') return 'bar-red';
      return 'bar-amber';
    }
    if (colorMode === 'groups') {
      return groupColorMap.get(booking.id) || 'bar-muted';
    }
    if (colorMode === 'guests') {
      return isReturning ? 'bar-teal' : 'bar-muted';
    }
    /* Default: Preno Status Mode */
    if (booking.status === 'checked_out') return 'bar-gray';
    if (depState === 'deposit_overdue') return 'bar-red';
    if (booking.status === 'checked_in') return 'bar-green';
    if (depState === 'awaiting_deposit') return 'bar-amber';
    return 'bar-blue';
  };

  const openPopoverForBar = (
    booking: Booking,
    targetEl: HTMLButtonElement
  ) => {
    if (!isDesktop || dragMove || dragCreate) return;
    const rect = targetEl.getBoundingClientRect();
    const popoverWidth = 286;
    const idealLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const clampedLeft = Math.max(
      12,
      Math.min(window.innerWidth - popoverWidth - 12, idealLeft)
    );
    const placeAbove = rect.bottom + 186 > window.innerHeight;
    const top = placeAbove ? rect.top - 10 : rect.bottom + 10;
    setPopover({ booking, left: clampedLeft, top, placeAbove });
  };

  const totalCols = ganttDates.length;
  const colWidthPx = isTabletOrDesktop
    ? scale === 'month'
      ? 52
      : scale === 'fortnight'
        ? 84
        : 112
    : scale === 'month'
      ? 42
      : scale === 'fortnight'
        ? 50
        : 62;
  const roomColWidthPx = isTabletOrDesktop ? (scale === 'week' && isDesktop ? 176 : 156) : 72;

  /* Authentic Half-Day Offset geometry: check-in starts at mid-day (+0.5), check-out ends at mid-day (+0.5) */
  const computeHalfDayBarStyle = (startDateISO: string, endDateISO: string) => {
    const rawStart = getNightsCount(ganttStartDate, startDateISO);
    const rawEnd = getNightsCount(ganttStartDate, endDateISO);

    const startsInside = rawStart >= 0;
    const endsInside = rawEnd < totalCols;

    const startCol = startsInside ? rawStart + 0.5 : 0;
    const endCol = endsInside ? rawEnd + 0.5 : totalCols;

    const leftPad = startsInside ? 3 : 1;
    const rightPad = endsInside ? 3 : 1;

    if (scale === 'week' && isDesktop) {
      const leftPct = (startCol / totalCols) * 100;
      const widthPct = Math.max(2, ((endCol - startCol) / totalCols) * 100);
      return {
        left: `calc(${leftPct}% + ${leftPad}px)`,
        width: `calc(${widthPct}% - ${leftPad + rightPad}px)`,
      };
    }

    const leftPx = startCol * colWidthPx + leftPad;
    const widthPx = Math.max(
      24,
      (endCol - startCol) * colWidthPx - leftPad - rightPad
    );
    return {
      left: `${leftPx}px`,
      width: `${widthPx}px`,
    };
  };

  const periodTitle =
    displayMode === 'floorplan'
      ? formatShortDateZh(anchorDate, WEEKDAY_ZH)
      : displayMode === 'calendar'
        ? '月曆查空房'
        : `${monthYear} 年 ${monthIndex + 1} 月`;

  return (
    <section
      className={`preno-page preno-grid-page ${
        dragCreate ? 'is-drag-selecting' : ''
      }`}
      aria-label="房態格"
    >
      {/* Pure Preno Single White Top Utility Bar */}
      <div className="preno-grid-toolbar">
        <div className="preno-toolbar-left">
          {displayMode !== 'calendar' && (
            <div className="preno-date-pill-group">
              <button
                id="btn-grid-prev"
                type="button"
                className="preno-step-btn"
                aria-label="上一區間"
                onClick={() => shiftDate(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                id="btn-grid-today"
                type="button"
                className="preno-step-today"
                onClick={() => setAnchorDate(todayISO)}
              >
                今天
              </button>
              <button
                id="btn-grid-next"
                type="button"
                className="preno-step-btn"
                aria-label="下一區間"
                onClick={() => shiftDate(1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <span className="preno-period-label tabular-nums">{periodTitle}</span>

          {displayMode !== 'calendar' && (
            <div className="desktop-only-flex" style={{ width: 146 }}>
              <SmartDateInput
                id="input-grid-jump-date"
                ariaLabel="跳轉日期"
                value={anchorDate}
                className="smart-date-compact"
                onChange={setAnchorDate}
              />
            </div>
          )}

          {/* Inline Guest Search with Live Jump Dropdown (Preno Native Top Bar) */}
          <div className="preno-grid-search desktop-only-flex">
            <Search size={15} className="preno-search-icon" />
            <input
              id="input-grid-search"
              type="text"
              className="input preno-search-input preno-search-sm"
              placeholder="搜尋旅客或電話..."
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 160)}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="preno-search-clear"
                aria-label="清除搜尋"
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            )}
            {searchFocused && searchQuery.trim() && (
              <div className="preno-search-dropdown">
                {searchMatches.length === 0 ? (
                  <div className="preno-search-empty">查無符合訂房</div>
                ) : (
                  searchMatches.map((b) => {
                    const codes = b.roomIds
                      .map((rid) => roomMap.get(rid)?.code || rid)
                      .join('+');
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className="preno-search-hit"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAnchorDate(b.checkInDate);
                          setSearchQuery('');
                          setSearchFocused(false);
                          onInspectBooking(b);
                        }}
                      >
                        <div>
                          <strong>{b.guestName}</strong>
                          <div className="preno-search-hit-sub tabular-nums">
                            {codes}・{formatShortDateZh(b.checkInDate, WEEKDAY_ZH)}
                          </div>
                        </div>
                        <span className="preno-search-hit-phone tabular-nums">
                          {b.guestPhone}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div className="preno-toolbar-right">
          {/* Preno Native 4 Color View Pills */}
          {displayMode === 'grid' && (
            <div className="preno-view-pills desktop-only-flex" role="tablist" aria-label="格線著色模式">
              {(
                [
                  { id: 'status', label: '住房狀態' },
                  { id: 'groups', label: '團體' },
                  { id: 'payments', label: '收款狀態' },
                  { id: 'guests', label: '老顧客' },
                ] as Array<{ id: PrenoColorMode; label: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  id={`btn-preno-mode-${m.id}`}
                  type="button"
                  role="tab"
                  aria-selected={colorMode === m.id}
                  className={`preno-pill-tab ${colorMode === m.id ? 'active' : ''}`}
                  onClick={() => setColorMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Range Switcher (7天 | 14天 | 整月) */}
          {displayMode === 'grid' && (
            <div className="preno-range-group" role="tablist" aria-label="天數範圍">
              {(
                [
                  { id: 'week', label: '7天' },
                  { id: 'fortnight', label: '14天' },
                  { id: 'month', label: '整月' },
                ] as Array<{ id: GanttScale; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  id={`btn-scale-${opt.id}`}
                  type="button"
                  role="tab"
                  aria-selected={scale === opt.id}
                  className={`preno-range-btn ${scale === opt.id ? 'active' : ''}`}
                  onClick={() => setSelectedScale(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* 3-Way Mode Switcher: 時間軸 | 月曆 | 樓層平面 */}
          <div className="preno-range-group" role="tablist" aria-label="檢視方式">
            <button
              id="btn-mode-grid"
              type="button"
              role="tab"
              aria-selected={displayMode === 'grid'}
              className={`preno-range-btn ${displayMode === 'grid' ? 'active' : ''}`}
              onClick={() => setDisplayMode('grid')}
            >
              時間軸
            </button>
            <button
              id="btn-mode-calendar"
              type="button"
              role="tab"
              aria-selected={displayMode === 'calendar'}
              className={`preno-range-btn ${displayMode === 'calendar' ? 'active' : ''}`}
              onClick={() => setDisplayMode('calendar')}
            >
              <CalendarDays size={13} style={{ verticalAlign: '-2px', marginRight: 3 }} />
              月曆
            </button>
            <button
              id="btn-toggle-floorplan"
              type="button"
              role="tab"
              aria-selected={displayMode === 'floorplan'}
              className={`preno-range-btn ${displayMode === 'floorplan' ? 'active' : ''}`}
              onClick={() => setDisplayMode('floorplan')}
            >
              <LayoutGrid size={13} style={{ verticalAlign: '-2px', marginRight: 3 }} />
              平面
            </button>
          </div>

          <button
            id="btn-open-room-block"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onCreateRoomBlock({ startDate: anchorDate })}
          >
            <Lock size={13} />
            <span>鎖房</span>
          </button>

          <button
            id="btn-grid-new-booking"
            type="button"
            className="btn btn-primary btn-sm desktop-only-flex"
            onClick={() => onCreateBookingAt({ checkInDate: anchorDate })}
          >
            <Plus size={15} />
            <span>新增訂房</span>
          </button>
        </div>
      </div>

      {/* ==================== MONTHLY AVAILABILITY CALENDAR VIEW ==================== */}
      {displayMode === 'calendar' ? (
        <AvailabilityCalendarView
          rooms={activeRooms}
          bookings={bookings}
          roomBlocks={roomBlocks}
          specialHolidayDates={specialHolidayDates}
          todayISO={todayISO}
          anchorDate={anchorDate}
          onSelectDateChange={setAnchorDate}
          onJumpToFloorplan={(dateISO) => {
            setAnchorDate(dateISO);
            setDisplayMode('floorplan');
          }}
          onJumpToGrid={(dateISO) => {
            setAnchorDate(dateISO);
            setDisplayMode('grid');
          }}
          onBookRoomOnDate={(room, dateISO) =>
            onCreateBookingAt({
              roomIds: [room.id],
              checkInDate: dateISO,
              checkOutDate: addDaysISO(dateISO, 1),
            })
          }
        />
      ) : displayMode === 'floorplan' ? (() => {
        const renderFlatRoomTile = (room: Room) => {
          const staying = floorplanData.stayMap.get(room.id);
          const departing = floorplanData.departMap.get(room.id);
          const activeBlock = floorplanData.blockMap.get(room.id);
          const isDirty = room.housekeepingStatus === 'dirty';

          const broomBtn = (
            <button
              type="button"
              className={`preno-broom-btn preno-fp-broom ${
                isDirty ? 'is-dirty' : 'is-clean'
              }`}
              title={`${HOUSEKEEPING_LABELS[room.housekeepingStatus]}（點擊切換）`}
              onClick={(e) => {
                e.stopPropagation();
                void onToggleHousekeeping(
                  room.id,
                  isDirty ? 'clean' : 'dirty'
                );
              }}
            >
              <BroomIcon size={13} />
            </button>
          );

          if (!staying && activeBlock) {
            return (
              <div
                className="preno-fp-tile is-blocked"
                role="button"
                tabIndex={0}
                onClick={() => onInspectRoomBlock(activeBlock)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onInspectRoomBlock(activeBlock);
                  }
                }}
              >
                <div className="preno-fp-top">
                  <strong className="preno-fp-code">{room.code}</strong>
                  {broomBtn}
                </div>
                <div className="preno-fp-mid">
                  <Lock size={12} style={{ flexShrink: 0 }} />
                  <span className="preno-fp-ellipsis">
                    {activeBlock.reason}
                  </span>
                </div>
                <div className="preno-fp-bot fp-hide-mobile tabular-nums">
                  <span>鎖房中</span>
                  <span>
                    至 {formatShortDateZh(activeBlock.endDate, WEEKDAY_ZH)}
                  </span>
                </div>
              </div>
            );
          }

          if (!staying) {
            return (
              <div
                className="preno-fp-tile is-vacant"
                role="button"
                tabIndex={0}
                onClick={() =>
                  onCreateBookingAt({
                    roomIds: [room.id],
                    checkInDate: anchorDate,
                    checkOutDate: addDaysISO(anchorDate, 1),
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCreateBookingAt({
                      roomIds: [room.id],
                      checkInDate: anchorDate,
                      checkOutDate: addDaysISO(anchorDate, 1),
                    });
                  }
                }}
              >
                <div className="preno-fp-top">
                  <strong className="preno-fp-code">{room.code}</strong>
                  {broomBtn}
                </div>
                {departing ? (
                  <div
                    className="preno-fp-turnover"
                    title={`上午退房：${departing.guestName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectBooking(departing);
                    }}
                  >
                    退：{departing.guestName}
                  </div>
                ) : (
                  <div className="preno-fp-vacant-cta">
                    <span>空房</span>
                  </div>
                )}
                <div className="preno-fp-bot fp-hide-mobile tabular-nums">
                  <span>{room.standardCapacity}人房</span>
                  <span>${room.standardRate.toLocaleString()}</span>
                </div>
              </div>
            );
          }

          const depState = getDepositTrackingState(staying, todayISO);
          const balance = getBalanceDue(staying);
          const barCls = resolveBarColorClass(staying);

          return (
            <div
              className={`preno-fp-tile is-occupied ${barCls}`}
              role="button"
              tabIndex={0}
              onClick={() => onInspectBooking(staying)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onInspectBooking(staying);
                }
              }}
            >
              <div className="preno-fp-top">
                <strong className="preno-fp-code">{room.code}</strong>
                {broomBtn}
              </div>
              {departing && departing.id !== staying.id && (
                <div
                  className="preno-fp-turnover fp-hide-mobile"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInspectBooking(departing);
                  }}
                >
                  退：{departing.guestName} → 入：{staying.guestName}
                </div>
              )}
              <div className="preno-fp-guest">{staying.guestName}</div>
              <div className="preno-fp-bot fp-hide-mobile tabular-nums">
                <span>
                  {depState === 'deposit_overdue'
                    ? '逾期未匯'
                    : BOOKING_STATUS_LABELS[staying.status]}
                </span>
                <strong>
                  {balance > 0 ? `尾 $${balance.toLocaleString()}` : '已付清'}
                </strong>
              </div>
            </div>
          );
        };

        return (
          <div className="preno-floorplan-wrap">
            <div
              className={`preno-fp-container ${
                isTabletOrDesktop ? 'is-campus3d' : ''
              }`}
            >
              <div className="preno-fp-summary tabular-nums">
                <span>
                  {formatShortDateZh(anchorDate, WEEKDAY_ZH)} 住房狀況：已訂{' '}
                  <strong>{floorplanData.stayMap.size}</strong> / {activeRooms.length} 間
                </span>
                {floorplanData.blockMap.size > 0 && (
                  <span>
                    鎖房 <strong>{floorplanData.blockMap.size}</strong> 間
                  </span>
                )}
                <span>
                  空房{' '}
                  <strong style={{ color: 'var(--brand-teal-ink)' }}>
                    {Math.max(
                      0,
                      activeRooms.length -
                        floorplanData.stayMap.size -
                        floorplanData.blockMap.size
                    )}{' '}
                    間
                  </strong>
                </span>
              </div>

              {isTabletOrDesktop ? (
                <Campus3DFloorplan
                  rooms={activeRooms}
                  stayMap={floorplanData.stayMap}
                  departMap={floorplanData.departMap}
                  blockMap={floorplanData.blockMap}
                  todayISO={todayISO}
                  resolveBarColorClass={resolveBarColorClass}
                  onSelectVacant={(room) =>
                    onCreateBookingAt({
                      roomIds: [room.id],
                      checkInDate: anchorDate,
                      checkOutDate: addDaysISO(anchorDate, 1),
                    })
                  }
                  onInspectBooking={onInspectBooking}
                  onInspectRoomBlock={onInspectRoomBlock}
                  onToggleHousekeeping={onToggleHousekeeping}
                  renderExtraRoom={renderFlatRoomTile}
                />
              ) : (
                <FloorplanRoomMap
                  rooms={activeRooms}
                  renderRoom={renderFlatRoomTile}
                />
              )}

              <div className="preno-fp-legend">
                <span className="preno-legend-item">
                  <span className="preno-swatch is-vacant-swatch" />
                  空房
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-blue" />
                  已確認
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-green" />
                  已入住
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-amber" />
                  待付訂金
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-red" />
                  逾期未匯
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch is-hatched" />
                  鎖房
                </span>
              </div>
            </div>
          </div>
        );
      })() : (
        /* ==================== AUTHENTIC PRENO FULL-WHITE GRID ==================== */
        <>
          <div
            className="preno-grid-frame"
            ref={timelineScrollRef}
            onScroll={() => {
              if (popover) setPopover(null);
            }}
          >
            <div
              className="preno-grid-table"
              style={{
                gridTemplateColumns:
                  scale === 'week' && isDesktop
                    ? `${roomColWidthPx}px repeat(${totalCols}, minmax(112px, 1fr))`
                    : `${roomColWidthPx}px repeat(${totalCols}, ${colWidthPx}px)`,
              }}
            >
              {/* Top-left corner */}
              <div className="preno-grid-corner">
                <span>房間</span>
                <span
                  className="tabular-nums preno-grid-corner-count"
                  style={{ fontWeight: 500, color: 'var(--ink-muted)' }}
                >
                  {activeRooms.length}間
                </span>
              </div>

              {/* Date Columns Header */}
              {ganttDates.map((dateISO) => {
                const parsed = parseDateISO(dateISO);
                const isSpecial = specialHolidayDates.includes(dateISO);
                const holiday = isHolidayNight(dateISO, specialHolidayDates);
                const isToday = dateISO === todayISO;
                const unavailable = ganttUnavailableByDate.get(dateISO) || 0;
                const vacant = Math.max(0, activeRooms.length - unavailable);

                return (
                  <button
                    key={dateISO}
                    type="button"
                    className={`preno-date-col-head ${
                      holiday ? 'is-weekend' : ''
                    } ${isToday ? 'is-today' : ''}`}
                    title={`點擊檢視 ${dateISO} 樓層平面${isSpecial ? '（特殊假日）' : ''}`}
                    onClick={() => {
                      setAnchorDate(dateISO);
                      setDisplayMode('floorplan');
                    }}
                  >
                    <span className="preno-col-dow">
                      週{WEEKDAY_ZH[parsed.getDay()]}
                      {isSpecial ? '★' : ''}
                    </span>
                    <span className="preno-col-day tabular-nums">
                      {parsed.getDate()}
                    </span>
                    <span
                      className={`preno-col-avail tabular-nums ${
                        vacant === 0 ? 'is-full' : ''
                      }`}
                    >
                      {vacant === 0 ? '滿' : `餘${vacant}`}
                    </span>
                  </button>
                );
              })}

              {/* Room Rows grouped cleanly by Building */}
              {groupedRooms.map((group) => (
                <div key={group.zone} style={{ display: 'contents' }}>
                  <div className="preno-grid-group-row">
                    {BUILDING_LABELS[group.zone]}
                  </div>

                  {group.items.map((room) => {
                    const roomBookings = ganttBookingsByRoom.get(room.id) || [];
                    const blocksForRoom = ganttBlocksByRoom.get(room.id) || [];
                    const isDirty = room.housekeepingStatus === 'dirty';

                    const createRange =
                      dragCreate && dragCreate.roomId === room.id
                        ? {
                            start:
                              dragCreate.anchorDate <= dragCreate.currentDate
                                ? dragCreate.anchorDate
                                : dragCreate.currentDate,
                            endExclusive: addDaysISO(
                              dragCreate.anchorDate <= dragCreate.currentDate
                                ? dragCreate.currentDate
                                : dragCreate.anchorDate,
                              1
                            ),
                          }
                        : null;

                    return (
                      <div key={room.id} className="preno-grid-row">
                        {/* Sticky Left Room Cell (slim 72px on mobile, full with broom on tablet/desktop) */}
                        <div
                          className="preno-room-cell"
                          title={`${room.name}（${HOUSEKEEPING_LABELS[room.housekeepingStatus]}）`}
                        >
                          <div className="preno-room-cell-main">
                            <span className="preno-room-cell-code">
                              {room.code}
                              {!isTabletOrDesktop && isDirty && (
                                <span
                                  className="preno-mobile-dirty-dot"
                                  aria-label="待清掃"
                                />
                              )}
                            </span>
                            <span className="preno-room-cell-sub tabular-nums">
                              {room.floorLabel}・${room.standardRate.toLocaleString()}
                            </span>
                          </div>
                          {isTabletOrDesktop && (
                            <button
                              type="button"
                              className={`preno-broom-btn ${
                                isDirty ? 'is-dirty' : 'is-clean'
                              }`}
                              title={`${HOUSEKEEPING_LABELS[room.housekeepingStatus]}（點擊切換）`}
                              aria-label={`${room.code} ${HOUSEKEEPING_LABELS[room.housekeepingStatus]}，點擊切換`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void onToggleHousekeeping(
                                  room.id,
                                  isDirty ? 'clean' : 'dirty'
                                );
                              }}
                            >
                              <BroomIcon size={15} />
                            </button>
                          )}
                        </div>

                        {/* Day Cells Track */}
                        <div
                          className="preno-cells-track"
                          style={{
                            gridColumn: `2 / span ${totalCols}`,
                            gridTemplateColumns:
                              scale === 'week' && isDesktop
                                ? `repeat(${totalCols}, minmax(0, 1fr))`
                                : `repeat(${totalCols}, ${colWidthPx}px)`,
                          }}
                        >
                          {ganttDates.map((dateISO) => {
                            const holiday = isHolidayNight(
                              dateISO,
                              specialHolidayDates
                            );
                            const isToday = dateISO === todayISO;
                            const isCellOccupied =
                              roomBookings.some(
                                (b) =>
                                  b.checkInDate <= dateISO &&
                                  b.checkOutDate > dateISO
                              ) ||
                              blocksForRoom.some(
                                (blk) =>
                                  blk.startDate <= dateISO &&
                                  blk.endDate > dateISO
                              );

                            return (
                              <button
                                key={dateISO}
                                type="button"
                                className={`preno-day-cell ${
                                  holiday ? 'is-weekend' : ''
                                } ${isToday ? 'is-today' : ''}`}
                                aria-label={`為 ${room.code} 於 ${dateISO} 新增訂房`}
                                onMouseDown={(e) => {
                                  if (e.button !== 0 || isCellOccupied) return;
                                  setPopover(null);
                                  setDragCreate({
                                    roomId: room.id,
                                    anchorDate: dateISO,
                                    currentDate: dateISO,
                                  });
                                }}
                                onMouseEnter={() => {
                                  if (
                                    dragCreate &&
                                    dragCreate.roomId === room.id
                                  ) {
                                    setDragCreate((prev) =>
                                      prev
                                        ? { ...prev, currentDate: dateISO }
                                        : null
                                    );
                                  }
                                }}
                                onClick={() => {
                                  if (suppressNextClickRef.current) return;
                                  onCreateBookingAt({
                                    roomIds: [room.id],
                                    checkInDate: dateISO,
                                    checkOutDate: addDaysISO(dateISO, 1),
                                  });
                                }}
                                onDragOver={(e) => {
                                  if (!dragMove) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                  if (
                                    !dropTarget ||
                                    dropTarget.roomId !== room.id ||
                                    dropTarget.dateISO !== dateISO
                                  ) {
                                    setDropTarget({ roomId: room.id, dateISO });
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  handleDropBooking();
                                }}
                              />
                            );
                          })}

                          {/* Drag-to-book Live Preview */}
                          {createRange && (
                            <div
                              className="preno-drag-create-bar tabular-nums"
                              style={computeHalfDayBarStyle(
                                createRange.start,
                                createRange.endExclusive
                              )}
                            >
                              {getNightsCount(
                                createRange.start,
                                createRange.endExclusive
                              )}{' '}
                              晚
                            </div>
                          )}

                          {/* Drag-to-move Live Target Preview */}
                          {dropPreview && dropPreview.roomId === room.id && (
                            <div
                              className={`preno-drop-target-bar ${
                                dropPreview.hasConflict
                                  ? 'is-conflict'
                                  : 'is-valid'
                              }`}
                              style={computeHalfDayBarStyle(
                                dropPreview.startDate,
                                dropPreview.endDate
                              )}
                            >
                              {dropPreview.hasConflict ? '撞期衝突' : '放開確認'}
                            </div>
                          )}

                          {/* Maintenance / Owner Hatched Lock Bars */}
                          {blocksForRoom.map((block) => (
                            <button
                              key={block.id}
                              type="button"
                              className="preno-block-bar"
                              style={computeHalfDayBarStyle(
                                block.startDate,
                                block.endDate
                              )}
                              title={`鎖房：${block.reason}（${block.startDate} ~ ${block.endDate}）`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onInspectRoomBlock(block);
                              }}
                            >
                              <Lock size={11} style={{ flexShrink: 0 }} />
                              <span className="preno-bar-text">
                                {block.reason}
                              </span>
                            </button>
                          ))}

                          {/* Authentic Preno Half-Day Booking Bars */}
                          {roomBookings.map((booking) => {
                            const barClass = resolveBarColorClass(booking);
                            const isReturning = returningPhoneSet.has(
                              booking.guestPhone.replace(/\D/g, '')
                            );
                            const isGroupHovered =
                              hoveredBookingId === booking.id;
                            const isDragging =
                              dragMove?.booking.id === booking.id;
                            const canDrag = booking.status !== 'checked_out';

                            return (
                              <button
                                key={`${booking.id}-${room.id}`}
                                type="button"
                                draggable={canDrag}
                                className={`preno-booking-bar ${barClass} ${
                                  isGroupHovered ? 'is-linked' : ''
                                } ${isDragging ? 'is-dragging' : ''}`}
                                style={computeHalfDayBarStyle(
                                  booking.checkInDate,
                                  booking.checkOutDate
                                )}
                                onDragStart={(e) => {
                                  if (!canDrag) return;
                                  setPopover(null);
                                  setHoveredBookingId(null);
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', booking.id);
                                  setDragMove({
                                    booking,
                                    sourceRoomId: room.id,
                                    nights: getNightsCount(
                                      booking.checkInDate,
                                      booking.checkOutDate
                                    ),
                                  });
                                }}
                                onDragEnd={() => {
                                  setDragMove(null);
                                  setDropTarget(null);
                                }}
                                onMouseEnter={(e) => {
                                  setHoveredBookingId(booking.id);
                                  openPopoverForBar(booking, e.currentTarget);
                                }}
                                onMouseLeave={() => {
                                  setHoveredBookingId(null);
                                  setPopover(null);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPopover(null);
                                  onInspectBooking(booking);
                                }}
                              >
                                {isReturning && (
                                  <Star
                                    size={11}
                                    fill="currentColor"
                                    style={{ flexShrink: 0 }}
                                  />
                                )}
                                <span className="preno-bar-text">
                                  {booking.guestName}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Clean Preno Bottom Legend Bar */}
          <div className="preno-grid-legend">
            {colorMode === 'payments' ? (
              <>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-green" />
                  已付清
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-blue" />
                  已付訂金
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-amber" />
                  待付訂金
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-red" />
                  逾期未匯
                </span>
              </>
            ) : colorMode === 'groups' ? (
              <>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-group-0" />
                  多房團體訂單（同色標示）
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-muted" />
                  單房訂單
                </span>
              </>
            ) : colorMode === 'guests' ? (
              <>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-teal" />★ 老顧客
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-muted" />
                  首次入住
                </span>
              </>
            ) : (
              <>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-blue" />
                  已確認
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-green" />
                  已入住
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-amber" />
                  待付訂金
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-red" />
                  逾期未匯
                </span>
                <span className="preno-legend-item">
                  <span className="preno-swatch bar-gray" />
                  已退房
                </span>
              </>
            )}
            <span className="preno-legend-item">
              <span className="preno-swatch is-hatched" />
              鎖房／維修
            </span>
            <span className="preno-legend-item">
              <Sparkles size={12} color="#F39C12" />
              橘色掃把＝待打掃
            </span>
          </div>
        </>
      )}

      {/* Desktop Hover Preview Popover */}
      {popover && !dragMove && !dragCreate && !pendingMove && (() => {
        const b = popover.booking;
        const depState = getDepositTrackingState(b, todayISO);
        const balance = getBalanceDue(b);
        const nights = getNightsCount(b.checkInDate, b.checkOutDate);
        const roomCodes = b.roomIds
          .map((rid) => roomMap.get(rid)?.code || rid)
          .join(' + ');

        return (
          <div
            className={`gantt-hover-popover ${
              popover.placeAbove ? 'place-above' : ''
            }`}
            style={{ left: popover.left, top: popover.top }}
            role="tooltip"
          >
            <div className="gantt-pop-header">
              <strong>{b.guestName}</strong>
              <span className={`pill pill-dep-${depState}`}>
                {DEPOSIT_TRACKING_LABELS[depState]}
              </span>
            </div>
            <div className="gantt-pop-meta tabular-nums">
              <span>
                {formatShortDateZh(b.checkInDate, WEEKDAY_ZH)} →{' '}
                {formatShortDateZh(b.checkOutDate, WEEKDAY_ZH)}（{nights} 晚）
              </span>
              <span className="gantt-pop-line">
                <Users size={12} />
                {roomCodes}・大人 {b.adults}
                {b.children > 0 ? `、孩童 ${b.children}` : ''}・
                {BOOKING_STATUS_LABELS[b.status]}
              </span>
              <span className="gantt-pop-line">
                <Phone size={12} />
                {b.guestPhone}
              </span>
            </div>
            <div className="gantt-pop-money tabular-nums">
              <span>總額 {formatCurrencyTWD(b.totalAmount)}</span>
              <strong
                style={{
                  color:
                    balance > 0 ? 'var(--status-overdue)' : 'var(--brand-teal)',
                }}
              >
                {balance > 0 ? `待收 ${formatCurrencyTWD(balance)}` : '已付清'}
              </strong>
            </div>
            {b.notes && <div className="gantt-pop-notes">{b.notes}</div>}
          </div>
        );
      })()}

      {/* Senior-Friendly Large Confirmation Dialog for Drag-to-Move */}
      {pendingMove && (
        <div
          className="overlay-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-move-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !movingBusy) {
              setPendingMove(null);
            }
          }}
        >
          <div className="modal-card preno-confirm-modal">
            <div className="modal-header">
              <h2 id="confirm-move-title" style={{ fontSize: 19, fontWeight: 700 }}>
                確認移動訂房？
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label="關閉"
                disabled={movingBusy}
                onClick={() => setPendingMove(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ gap: 12 }}>
              <p style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--ink-primary)' }}>
                確定要將 <strong>「{pendingMove.booking.guestName}」</strong> 移動至以下新房位與日期嗎？
              </p>
              <div className="preno-move-compare tabular-nums">
                <div>
                  <div className="preno-move-label">原本</div>
                  <div className="preno-move-val">
                    {pendingMove.fromRoomsLabel}｜{pendingMove.fromDatesLabel}
                  </div>
                </div>
                <div className="preno-move-arrow">↓</div>
                <div>
                  <div className="preno-move-label is-new">移動後</div>
                  <div className="preno-move-val is-new">
                    {pendingMove.toRoomsLabel}｜{pendingMove.toDatesLabel}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                disabled={movingBusy}
                onClick={() => setPendingMove(null)}
              >
                取消
              </button>
              <button
                id="btn-confirm-drag-move"
                type="button"
                className="btn btn-primary btn-lg"
                disabled={movingBusy}
                onClick={() => void confirmPendingMove()}
              >
                {movingBusy ? '移動中...' : '確定移動'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
