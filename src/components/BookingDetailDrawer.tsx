import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  LogIn,
  LogOut,
  Phone,
  RotateCcw,
  Star,
  X,
} from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  DEPOSIT_TRACKING_LABELS,
  WEEKDAY_ZH,
} from '../constants/labels';
import {
  buildConfirmationMessageZh,
  findReturningGuestByPhone,
  formatCurrencyTWD,
  formatShortDateZh,
  getBalanceDue,
  getDepositTrackingState,
  getNightsCount,
  sanitizePhoneForTel,
} from '../domain/bookingLogic';
import type { Booking, BookingStatus, Room } from '../types/domain';

interface BookingDetailDrawerProps {
  booking: Booking | null;
  allBookings: Booking[];
  rooms: Room[];
  onClose: () => void;
  onEdit: (booking: Booking) => void;
  onStatusChange: (bookingId: string, status: BookingStatus) => Promise<void>;
  onRecordDeposit: (
    bookingId: string,
    depositAmount: number,
    transferLastFour: string
  ) => Promise<void>;
  onMarkPaidInFull: (bookingId: string) => Promise<void>;
  onNotify?: (message: string) => void;
}

export function BookingDetailDrawer({
  booking,
  allBookings,
  rooms,
  onClose,
  onEdit,
  onStatusChange,
  onRecordDeposit,
  onMarkPaidInFull,
  onNotify,
}: BookingDetailDrawerProps) {
  const [depositInput, setDepositInput] = useState<string>('');
  const [lastFourInput, setLastFourInput] = useState<string>('');
  const [recording, setRecording] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  if (!booking) {
    return null;
  }

  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const nights = getNightsCount(booking.checkInDate, booking.checkOutDate);
  const balanceDue = getBalanceDue(booking);
  const depositState = getDepositTrackingState(booking);
  const telHref = `tel:${sanitizePhoneForTel(booking.guestPhone)}`;

  const guestHistory = findReturningGuestByPhone(
    booking.guestPhone,
    allBookings
  );
  const visitCount = guestHistory?.visitCount || 1;

  const originalSubtotal = booking.roomAllocations.reduce(
    (sum, a) => sum + a.originalPrice,
    0
  );
  const totalDiscount = Math.max(0, originalSubtotal - booking.totalAmount);
  const suggestedHalfDeposit = Math.round(booking.totalAmount * 0.5);

  const handleCopyConfirmation = async () => {
    const text = buildConfirmationMessageZh(booking, rooms);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotice(true);
      onNotify?.('已複製訂房確認與匯款通知，可直接貼至 LINE 或簡訊');
      window.setTimeout(() => setCopiedNotice(false), 2400);
    } catch {
      window.prompt('請複製以下訊息傳送給旅客：', text);
    }
  };

  const handleRecordDepositSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(depositInput || suggestedHalfDeposit);
    if (Number.isNaN(amount) || amount <= 0) {
      return;
    }
    try {
      setRecording(true);
      await onRecordDeposit(booking.id, amount, lastFourInput);
      setDepositInput('');
      setLastFourInput('');
    } finally {
      setRecording(false);
    }
  };

  const handleCancelBooking = () => {
    if (
      window.confirm(
        `確定要取消「${booking.guestName}」的訂房嗎？取消後房態將立即釋出。`
      )
    ) {
      void onStatusChange(booking.id, 'cancelled');
    }
  };

  return (
    <div
      className="drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-guest-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer-panel">
        <div className="drawer-header">
          <div>
            <h2
              id="drawer-guest-title"
              style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink-primary)' }}
            >
              {booking.guestName}
            </h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 5,
              }}
            >
              {visitCount >= 2 && (
                <span className="preno-returning-badge tabular-nums">
                  <Star size={12} fill="#F39C12" color="#F39C12" />
                  老顧客（第 {visitCount} 次）
                </span>
              )}
              <span className={`pill pill-${booking.status}`}>
                {BOOKING_STATUS_LABELS[booking.status]}
              </span>
              <span className={`pill pill-dep-${depositState}`}>
                {DEPOSIT_TRACKING_LABELS[depositState]}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="關閉詳情"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <div className="drawer-body">
          {/* Quick Contact & Copy LINE Remittance Notice */}
          <div className="preno-drawer-contact">
            <a href={telHref} className="btn btn-secondary">
              <Phone size={15} />
              <span className="tabular-nums">{booking.guestPhone}</span>
            </a>

            <button
              id="btn-copy-confirmation"
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleCopyConfirmation()}
            >
              {copiedNotice ? <Check size={15} /> : <Copy size={15} />}
              <span>{copiedNotice ? '已複製通知' : '複製 LINE 匯款通知'}</span>
            </button>
          </div>

          {/* Stay Summary */}
          <div className="preno-drawer-section">
            <div className="preno-drawer-section-title">住房資訊</div>
            <div className="preno-folio-rows">
              <div className="preno-folio-row">
                <span className="preno-folio-k">入退日期</span>
                <span className="preno-folio-v tabular-nums">
                  {formatShortDateZh(booking.checkInDate, WEEKDAY_ZH)} →{' '}
                  {formatShortDateZh(booking.checkOutDate, WEEKDAY_ZH)}（{nights} 晚）
                </span>
              </div>

              <div className="preno-folio-row">
                <span className="preno-folio-k">入住人數</span>
                <span className="preno-folio-v tabular-nums">
                  大人 {booking.adults} 位
                  {booking.children > 0 ? `、孩童 ${booking.children} 位` : ''}
                </span>
              </div>

              <div className="preno-folio-row is-top">
                <span className="preno-folio-k">預訂房型</span>
                <div className="preno-drawer-rooms-col">
                  {booking.roomAllocations.map((alloc) => {
                    const r = roomMap.get(alloc.roomId);
                    return (
                      <div key={alloc.roomId} className="preno-drawer-room-line">
                        <span>
                          <strong>{r ? r.code : alloc.roomId}</strong>（
                          {alloc.rateOptionLabel || `${alloc.guests}人`}）
                        </span>
                        <span className="tabular-nums">
                          {formatCurrencyTWD(alloc.adjustedPrice)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {booking.notes && (
                <div className="preno-folio-row is-top">
                  <span className="preno-folio-k">備註</span>
                  <span className="preno-folio-v">{booking.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Preno-style Financial Folio Box */}
          <div className="preno-folio-box">
            <div className="preno-folio-line tabular-nums">
              <span>房費總計</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {totalDiscount > 0 && (
                  <span className="preno-discount-tag">
                    已折 ${totalDiscount.toLocaleString()}
                  </span>
                )}
                <strong>{formatCurrencyTWD(booking.totalAmount)}</strong>
              </span>
            </div>

            <div className="preno-folio-line tabular-nums">
              <span>已收訂金</span>
              <strong style={{ color: 'var(--status-checkedin)' }}>
                {formatCurrencyTWD(booking.depositPaid)}
                {booking.transferLastFour
                  ? `（後四碼 ${booking.transferLastFour}）`
                  : ''}
              </strong>
            </div>

            <div className="preno-folio-line is-balance tabular-nums">
              <span>待收尾款</span>
              {balanceDue > 0 ? (
                <strong style={{ color: 'var(--status-overdue)', fontSize: 17 }}>
                  {formatCurrencyTWD(balanceDue)}
                </strong>
              ) : (
                <strong
                  style={{
                    color: 'var(--brand-teal)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <CheckCircle2 size={16} />
                  已全額付清
                </strong>
              )}
            </div>

            {/* Inline Quick Deposit Recording when unpaid */}
            {(depositState === 'awaiting_deposit' ||
              depositState === 'deposit_overdue') &&
              booking.status !== 'cancelled' && (
                <form
                  className="preno-quick-deposit"
                  onSubmit={(e) => void handleRecordDepositSubmit(e)}
                >
                  <div
                    className={`preno-deposit-due-note tabular-nums ${
                      depositState === 'deposit_overdue' ? 'is-overdue' : ''
                    }`}
                  >
                    {depositState === 'deposit_overdue' ? (
                      <AlertCircle size={14} />
                    ) : (
                      <Clock size={14} />
                    )}
                    <span>
                      {depositState === 'deposit_overdue' ? '逾期未匯' : '待付訂金'}
                      ・期限 {formatShortDateZh(booking.depositDueDate, WEEKDAY_ZH)}
                    </span>
                  </div>

                  <div className="quick-deposit-inputs">
                    <input
                      id="input-quick-deposit-amount"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      className="input tabular-nums"
                      placeholder={`金額（如 ${suggestedHalfDeposit}）`}
                      value={depositInput}
                      onChange={(e) => setDepositInput(e.target.value)}
                    />
                    <input
                      id="input-quick-deposit-last4"
                      type="text"
                      maxLength={8}
                      className="input tabular-nums"
                      placeholder="後四碼"
                      value={lastFourInput}
                      onChange={(e) => setLastFourInput(e.target.value)}
                    />
                  </div>

                  <button
                    id="btn-quick-record-deposit"
                    type="submit"
                    className="btn btn-primary"
                    disabled={recording}
                  >
                    <CreditCard size={15} />
                    {recording
                      ? '登記中...'
                      : `補登訂金 ${formatCurrencyTWD(
                          Number(depositInput || suggestedHalfDeposit)
                        )}`}
                  </button>
                </form>
              )}

            {/* One-tap Settle Balance when deposit already paid */}
            {balanceDue > 0 &&
              booking.status !== 'cancelled' &&
              depositState === 'deposit_paid' && (
                <button
                  id="btn-drawer-mark-paid"
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 4 }}
                  onClick={() => void onMarkPaidInFull(booking.id)}
                >
                  <CreditCard size={15} />
                  標記已收清尾款（{formatCurrencyTWD(balanceDue)}）
                </button>
              )}
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="drawer-footer preno-drawer-footer">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              id="btn-drawer-edit"
              type="button"
              className="btn btn-secondary"
              onClick={() => onEdit(booking)}
            >
              <Edit3 size={15} />
              編輯
            </button>
            {booking.status !== 'cancelled' && (
              <button
                id="btn-drawer-cancel-booking"
                type="button"
                className="btn btn-danger-outline"
                onClick={handleCancelBooking}
              >
                <Ban size={15} />
                取消
              </button>
            )}
          </div>

          {booking.status === 'confirmed' && (
            <button
              id="btn-drawer-checkin"
              type="button"
              className="btn btn-success"
              onClick={() => void onStatusChange(booking.id, 'checked_in')}
            >
              <LogIn size={16} />
              辦理入住
            </button>
          )}

          {booking.status === 'checked_in' && (
            <button
              id="btn-drawer-checkout"
              type="button"
              className="btn btn-primary"
              onClick={() => void onStatusChange(booking.id, 'checked_out')}
            >
              <LogOut size={16} />
              辦理退房
            </button>
          )}

          {booking.status === 'cancelled' && (
            <button
              id="btn-drawer-restore"
              type="button"
              className="btn btn-primary"
              onClick={() => void onStatusChange(booking.id, 'confirmed')}
            >
              <RotateCcw size={15} />
              恢復訂房
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
