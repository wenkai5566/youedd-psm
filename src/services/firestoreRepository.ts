import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { INITIAL_XINYUE_ROOMS } from '../constants/seedData';
import {
  buildNightLockId,
  enumerateOccupiedNights,
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
} from '../types/domain';
import { getEnvAllowedEmails, getFirebaseServices } from './firebaseConfig';
import type { GuesthouseRepository } from './repository';

const COLLECTION_ROOMS = 'rooms';
const COLLECTION_BOOKINGS = 'bookings';
const COLLECTION_ROOM_BLOCKS = 'roomBlocks';
const COLLECTION_NIGHT_LOCKS = 'roomNightLocks';
const ACCESS_DOC_PATH = ['config', 'accessControl'] as const;
const HOLIDAYS_DOC_PATH = ['config', 'specialHolidays'] as const;

interface NightLockRecord {
  bookingId: string;
  lockType?: 'booking' | 'block';
  roomId: string;
  nightDate: string;
  guestName: string;
  updatedAt: string;
}

function collectLockEntries(
  roomIds: string[],
  checkInDate: string,
  checkOutDate: string
): Array<{ lockId: string; roomId: string; nightDate: string }> {
  const nights = enumerateOccupiedNights(checkInDate, checkOutDate);
  const entries: Array<{ lockId: string; roomId: string; nightDate: string }> = [];
  for (const roomId of roomIds) {
    for (const nightDate of nights) {
      entries.push({
        lockId: buildNightLockId(roomId, nightDate),
        roomId,
        nightDate,
      });
    }
  }
  return entries;
}

/**
 * Production Cloud Firestore + Firebase Google Auth repository.
 */
