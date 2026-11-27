import { describe, expect, it } from 'vitest';
import { INITIAL_XINYUE_ROOMS } from '../constants/seedData';
import {
  buildConfirmationMessageZh,
  calculateBreakfastSummary,
  calculateMonthlyStats,
  calculateRoomOptionStayPrice,
  derivePaymentStatus,
  doDateRangesOverlap,
  enumerateOccupiedNights,
  findBookingConflict,
  findConflictForRoomBlock,
  findReturningGuestByPhone,
  findRoomBlockConflictForBooking,
  formatTaiwanPhone,
  getBalanceDue,
  getDepositTrackingState,
  getRoomRateOptions,
  isEmailWhitelisted,
  isHolidayNight,
  parseFlexibleDateInput,
  syncRoomAllocations,
  validateBookingInput,
  validateRoomBlockInput,
} from './bookingLogic';
import type { Booking, BookingInput, RoomBlock } from '../types/domain';

const sampleBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'bk-1',
  roomIds: ['room-a'],
  roomAllocations: [
    {
      roomId: 'room-a',
      rateOptionKey: 'standard',
      rateOptionLabel: '標準4人',
      guests: 4,
      extraBed: false,
      originalPrice: 8000,
      adjustedPrice: 8000,
    },
  ],
  guestName: '測試旅客',
  guestPhone: '0912-345-678',
  checkInDate: '2026-12-01',
  checkOutDate: '2026-12-03',
  adults: 4,
  children: 0,
  totalAmount: 8000,
  depositPaid: 4000,
  depositDueDate: '2026-11-28',
  transferLastFour: '1234',
  paymentStatus: 'deposit_paid',
  status: 'confirmed',
  notes: '靠窗高樓層',
  createdAt: '2026-11-25T00:00:00Z',
  updatedAt: '2026-11-25T00:00:00Z',
  updatedByEmail: 'owner@xinyue.tw',
  ...overrides,
});

describe('bookingLogic double-booking prevention', () => {
  it('allows back-to-back check-out and check-in on the same date', () => {
    expect(
      doDateRangesOverlap('2026-12-01', '2026-12-03', '2026-12-03', '2026-12-05')
    ).toBe(false);
    const existing = [
      sampleBooking({ checkInDate: '2026-12-01', checkOutDate: '2026-12-03' }),
    ];
    expect(
      findBookingConflict(
        {
          roomIds: ['room-a'],
          checkInDate: '2026-12-03',
          checkOutDate: '2026-12-05',
          status: 'confirmed',
        },
        existing
      )
    ).toBeNull();
  });

  it('blocks multi-room booking when any selected room overlaps', () => {
    const existing = [
      sampleBooking({
        roomIds: ['room-a1'],
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-04',
      }),
    ];
    const conflict = findBookingConflict(
      {
        roomIds: ['room-a', 'room-a1'],
        checkInDate: '2026-12-03',
        checkOutDate: '2026-12-05',
        status: 'confirmed',
      },
      existing
    );
    expect(conflict?.roomId).toBe('room-a1');
    expect(conflict?.overlappingDates).toEqual(['2026-12-03']);
  });
});

