import {
  APP_BRAND,
  BANK_REMITTANCE_INFO,
  WEEKDAY_ZH,
} from '../constants/labels';
import type {
  Booking,
  BookingConflict,
  BookingInput,
  BreakfastDietaryNote,
  BreakfastSummary,
  DepositTrackingState,
  GuestHistoryMatch,
  MonthlyStatsSummary,
  PaymentStatus,
  Room,
  RoomAllocation,
  RoomBlock,
  RoomBlockConflict,
  RoomBlockInput,
  RoomRateOption,
} from '../types/domain';

export const EXTRA_BED_NIGHTLY_FEE = 500;
export const FOUR_PERSON_TWO_GUEST_DISCOUNT = 500;

/**
 * Formats a Date object in local time as YYYY-MM-DD.
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's date in local time as YYYY-MM-DD.
 */
export function getTodayISO(): string {
  return formatDateISO(new Date());
}

/**
 * Checks whether a string is a strictly valid YYYY-MM-DD calendar date.
 */
export function isValidDateISO(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Parses flexible manual date inputs (YYYY-MM-DD, YYYY/M/D, YYYYMMDD) into YYYY-MM-DD.
 */
export function parseFlexibleDateInput(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) {
    return null;
  }

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(cleaned);
  if (compact) {
    const candidate = `${compact[1]}-${compact[2]}-${compact[3]}`;
    return isValidDateISO(candidate) ? candidate : null;
  }

  const delimited = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(cleaned);
  if (delimited) {
    const candidate = `${delimited[1]}-${delimited[2].padStart(2, '0')}-${delimited[3].padStart(2, '0')}`;
    return isValidDateISO(candidate) ? candidate : null;
  }

  return null;
}

/**
 * Formats Taiwanese mobile and landline numbers uniformly without requiring users to type hyphens.
 */
export function formatTaiwanPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('+')) {
    return trimmed.replace(/\s+/g, ' ');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('09')) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith('0')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return trimmed;
}

/**
 * Parses a YYYY-MM-DD string into a local Date at midnight to avoid UTC shifts.
 */
export function parseDateISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Adds a number of calendar days to a YYYY-MM-DD date string.
 */
export function addDaysISO(iso: string, deltaDays: number): string {
  if (!isValidDateISO(iso)) {
    return getTodayISO();
  }
  const date = parseDateISO(iso);
  date.setDate(date.getDate() + deltaDays);
  return formatDateISO(date);
}

/**
 * Returns the number of nights between check-in and check-out.
 */
export function getNightsCount(checkInDate: string, checkOutDate: string): number {
  if (!isValidDateISO(checkInDate) || !isValidDateISO(checkOutDate)) {
    return 0;
  }
  const start = parseDateISO(checkInDate).getTime();
  const end = parseDateISO(checkOutDate).getTime();
  return Math.round((end - start) / 86_400_000);
}

/**
 * Enumerates every occupied night [checkInDate, checkOutDate).
 */
export function enumerateOccupiedNights(
  checkInDate: string,
  checkOutDate: string
): string[] {
  const nights = getNightsCount(checkInDate, checkOutDate);
  if (nights <= 0) {
    return [];
  }
  const dates: string[] = [];
  for (let i = 0; i < nights; i += 1) {
    dates.push(addDaysISO(checkInDate, i));
  }
  return dates;
}

/**
 * Generates an array of consecutive YYYY-MM-DD strings starting from startDate.
 */
export function generateDateRange(startDate: string, days: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < days; i += 1) {
    result.push(addDaysISO(startDate, i));
  }
  return result;
}

/**
 * Taiwanese guesthouse weekend convention: Friday (5) and Saturday (6) nights use weekend rates.
 */
export function isWeekendNight(dateISO: string): boolean {
  const day = parseDateISO(dateISO).getDay();
  return day === 5 || day === 6;
}

/**
 * Returns true if a night should use holiday pricing (Friday/Saturday OR custom special holiday/peak date).
 */
export function isHolidayNight(
  dateISO: string,
  specialHolidayDates: readonly string[] = []
): boolean {
  if (isWeekendNight(dateISO)) {
    return true;
  }
  return specialHolidayDates.includes(dateISO);
}

