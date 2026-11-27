import type {
  AppView,
  BookingStatus,
  BuildingZone,
  DepositTrackingState,
  HousekeepingStatus,
  PaymentStatus,
} from '../types/domain';

export const APP_BRAND = {
  title: '侑德心悅・侑德園',
  subtitle: '拉拉山民宿訂房管理系統',
  shortTitle: '侑德心悅',
} as const;

export const BANK_REMITTANCE_INFO = {
  bankCode: '050',
  bankName: '台灣中小企業銀行 八德分行（活儲）',
  accountNumber: '33062567975',
  accountHolder: '羅素貞',
  contactPhones: '03-3912731 或 0910-264643',
} as const;

export const BUILDING_LABELS: Record<BuildingZone, string> = {
  xinyue: '侑德心悅（本館）',
  youde: '侑德園（木屋區）',
};

export const BUILDING_SHORT_LABELS: Record<BuildingZone, string> = {
  xinyue: '心悅館',
  youde: '侑德園',
};

export const HOUSEKEEPING_LABELS: Record<HousekeepingStatus, string> = {
  clean: '已清潔',
  dirty: '待打掃',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: '已確認',
  checked_in: '已入住',
  checked_out: '已退房',
  cancelled: '已取消',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: '待付訂金',
  deposit_paid: '已付訂金',
  paid_in_full: '已付清',
};

export const DEPOSIT_TRACKING_LABELS: Record<DepositTrackingState, string> = {
  awaiting_deposit: '待付訂金',
  deposit_overdue: '逾期未匯',
  deposit_paid: '已付訂金',
  paid_in_full: '已付清',
};

export const NAV_LABELS: Record<AppView, string> = {
  timeline: '房態格',
  today: '今日',
  bookings: '訂單',
  housekeeping: '房務',
  settings: '設定',
};

export const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const;

export const ROOM_BLOCK_REASON_PRESETS = [
  '設備維修',
  '冷氣保養',
  '油漆／裝修',
  '老闆親友自留',
  '公休不開放',
] as const;