describe('bookingLogic room pricing options & special holidays', () => {
  it('applies custom special holiday dates as weekend rate even on weekdays', () => {
    const roomA = INITIAL_XINYUE_ROOMS.find((r) => r.id === 'room-a')!;
    const standard = getRoomRateOptions(roomA).find((o) => o.key === 'standard')!;
    // 2026-12-03 is Thursday (normally $4,000), marked as special holiday -> $5,000
    expect(isHolidayNight('2026-12-03', ['2026-12-03'])).toBe(true);
    expect(
      calculateRoomOptionStayPrice(standard, '2026-12-03', '2026-12-04', ['2026-12-03'])
    ).toBe(5000);
    expect(
      calculateRoomOptionStayPrice(standard, '2026-12-03', '2026-12-04', [])
    ).toBe(4000);
  });

  it('provides 2-person (-$500), standard 4-person, and +extra bed (+$500)', () => {
    const roomA = INITIAL_XINYUE_ROOMS.find((r) => r.id === 'room-a')!;
    const options = getRoomRateOptions(roomA);
    expect(calculateRoomOptionStayPrice(options[0], '2026-12-03', '2026-12-05')).toBe(8000);
    expect(calculateRoomOptionStayPrice(options[1], '2026-12-03', '2026-12-05')).toBe(9000);
    expect(calculateRoomOptionStayPrice(options[2], '2026-12-03', '2026-12-05')).toBe(10000);
  });

  it('preserves manual room discounts while syncing allocations', () => {
    const initial = syncRoomAllocations(
      ['room-a', 'room-a1'],
      INITIAL_XINYUE_ROOMS,
      '2026-12-03',
      '2026-12-05'
    );
    const discounted = [initial[0], { ...initial[1], adjustedPrice: 5123 }];
    const updated = syncRoomAllocations(
      ['room-a', 'room-a1', 'room-b'],
      INITIAL_XINYUE_ROOMS,
      '2026-12-03',
      '2026-12-05',
      discounted
    );
    expect(updated[1].adjustedPrice).toBe(5123);
  });
});

describe('bookingLogic returning guest lookup, confirmation template & monthly stats', () => {
  it('recognizes returning guests by phone digits ignoring hyphens', () => {
    const history = [
      sampleBooking({ id: 'old-1', checkInDate: '2026-08-10', guestName: '陳老客' }),
      sampleBooking({ id: 'old-2', checkInDate: '2026-10-15', guestName: '陳老客', notes: '素食早餐' }),
      sampleBooking({ id: 'old-cancelled', checkInDate: '2026-11-01', status: 'cancelled' }),
    ];
    const match = findReturningGuestByPhone('0912345678', history);
    expect(match).not.toBeNull();
    expect(match?.visitCount).toBe(2);
    expect(match?.lastNotes).toBe('素食早餐');
  });

  it('generates LINE confirmation message with xinyue.tw bank info when unpaid', () => {
    const msg = buildConfirmationMessageZh(
      sampleBooking({ paymentStatus: 'unpaid', depositPaid: 0 }),
      INITIAL_XINYUE_ROOMS
    );
    expect(msg).toContain('侑德心悅・侑德園');
    expect(msg).toContain('33062567975');
    expect(msg).toContain('羅素貞');
  });

  it('computes monthly occupancy rate and projected revenue accurately', () => {
    const bookings = [
      sampleBooking({
        id: 'm1',
        roomIds: ['room-a', 'room-a1'],
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-03',
        totalAmount: 13000,
        depositPaid: 6500,
      }),
    ];
    const stats = calculateMonthlyStats(2026, 11, INITIAL_XINYUE_ROOMS, bookings);
    expect(stats.occupiedRoomNights).toBe(4); // 2 rooms * 2 nights
    expect(stats.projectedRevenue).toBe(13000);
    expect(stats.depositCollected).toBe(6500);
    expect(stats.balanceDue).toBe(6500);
  });

  it('handles phone formatting, manual dates, deposit states, whitelist & validation', () => {
    expect(formatTaiwanPhone('0912345678')).toBe('0912-345-678');
    expect(parseFlexibleDateInput('20261205')).toBe('2026-12-05');
    expect(enumerateOccupiedNights('2026-12-04', '2026-12-06')).toHaveLength(2);
    expect(
      getDepositTrackingState(
        {
          paymentStatus: 'unpaid',
          depositPaid: 0,
          totalAmount: 4550,
          depositDueDate: '2026-11-25',
          status: 'confirmed',
        },
        '2026-11-26'
      )
    ).toBe('deposit_overdue');
    expect(getBalanceDue({ totalAmount: 4550, depositPaid: 1250, paymentStatus: 'deposit_paid' })).toBe(3300);
    expect(derivePaymentStatus(4550, 4550)).toBe('paid_in_full');
    expect(isEmailWhitelisted('ONE@xinyue.tw', ['one@xinyue.tw'])).toBe(true);

    const validInput: BookingInput = {
      roomIds: ['room-a'],
      roomAllocations: [
        {
          roomId: 'room-a',
          rateOptionKey: 'standard',
          rateOptionLabel: '標準4人',
          guests: 4,
          extraBed: false,
          originalPrice: 4000,
          adjustedPrice: 3888,
        },
      ],
      guestName: '王小明',
      guestPhone: '0912345678',
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-02',
      adults: 2,
      children: 1,
      totalAmount: 3888,
      depositPaid: 1234,
      depositDueDate: '2026-11-28',
      transferLastFour: '',
      paymentStatus: 'deposit_paid',
      status: 'confirmed',
      notes: '',
    };
    expect(validateBookingInput(validInput)).toBeNull();
  });
});