/**
 * Builds the selectable one-tap pricing options for a room:
 * - Tiered rooms (e.g. Youde cabin / villa): each configured tier + an extra-bed (+1, +$500/night) option
 * - 4-person standard rooms: 2-person (-$500/night), Standard 4-person, +Extra bed (+$500/night)
 * - 2-person / other standard rooms: Standard, +Extra bed (+$500/night)
 */
export function getRoomRateOptions(room: Room): RoomRateOption[] {
  if (room.rateTiers && room.rateTiers.length > 0) {
    const sorted = [...room.rateTiers].sort((a, b) => a.maxGuests - b.maxGuests);
    const tierOptions: RoomRateOption[] = sorted.map((tier, idx) => ({
      key: `tier_${idx}`,
      label: tier.label.replace('入住', ''),
      guests: tier.maxGuests,
      extraBed: false,
      standardRate: tier.standardRate,
      weekendRate: tier.weekendRate,
    }));
    const topTier = sorted[sorted.length - 1];
    tierOptions.push({
      key: 'extra_bed',
      label: '+加床 (+$500)',
      guests: topTier.maxGuests + 1,
      extraBed: true,
      standardRate: topTier.standardRate + EXTRA_BED_NIGHTLY_FEE,
      weekendRate: topTier.weekendRate + EXTRA_BED_NIGHTLY_FEE,
    });
    return tierOptions;
  }

  const options: RoomRateOption[] = [];

  if (room.standardCapacity === 4) {
    options.push({
      key: 'two_person',
      label: '2人 (-$500)',
      guests: 2,
      extraBed: false,
      standardRate: Math.max(0, room.standardRate - FOUR_PERSON_TWO_GUEST_DISCOUNT),
      weekendRate: Math.max(0, room.weekendRate - FOUR_PERSON_TWO_GUEST_DISCOUNT),
    });
  }

  options.push({
    key: 'standard',
    label: `標準${room.standardCapacity}人`,
    guests: room.standardCapacity,
    extraBed: false,
    standardRate: room.standardRate,
    weekendRate: room.weekendRate,
  });

  options.push({
    key: 'extra_bed',
    label: '+加床 (+$500)',
    guests: room.standardCapacity + 1,
    extraBed: true,
    standardRate: room.standardRate + EXTRA_BED_NIGHTLY_FEE,
    weekendRate: room.weekendRate + EXTRA_BED_NIGHTLY_FEE,
  });

  return options;
}

/**
 * Returns the default pricing option for a newly selected room.
 */
export function getDefaultRoomRateOption(room: Room): RoomRateOption {
  const options = getRoomRateOptions(room);
  return options.find((opt) => opt.key === 'standard') || options[0];
}

/**
 * Calculates total stay price for one room under a specific pricing option,
 * taking custom special holiday/peak dates into account.
 */
export function calculateRoomOptionStayPrice(
  option: Pick<RoomRateOption, 'standardRate' | 'weekendRate'>,
  checkInDate: string,
  checkOutDate: string,
  specialHolidayDates: readonly string[] = []
): number {
  const nights = enumerateOccupiedNights(checkInDate, checkOutDate);
  if (nights.length === 0) {
    return 0;
  }
  return nights.reduce(
    (sum, night) =>
      sum +
      (isHolidayNight(night, specialHolidayDates)
        ? option.weekendRate
        : option.standardRate),
    0
  );
}

/**
 * Builds or updates per-room allocations when room selection or stay dates change.
 */
