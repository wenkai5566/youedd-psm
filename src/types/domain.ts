export type BuildingZone = 'xinyue' | 'youde';

export type HousekeepingStatus = 'clean' | 'dirty';

export type BookingStatus =
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid_in_full';

export type DepositTrackingState =
  | 'awaiting_deposit'
  | 'deposit_overdue'
  | 'deposit_paid'
  | 'paid_in_full';

export type AppView =
  | 'today'
  | 'timeline'
  | 'bookings'
  | 'housekeeping'
  | 'settings';

export type BackendMode = 'firebase' | 'demo';

export interface RateTier {
  label: string;
  maxGuests: number;
  standardRate: number;
  weekendRate: number;
}

export interface RoomRateOption {
  key: string;
  label: string;
  guests: number;
  extraBed: boolean;
  standardRate: number;
  weekendRate: number;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  building: BuildingZone;
  floorLabel: string;
  roomType: string;
  standardCapacity: number;
  maxCapacity: number;
  standardRate: number;
  weekendRate: number;
  rateTiers?: RateTier[];
  connectingRoomId?: string;
  housekeepingStatus: HousekeepingStatus;
  sortOrder: number;
  notes: string;
  isActive: boolean;
}

export interface RoomAllocation {
  roomId: string;
  rateOptionKey: string;
  rateOptionLabel: string;
  guests: number;
  extraBed: boolean;
  originalPrice: number;
  adjustedPrice: number;
}

export interface Booking {
  id: string;
  roomIds: string[];
  roomAllocations: RoomAllocation[];
  guestName: string;
  guestPhone: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  adults: number;
  children: number;
  totalAmount: number;
  depositPaid: number;
  depositDueDate: string; // YYYY-MM-DD remittance deadline for unpaid bookings
  transferLastFour?: string;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedByEmail: string;
}

export type BookingInput = Omit<
  Booking,
  'id' | 'createdAt' | 'updatedAt' | 'updatedByEmail'
>;

export type RoomInput = Omit<Room, 'id'>;

export interface StaffUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface AccessControlConfig {
  allowedEmails: string[];
  updatedAt: string;
  updatedByEmail: string;
}

export interface SpecialHolidaysConfig {
  dates: string[]; // Sorted YYYY-MM-DD dates treated as holiday pricing
  updatedAt: string;
  updatedByEmail: string;
}

export interface GuestHistoryMatch {
  guestName: string;
  guestPhone: string;
  visitCount: number;
  lastCheckIn: string;
  lastNotes: string;
}

export interface MonthlyStatsSummary {
  occupancyRate: number;
  occupiedRoomNights: number;
  totalRoomNights: number;
  projectedRevenue: number;
  depositCollected: number;
  balanceDue: number;
}

export interface RoomBlock {
  id: string;
  roomId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD exclusive
  reason: string;
  createdAt: string;
  updatedByEmail: string;
}

export type RoomBlockInput = Omit<
  RoomBlock,
  'id' | 'createdAt' | 'updatedByEmail'
>;

export interface BreakfastDietaryNote {
  bookingId: string;
  roomCodes: string;
  guestName: string;
  note: string;
}

export interface BreakfastSummary {
  totalAdults: number;
  totalChildren: number;
  totalPortions: number;
  roomCount: number;
  dietaryNotes: BreakfastDietaryNote[];
}

export interface BookingConflict {
  roomId: string;
  conflictingBooking: Booking;
  overlappingDates: string[];
}

export interface RoomBlockConflict {
  roomId: string;
  conflictingBlock: RoomBlock;
  overlappingDates: string[];
}

export interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info';
  message: string;
}
