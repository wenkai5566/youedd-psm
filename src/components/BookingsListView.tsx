import { useMemo, useState } from 'react';
import { ChevronRight, Phone, Plus, Search, Star } from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  DEPOSIT_TRACKING_LABELS,
  WEEKDAY_ZH,
} from '../constants/labels';
import {
  formatShortDateZh,
  getBalanceDue,
  getDepositTrackingState,
  getNightsCount,
  getTodayISO,
  sanitizePhoneForTel,
} from '../domain/bookingLogic';
import type { Booking, Room } from '../types/domain';

interface BookingsListViewProps {
  rooms: Room[];
  bookings: Booking[];
  onCreateBooking: () => void;
  onInspectBooking: (booking: Booking) => void;
}

type ListTab =
  | 'active'
  | 'overdue'
  | 'awaiting'
  | 'deposit_paid'
  | 'paid_in_full'
  | 'cancelled';

export function BookingsListView({
  rooms,
  bookings,
  onCreateBooking,
  onInspectBooking,
}: BookingsListViewProps) {
  const todayISO = getTodayISO();
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<ListTab>('active');

  const roomMap = useMemo(
    () => new Map(rooms.map((r) => [r.id, r])),
    [rooms]
  );

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

  const counts = useMemo(() => {
    let active = 0;
    let overdue = 0;
    let awaiting = 0;
    let depositPaid = 0;
    let paidInFull = 0;
    let cancelled = 0;

    for (const b of bookings) {
      if (b.status === 'cancelled') {
        cancelled += 1;
        continue;
      }
      active += 1;
      const dep = getDepositTrackingState(b, todayISO);
      if (dep === 'deposit_overdue') overdue += 1;
      else if (dep === 'awaiting_deposit') awaiting += 1;
      else if (dep === 'deposit_paid') depositPaid += 1;
      else paidInFull += 1;
    }

    return { active, overdue, awaiting, depositPaid, paidInFull, cancelled };
  }, [bookings, todayISO]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return bookings
      .filter((b) => {
        if (activeTab === 'cancelled') {
          if (b.status !== 'cancelled') return false;
        } else {
          if (b.status === 'cancelled') return false;
          const dep = getDepositTrackingState(b, todayISO);
          if (activeTab === 'overdue' && dep !== 'deposit_overdue') return false;
          if (activeTab === 'awaiting' && dep !== 'awaiting_deposit')
            return false;
          if (activeTab === 'deposit_paid' && dep !== 'deposit_paid')
            return false;
          if (activeTab === 'paid_in_full' && dep !== 'paid_in_full')
            return false;
        }

        if (q) {
          const roomCodes = b.roomIds
            .map((rid) => roomMap.get(rid)?.name.toLowerCase() || '')
            .join(' ');
          const hit =
            b.guestName.toLowerCase().includes(q) ||
            b.guestPhone.toLowerCase().includes(q) ||
            b.notes.toLowerCase().includes(q) ||
            (b.transferLastFour || '').toLowerCase().includes(q) ||
            roomCodes.includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));
  }, [bookings, activeTab, searchText, roomMap, todayISO]);

  const resolveDotClass = (booking: Booking): string => {
    if (booking.status === 'cancelled' || booking.status === 'checked_out') {
      return 'dot-gray';
    }
    const dep = getDepositTrackingState(booking, todayISO);
    if (dep === 'deposit_overdue') return 'dot-red';
    if (booking.status === 'checked_in') return 'dot-green';
    if (dep === 'awaiting_deposit') return 'dot-amber';
    return 'dot-blue';
  };

  return (
    <section className="preno-page" aria-label="訂單管理">
      <div className="preno-topbar">
        <div className="preno-search-field">
          <Search size={16} className="preno-search-icon" />
          <input
            id="input-bookings-search"
            type="search"
            className="input preno-search-input"
            placeholder="搜尋旅客姓名、電話、房號或後四碼..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <button
          id="btn-list-new-booking"
          type="button"
          className="btn btn-primary desktop-only-flex"
          onClick={onCreateBooking}
        >
          <Plus size={16} />
          新增訂房
        </button>
      </div>

      <div className="preno-underline-tabs" role="tablist" aria-label="訂單分類">
        {(
          [
            { id: 'active', label: '全部有效', count: counts.active },
            {
              id: 'overdue',
              label: '逾期未匯',
              count: counts.overdue,
              alert: counts.overdue > 0,
            },
            { id: 'awaiting', label: '待付訂金', count: counts.awaiting },
            { id: 'deposit_paid', label: '已付訂金', count: counts.depositPaid },
            { id: 'paid_in_full', label: '已付清', count: counts.paidInFull },
            { id: 'cancelled', label: '已取消', count: counts.cancelled },
          ] as Array<{
            id: ListTab;
            label: string;
            count: number;
            alert?: boolean;
          }>
        ).map((tab) => (
          <button
            key={tab.id}
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

      <div className="preno-page-scroll">
        {filtered.length === 0 ? (
          <div className="preno-empty">
            <div className="preno-empty-title">找不到符合條件的訂單</div>
          </div>
        ) : (
          <div className="preno-flat-list">
            {filtered.map((booking) => {
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

              return (
                <div
                  key={booking.id}
                  className="preno-flat-row preno-guest-row"
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
                          {formatShortDateZh(booking.checkInDate, WEEKDAY_ZH)} →{' '}
                          {formatShortDateZh(booking.checkOutDate, WEEKDAY_ZH)}（
                          {nights}晚）
                        </span>
                        <span>
                          ｜{roomCodes}・{booking.adults}大
                          {booking.children > 0 ? `${booking.children}小` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="preno-row-right">
                    <div className="preno-money-col tabular-nums">
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        ${booking.totalAmount.toLocaleString()}
                      </div>
                      {booking.status === 'cancelled' ? (
                        <span className="preno-money is-muted">已取消</span>
                      ) : depState === 'deposit_overdue' ? (
                        <span className="preno-money is-overdue">
                          {DEPOSIT_TRACKING_LABELS.deposit_overdue}
                        </span>
                      ) : depState === 'awaiting_deposit' ? (
                        <span className="preno-money is-amber">
                          待付・期限 {formatShortDateZh(booking.depositDueDate, WEEKDAY_ZH)}
                        </span>
                      ) : balance > 0 ? (
                        <span className="preno-money is-amber">
                          尾款 ${balance.toLocaleString()}
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