export function createFirestoreRepository(): GuesthouseRepository {
  const { auth, db, googleProvider } = getFirebaseServices();
  let roomsSeedAttempted = false;

  async function seedInitialRoomsIfEmpty(): Promise<void> {
    if (roomsSeedAttempted) {
      return;
    }
    roomsSeedAttempted = true;
    const snap = await getDocs(collection(db, COLLECTION_ROOMS));
    if (!snap.empty) {
      return;
    }
    const batch = writeBatch(db);
    for (const room of INITIAL_XINYUE_ROOMS) {
      batch.set(doc(db, COLLECTION_ROOMS, room.id), room);
    }
    await batch.commit();
  }

  return {
    mode: 'firebase',

    subscribeAuth(onChange) {
      return onAuthStateChanged(auth, (fbUser) => {
        if (!fbUser || !fbUser.email) {
          onChange(null);
          return;
        }
        onChange({
          uid: fbUser.uid,
          email: normalizeEmail(fbUser.email),
          displayName: fbUser.displayName || fbUser.email.split('@')[0],
          photoURL: fbUser.photoURL || undefined,
        });
      });
    },

    async signInWithGoogle() {
      try {
        const credential = await signInWithPopup(auth, googleProvider);
        const fbUser = credential.user;
        if (!fbUser.email) {
          throw new Error('無法取得 Google 帳號電子郵件');
        }
        return {
          uid: fbUser.uid,
          email: normalizeEmail(fbUser.email),
          displayName: fbUser.displayName || fbUser.email.split('@')[0],
          photoURL: fbUser.photoURL || undefined,
        };
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (
          code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment'
        ) {
          await signInWithRedirect(auth, googleProvider);
          throw new Error('正在重新導向至 Google 登入頁面...');
        }
        throw err;
      }
    },

    async signOut() {
      await firebaseSignOut(auth);
    },

    subscribeAccessControl(onChange, onError) {
      const ref = doc(db, ACCESS_DOC_PATH[0], ACCESS_DOC_PATH[1]);
      return onSnapshot(
        ref,
        (snapshot) => {
          if (!snapshot.exists()) {
            onChange({
              allowedEmails: getEnvAllowedEmails(),
              updatedAt: new Date().toISOString(),
              updatedByEmail: 'system',
            });
            return;
          }
          const data = snapshot.data() as Partial<AccessControlConfig>;
          const list =
            Array.isArray(data.allowedEmails) && data.allowedEmails.length > 0
              ? data.allowedEmails.map(normalizeEmail)
              : getEnvAllowedEmails();
          onChange({
            allowedEmails: list,
            updatedAt: data.updatedAt || new Date().toISOString(),
            updatedByEmail: data.updatedByEmail || 'system',
          });
        },
        (error) => {
          onError?.(error);
        }
      );
    },

    async updateAllowedEmails(emails, actorEmail) {
      const cleaned = Array.from(
        new Set(emails.map(normalizeEmail).filter(Boolean))
      );
      if (cleaned.length < 1) {
        throw new Error('至少必須保留 1 組授權工作人員 Email');
      }
      const ref = doc(db, ACCESS_DOC_PATH[0], ACCESS_DOC_PATH[1]);
      await setDoc(ref, {
        allowedEmails: cleaned,
        updatedAt: new Date().toISOString(),
        updatedByEmail: normalizeEmail(actorEmail),
      });
    },

    subscribeSpecialHolidays(onChange, onError) {
      const ref = doc(db, HOLIDAYS_DOC_PATH[0], HOLIDAYS_DOC_PATH[1]);
      return onSnapshot(
        ref,
        (snapshot) => {
          if (!snapshot.exists()) {
            onChange({
              dates: [],
              updatedAt: new Date().toISOString(),
              updatedByEmail: 'system',
            });
            return;
          }
          const data = snapshot.data() as Partial<SpecialHolidaysConfig>;
          const dates = Array.isArray(data.dates)
            ? Array.from(new Set(data.dates.filter(isValidDateISO))).sort()
            : [];
          onChange({
            dates,
            updatedAt: data.updatedAt || new Date().toISOString(),
            updatedByEmail: data.updatedByEmail || 'system',
          });
        },
        (error) => onError?.(error)
      );
    },

    async updateSpecialHolidays(dates, actorEmail) {
      const cleaned = Array.from(new Set(dates.filter(isValidDateISO))).sort();
      const ref = doc(db, HOLIDAYS_DOC_PATH[0], HOLIDAYS_DOC_PATH[1]);
      await setDoc(ref, {
        dates: cleaned,
        updatedAt: new Date().toISOString(),
        updatedByEmail: normalizeEmail(actorEmail),
      });
    },

    subscribeRooms(onChange, onError) {
      void seedInitialRoomsIfEmpty().catch(() => {
        /* Unauthorized or offline user */
      });

      const q = query(collection(db, COLLECTION_ROOMS), orderBy('sortOrder', 'asc'));
      return onSnapshot(
        q,
        (snapshot) => {
          const rooms = snapshot.docs.map((d) =>
            normalizeRoomRecord({
              ...(d.data() as Partial<Room>),
              id: d.id,
            })
          );
          onChange(rooms);
        },
        (error) => onError?.(error)
      );
    },

    async saveRoom(input: RoomInput, existingRoomId?: string) {
      const targetRef = existingRoomId
        ? doc(db, COLLECTION_ROOMS, existingRoomId)
        : doc(collection(db, COLLECTION_ROOMS));

      const roomRecord: Room = {
        ...input,
        id: targetRef.id,
      };
      await setDoc(targetRef, roomRecord);
    },

    async updateRoomHousekeeping(roomId: string, status: HousekeepingStatus) {
      await updateDoc(doc(db, COLLECTION_ROOMS, roomId), {
        housekeepingStatus: status,
      });
    },

    async deleteRoom(roomId: string) {
      await deleteDoc(doc(db, COLLECTION_ROOMS, roomId));
    },

    subscribeBookings(onChange, onError) {
      const q = query(
        collection(db, COLLECTION_BOOKINGS),
        orderBy('checkInDate', 'asc')
      );
      return onSnapshot(
        q,
        (snapshot) => {
          const bookings = snapshot.docs.map((d) =>
            normalizeBookingRecord({
              ...(d.data() as Booking & { roomId?: string }),
              id: d.id,
            })
          );
          onChange(bookings);
        },
        (error) => onError?.(error)
      );
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

      const bookingRef = existingBookingId
        ? doc(db, COLLECTION_BOOKINGS, existingBookingId)
        : doc(collection(db, COLLECTION_BOOKINGS));
      const bookingId = bookingRef.id;
      const nowIso = new Date().toISOString();

      return runTransaction(db, async (tx) => {
        const previousSnap = existingBookingId ? await tx.get(bookingRef) : null;
        const previousBooking = previousSnap?.exists()
          ? normalizeBookingRecord({
              ...(previousSnap.data() as Booking & { roomId?: string }),
              id: bookingId,
            })
          : null;

        const oldLocks =
          previousBooking && previousBooking.status !== 'cancelled'
            ? collectLockEntries(
                previousBooking.roomIds,
                previousBooking.checkInDate,
                previousBooking.checkOutDate
              )
            : [];

        const newLocks =
          normalizedInput.status !== 'cancelled'
            ? collectLockEntries(
                normalizedInput.roomIds,
                normalizedInput.checkInDate,
                normalizedInput.checkOutDate
              )
            : [];

        for (const entry of newLocks) {
          const lockRef = doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId);
          const lockSnap = await tx.get(lockRef);
          if (lockSnap.exists()) {
            const existingLock = lockSnap.data() as NightLockRecord;
            if (existingLock.bookingId !== bookingId) {
              throw new Error(
                existingLock.lockType === 'block'
                  ? `鎖房衝突：房號於 ${existingLock.nightDate} 已被${existingLock.guestName}`
                  : `重複訂房衝突：房號於 ${existingLock.nightDate} 已有「${existingLock.guestName}」的訂房紀錄`
              );
            }
          }
        }

        const newLockIdSet = new Set(newLocks.map((e) => e.lockId));
        for (const oldEntry of oldLocks) {
          if (!newLockIdSet.has(oldEntry.lockId)) {
            tx.delete(doc(db, COLLECTION_NIGHT_LOCKS, oldEntry.lockId));
          }
        }

        for (const entry of newLocks) {
          const lockRecord: NightLockRecord = {
            bookingId,
            lockType: 'booking',
            roomId: entry.roomId,
            nightDate: entry.nightDate,
            guestName: normalizedInput.guestName.trim(),
            updatedAt: nowIso,
          };
          tx.set(doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId), lockRecord);
        }

        const savedBooking: Booking = {
          ...normalizedInput,
          id: bookingId,
          guestName: normalizedInput.guestName.trim(),
          guestPhone: formatTaiwanPhone(normalizedInput.guestPhone),
          notes: normalizedInput.notes.trim(),
          createdAt: previousBooking?.createdAt || nowIso,
          updatedAt: nowIso,
          updatedByEmail: normalizeEmail(actorEmail),
        };

        tx.set(bookingRef, savedBooking);
        return savedBooking;
      });
    },

    async updateBookingStatus(
      bookingId: string,
      status: BookingStatus,
      actorEmail: string
    ) {
      const bookingRef = doc(db, COLLECTION_BOOKINGS, bookingId);
      const nowIso = new Date().toISOString();

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists()) {
          throw new Error('找不到此筆訂房資料');
        }
        const current = normalizeBookingRecord({
          ...(snap.data() as Booking & { roomId?: string }),
          id: bookingId,
        });
        const locks = collectLockEntries(
          current.roomIds,
          current.checkInDate,
          current.checkOutDate
        );

        if (status === 'cancelled' && current.status !== 'cancelled') {
          for (const entry of locks) {
            tx.delete(doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId));
          }
        } else if (status !== 'cancelled' && current.status === 'cancelled') {
          for (const entry of locks) {
            const lockSnap = await tx.get(
              doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId)
            );
            if (lockSnap.exists()) {
              const lockData = lockSnap.data() as NightLockRecord;
              if (lockData.bookingId !== bookingId) {
                throw new Error(
                  `無法恢復訂房：${lockData.nightDate} 已被「${lockData.guestName}」預訂`
                );
              }
            }
          }
          for (const entry of locks) {
            tx.set(doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId), {
              bookingId,
              roomId: entry.roomId,
              nightDate: entry.nightDate,
              guestName: current.guestName,
              updatedAt: nowIso,
            });
          }
        }

        /* Automatically mark checked-out rooms as dirty for housekeeping */
        if (status === 'checked_out' && current.status !== 'checked_out') {
          for (const rid of current.roomIds) {
            tx.update(doc(db, COLLECTION_ROOMS, rid), {
              housekeepingStatus: 'dirty',
            });
          }
        }

        tx.set(bookingRef, {
          ...current,
          status,
          updatedAt: nowIso,
          updatedByEmail: normalizeEmail(actorEmail),
        });
      });
    },

    async recordBookingDeposit(
      bookingId: string,
      depositAmount: number,
      transferLastFour: string,
      actorEmail: string
    ) {
      const bookingRef = doc(db, COLLECTION_BOOKINGS, bookingId);
      const nowIso = new Date().toISOString();

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists()) {
          throw new Error('找不到此筆訂房資料');
        }
        const current = normalizeBookingRecord({
          ...(snap.data() as Booking & { roomId?: string }),
          id: bookingId,
        });
        const amount = Math.max(0, Math.round(depositAmount));
        const paymentStatus =
          current.totalAmount > 0 && amount >= current.totalAmount
            ? 'paid_in_full'
            : amount > 0
              ? 'deposit_paid'
              : 'unpaid';

        tx.set(bookingRef, {
          ...current,
          depositPaid: amount,
          transferLastFour: transferLastFour.trim() || current.transferLastFour || '',
          paymentStatus,
          updatedAt: nowIso,
          updatedByEmail: normalizeEmail(actorEmail),
        });
      });
    },

    async markBookingPaidInFull(bookingId: string, actorEmail: string) {
      const bookingRef = doc(db, COLLECTION_BOOKINGS, bookingId);
      const nowIso = new Date().toISOString();

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists()) {
          throw new Error('找不到此筆訂房資料');
        }
        const current = normalizeBookingRecord({
          ...(snap.data() as Booking & { roomId?: string }),
          id: bookingId,
        });
        tx.set(bookingRef, {
          ...current,
          depositPaid: current.totalAmount,
          paymentStatus: 'paid_in_full',
          updatedAt: nowIso,
          updatedByEmail: normalizeEmail(actorEmail),
        });
      });
    },

    subscribeRoomBlocks(onChange, onError) {
      const q = query(
        collection(db, COLLECTION_ROOM_BLOCKS),
        orderBy('startDate', 'asc')
      );
      return onSnapshot(
        q,
        (snapshot) => {
          const blocks = snapshot.docs.map((d) =>
            normalizeRoomBlockRecord({
              ...(d.data() as Partial<RoomBlock>),
              id: d.id,
            })
          );
          onChange(blocks);
        },
        (error) => onError?.(error)
      );
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

      const blockRef = existingBlockId
        ? doc(db, COLLECTION_ROOM_BLOCKS, existingBlockId)
        : doc(collection(db, COLLECTION_ROOM_BLOCKS));
      const blockId = blockRef.id;
      const nowIso = new Date().toISOString();

      return runTransaction(db, async (tx) => {
        const previousSnap = existingBlockId ? await tx.get(blockRef) : null;
        const previousBlock = previousSnap?.exists()
          ? normalizeRoomBlockRecord({
              ...(previousSnap.data() as Partial<RoomBlock>),
              id: blockId,
            })
          : null;

        const oldLocks = previousBlock
          ? collectLockEntries(
              [previousBlock.roomId],
              previousBlock.startDate,
              previousBlock.endDate
            )
          : [];

        const newLocks = collectLockEntries(
          [cleaned.roomId],
          cleaned.startDate,
          cleaned.endDate
        );

        for (const entry of newLocks) {
          const lockRef = doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId);
          const lockSnap = await tx.get(lockRef);
          if (lockSnap.exists()) {
            const existingLock = lockSnap.data() as NightLockRecord;
            if (existingLock.bookingId !== blockId) {
              throw new Error(
                existingLock.lockType === 'block'
                  ? `無法鎖房：${existingLock.nightDate} 已有「${existingLock.guestName}」鎖房紀錄`
                  : `無法鎖房：${existingLock.nightDate} 已有「${existingLock.guestName}」的訂房紀錄`
              );
            }
          }
        }

        const newLockIdSet = new Set(newLocks.map((e) => e.lockId));
        for (const oldEntry of oldLocks) {
          if (!newLockIdSet.has(oldEntry.lockId)) {
            tx.delete(doc(db, COLLECTION_NIGHT_LOCKS, oldEntry.lockId));
          }
        }

        for (const entry of newLocks) {
          const lockRecord: NightLockRecord = {
            bookingId: blockId,
            lockType: 'block',
            roomId: entry.roomId,
            nightDate: entry.nightDate,
            guestName: `鎖房：${cleaned.reason}`,
            updatedAt: nowIso,
          };
          tx.set(doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId), lockRecord);
        }

        const savedBlock: RoomBlock = {
          ...cleaned,
          id: blockId,
          createdAt: previousBlock?.createdAt || nowIso,
          updatedByEmail: normalizeEmail(actorEmail),
        };
        tx.set(blockRef, savedBlock);
        return savedBlock;
      });
    },

    async deleteRoomBlock(blockId: string) {
      const blockRef = doc(db, COLLECTION_ROOM_BLOCKS, blockId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(blockRef);
        if (!snap.exists()) {
          return;
        }
        const current = normalizeRoomBlockRecord({
          ...(snap.data() as Partial<RoomBlock>),
          id: blockId,
        });
        const locks = collectLockEntries(
          [current.roomId],
          current.startDate,
          current.endDate
        );
        for (const entry of locks) {
          const lockRef = doc(db, COLLECTION_NIGHT_LOCKS, entry.lockId);
          const lockSnap = await tx.get(lockRef);
          if (lockSnap.exists()) {
            const data = lockSnap.data() as NightLockRecord;
            if (data.bookingId === blockId) {
              tx.delete(lockRef);
            }
          }
        }
        tx.delete(blockRef);
      });
    },
  };
}