export function syncRoomAllocations(
  roomIds: string[],
  rooms: Room[],
  checkInDate: string,
  checkOutDate: string,
  previousAllocations: RoomAllocation[] = [],
  specialHolidayDates: readonly string[] = []
): RoomAllocation[] {
  const prevMap = new Map(previousAllocations.map((a) => [a.roomId, a]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  return roomIds
    .map((roomId) => {
      const room = roomMap.get(roomId);
      if (!room) {
        return null;
      }
      const prev = prevMap.get(roomId);
      const options = getRoomRateOptions(room);
      const chosenOption =
        (prev && options.find((opt) => opt.key === prev.rateOptionKey)) ||
        getDefaultRoomRateOption(room);

      const nextOriginal = calculateRoomOptionStayPrice(
        chosenOption,
        checkInDate,
        checkOutDate,
        specialHolidayDates
      );
      const hadCustomDiscount =
        prev !== undefined && prev.adjustedPrice !== prev.originalPrice;

      return {
        roomId,
        rateOptionKey: chosenOption.key,
        rateOptionLabel: chosenOption.label,
        guests: chosenOption.guests,
        extraBed: chosenOption.extraBed,
        originalPrice: nextOriginal,
        adjustedPrice: hadCustomDiscount ? prev.adjustedPrice : nextOriginal,
      };
    })
    .filter((item): item is RoomAllocation => item !== null);
}

/**
 * Looks up past non-cancelled stays matching a phone number to recognize returning guests.
 */
export function findReturningGuestByPhone(
  phoneInput: string,
  bookings: Booking[],
  excludeBookingId?: string
): GuestHistoryMatch | null {
  const digits = phoneInput.replace(/\D/g, '');
  if (digits.length < 8) {
    return null;
  }
  const matches = bookings
    .filter((b) => {
      if (b.id === excludeBookingId || b.status === 'cancelled') {
        return false;
      }
      return b.guestPhone.replace(/\D/g, '') === digits;
    })
    .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));

  if (matches.length === 0) {
    return null;
  }
  const latest = matches[0];
  return {
    guestName: latest.guestName,
    guestPhone: latest.guestPhone,
    visitCount: matches.length,
    lastCheckIn: latest.checkInDate,
    lastNotes: latest.notes,
  };
}

/**
 * Generates a ready-to-send Traditional Chinese booking confirmation & bank transfer message
 * for LINE or SMS after taking a phone reservation.
 */
export function buildConfirmationMessageZh(
  booking: Booking,
  rooms: Room[]
): string {
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const nights = getNightsCount(booking.checkInDate, booking.checkOutDate);
  const balance = getBalanceDue(booking);
  const suggestedDeposit = Math.round(booking.totalAmount * 0.5);

  const roomLines = booking.roomAllocations
    .map((alloc) => {
      const room = roomMap.get(alloc.roomId);
      const name = room ? room.name : alloc.roomId;
      const opt = alloc.rateOptionLabel ? `（${alloc.rateOptionLabel}）` : '';
      return `・${name}${opt}`;
    })
    .join('\n');

  const paymentBlock =
    booking.paymentStatus === 'paid_in_full'
      ? `・付款狀態：已全額結清（${formatCurrencyTWD(booking.totalAmount)}）`
      : booking.paymentStatus === 'deposit_paid'
        ? `・總金額：${formatCurrencyTWD(booking.totalAmount)}\n・已收訂金：${formatCurrencyTWD(booking.depositPaid)}\n・現場尾款：${formatCurrencyTWD(balance)}`
        : `・總金額：${formatCurrencyTWD(booking.totalAmount)}\n・訂金（50%）：${formatCurrencyTWD(suggestedDeposit)}\n・匯款期限：${formatShortDateZh(booking.depositDueDate, WEEKDAY_ZH)} 前\n\n【匯款資訊】\n銀行代碼：${BANK_REMITTANCE_INFO.bankCode}（${BANK_REMITTANCE_INFO.bankName}）\n帳號：${BANK_REMITTANCE_INFO.accountNumber}\n戶名：${BANK_REMITTANCE_INFO.accountHolder}\n※ 匯款完成後請回覆帳號後四碼或來電 ${BANK_REMITTANCE_INFO.contactPhones} 確認，謝謝您！`;

  return [
    `【${APP_BRAND.title} 訂房確認通知】`,
    `${booking.guestName} 您好，感謝您的預訂，以下為本次訂房資訊：`,
    '',
    `・入住日期：${formatShortDateZh(booking.checkInDate, WEEKDAY_ZH)}`,
    `・退房日期：${formatShortDateZh(booking.checkOutDate, WEEKDAY_ZH)}（共 ${nights} 晚）`,
    `・入住人數：大人 ${booking.adults} 位${booking.children > 0 ? `、孩童 ${booking.children} 位` : ''}`,
    `・預訂房型：`,
    roomLines,
    paymentBlock,
    '',
    '期待在拉拉山與您相見！',
  ].join('\n');
}

/**
 * Computes concise monthly occupancy & revenue metrics for a given year and 0-indexed month.
 */
