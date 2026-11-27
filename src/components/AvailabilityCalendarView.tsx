import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Sparkles,
} from 'lucide-react';
import { BUILDING_LABELS, WEEKDAY_ZH } from '../constants/labels';
import {
  addDaysISO,
  formatDateISO,
  formatShortDateZh,
  isHolidayNight,
  parseDateISO,
} from '../domain/bookingLogic';
import type { Booking, Room, RoomBlock } from '../types/domain';

interface AvailabilityCalendarViewProps {
  rooms: Room[];
  bookings: Booking[];
  roomBlocks: RoomBlock[];
  specialHolidayDates: string[];
  todayISO: string;
  anchorDate: string;
  onSelectDateChange: (dateISO: string) => void;
  onJumpToFloorplan: (dateISO: string) => void;
  onJumpToGrid: (dateISO: string) => void;
  onBookRoomOnDate: (room: Room, dateISO: string) => void;
}

type CalendarRoomFilter = 'all' | 'xinyue' | 'youde' | 'family4' | 'couple2';

const FILTER_OPTIONS: { id: CalendarRoomFilter; label: string }[] = [
  { id: 'all', label: '全部房型' },
  { id: 'xinyue', label: '本館' },
  { id: 'youde', label: '侑德園' },
  { id: 'family4', label: '4人以上' },
  { id: 'couple2', label: '2人房' },
];

function getMonthGridDates(year: number, monthIndex: number): string[] {
  const firstDay = new Date(year, monthIndex, 1);
  const startDow = firstDay.getDay(); // 0 = Sun
  const lastDate = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((startDow + lastDate) / 7) * 7;

  const dates: string[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, monthIndex, 1 - startDow + i);
    dates.push(formatDateISO(d));
  }
  return dates;
}

/**
 * Pure Native Preno Monthly Availability Calendar:
 * Lets staff answer phone inquiries like "Which Saturdays next month still have a 4-person room?"
 * in 2 taps, with instant per-day vacant room list & direct one-tap booking.
 */
