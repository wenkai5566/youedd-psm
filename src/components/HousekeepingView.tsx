import { useMemo, useState } from 'react';
import { Check, CheckCheck, Sparkles } from 'lucide-react';
import { BUILDING_LABELS, HOUSEKEEPING_LABELS } from '../constants/labels';
import { getTodayISO } from '../domain/bookingLogic';
import type {
  Booking,
  HousekeepingStatus,
  Room,
  RoomBlock,
} from '../types/domain';

interface HousekeepingViewProps {
  rooms: Room[];
  bookings: Booking[];
  roomBlocks: RoomBlock[];
  onToggleHousekeeping: (
    roomId: string,
    nextStatus: HousekeepingStatus
  ) => Promise<void>;
}

type HkFilter = 'all' | 'dirty' | 'clean';

export function HousekeepingView({
  rooms,
  bookings,
  roomBlocks,
  onToggleHousekeeping,
}: HousekeepingViewProps) {
  const todayISO = getTodayISO();
  const [filter, setFilter] = useState<HkFilter>('all');

  const activeRooms = useMemo(() => rooms.filter((r) => r.isActive), [rooms]);

  const roomContextMap = useMemo(() => {
    const active = bookings.filter((b) => b.status !== 'cancelled');
    const map = new Map<
      string,
      {
        departing?: Booking;
        arriving?: Booking;
        staying?: Booking;
        block?: RoomBlock;
      }
    >();

    for (const room of activeRooms) {
      map.set(room.id, {});
    }

    for (const b of active) {
      for (const rid of b.roomIds) {
        const entry = map.get(rid);
        if (!entry) continue;
        if (b.checkOutDate === todayISO) entry.departing = b;
        if (b.checkInDate === todayISO) entry.arriving = b;
        if (b.checkInDate < todayISO && b.checkOutDate > todayISO) {
          entry.staying = b;
        }
      }
    }

    for (const blk of roomBlocks) {
      if (blk.startDate <= todayISO && blk.endDate > todayISO) {
        const entry = map.get(blk.roomId);
        if (entry) entry.block = blk;
      }
    }

    return map;
  }, [activeRooms, bookings, roomBlocks, todayISO]);

  const dirtyCount = activeRooms.filter(
    (r) => r.housekeepingStatus === 'dirty'
  ).length;
  const cleanCount = activeRooms.length - dirtyCount;

  const filteredRooms = useMemo(() => {
    if (filter === 'all') return activeRooms;
    return activeRooms.filter((r) => r.housekeepingStatus === filter);
  }, [activeRooms, filter]);

  const grouped = useMemo(() => {
    const xinyue = filteredRooms.filter((r) => r.building === 'xinyue');
    const youde = filteredRooms.filter((r) => r.building === 'youde');
    const list: Array<{ title: string; items: Room[] }> = [];
    if (xinyue.length > 0) {
      list.push({ title: BUILDING_LABELS.xinyue, items: xinyue });
    }
    if (youde.length > 0) {
      list.push({ title: BUILDING_LABELS.youde, items: youde });
    }
    return list;
  }, [filteredRooms]);

  const handleMarkAllClean = async () => {
    const dirtyRooms = activeRooms.filter(
      (r) => r.housekeepingStatus === 'dirty'
    );
    for (const r of dirtyRooms) {
      await onToggleHousekeeping(r.id, 'clean');
    }
  };

  return (
    <section className="preno-page" aria-label="房務清潔管理">
      <div className="preno-topbar">
        <div className="preno-topbar-left">
          <h2 className="preno-topbar-title">房務清潔</h2>
          <span className="preno-topbar-sub tabular-nums">
            共 {activeRooms.length} 間・待打掃 {dirtyCount} 間
          </span>
        </div>

        {dirtyCount > 0 && (
          <button
            id="btn-mark-all-clean"
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void handleMarkAllClean()}
          >
            <CheckCheck size={15} />
            全部標為已清潔
          </button>
        )}
      </div>

      <div className="preno-underline-tabs" role="tablist" aria-label="房務篩選">
        {(
          [
            { id: 'all', label: '全部房間', count: activeRooms.length },
            { id: 'dirty', label: '待打掃', count: dirtyCount },
            { id: 'clean', label: '已清潔', count: cleanCount },
          ] as Array<{ id: HkFilter; label: string; count: number }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={`preno-tab-btn ${filter === tab.id ? 'active' : ''}`}
            onClick={() => setFilter(tab.id)}
          >
            <span>{tab.label}</span>
            <span className="preno-tab-count tabular-nums">{tab.count}</span>
          </button>
        ))}
      </div>

      {filteredRooms.length === 0 ? (
        <div className="preno-empty">
          <Sparkles size={28} color="var(--brand-teal)" />
          <div className="preno-empty-title">所有房間皆已清潔完成</div>
        </div>
      ) : (
        <div className="preno-page-scroll">
          {grouped.map((group) => (
            <div key={group.title}>
              <div className="preno-list-section-header">{group.title}</div>
              <div className="preno-flat-list">
                {group.items.map((room) => {
                  const ctx = roomContextMap.get(room.id);
                  const isDirty = room.housekeepingStatus === 'dirty';
                  const isTurnover = Boolean(ctx?.departing && ctx?.arriving);

                  let statusText = '今日空房';
                  if (ctx?.block) {
                    statusText = `鎖房：${ctx.block.reason}`;
                  } else if (isTurnover) {
                    statusText = `退：${ctx?.departing?.guestName} → 今日入住：${ctx?.arriving?.guestName}`;
                  } else if (ctx?.departing) {
                    statusText = `今日退房：${ctx.departing.guestName}`;
                  } else if (ctx?.arriving) {
                    statusText = `今日入住：${ctx.arriving.guestName}`;
                  } else if (ctx?.staying) {
                    statusText = `在館續住：${ctx.staying.guestName}`;
                  }

                  return (
                    <div key={room.id} className="preno-flat-row preno-hk-row">
                      <div className="preno-row-left">
                        <span
                          className={`preno-status-dot ${
                            isDirty ? 'dot-amber' : 'dot-teal'
                          }`}
                        />
                        <div className="preno-row-text">
                          <div className="preno-row-title">
                            <span className="preno-room-tag">
                              {room.floorLabel}
                            </span>
                            <strong>{room.code}</strong>
                            <span className="preno-row-muted-inline">
                              {room.roomType}
                            </span>
                            {isTurnover && isDirty && (
                              <span className="preno-urgent-tag">
                                今日交接優先
                              </span>
                            )}
                          </div>
                          <div className="preno-row-sub">{statusText}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={`preno-hk-toggle-btn ${
                          isDirty ? 'is-dirty' : 'is-clean'
                        }`}
                        onClick={() =>
                          void onToggleHousekeeping(
                            room.id,
                            isDirty ? 'clean' : 'dirty'
                          )
                        }
                      >
                        {isDirty ? (
                          <>
                            <Sparkles size={15} />
                            <span>{HOUSEKEEPING_LABELS.dirty}・點此完成</span>
                          </>
                        ) : (
                          <>
                            <Check size={15} />
                            <span>{HOUSEKEEPING_LABELS.clean}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