export function calculateMonthlyStats(
  year: number,
  monthIndex: number,
  rooms: Room[],
  bookings: Booking[]
): MonthlyStatsSummary {
  const activeRooms = rooms.filter((r) => r.isActive);
  const activeRoomIds = new Set(activeRooms.map((r) => r.id));
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const monthStart = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const monthEndExclusive = addDaysISO(monthStart, daysInMonth);
  const totalRoomNights = activeRooms.length * daysInMonth;

  let occupiedRoomNights = 0;
  let projectedRevenue = 0;
  let depositCollected = 0;
  let balanceDue = 0;

  for (const booking of bookings) {
    if (booking.status === 'cancelled') {
      continue;
    }
    const nights = enumerateOccupiedNights(
      booking.checkInDate,
      booking.checkOutDate
    );
    if (nights.length === 0) {
      continue;
    }
    const nightsInMonth = nights.filter(
      (n) => n >= monthStart && n < monthEndExclusive
    );
    if (nightsInMonth.length === 0) {
      continue;
    }

    const validRoomsCount = booking.roomIds.filter((rid) =>
      activeRoomIds.has(rid)
    ).length;
    occupiedRoomNights += nightsInMonth.length * validRoomsCount;

    /* Pro-rate revenue cleanly when a multi-night stay crosses month boundaries */
    const ratio = nightsInMonth.length / nights.length;
    projectedRevenue += Math.round(booking.totalAmount * ratio);

    if (booking.checkInDate >= monthStart && booking.checkInDate < monthEndExclusive) {
      depositCollected +=
        booking.paymentStatus === 'paid_in_full'
          ? booking.totalAmount
          : booking.depositPaid;
      balanceDue += getBalanceDue(booking);
    }
  }

  const occupancyRate =
    totalRoomNights > 0
      ? Math.round((occupiedRoomNights / totalRoomNights) * 100)
      : 0;

  return {
    occupancyRate,
    occupiedRoomNights,
    totalRoomNights,
    projectedRevenue,
    depositCollected,
    balanceDue,
  };
}

/**
 * Normalizes legacy room records with default housekeeping status.
 */
export function normalizeRoomRecord(
  raw: Partial<Room> & { id: string }
): Room {
  return {
    id: raw.id,
    code: raw.code ?? '',
    name: raw.name ?? '',
    building: raw.building ?? 'xinyue',
    floorLabel: raw.floorLabel ?? '1F',
    roomType: raw.roomType ?? '',
    standardCapacity: raw.standardCapacity ?? 2,
    maxCapacity: raw.maxCapacity ?? 3,
    standardRate: raw.standardRate ?? 2500,
    weekendRate: raw.weekendRate ?? 3000,
    rateTiers: raw.rateTiers,
    connectingRoomId: raw.connectingRoomId,
    housekeepingStatus: raw.housekeepingStatus ?? 'clean',
    sortOrder: raw.sortOrder ?? 99,
    notes: raw.notes ?? '',
    isActive: raw.isActive ?? true,
  };
}

/**
 * Normalizes legacy booking records into the current schema cleanly.
 */