export function AvailabilityCalendarView({
  rooms,
  bookings,
  roomBlocks,
  specialHolidayDates,
  todayISO,
  anchorDate,
  onSelectDateChange,
  onJumpToFloorplan,
  onJumpToGrid,
  onBookRoomOnDate,
}: AvailabilityCalendarViewProps) {
  const initialParsed = parseDateISO(anchorDate);
  const [viewYear, setViewYear] = useState(initialParsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialParsed.getMonth());
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const [filter, setFilter] = useState<CalendarRoomFilter>('all');

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (filter === 'xinyue') return room.building === 'xinyue';
      if (filter === 'youde') return room.building === 'youde';
      if (filter === 'family4') return room.maxCapacity >= 4;
      if (filter === 'couple2') return room.standardCapacity <= 2;
      return true;
    });
  }, [rooms, filter]);

  const calendarDates = useMemo(
    () => getMonthGridDates(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  /* Compute unavailable room IDs for every date visible in the month grid */
  const unavailableMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (calendarDates.length === 0) return map;
    const rangeStart = calendarDates[0];
    const rangeEndExclusive = addDaysISO(calendarDates[calendarDates.length - 1], 1);

    for (const d of calendarDates) {
      map.set(d, new Set());
    }

    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      if (b.checkOutDate <= rangeStart || b.checkInDate >= rangeEndExclusive) {
        continue;
      }
      let cur = b.checkInDate < rangeStart ? rangeStart : b.checkInDate;
      const stop = b.checkOutDate > rangeEndExclusive ? rangeEndExclusive : b.checkOutDate;
      while (cur < stop) {
        const set = map.get(cur);
        if (set) {
          for (const rid of b.roomIds) set.add(rid);
        }
        cur = addDaysISO(cur, 1);
      }
    }

    for (const blk of roomBlocks) {
      if (blk.endDate <= rangeStart || blk.startDate >= rangeEndExclusive) {
        continue;
      }
      let cur = blk.startDate < rangeStart ? rangeStart : blk.startDate;
      const stop = blk.endDate > rangeEndExclusive ? rangeEndExclusive : blk.endDate;
      while (cur < stop) {
        const set = map.get(cur);
        if (set) set.add(blk.roomId);
        cur = addDaysISO(cur, 1);
      }
    }

    return map;
  }, [bookings, roomBlocks, calendarDates]);

  const selectedDayRooms = useMemo(() => {
    const unavailable = unavailableMap.get(selectedDate) ?? new Set<string>();
    const vacant = filteredRooms.filter((r) => !unavailable.has(r.id));
    const xinyueVacant = vacant.filter((r) => r.building === 'xinyue');
    const youdeVacant = vacant.filter((r) => r.building === 'youde');
    return { vacant, xinyueVacant, youdeVacant };
  }, [filteredRooms, unavailableMap, selectedDate]);

  const selectedIsHoliday = isHolidayNight(selectedDate, specialHolidayDates);
  const selectedIsSpecial = specialHolidayDates.includes(selectedDate);

  const stepMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    const nextIso = formatDateISO(next);
    setSelectedDate(nextIso);
    onSelectDateChange(nextIso);
  };

  const jumpToCurrentMonth = () => {
    const t = parseDateISO(todayISO);
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setSelectedDate(todayISO);
    onSelectDateChange(todayISO);
  };

  const handleSelectDay = (dateISO: string) => {
    setSelectedDate(dateISO);
    onSelectDateChange(dateISO);
    const parsed = parseDateISO(dateISO);
    if (
      parsed.getFullYear() !== viewYear ||
      parsed.getMonth() !== viewMonth
    ) {
      setViewYear(parsed.getFullYear());
      setViewMonth(parsed.getMonth());
    }
  };

  return (
    <div className="preno-cal-wrap">
      <div className="preno-cal-layout">
        {/* Left/Top: Monthly Availability Grid */}
        <section className="preno-cal-main" aria-label="月曆空房查詢">
          <div className="preno-cal-head">
            <div className="preno-cal-month-nav">
              <button
                type="button"
                className="btn-icon"
                aria-label="上個月"
                onClick={() => stepMonth(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <h2 className="preno-cal-month-title tabular-nums">
                {viewYear} 年 {viewMonth + 1} 月
              </h2>
              <button
                type="button"
                className="btn-icon"
                aria-label="下個月"
                onClick={() => stepMonth(1)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={jumpToCurrentMonth}
              >
                本月
              </button>
            </div>

            <div className="preno-cal-filters" role="tablist" aria-label="篩選房型">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === opt.id}
                  className={`preno-cal-chip ${filter === opt.id ? 'is-active' : ''}`}
                  onClick={() => setFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekday Header Row */}
          <div className="preno-cal-dow-row">
            {WEEKDAY_ZH.map((dow, idx) => (
              <div
                key={dow}
                className={`preno-cal-dow-cell ${
                  idx === 0 || idx === 6 ? 'is-weekend' : ''
                }`}
              >
                週{dow}
              </div>
            ))}
          </div>

          {/* 7-Column Calendar Cells */}
          <div className="preno-cal-grid">
            {calendarDates.map((dateISO) => {
              const parsed = parseDateISO(dateISO);
              const inMonth = parsed.getMonth() === viewMonth;
              const isToday = dateISO === todayISO;
              const isSelected = dateISO === selectedDate;
              const isSpecial = specialHolidayDates.includes(dateISO);
              const holiday = isHolidayNight(dateISO, specialHolidayDates);
              const unavailable = unavailableMap.get(dateISO) ?? new Set<string>();
              const vacantList = filteredRooms.filter((r) => !unavailable.has(r.id));
              const vacantCount = vacantList.length;

              const availTone =
                vacantCount === 0
                  ? 'is-full'
                  : vacantCount <= 3
                    ? 'is-low'
                    : 'is-open';

              return (
                <button
                  key={dateISO}
                  type="button"
                  className={`preno-cal-cell ${inMonth ? '' : 'is-outside'} ${
                    holiday ? 'is-holiday' : ''
                  } ${isToday ? 'is-today' : ''} ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  onClick={() => handleSelectDay(dateISO)}
                >
                  <div className="preno-cal-cell-top">
                    <span className="preno-cal-day-num tabular-nums">
                      {parsed.getDate()}
                    </span>
                    {isSpecial && (
                      <span className="preno-cal-star" title="特殊假日">
                        ★
                      </span>
                    )}
                  </div>
                  <div className={`preno-cal-badge tabular-nums ${availTone}`}>
                    {vacantCount === 0 ? '滿房' : `餘 ${vacantCount}`}
                  </div>
                  {vacantCount > 0 && (
                    <div className="preno-cal-preview desktop-only">
                      {vacantList
                        .slice(0, 3)
                        .map((r) => r.code)
                        .join('、')}
                      {vacantList.length > 3 ? '…' : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="preno-cal-legend">
            <span className="preno-legend-item">
              <span className="preno-cal-dot is-open" />
              空房充裕
            </span>
            <span className="preno-legend-item">
              <span className="preno-cal-dot is-low" />
              僅剩 1～3 間
            </span>
            <span className="preno-legend-item">
              <span className="preno-cal-dot is-full" />
              已滿房
            </span>
            <span className="preno-legend-item">
              <span>★ 特殊假日</span>
            </span>
          </div>
        </section>

        {/* Right/Bottom: Selected Day Vacant Rooms & Instant Booking */}
        <aside className="preno-cal-detail" aria-label="選定日期空房明細">
          <div className="preno-cal-detail-head">
            <div>
              <div className="preno-cal-detail-date tabular-nums">
                {formatShortDateZh(selectedDate, WEEKDAY_ZH)}
                <span className="preno-cal-rate-tag">
                  {selectedIsSpecial
                    ? '特殊假日價'
                    : selectedIsHoliday
                      ? '假日價'
                      : '平日價'}
                </span>
              </div>
              <div className="preno-cal-detail-sub tabular-nums">
                符合篩選空房：
                <strong>
                  {selectedDayRooms.vacant.length} / {filteredRooms.length} 間
                </strong>
              </div>
            </div>
            <div className="preno-cal-detail-jumps">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onJumpToFloorplan(selectedDate)}
              >
                <LayoutGrid size={14} />
                <span>平面圖</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onJumpToGrid(selectedDate)}
              >
                <CalendarDays size={14} />
                <span>時間軸</span>
              </button>
            </div>
          </div>

          {selectedDayRooms.vacant.length === 0 ? (
            <div className="preno-cal-empty">
              <Sparkles size={20} style={{ color: 'var(--ink-faint)' }} />
              <p>這一天符合條件的房型皆已滿房或鎖房</p>
              <span className="text-muted">可點選其他綠色日期，或切換「全部房型」查看</span>
            </div>
          ) : (
            <div className="preno-cal-room-list">
              {[
                { zone: 'xinyue' as const, items: selectedDayRooms.xinyueVacant },
                { zone: 'youde' as const, items: selectedDayRooms.youdeVacant },
              ]
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <div key={group.zone} className="preno-cal-group">
                    <div className="preno-cal-group-label">
                      {BUILDING_LABELS[group.zone]}（{group.items.length} 間空房）
                    </div>
                    {group.items.map((room) => {
                      const nightlyRate = selectedIsHoliday
                        ? room.weekendRate
                        : room.standardRate;
                      return (
                        <div key={room.id} className="preno-cal-room-row">
                          <div className="preno-cal-room-info">
                            <strong>{room.code}</strong>
                            <span>
                              {room.floorLabel}・
                              {room.rateTiers
                                ? `${room.standardCapacity}~${room.maxCapacity}人`
                                : `${room.standardCapacity}人`}
                              ・
                              <b className="tabular-nums">
                                ${nightlyRate.toLocaleString()}
                              </b>
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onBookRoomOnDate(room, selectedDate)}
                          >
                            <Plus size={14} />
                            <span>訂房</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