describe('bookingLogic room blocks & daily breakfast count', () => {
  const sampleBlock: RoomBlock = {
    id: 'blk-1',
    roomId: 'room-d1',
    startDate: '2026-12-05',
    endDate: '2026-12-07',
    reason: '冷氣清洗保養',
    createdAt: '2026-11-25T00:00:00Z',
    updatedByEmail: 'owner@xinyue.tw',
  };

  it('prevents double-booking between guest bookings and maintenance room blocks', () => {
    expect(
      validateRoomBlockInput({
        roomId: 'room-d1',
        startDate: '2026-12-05',
        endDate: '2026-12-07',
        reason: '設備維修',
      })
    ).toBeNull();

    // Booking overlapping a block is rejected
    const blockConflict = findRoomBlockConflictForBooking(
      {
        roomIds: ['room-d1'],
        checkInDate: '2026-12-06',
        checkOutDate: '2026-12-08',
        status: 'confirmed',
      },
      [sampleBlock]
    );
    expect(blockConflict?.conflictingBlock.id).toBe('blk-1');
    expect(blockConflict?.overlappingDates).toEqual(['2026-12-06']);

    // Back-to-back check-in on block's endDate is allowed
    expect(
      findRoomBlockConflictForBooking(
        {
          roomIds: ['room-d1'],
          checkInDate: '2026-12-07',
          checkOutDate: '2026-12-08',
          status: 'confirmed',
        },
        [sampleBlock]
      )
    ).toBeNull();

    // Block overlapping an active guest booking is rejected
    const existingBookings = [
      sampleBooking({
        roomIds: ['room-a'],
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-03',
      }),
    ];
    expect(
      findConflictForRoomBlock(
        {
          roomId: 'room-a',
          startDate: '2026-12-02',
          endDate: '2026-12-04',
          reason: '油漆工程',
        },
        existingBookings,
        [sampleBlock],
        INITIAL_XINYUE_ROOMS
      )
    ).toContain('無法鎖房');
  });

  it('calculates daily breakfast portions for departures and stayovers and highlights dietary notes', () => {
    const bookings: Booking[] = [
      // Departing today (stayed last night -> eats breakfast)
      sampleBooking({
        id: 'b-dep',
        roomIds: ['room-c1'],
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-02',
        adults: 2,
        children: 0,
        notes: '準時退房',
      }),
      // Stayover (stayed last night -> eats breakfast + dietary note)
      sampleBooking({
        id: 'b-stay',
        roomIds: ['room-a', 'room-a1'],
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-04',
        adults: 4,
        children: 2,
        notes: '早餐 2 位蛋奶素',
      }),
      // Arriving today afternoon -> does NOT eat this morning's breakfast
      sampleBooking({
        id: 'b-arr',
        roomIds: ['room-e'],
        checkInDate: '2026-12-02',
        checkOutDate: '2026-12-03',
        adults: 4,
        children: 0,
        notes: '素食',
      }),
      // Cancelled -> excluded
      sampleBooking({
        id: 'b-cancel',
        roomIds: ['room-b'],
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-03',
        adults: 4,
        children: 0,
        status: 'cancelled',
      }),
    ];

    const summary = calculateBreakfastSummary(
      '2026-12-02',
      bookings,
      INITIAL_XINYUE_ROOMS
    );
    expect(summary.totalAdults).toBe(6);
    expect(summary.totalChildren).toBe(2);
    expect(summary.totalPortions).toBe(8);
    expect(summary.roomCount).toBe(3);
    expect(summary.dietaryNotes).toHaveLength(1);
    expect(summary.dietaryNotes[0].roomCodes).toBe('A+A1');
  });
});