export function normalizeBookingRecord(
  raw: Partial<Booking> & { id: string; roomId?: string }
): Booking {
  const roomIds =
    Array.isArray(raw.roomIds) && raw.roomIds.length > 0
      ? Array.from(new Set(raw.roomIds.filter(Boolean)))
      : raw.roomId
        ? [raw.roomId]
        : [];

  const totalAmount = raw.totalAmount ?? 0;
  const fallbackPerRoom =
    roomIds.length > 0 ? Math.round(totalAmount / roomIds.length) : 0;

  const roomAllocations: RoomAllocation[] =
    Array.isArray(raw.roomAllocations) && raw.roomAllocations.length > 0
      ? raw.roomAllocations
          .filter((a) => roomIds.includes(a.roomId))
          .map((a) => ({
            roomId: a.roomId,
            rateOptionKey: a.rateOptionKey || 'standard',
            rateOptionLabel: a.rateOptionLabel || `${a.guests || 2}人`,
            guests: a.guests || 2,
            extraBed: Boolean(a.extraBed),
            originalPrice: a.originalPrice ?? fallbackPerRoom,
            adjustedPrice: a.adjustedPrice ?? fallbackPerRoom,
          }))
      : roomIds.map((roomId) => ({
          roomId,
          rateOptionKey: 'standard',
          rateOptionLabel: '標準',
          guests: Math.max(
            1,
            Math.round(
              ((raw.adults ?? 2) + (raw.children ?? 0)) /
                Math.max(1, roomIds.length)
            )
          ),
          extraBed: false,
          originalPrice: fallbackPerRoom,
          adjustedPrice: fallbackPerRoom,
        }));

  const createdDate = raw.createdAt
    ? raw.createdAt.slice(0, 10)
    : getTodayISO();

  return {
    id: raw.id,
    roomIds,
    roomAllocations,
    guestName: raw.guestName ?? '',
    guestPhone: formatTaiwanPhone(raw.guestPhone ?? ''),
    checkInDate: raw.checkInDate ?? getTodayISO(),
    checkOutDate: raw.checkOutDate ?? addDaysISO(getTodayISO(), 1),
    adults: raw.adults ?? 2,
    children: raw.children ?? 0,
    totalAmount,
    depositPaid: raw.depositPaid ?? 0,
    depositDueDate: raw.depositDueDate || addDaysISO(createdDate, 2),
    transferLastFour: raw.transferLastFour || '',
    paymentStatus: raw.paymentStatus ?? 'unpaid',
    status: raw.status ?? 'confirmed',
    notes: raw.notes ?? '',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    updatedByEmail: raw.updatedByEmail ?? 'system',
  };
}

/**
 * Classifies a booking's live deposit tracking state.
 */
export function getDepositTrackingState(
  booking: Pick<
    Booking,
    'paymentStatus' | 'depositPaid' | 'totalAmount' | 'depositDueDate' | 'status'
  >,
  todayISO: string = getTodayISO()
): DepositTrackingState {
  if (
    booking.paymentStatus === 'paid_in_full' ||
    (booking.totalAmount > 0 && booking.depositPaid >= booking.totalAmount)
  ) {
    return 'paid_in_full';
  }
  if (booking.paymentStatus === 'deposit_paid' || booking.depositPaid > 0) {
    return 'deposit_paid';
  }
  if (
    booking.status !== 'cancelled' &&
    booking.status !== 'checked_out' &&
    booking.depositDueDate &&
    booking.depositDueDate < todayISO
  ) {
    return 'deposit_overdue';
  }
  return 'awaiting_deposit';
}

/**
 * Computes unpaid balance due for a booking (never negative).
 */
export function getBalanceDue(
  booking: Pick<Booking, 'totalAmount' | 'depositPaid' | 'paymentStatus'>
): number {
  if (booking.paymentStatus === 'paid_in_full') {
    return 0;
  }
  return Math.max(0, booking.totalAmount - booking.depositPaid);
}

/**
 * Derives an appropriate payment status from total amount and deposit paid.
 */
export function derivePaymentStatus(
  totalAmount: number,
  depositPaid: number
): PaymentStatus {
  if (totalAmount > 0 && depositPaid >= totalAmount) {
    return 'paid_in_full';
  }
  if (depositPaid > 0) {
    return 'deposit_paid';
  }
  return 'unpaid';
}

/**
 * Half-open interval overlap check: [startA, endA) intersects [startB, endB).
 */
export function doDateRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && startB < endA;
}

/**
 * Detects double-booking conflicts across every room requested by a candidate booking.
 */
export function findBookingConflict(
  candidate: Pick<BookingInput, 'roomIds' | 'checkInDate' | 'checkOutDate' | 'status'>,
  existingBookings: Booking[],
  excludeBookingId?: string
): BookingConflict | null {
  if (candidate.status === 'cancelled') {
    return null;
  }

  const candidateNights = new Set(
    enumerateOccupiedNights(candidate.checkInDate, candidate.checkOutDate)
  );
  const candidateRoomSet = new Set(candidate.roomIds);

  for (const existing of existingBookings) {
    if (existing.id === excludeBookingId) {
      continue;
    }
    if (existing.status === 'cancelled') {
      continue;
    }

    const overlappingRoomId = existing.roomIds.find((rid) =>
      candidateRoomSet.has(rid)
    );
    if (!overlappingRoomId) {
      continue;
    }

    if (
      doDateRangesOverlap(
        candidate.checkInDate,
        candidate.checkOutDate,
        existing.checkInDate,
        existing.checkOutDate
      )
    ) {
      const overlappingDates = enumerateOccupiedNights(
        existing.checkInDate,
        existing.checkOutDate
      ).filter((night) => candidateNights.has(night));

      return {
        roomId: overlappingRoomId,
        conflictingBooking: existing,
        overlappingDates,
      };
    }
  }

  return null;
}

