import { useState } from 'react';
import { BedDouble, CalendarHeart, Plus, ShieldCheck, X } from 'lucide-react';
import { WEEKDAY_ZH } from '../constants/labels';
import {
  addDaysISO,
  formatShortDateZh,
  getNightsCount,
  getTodayISO,
} from '../domain/bookingLogic';
import type {
  AccessControlConfig,
  BackendMode,
  Room,
  RoomInput,
  StaffUser,
} from '../types/domain';
import { RoomsManagerView } from './RoomsManagerView';
import { SmartDateInput } from './SmartDateInput';
import { TeamAccessView } from './TeamAccessView';

interface SettingsViewProps {
  mode: BackendMode;
  currentUser: StaffUser;
  rooms: Room[];
  accessConfig: AccessControlConfig;
  specialHolidayDates: string[];
  onSaveRoom: (input: RoomInput, existingRoomId?: string) => Promise<void>;
  onDeleteRoom: (roomId: string) => Promise<void>;
  onUpdateAllowedEmails: (emails: string[]) => Promise<void>;
  onUpdateSpecialHolidays: (dates: string[]) => Promise<void>;
  onResetDemoData?: () => Promise<void>;
}

type SettingsTab = 'rooms' | 'holidays' | 'access';

export function SettingsView({
  mode,
  currentUser,
  rooms,
  accessConfig,
  specialHolidayDates,
  onSaveRoom,
  onDeleteRoom,
  onUpdateAllowedEmails,
  onUpdateSpecialHolidays,
  onResetDemoData,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('rooms');
  const todayISO = getTodayISO();
  const [rangeStart, setRangeStart] = useState<string>(todayISO);
  const [rangeEnd, setRangeEnd] = useState<string>(todayISO);
  const [busyHoliday, setBusyHoliday] = useState(false);

  const handleAddHolidayRange = async () => {
    const span = getNightsCount(rangeStart, rangeEnd);
    const daysToAdd = span >= 0 ? Math.min(90, span + 1) : 1;
    const added: string[] = [];
    for (let i = 0; i < daysToAdd; i += 1) {
      added.push(addDaysISO(rangeStart, i));
    }
    try {
      setBusyHoliday(true);
      await onUpdateSpecialHolidays([...specialHolidayDates, ...added]);
    } finally {
      setBusyHoliday(false);
    }
  };

  const handleRemoveHoliday = async (dateISO: string) => {
    try {
      setBusyHoliday(true);
      await onUpdateSpecialHolidays(
        specialHolidayDates.filter((d) => d !== dateISO)
      );
    } finally {
      setBusyHoliday(false);
    }
  };

  return (
    <section className="preno-page" aria-label="系統設定">
      <div className="preno-topbar desktop-only-flex">
        <div className="preno-topbar-left">
          <h2 className="preno-topbar-title">設定</h2>
          <span className="preno-topbar-sub">
            房型價目、特殊假日與團隊授權白名單
          </span>
        </div>
      </div>

      <div className="preno-underline-tabs" role="tablist" aria-label="設定分頁">
        <button
          id="tab-settings-rooms"
          type="button"
          role="tab"
          aria-selected={activeTab === 'rooms'}
          className={`preno-tab-btn ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          <BedDouble size={15} />
          <span>房型與房價</span>
        </button>

        <button
          id="tab-settings-holidays"
          type="button"
          role="tab"
          aria-selected={activeTab === 'holidays'}
          className={`preno-tab-btn ${activeTab === 'holidays' ? 'active' : ''}`}
          onClick={() => setActiveTab('holidays')}
        >
          <CalendarHeart size={15} />
          <span>特殊假日</span>
          <span className="preno-tab-count tabular-nums">
            {specialHolidayDates.length}
          </span>
        </button>

        <button
          id="tab-settings-access"
          type="button"
          role="tab"
          aria-selected={activeTab === 'access'}
          className={`preno-tab-btn ${activeTab === 'access' ? 'active' : ''}`}
          onClick={() => setActiveTab('access')}
        >
          <ShieldCheck size={15} />
          <span>團隊授權</span>
        </button>
      </div>

      <div className="preno-page-scroll preno-settings-body">
        {activeTab === 'rooms' && (
          <RoomsManagerView
            rooms={rooms}
            onSaveRoom={onSaveRoom}
            onDeleteRoom={onDeleteRoom}
          />
        )}

        {activeTab === 'holidays' && (
          <div className="preno-section-block">
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>
                自訂特殊假日／旺季計價日
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--ink-secondary)',
                  marginTop: 4,
                }}
              >
                週五與週六預設為假日價。國定連假週日、農曆春節或旺季加入下方後，開單即自動套用假日房價。
              </p>
            </div>

            <div className="preno-holiday-adder">
              <div className="field-group" style={{ width: 170 }}>
                <span className="field-label">起始日期</span>
                <SmartDateInput
                  ariaLabel="特殊假日起始日"
                  value={rangeStart}
                  onChange={(d) => {
                    setRangeStart(d);
                    if (d > rangeEnd) setRangeEnd(d);
                  }}
                />
              </div>

              <div className="field-group" style={{ width: 170 }}>
                <span className="field-label">結束日期（單日可填同天）</span>
                <SmartDateInput
                  ariaLabel="特殊假日結束日"
                  value={rangeEnd}
                  min={rangeStart}
                  onChange={setRangeEnd}
                />
              </div>

              <button
                id="btn-add-special-holiday"
                type="button"
                className="btn btn-primary"
                disabled={busyHoliday}
                onClick={() => void handleAddHolidayRange()}
              >
                <Plus size={15} />
                加入假日標記
              </button>
            </div>

            {specialHolidayDates.length === 0 ? (
              <div
                style={{
                  fontSize: 14,
                  color: 'var(--ink-muted)',
                  padding: '8px 0',
                }}
              >
                尚未設定自訂特殊假日（目前僅週五、週六套用假日價）。
              </div>
            ) : (
              <div className="holiday-chip-list">
                {specialHolidayDates.map((dateISO) => (
                  <span key={dateISO} className="holiday-chip tabular-nums">
                    <span>{formatShortDateZh(dateISO, WEEKDAY_ZH)}</span>
                    <button
                      type="button"
                      aria-label={`移除 ${dateISO}`}
                      disabled={busyHoliday}
                      onClick={() => void handleRemoveHoliday(dateISO)}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'access' && (
          <TeamAccessView
            mode={mode}
            currentUser={currentUser}
            accessConfig={accessConfig}
            onUpdateAllowedEmails={onUpdateAllowedEmails}
            onResetDemoData={onResetDemoData}
          />
        )}
      </div>
    </section>
  );
}
