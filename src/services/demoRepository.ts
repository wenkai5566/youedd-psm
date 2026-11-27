import {
  buildInitialDemoBookings,
  buildInitialDemoRoomBlocks,
  INITIAL_XINYUE_ROOMS,
} from '../constants/seedData';
import {
  compareRoomsAlphabetically,
  findBookingConflict,
  findConflictForRoomBlock,
  findRoomBlockConflictForBooking,
  formatTaiwanPhone,
  isValidDateISO,
  normalizeBookingRecord,
  normalizeEmail,
  normalizeRoomBlockRecord,
  normalizeRoomRecord,
  validateBookingInput,
  validateRoomBlockInput,
} from '../domain/bookingLogic';
import type {
  AccessControlConfig,
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
import { getEnvAllowedEmails } from './firebaseConfig';
import type { DemoSignInAccount, GuesthouseRepository } from './repository';

const STORAGE_KEY_ROOMS = 'xinyue_pms_v7_rooms';
const STORAGE_KEY_BOOKINGS = 'xinyue_pms_v7_bookings';
const STORAGE_KEY_BLOCKS = 'xinyue_pms_v7_blocks';
const STORAGE_KEY_ACCESS = 'xinyue_pms_v7_access';
const STORAGE_KEY_HOLIDAYS = 'xinyue_pms_v7_holidays';
const STORAGE_KEY_AUTH = 'xinyue_pms_v7_auth';
const SYNC_CHANNEL_NAME = 'xinyue_pms_realtime_sync_v7';

function readJson<T>(key: string, fallback: () => T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      const initial = fallback();
      window.localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

function writeJson<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Local real-time demo repository backed by localStorage + BroadcastChannel.
 */
export function createDemoRepository(): GuesthouseRepository {
  const authListeners = new Set<(user: StaffUser | null) => void>();
  const accessListeners = new Set<(config: AccessControlConfig) => void>();
  const holidayListeners = new Set<(config: SpecialHolidaysConfig) => void>();
  const roomListeners = new Set<(rooms: Room[]) => void>();
  const bookingListeners = new Set<(bookings: Booking[]) => void>();
  const blockListeners = new Set<(blocks: RoomBlock[]) => void>();

  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(SYNC_CHANNEL_NAME)
      : null;

  const getRooms = (): Room[] =>
    readJson<Array<Partial<Room> & { id: string }>>(
      STORAGE_KEY_ROOMS,
      () => INITIAL_XINYUE_ROOMS
    )
      .map(normalizeRoomRecord)
      .sort(compareRoomsAlphabetically);

  const getBookings = (): Booking[] =>
    readJson<Array<Booking & { roomId?: string }>>(STORAGE_KEY_BOOKINGS, () =>
      buildInitialDemoBookings()
    )
      .map(normalizeBookingRecord)
      .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));

  const getRoomBlocks = (): RoomBlock[] =>
    readJson<Array<Partial<RoomBlock> & { id: string }>>(
      STORAGE_KEY_BLOCKS,
      () => buildInitialDemoRoomBlocks()
    )
      .map(normalizeRoomBlockRecord)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const getAccessConfig = (): AccessControlConfig =>
    readJson<AccessControlConfig>(STORAGE_KEY_ACCESS, () => ({
      allowedEmails: getEnvAllowedEmails(),
      updatedAt: new Date().toISOString(),
      updatedByEmail: 'owner@xinyue.tw',
    }));

  const getHolidaysConfig = (): SpecialHolidaysConfig =>
    readJson<SpecialHolidaysConfig>(STORAGE_KEY_HOLIDAYS, () => ({
      dates: [],
      updatedAt: new Date().toISOString(),
      updatedByEmail: 'owner@xinyue.tw',
    }));

  const getAuthUser = (): StaffUser | null => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_AUTH);
      return raw ? (JSON.parse(raw) as StaffUser) : null;
    } catch {
      return null;
    }
  };

  function emitRooms(): void {
    const rooms = getRooms();
    roomListeners.forEach((cb) => cb(rooms));
  }

  function emitBookings(): void {
    const bookings = getBookings();
    bookingListeners.forEach((cb) => cb(bookings));
  }

  function emitBlocks(): void {
    const blocks = getRoomBlocks();
    blockListeners.forEach((cb) => cb(blocks));
  }

  function emitAccess(): void {
    const config = getAccessConfig();
    accessListeners.forEach((cb) => cb(config));
  }

  function emitHolidays(): void {
    const config = getHolidaysConfig();
    holidayListeners.forEach((cb) => cb(config));
  }

  function emitAuth(): void {
    const user = getAuthUser();
    authListeners.forEach((cb) => cb(user));
  }

  function broadcast(
    topic: 'rooms' | 'bookings' | 'blocks' | 'access' | 'holidays' | 'auth'
  ): void {
    channel?.postMessage({ topic });
  }

  if (channel) {
    channel.onmessage = (event) => {
      const topic = event.data?.topic;
      if (topic === 'rooms') emitRooms();
      if (topic === 'bookings') emitBookings();
      if (topic === 'blocks') emitBlocks();
      if (topic === 'access') emitAccess();
      if (topic === 'holidays') emitHolidays();
      if (topic === 'auth') emitAuth();
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY_ROOMS) emitRooms();
      if (event.key === STORAGE_KEY_BOOKINGS) emitBookings();
      if (event.key === STORAGE_KEY_BLOCKS) emitBlocks();
      if (event.key === STORAGE_KEY_ACCESS) emitAccess();
      if (event.key === STORAGE_KEY_HOLIDAYS) emitHolidays();
      if (event.key === STORAGE_KEY_AUTH) emitAuth();
    });
  }

  return {
    mode: 'demo',

    subscribeAuth(onChange) {
      authListeners.add(onChange);
      onChange(getAuthUser());
      return () => {
        authListeners.delete(onChange);
      };
    },

    async signInWithGoogle(demoAccount?: DemoSignInAccount): Promise<StaffUser> {
      const account = demoAccount || {
        email: getAccessConfig().allowedEmails[0] || 'owner@xinyue.tw',
        displayName: '心悅管家（展示帳號）',
      };
      const user: StaffUser = {
        uid: `demo-${normalizeEmail(account.email)}`,
        email: normalizeEmail(account.email),
        displayName: account.displayName,
      };
      writeJson(STORAGE_KEY_AUTH, user);
      emitAuth();
      broadcast('auth');
      return user;
    },

    async signOut() {
      window.localStorage.removeItem(STORAGE_KEY_AUTH);
      emitAuth();
      broadcast('auth');
    },

    subscribeAccessControl(onChange) {
      accessListeners.add(onChange);
      onChange(getAccessConfig());
      return () => {
        accessListeners.delete(onChange);
      };
    },

    async updateAllowedEmails(emails, actorEmail) {
      const cleaned = Array.from(
        new Set(emails.map(normalizeEmail).filter(Boolean))
      );
      if (cleaned.length < 1) {
        throw new Error('至少必須保留 1 組授權工作人員 Email');
      }
      const next: AccessControlConfig = {
        allowedEmails: cleaned,
        updatedAt: new Date().toISOString(),
        updatedByEmail: normalizeEmail(actorEmail),
      };
      writeJson(STORAGE_KEY_ACCESS, next);
      emitAccess();
      broadcast('access');
    },

    subscribeSpecialHolidays(onChange) {
      holidayListeners.add(onChange);
      onChange(getHolidaysConfig());
      return () => {
        holidayListeners.delete(onChange);
      };
    },

    async updateSpecialHolidays(dates, actorEmail) {
      const cleaned = Array.from(new Set(dates.filter(isValidDateISO))).sort();
      const next: SpecialHolidaysConfig = {
        dates: cleaned,
        updatedAt: new Date().toISOString(),
        updatedByEmail: normalizeEmail(actorEmail),
      };
      writeJson(STORAGE_KEY_HOLIDAYS, next);
      emitHolidays();
      broadcast('holidays');
    },

    subscribeRooms(onChange) {
      roomListeners.add(onChange);
      onChange(getRooms());
      return () => {
        roomListeners.delete(onChange);
      };
    },

    async saveRoom(input: RoomInput, existingRoomId?: string) {
      const rooms = getRooms();
      if (existingRoomId) {
        const updated = rooms.map((room) =>
          room.id === existingRoomId ? { ...input, id: existingRoomId } : room
        );
        writeJson(STORAGE_KEY_ROOMS, updated);
      } else {
        const created: Room = {
          ...input,
          id: createId('room'),
        };
        writeJson(STORAGE_KEY_ROOMS, [...rooms, created]);
      }
      emitRooms();
      broadcast('rooms');
    },

    async updateRoomHousekeeping(roomId: string, status: HousekeepingStatus) {
      const rooms = getRooms();
      const updated = rooms.map((r) =>
        r.id === roomId ? { ...r, housekeepingStatus: status } : r
      );
      writeJson(STORAGE_KEY_ROOMS, updated);
      emitRooms();
      broadcast('rooms');
    },

    async deleteRoom(roomId: string) {
      const bookings = getBookings();
      const hasActiveBooking = bookings.some(
        (b) => b.roomIds.includes(roomId) && b.status !== 'cancelled'
      );
      if (hasActiveBooking) {
        throw new Error('此房型尚有有效訂房紀錄，請先調整或取消訂單後再刪除');
      }
      const updated = getRooms().filter((r) => r.id !== roomId);
      writeJson(STORAGE_KEY_ROOMS, updated);
      emitRooms();
      broadcast('rooms');
    },

    subscribeBookings(onChange) {
      bookingListeners.add(onChange);
      onChange(getBookings());
      return () => {
        bookingListeners.delete(onChange);
      };
    },

    async saveBooking(
      input: BookingInput,
      actorEmail: string,
      existingBookingId?: string
    ): Promise<Booking> {
      const uniqueRoomIds = Array.from(new Set(input.roomIds.filter(Boolean)));
      const normalizedInput: BookingInput = { ...input, roomIds: uniqueRoomIds };

      const validationError = validateBookingInput(normalizedInput);
      if (validationError) {
        throw new Error(validationError);
      }

      const rooms = getRooms();
      const bookings = getBookings();
      const blocks = getRoomBlocks();
      const conflict = findBookingConflict(
        normalizedInput,
        bookings,
        existingBookingId
      );
      if (conflict) {
        const conflictRoom = rooms.find((r) => r.id === conflict.roomId);
        const roomLabel = conflictRoom ? conflictRoom.code : '所選房間';
        throw new Error(
          `重複訂房衝突：「${roomLabel}」於 ${conflict.overlappingDates[0]} 已有「${conflict.conflictingBooking.guestName}」的訂房紀錄`
        );
      }

      const blockConflict = findRoomBlockConflictForBooking(
        normalizedInput,
        blocks
      );
      if (blockConflict) {
        const conflictRoom = rooms.find((r) => r.id === blockConflict.roomId);
        const roomLabel = conflictRoom ? conflictRoom.code : '所選房間';
        throw new Error(
          `鎖房衝突：「${roomLabel}」於 ${blockConflict.overlappingDates[0]} 已被鎖房（${blockConflict.conflictingBlock.reason}）`
        );
      }

      const nowIso = new Date().toISOString();
      const existing = existingBookingId
        ? bookings.find((b) => b.id === existingBookingId)
        : undefined;

      const record: Booking = {
        ...normalizedInput,
        id: existingBookingId || createId('bk'),
        guestName: normalizedInput.guestName.trim(),
        guestPhone: formatTaiwanPhone(normalizedInput.guestPhone),
        notes: normalizedInput.notes.trim(),
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
        updatedByEmail: normalizeEmail(actorEmail),
      };

      const next = existingBookingId
        ? bookings.map((b) => (b.id === existingBookingId ? record : b))
        : [...bookings, record];

      writeJson(STORAGE_KEY_BOOKINGS, next);
      emitBookings();
      broadcast('bookings');
      return record;
    },

    async updateBookingStatus(
      bookingId: string,
      status: BookingStatus,
      actorEmail: string
    ) {
      const bookings = getBookings();
      const target = bookings.find((b) => b.id === bookingId);
      if (!target) {
        throw new Error('找不到此筆訂房資料');
      }

      if (status !== 'cancelled' && target.status === 'cancelled') {
        const conflict = findBookingConflict(
          { ...target, status },
          bookings,
          bookingId
        );
        if (conflict) {
          throw new Error(
            `無法恢復訂房：${conflict.overlappingDates[0]} 已被「${conflict.conflictingBooking.guestName}」預訂`
          );
        }
        const blockConflict = findRoomBlockConflictForBooking(
          { ...target, status },
          getRoomBlocks()
        );
        if (blockConflict) {
          throw new Error(
            `無法恢復訂房：${blockConflict.overlappingDates[0]} 已被鎖房（${blockConflict.conflictingBlock.reason}）`
          );
        }
      }

      const next = bookings.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              status,
              updatedAt: new Date().toISOString(),
              updatedByEmail: normalizeEmail(actorEmail),
            }
          : b
      );
      writeJson(STORAGE_KEY_BOOKINGS, next);
      emitBookings();
      broadcast('bookings');

      /* Automatically mark checked-out rooms as dirty for housekeeping */
      if (status === 'checked_out' && target.status !== 'checked_out') {
        const roomSet = new Set(target.roomIds);
        const updatedRooms = getRooms().map((r) =>
          roomSet.has(r.id) ? { ...r, housekeepingStatus: 'dirty' as const } : r
        );
        writeJson(STORAGE_KEY_ROOMS, updatedRooms);
        emitRooms();
        broadcast('rooms');
      }
    },

    async recordBookingDeposit(
      bookingId: string,
      depositAmount: number,
      transferLastFour: string,
      actorEmail: string
    ) {
      const bookings = getBookings();
      const amount = Math.max(0, Math.round(depositAmount));
      const next = bookings.map((b) => {
        if (b.id !== bookingId) return b;
        const paymentStatus =
          b.totalAmount > 0 && amount >= b.totalAmount
            ? ('paid_in_full' as const)
            : amount > 0
              ? ('deposit_paid' as const)
              : ('unpaid' as const);
        return {
          ...b,
          depositPaid: amount,
          transferLastFour: transferLastFour.trim() || b.transferLastFour || '',
          paymentStatus,
          updatedAt: new Date().toISOString(),
          updatedByEmail: normalizeEmail(actorEmail),
        };
      });
      writeJson(STORAGE_KEY_BOOKINGS, next);
      emitBookings();
      broadcast('bookings');
    },

    async markBookingPaidInFull(bookingId: string, actorEmail: string) {
      const bookings = getBookings();
      const next = bookings.map((b) =>
        b.id === bookingId
          ? {
              ...b,
              depositPaid: b.totalAmount,
              paymentStatus: 'paid_in_full' as const,
              updatedAt: new Date().toISOString(),
              updatedByEmail: normalizeEmail(actorEmail),
            }
          : b
      );
      writeJson(STORAGE_KEY_BOOKINGS, next);
      emitBookings();
      broadcast('bookings');
    },

    subscribeRoomBlocks(onChange) {
      blockListeners.add(onChange);
      onChange(getRoomBlocks());
      return () => {
        blockListeners.delete(onChange);
      };
    },

    async saveRoomBlock(
      input: RoomBlockInput,
      actorEmail: string,
      existingBlockId?: string
    ): Promise<RoomBlock> {
      const cleaned: RoomBlockInput = {
        ...input,
        reason: input.reason.trim(),
      };
      const validationError = validateRoomBlockInput(cleaned);
      if (validationError) {
        throw new Error(validationError);
      }

      const rooms = getRooms();
      const bookings = getBookings();
      const blocks = getRoomBlocks();
      const conflictMsg = findConflictForRoomBlock(
        cleaned,
        bookings,
        blocks,
        rooms,
        existingBlockId
      );
      if (conflictMsg) {
        throw new Error(conflictMsg);
      }

      const nowIso = new Date().toISOString();
      const existing = existingBlockId
        ? blocks.find((b) => b.id === existingBlockId)
        : undefined;

      const record: RoomBlock = {
        ...cleaned,
        id: existingBlockId || createId('blk'),
        createdAt: existing?.createdAt || nowIso,
        updatedByEmail: normalizeEmail(actorEmail),
      };

      const next = existingBlockId
        ? blocks.map((b) => (b.id === existingBlockId ? record : b))
        : [...blocks, record];

      writeJson(STORAGE_KEY_BLOCKS, next);
      emitBlocks();
      broadcast('blocks');
      return record;
    },

    async deleteRoomBlock(blockId: string) {
      const next = getRoomBlocks().filter((b) => b.id !== blockId);
      writeJson(STORAGE_KEY_BLOCKS, next);
      emitBlocks();
      broadcast('blocks');
    },

    async resetDemoData() {
      writeJson(STORAGE_KEY_ROOMS, INITIAL_XINYUE_ROOMS);
      writeJson(STORAGE_KEY_BOOKINGS, buildInitialDemoBookings());
      writeJson(STORAGE_KEY_BLOCKS, buildInitialDemoRoomBlocks());
      writeJson(STORAGE_KEY_HOLIDAYS, {
        dates: [],
        updatedAt: new Date().toISOString(),
        updatedByEmail: 'owner@xinyue.tw',
      });
      emitRooms();
      emitBookings();
      emitBlocks();
      emitHolidays();
      broadcast('rooms');
      broadcast('bookings');
      broadcast('blocks');
      broadcast('holidays');
    },
  };
}