/**
 * Validates booking input fields and returns a Traditional Chinese error message if invalid.
 */
export function validateBookingInput(input: BookingInput): string | null {
  if (!input.guestName.trim()) {
    return '請輸入旅客姓名';
  }
  if (!input.guestPhone.trim()) {
    return '請輸入聯絡電話';
  }
  if (!input.roomIds || input.roomIds.length === 0) {
    return '請至少選擇 1 間客房';
  }
  if (!isValidDateISO(input.checkInDate) || !isValidDateISO(input.checkOutDate)) {
    return '請輸入正確的入住與退房日期（格式如 2026-12-05）';
  }
  if (getNightsCount(input.checkInDate, input.checkOutDate) <= 0) {
    return '退房日期必須晚於入住日期';
  }
  if (input.adults < 1) {
    return '大人人數至少需為 1 位';
  }
  if (input.children < 0) {
    return '孩童人數不可為負數';
  }
  if (input.totalAmount < 0 || input.depositPaid < 0) {
    return '金額不可為負數';
  }
  if (input.depositPaid > input.totalAmount && input.totalAmount > 0) {
    return '已付訂金不可大於總金額';
  }
  return null;
}

/**
 * Normalizes an email address for whitelist comparison.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checks whether an email address belongs to the authorized staff whitelist.
 */
export function isEmailWhitelisted(email: string, allowedEmails: string[]): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }
  const normalizedList = allowedEmails.map(normalizeEmail);
  return normalizedList.includes(normalized);
}

/**
 * Formats NTD currency cleanly for Traditional Chinese display.
 */
export function formatCurrencyTWD(amount: number): string {
  return `NT$ ${Math.round(amount).toLocaleString('zh-TW')}`;
}

/**
 * Formats YYYY-MM-DD as M/D（週X） for compact headers and cards.
 */
export function formatShortDateZh(dateISO: string, weekdays: readonly string[]): string {
  if (!isValidDateISO(dateISO)) {
    return dateISO;
  }
  const date = parseDateISO(dateISO);
  return `${date.getMonth() + 1}/${date.getDate()}（${weekdays[date.getDay()]}）`;
}

/**
 * Builds deterministic Firestore lock document IDs for atomic room-night locking.
 */
export function buildNightLockId(roomId: string, nightDateISO: string): string {
  return `${roomId}_${nightDateISO}`;
}

/**
 * Strips non-dialable characters while preserving leading + for tel: links.
 */
