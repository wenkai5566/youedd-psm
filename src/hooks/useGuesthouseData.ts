import { useCallback, useEffect, useMemo, useState } from 'react';
import { isEmailWhitelisted } from '../domain/bookingLogic';
import { getEnvAllowedEmails } from '../services/firebaseConfig';
import { getRepository, type DemoSignInAccount } from '../services/repository';
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
  ToastItem,
} from '../types/domain';

export function useGuesthouseData() {
  const repository = useMemo(() => getRepository(), []);

  const [user, setUser] = useState<StaffUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [accessConfig, setAccessConfig] = useState<AccessControlConfig>(() => ({
    allowedEmails: getEnvAllowedEmails(),
    updatedAt: new Date().toISOString(),
    updatedByEmail: 'system',
  }));
  const [holidaysConfig, setHolidaysConfig] = useState<SpecialHolidaysConfig>(
    () => ({
      dates: [],
      updatedAt: new Date().toISOString(),
      updatedByEmail: 'system',
    })
  );
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [roomBlocks, setRoomBlocks] = useState<RoomBlock[]>([]);
  const [permissionError, setPermissionError] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (message: string, tone: ToastItem['tone'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, tone, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3600);
    },
    []
  );

  useEffect(() => {
    const unsubscribe = repository.subscribeAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      setPermissionError(false);
    });
    return unsubscribe;
  }, [repository]);

  const isAuthorized = useMemo(() => {
    if (!user || permissionError) {
      return false;
    }
    return isEmailWhitelisted(user.email, accessConfig.allowedEmails);
  }, [user, permissionError, accessConfig.allowedEmails]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }
    const unsubscribe = repository.subscribeAccessControl(
      (config) => {
        setAccessConfig(config);
        setPermissionError(false);
      },
      (error) => {
        const code = (error as { code?: string })?.code;
        if (code === 'permission-denied') {
          setPermissionError(true);
        }
      }
    );
    return unsubscribe;
  }, [repository, user]);

  useEffect(() => {
    if (!user || !isAuthorized) {
      return undefined;
    }

    const unsubRooms = repository.subscribeRooms(
      (nextRooms) => setRooms(nextRooms),
      (error) => {
        const code = (error as { code?: string })?.code;
        if (code === 'permission-denied') {
          setPermissionError(true);
        } else {
          pushToast('讀取房型資料失敗，請檢查網路連線', 'error');
        }
      }
    );

    const unsubBookings = repository.subscribeBookings(
      (nextBookings) => setBookings(nextBookings),
      (error) => {
        const code = (error as { code?: string })?.code;
        if (code === 'permission-denied') {
          setPermissionError(true);
        } else {
          pushToast('讀取訂房資料失敗，請檢查網路連線', 'error');
        }
      }
    );

    const unsubHolidays = repository.subscribeSpecialHolidays(
      (config) => setHolidaysConfig(config),
      () => {
        /* Non-blocking */
      }
    );

    const unsubBlocks = repository.subscribeRoomBlocks(
      (nextBlocks) => setRoomBlocks(nextBlocks),
      () => {
        /* Non-blocking */
      }
    );

    return () => {
      unsubRooms();
      unsubBookings();
      unsubHolidays();
      unsubBlocks();
    };
  }, [repository, user, isAuthorized, pushToast]);

  const signInWithGoogle = useCallback(
    async (demoAccount?: DemoSignInAccount) => {
      try {
        await repository.signInWithGoogle(demoAccount);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google 登入失敗，請稍後再試';
        pushToast(msg, 'error');
      }
    },
    [repository, pushToast]
  );

  const signOut = useCallback(async () => {
    await repository.signOut();
    pushToast('已登出系統', 'info');
  }, [repository, pushToast]);

  const saveBooking = useCallback(
    async (
      input: BookingInput,
      existingId?: string,
      customSuccessMessage?: string
    ) => {
      if (!user) {
        throw new Error('請先登入系統');
      }
      const saved = await repository.saveBooking(input, user.email, existingId);
      pushToast(
        customSuccessMessage ||
          (existingId ? '已更新訂房資料' : '已建立新訂房紀錄'),
        'success'
      );
      return saved;
    },
    [repository, user, pushToast]
  );

  const updateBookingStatus = useCallback(
    async (bookingId: string, status: BookingStatus) => {
      if (!user) return;
      try {
        await repository.updateBookingStatus(bookingId, status, user.email);
        const statusToast: Record<BookingStatus, string> = {
          confirmed: '已恢復訂房',
          checked_in: '已完成辦理入住',
          checked_out: '已辦理退房，房務已自動標示為待清潔',
          cancelled: '已取消訂房並釋出房態',
        };
        pushToast(statusToast[status], 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新狀態失敗';
        pushToast(msg, 'error');
      }
    },
    [repository, user, pushToast]
  );

  const recordBookingDeposit = useCallback(
    async (bookingId: string, depositAmount: number, transferLastFour: string) => {
      if (!user) return;
      try {
        await repository.recordBookingDeposit(
          bookingId,
          depositAmount,
          transferLastFour,
          user.email
        );
        pushToast('已登記收到訂金', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '登記訂金失敗';
        pushToast(msg, 'error');
        throw err;
      }
    },
    [repository, user, pushToast]
  );

  const markBookingPaidInFull = useCallback(
    async (bookingId: string) => {
      if (!user) return;
      try {
        await repository.markBookingPaidInFull(bookingId, user.email);
        pushToast('已標記為全額結清', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新收款狀態失敗';
        pushToast(msg, 'error');
      }
    },
    [repository, user, pushToast]
  );

  const saveRoom = useCallback(
    async (input: RoomInput, existingRoomId?: string) => {
      try {
        await repository.saveRoom(input, existingRoomId);
        pushToast(existingRoomId ? '已更新房型設定' : '已新增房型', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '儲存房型失敗';
        pushToast(msg, 'error');
        throw err;
      }
    },
    [repository, pushToast]
  );

  const updateRoomHousekeeping = useCallback(
    async (roomId: string, status: HousekeepingStatus) => {
      try {
        await repository.updateRoomHousekeeping(roomId, status);
        pushToast(
          status === 'clean' ? '已標記為清潔完成' : '已標記為待清潔',
          'info'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新清潔狀態失敗';
        pushToast(msg, 'error');
      }
    },
    [repository, pushToast]
  );

  const deleteRoom = useCallback(
    async (roomId: string) => {
      try {
        await repository.deleteRoom(roomId);
        pushToast('已刪除房型', 'info');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '無法刪除此房型';
        pushToast(msg, 'error');
      }
    },
    [repository, pushToast]
  );

  const updateAllowedEmails = useCallback(
    async (emails: string[]) => {
      if (!user) return;
      try {
        await repository.updateAllowedEmails(emails, user.email);
        pushToast('已更新團隊授權白名單', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新白名單失敗';
        pushToast(msg, 'error');
        throw err;
      }
    },
    [repository, user, pushToast]
  );

  const updateSpecialHolidays = useCallback(
    async (dates: string[]) => {
      if (!user) return;
      try {
        await repository.updateSpecialHolidays(dates, user.email);
        pushToast('已更新特殊假日設定', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '更新特殊假日失敗';
        pushToast(msg, 'error');
        throw err;
      }
    },
    [repository, user, pushToast]
  );

  const saveRoomBlock = useCallback(
    async (input: RoomBlockInput, existingBlockId?: string) => {
      if (!user) {
        throw new Error('請先登入系統');
      }
      const saved = await repository.saveRoomBlock(
        input,
        user.email,
        existingBlockId
      );
      pushToast(existingBlockId ? '已更新鎖房設定' : '已鎖定該房型日期', 'success');
      return saved;
    },
    [repository, user, pushToast]
  );

  const deleteRoomBlock = useCallback(
    async (blockId: string) => {
      try {
        await repository.deleteRoomBlock(blockId);
        pushToast('已解除鎖房並釋出空房', 'info');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '解除鎖房失敗';
        pushToast(msg, 'error');
        throw err;
      }
    },
    [repository, pushToast]
  );

  const resetDemoData = useCallback(async () => {
    if (!repository.resetDemoData) return;
    await repository.resetDemoData();
    pushToast('已重設預設展示資料', 'info');
  }, [repository, pushToast]);

  return {
    mode: repository.mode,
    user,
    authReady,
    isAuthorized,
    accessConfig,
    specialHolidayDates: isAuthorized ? holidaysConfig.dates : [],
    rooms: isAuthorized ? rooms : [],
    bookings: isAuthorized ? bookings : [],
    roomBlocks: isAuthorized ? roomBlocks : [],
    toasts,
    pushToast,
    signInWithGoogle,
    signOut,
    saveBooking,
    updateBookingStatus,
    recordBookingDeposit,
    markBookingPaidInFull,
    saveRoom,
    updateRoomHousekeeping,
    deleteRoom,
    saveRoomBlock,
    deleteRoomBlock,
    updateAllowedEmails,
    updateSpecialHolidays,
    resetDemoData: repository.resetDemoData ? resetDemoData : undefined,
  };
}
