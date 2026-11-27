import type {
  AccessControlConfig,
  BackendMode,
  Booking,
  BookingInput,
  BookingStatus,
  HousekeepingStatus,
  Room,
  RoomBlock,
  RoomBlockInput,
  RoomInput,
  SpecialHolidaysConfig,
  StaffUser,
} from '../types/domain';
import { getBackendMode } from './firebaseConfig';
import { createDemoRepository } from './demoRepository';
import { createFirestoreRepository } from './firestoreRepository';

export type Unsubscribe = () => void;

export interface DemoSignInAccount {
  email: string;
  displayName: string;
}

export interface GuesthouseRepository {
  readonly mode: BackendMode;
  subscribeAuth(onChange: (user: StaffUser | null) => void): Unsubscribe;
  signInWithGoogle(demoAccount?: DemoSignInAccount): Promise<StaffUser>;
  signOut(): Promise<void>;

  subscribeAccessControl(
    onChange: (config: AccessControlConfig) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
  updateAllowedEmails(emails: string[], actorEmail: string): Promise<void>;

  subscribeSpecialHolidays(
    onChange: (config: SpecialHolidaysConfig) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
  updateSpecialHolidays(dates: string[], actorEmail: string): Promise<void>;

  subscribeRooms(
    onChange: (rooms: Room[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
  saveRoom(input: RoomInput, existingRoomId?: string): Promise<void>;
  updateRoomHousekeeping(
    roomId: string,
    status: HousekeepingStatus
  ): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;

  subscribeBookings(
    onChange: (bookings: Booking[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
  saveBooking(
    input: BookingInput,
    actorEmail: string,
    existingBookingId?: string
  ): Promise<Booking>;
  updateBookingStatus(
    bookingId: string,
    status: BookingStatus,
    actorEmail: string
  ): Promise<void>;
  recordBookingDeposit(
    bookingId: string,
    depositAmount: number,
    transferLastFour: string,
    actorEmail: string
  ): Promise<void>;
  markBookingPaidInFull(bookingId: string, actorEmail: string): Promise<void>;

  subscribeRoomBlocks(
    onChange: (blocks: RoomBlock[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
  saveRoomBlock(
    input: RoomBlockInput,
    actorEmail: string,
    existingBlockId?: string
  ): Promise<RoomBlock>;
  deleteRoomBlock(blockId: string): Promise<void>;

  resetDemoData?(): Promise<void>;
}

let singletonRepo: GuesthouseRepository | null = null;

/**
 * Returns the active repository singleton (Cloud Firestore when configured, otherwise local real-time demo).
 */
export function getRepository(): GuesthouseRepository {
  if (!singletonRepo) {
    singletonRepo =
      getBackendMode() === 'firebase'
        ? createFirestoreRepository()
        : createDemoRepository();
  }
  return singletonRepo;
}