export function sanitizePhoneForTel(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

/**
 * Normalizes a RoomBlock record loaded from storage.
 */
export function normalizeRoomBlockRecord(
  raw: Partial<RoomBlock> & { id: string }
): RoomBlock {
  return {
    id: raw.id,
    roomId: raw.roomId ?? '',
    startDate: raw.startDate ?? getTodayISO(),
    endDate: raw.endDate ?? addDaysISO(getTodayISO(), 1),
    reason: raw.reason ?? '鎖房',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedByEmail: raw.updatedByEmail ?? 'system',
  };
}

/**
 * Validates room block input fields and returns a Traditional Chinese error message if invalid.
 */
export function validateRoomBlockInput(input: RoomBlockInput): string | null {
  if (!input.roomId) {
    return '請選擇要鎖定的客房';
  }
  if (!isValidDateISO(input.startDate) || !isValidDateISO(input.endDate)) {
    return '請輸入正確的鎖房開始與結束日期';
  }
  if (getNightsCount(input.startDate, input.endDate) <= 0) {
    return '結束日期必須晚於開始日期';
  }
  if (!input.reason.trim()) {
    return '請填寫鎖房原因（例如：設備維修、老闆親友自留）';
  }
  return null;
}

/**
 * Detects conflicts between a candidate booking and existing maintenance/owner room blocks.
 */
export function findRoomBlockConflictForBooking(
  candidate: Pick<BookingInput, 'roomIds' | 'checkInDate' | 'checkOutDate' | 'status'>,
  roomBlocks: RoomBlock[]
): RoomBlockConflict | null {
  if (candidate.status === 'cancelled') {
    return null;
  }

  const candidateNights = new Set(
    enumerateOccupiedNights(candidate.checkInDate, candidate.checkOutDate)
  );
  const candidateRoomSet = new Set(candidate.roomIds);

  for (const block of roomBlocks) {
    if (!candidateRoomSet.has(block.roomId)) {
      continue;
    }
    if (
      doDateRangesOverlap(
        candidate.checkInDate,
        candidate.checkOutDate,
        block.startDate,
        block.endDate
      )
    ) {
      const overlappingDates = enumerateOccupiedNights(
        block.startDate,
        block.endDate
      ).filter((night) => candidateNights.has(night));
      return {
        roomId: block.roomId,
        conflictingBlock: block,
        overlappingDates,
      };
    }
  }

  return null;
}

/**
 * Checks whether a candidate RoomBlock overlaps any active guest booking or another RoomBlock.
 */
export function findConflictForRoomBlock(
  candidate: RoomBlockInput,
  existingBookings: Booking[],
  existingBlocks: RoomBlock[],
  rooms: Room[],
  excludeBlockId?: string
): string | null {
  const room = rooms.find((r) => r.id === candidate.roomId);
  const roomLabel = room ? room.code : '所選房間';

  const bookingConflict = findBookingConflict(
    {
      roomIds: [candidate.roomId],
      checkInDate: candidate.startDate,
      checkOutDate: candidate.endDate,
      status: 'confirmed',
    },
    existingBookings
  );
  if (bookingConflict) {
    return `無法鎖房：「${roomLabel}」於 ${bookingConflict.overlappingDates[0]} 已有「${bookingConflict.conflictingBooking.guestName}」的訂房`;
  }

  for (const block of existingBlocks) {
    if (block.id === excludeBlockId || block.roomId !== candidate.roomId) {
      continue;
    }
    if (
      doDateRangesOverlap(
        candidate.startDate,
        candidate.endDate,
        block.startDate,
        block.endDate
      )
    ) {
      const candidateNights = new Set(
        enumerateOccupiedNights(candidate.startDate, candidate.endDate)
      );
      const overlap = enumerateOccupiedNights(
        block.startDate,
        block.endDate
      ).find((night) => candidateNights.has(night));
      return `無法鎖房：「${roomLabel}」於 ${overlap || block.startDate} 已有「${block.reason}」鎖房紀錄`;
    }
  }

  return null;
}

const DIETARY_NOTE_PATTERN =
  /(?:全素|蛋奶素|五辛素|鍋邊素|吃素|素食|素|過敏|不吃|早餐|乳糖|清淡|無糖)/;

/**
 * Calculates morning breakfast counts for guests waking up on dateISO
 * (active stays where checkInDate < dateISO <= checkOutDate, i.e., departures + stayovers).
 */
export function calculateBreakfastSummary(
  dateISO: string,
  bookings: Booking[],
  rooms: Room[]
): BreakfastSummary {
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  let totalAdults = 0;
  let totalChildren = 0;
  let roomCount = 0;
  const dietaryNotes: BreakfastDietaryNote[] = [];

  for (const booking of bookings) {
    if (booking.status === 'cancelled') {
      continue;
    }
    if (booking.checkInDate < dateISO && booking.checkOutDate >= dateISO) {
      totalAdults += booking.adults;
      totalChildren += booking.children;
      roomCount += booking.roomIds.length;

      const trimmedNote = booking.notes.trim();
      if (trimmedNote && DIETARY_NOTE_PATTERN.test(trimmedNote)) {
        const roomCodes = booking.roomIds
          .map((rid) => roomMap.get(rid)?.code || rid)
          .join('+');
        dietaryNotes.push({
          bookingId: booking.id,
          roomCodes,
          guestName: booking.guestName,
          note: trimmedNote,
        });
      }
    }
  }

  return {
    totalAdults,
    totalChildren,
    totalPortions: totalAdults + totalChildren,
    roomCount,
    dietaryNotes,
  };
}
