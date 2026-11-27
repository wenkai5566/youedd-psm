import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Coffee,
  Phone,
  Plus,
  Star,
} from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  DEPOSIT_TRACKING_LABELS,
  WEEKDAY_ZH,
} from '../constants/labels';
import {
  addDaysISO,
  calculateBreakfastSummary,
  formatShortDateZh,
  getBalanceDue,
  getDepositTrackingState,
  getNightsCount,
  getTodayISO,
  sanitizePhoneForTel,
} from '../domain/bookingLogic';
import type { Booking, Room } from '../types/domain';
import { SmartDateInput } from './SmartDateInput';

interface TodayOperationsViewProps {
  rooms: Room[];
  bookings: Booking[];
  selectedDate: string;
  onChangeDate: (dateISO: string) => void;
  onCreateBooking: () => void;
  onInspectBooking: (booking: Booking) => void;
}

type TodayTab = 'arrivals' | 'departures' | 'in_house' | 'deposits';

export function TodayOperationsView({
  rooms,
  bookings,
  selectedDate,
  onChangeDate,
  onCreateBooking,
  onInspectBooking,
}: TodayOperationsViewProps) {
  const todayISO = getTodayISO();
  const [activeTab, setActiveTab] = useState<TodayTab>('arrivals');

  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms]
  );

  /* Track returning guest phones (>= 2 non-cancelled stays) for Preno ★ badge */
  const returningPhoneSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
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
  }, [bookings]);

  const breakfastSummary = useMemo(
    () => calculateBreakfastSummary(selectedDate, bookings, rooms),
    [selectedDate, bookings, rooms]
  );

  const { arrivals, departures, inHouse, pendingDeposits, overdueCount } =
    useMemo(() => {
      const active = bookings.filter((b) => b.status !== 'cancelled');

      const arrivalList = active
        .filter((b) => b.checkInDate === selectedDate)
        .sort((a, b) =>
          a.status === 'confirmed' && b.status !== 'confirmed' ? -1 : 1
        );

      const departureList = active
        .filter((b) => b.checkOutDate === selectedDate)
        .sort((a, b) =>
          a.status === 'checked_in' && b.status !== 'checked_in' ? -1 : 1
        );

      const inHouseList = active.filter(
        (b) => b.checkInDate < selectedDate && b.checkOutDate > selectedDate
      );

      const depositList = active
        .filter((b) => {
          const state = getDepositTrackingState(b, todayISO);
          return state === 'deposit_overdue' || state === 'awaiting_deposit';
        })
        .sort((a, b) => a.depositDueDate.localeCompare(b.depositDueDate));

      const overdue = depositList.filter(
        (b) => getDepositTrackingState(b, todayISO) === 'deposit_overdue'
      ).length;

      return {
        arrivals: arrivalList,
        departures: departureList,
        inHouse: inHouseList,
        pendingDeposits: depositList,
        overdueCount: overdue,
      };
    }, [bookings, selectedDate, todayISO]);

  const isToday = selectedDate === todayISO;

  const currentList =
    activeTab === 'arrivals'
      ? arrivals
      : activeTab === 'departures'
        ? departures
        : activeTab === 'in_house'
          ? inHouse
          : pendingDeposits;

  const resolveDotClass = (booking: Booking): string => {
    const dep = getDepositTrackingState(booking, todayISO);
    if (booking.status === 'checked_out') return 'dot-gray';
    if (dep === 'deposit_overdue') return 'dot-red';
    if (booking.status === 'checked_in') return 'dot-green';
    if (dep === 'awaiting_deposit') return 'dot-amber';
    return 'dot-blue';
  };

  return (
    <section className="preno-page" aria-label="今日房務">
      {/* Desktop/Tablet Clean White Top Bar (Mobile uses AppShell dark header + date bar below) */}
      <div className="preno-topbar preno-today-topbar">
        <div className="preno-date-nav">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="前一天"
            onClick={() => onChangeDate(addDaysISO(selectedDate, -1))}
          >
            <ChevronLeft size={19} />
          </button>

          <span className="preno-date-heading tabular-nums">
            {formatShortDateZh(selectedDate, WEEKDAY_ZH)}
            {isToday ? ' 今天' : ''}
          </span>

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="後一天"
            onClick={() => onChangeDate(addDaysISO(selectedDate, 1))}
          >
            <ChevronRight size={19} />
          </button>

          {!isToday && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChangeDate(todayISO)}
            >
              回今天
            </button>
          )}
        </div>

        <div className="preno-topbar-right desktop-only-flex">
          <SmartDateInput
            id="input-today-jump-date"
            ariaLabel="切換日期"
            value={selectedDate}
            className="smart-date-compact"
            onChange={onChangeDate}
          />
          <button
            id="btn-today-new-booking"
            type="button"
            className="btn btn-primary"
            onClick={onCreateBooking}
          >
            <Plus size={16} />
            新增訂房
          </button>
        </div>
      </div>

      {/* Preno Native Underline Tabs */}
      <div className="preno-underline-tabs" role="tablist" aria-label="今日分類">
        {(
          [
            { id: 'arrivals', label: '入住', count: arrivals.length },
            { id: 'departures', label: '退房', count: departures.length },
            { id: 'in_house', label: '在館', count: inHouse.length },
            {
              id: 'deposits',
              label: '追訂金',
              count: pendingDeposits.length,
              alert: overdueCount > 0,
            },
          ] as Array<{
            id: TodayTab;
            label: string;
            count: number;
            alert?: boolean;
          }>
        ).map((tab) => (
          <button
            key={tab.id}
            id={`tab-today-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`preno-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            <span
              className={`preno-tab-count tabular-nums ${
                tab.alert ? 'is-alert' : ''
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Compact Single-Line Morning Breakfast Strip */}
      <div className="preno-breakfast-line tabular-nums" aria-label="今日早餐份數">
        <div className="preno-breakfast-left">
          <Coffee size={15} color="var(--brand-teal)" style={{ flexShrink: 0 }} />
          <span>
            {isToday ? '今日早餐' : `${formatShortDateZh(selectedDate, WEEKDAY_ZH)} 早餐`}：
            <strong>共 {breakfastSummary.totalPortions} 份</strong>
            {breakfastSummary.totalPortions > 0 ? (
              <span className="preno-muted-inline">
                （大人 {breakfastSummary.totalAdults}
                {breakfastSummary.totalChildren > 0
                  ? `、孩童 ${breakfastSummary.totalChildren}`
                  : ''}
                ）
              </span>
            ) : (
              <span className="preno-muted-inline">（無過夜旅客）</span>
            )}
          </span>
        </div>

        {breakfastSummary.dietaryNotes.length > 0 && (
          <div className="preno-dietary-tags">
            {breakfastSummary.dietaryNotes.map((item) => {
              const target = bookings.find((b) => b.id === item.bookingId);
              return (
                <button
                  key={item.bookingId}
                  type="button"
                  className="preno-dietary-chip"
                  onClick={() => {
                    if (target) onInspectBooking(target);
                  }}
                >
                  <strong>{item.roomCodes}</strong>：{item.note}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pure Preno Flat Hairline Guest List (ZERO cards!) */}
      <div className="preno-page-scroll">
        {currentList.length === 0 ? (
          <div className="preno-empty">
            <div className="preno-empty-title">此項目目前無訂房紀錄</div>
          </div>
        ) : (
          <div className="preno-flat-list">
            {currentList.map((booking) => {
              const roomCodes = booking.roomIds
                .map((rid) => roomMap.get(rid)?.code || rid)
                .join(', ');
              const nights = getNightsCount(
                booking.checkInDate,
                booking.checkOutDate
              );
              const balance = getBalanceDue(booking);
              const depState = getDepositTrackingState(booking, todayISO);
              const isReturning = returningPhoneSet.has(
                booking.guestPhone.replace(/\D/g, '')
              );
              const telHref = `tel:${sanitizePhoneForTel(booking.guestPhone)}`;

              const isCompleted =
                (activeTab === 'arrivals' && booking.status === 'checked_in') ||
                (activeTab === 'departures' && booking.status === 'checked_out');

              return (
                <div
                  key={booking.id}
                  className={`preno-flat-row preno-guest-row ${
                    isCompleted ? 'is-completed' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onInspectBooking(booking)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onInspectBooking(booking);
                    }
                  }}
                >
                  <div className="preno-row-left">
                    <span
                      className={`preno-status-dot ${resolveDotClass(booking)}`}
                    />
                    <div className="preno-row-text">
                      <div className="preno-row-title">
                        {isReturning && (
                          <Star
                            size={14}
                            fill="#F39C12"
                            color="#F39C12"
                            style={{ flexShrink: 0 }}
                          />
                        )}
                        <strong className="preno-guest-name">
                          {booking.guestName}
                        </strong>
                        <span className={`preno-mini-state state-${booking.status}`}>
                          {BOOKING_STATUS_LABELS[booking.status]}
                        </span>
                      </div>

                      <div className="preno-row-sub tabular-nums">
                        <span>
                          {roomCodes}・{nights}晚・{booking.adults}大
                          {booking.children > 0 ? `${booking.children}小` : ''}
                        </span>
                        {activeTab === 'deposits' && (
                          <span className="preno-sub-due">
                            ｜入住 {formatShortDateZh(booking.checkInDate, WEEKDAY_ZH)}・期限{' '}
                            {formatShortDateZh(booking.depositDueDate, WEEKDAY_ZH)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="preno-row-right">
                    <div className="preno-money-col tabular-nums">
                      {depState === 'deposit_overdue' ? (
                        <span className="preno-money is-overdue">
                          逾期 ${booking.totalAmount.toLocaleString()}
                        </span>
                      ) : depState === 'awaiting_deposit' ? (
                        <span className="preno-money is-amber">
                          {DEPOSIT_TRACKING_LABELS.awaiting_deposit} $
                          {booking.totalAmount.toLocaleString()}
                        </span>
                      ) : balance > 0 ? (
                        <span className="preno-money is-amber">
                          待收 ${balance.toLocaleString()}
                        </span>
                      ) : (
                        <span className="preno-money is-paid">已付清</span>
                      )}
                    </div>

                    <a
                      href={telHref}
                      className="preno-row-phone-btn"
                      title={`撥打 ${booking.guestPhone}`}
                      aria-label={`撥打電話給 ${booking.guestName}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone size={17} />
                    </a>

                    <ChevronRight
                      size={18}
                      color="var(--ink-faint)"
                      style={{ flexShrink: 0 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
