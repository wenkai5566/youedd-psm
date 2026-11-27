import type { ReactNode } from 'react';
import { BUILDING_LABELS } from '../constants/labels';
import type { Room } from '../types/domain';

interface FloorplanRoomMapProps {
  rooms: Room[];
  renderRoom: (room: Room) => ReactNode;
  compact?: boolean;
}

const XINYUE_FLOOR_BLUEPRINT = [
  { floor: '3F', backCodes: ['E1'], frontCodes: ['E', 'F'] },
  { floor: '2F', backCodes: ['C1', 'D1'], frontCodes: ['C', 'D'] },
  { floor: '1F', backCodes: ['A1', 'B1'], frontCodes: ['A', 'B'] },
] as const;

const YOUDE_UPPER_CODES = ['獨棟別墅', '獨棟木屋'] as const;
const YOUDE_LOWER_CODES = ['景觀四人兩房木屋', '景觀4人木屋'] as const;

/**
 * Renders guesthouse rooms in an authentic minimalist elevation layout (Option A):
 * - Xinyue Main Lodge: Modern 3-story Zen flat-roof building with central rooftop stair tower,
 *   horizontal parapet wood slats, right full-height vertical louver strip, and signature 2F left frame.
 *   Each floor clearly separates Back (後・樹林) above Front (前・山景):
 *     3F: Back [E1 full-width] / Front [E][F] (no balcony)
 *     2F: Back [C1][D1]        / Front [C (framed)][D]
 *     1F: Back [A1][B1]        / Front [A][B]
 * - Youde Garden:
 *     Upper: [獨棟別墅][獨棟木屋]
 *     Single-line divider: ─── 大觀景平台 ───
 *     Lower: [景觀四人兩房木屋]
 */
export function FloorplanRoomMap({
  rooms,
  renderRoom,
  compact = false,
}: FloorplanRoomMapProps) {
  const byCode = new Map(rooms.map((r) => [r.code, r]));
  const placedIds = new Set<string>();

  const takeRoom = (code: string): Room | undefined => {
    const found = byCode.get(code);
    if (found) {
      placedIds.add(found.id);
    }
    return found;
  };

  const xinyueRows = XINYUE_FLOOR_BLUEPRINT.map((row) => ({
    floor: row.floor,
    back: row.backCodes.map(takeRoom).filter((r): r is Room => Boolean(r)),
    front: row.frontCodes.map(takeRoom).filter((r): r is Room => Boolean(r)),
  })).filter((row) => row.back.length > 0 || row.front.length > 0);

  const youdeUpper = YOUDE_UPPER_CODES.map(takeRoom).filter((r): r is Room =>
    Boolean(r)
  );
  const youdeLower = YOUDE_LOWER_CODES.map(takeRoom).filter((r): r is Room =>
    Boolean(r)
  );

  const extraXinyue = rooms.filter(
    (r) => r.building === 'xinyue' && !placedIds.has(r.id)
  );
  const extraYoude = rooms.filter(
    (r) => r.building === 'youde' && !placedIds.has(r.id)
  );

  return (
    <div className={`arch-map-shell ${compact ? 'is-compact' : ''}`}>
      {/* ==================== XINYUE MODERN ZEN FLAT-ROOF ELEVATION ==================== */}
      {(xinyueRows.length > 0 || extraXinyue.length > 0) && (
        <div className="arch-lodge">
          {/* Authentic Flat-Roof Silhouette: Rooftop Stair Tower + Wood-Slat Parapet */}
          <div className="arch-zen-roof" aria-hidden="true">
            <div className="arch-zen-tower">
              <span className="arch-zen-title">{BUILDING_LABELS.xinyue}</span>
            </div>
            <div className="arch-zen-parapet" />
          </div>

          {/* 3-Story Structural Body with Right Vertical Wood-Slat Column */}
          <div className="arch-zen-frame">
            <div className="arch-lodge-body">
              {xinyueRows.map((row, rowIdx) => (
                <div
                  key={row.floor}
                  className={`arch-floor-slab ${
                    rowIdx === xinyueRows.length - 1 ? 'is-ground' : ''
                  }`}
                >
                  <div className="arch-floor-badge">{row.floor}</div>

                  <div className="arch-floor-depth">
                    {/* Back Row (後・樹林) — E1 spans full width on 3F */}
                    {row.back.length > 0 && (
                      <div className="arch-depth-band is-back">
                        <span className="arch-depth-tag">後・樹林</span>
                        <div
                          className={`arch-depth-rooms ${
                            row.back.length === 1 ? 'is-full' : ''
                          }`}
                        >
                          {row.back.map((room) => (
                            <div key={room.id} className="arch-room-slot">
                              {renderRoom(room)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Front Row (前・山景) — 2F Left (C) carries signature concrete frame */}
                    {row.front.length > 0 && (
                      <div className="arch-depth-band is-front">
                        <span className="arch-depth-tag">前・山景</span>
                        <div className="arch-depth-rooms">
                          {row.front.map((room) => (
                            <div
                              key={room.id}
                              className={`arch-room-slot ${
                                row.floor === '2F' && room.code === 'C'
                                  ? 'is-zen-framed'
                                  : ''
                              }`}
                            >
                              {renderRoom(room)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {extraXinyue.length > 0 && (
                <div className="arch-extra-floor">
                  <div className="arch-floor-badge">增</div>
                  <div className="arch-extra-grid">
                    {extraXinyue.map((room) => (
                      <div key={room.id} className="arch-room-slot">
                        {renderRoom(room)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Signature Full-Height Right Vertical Wood-Slat Louver Strip */}
            <div className="arch-zen-right-slats" aria-hidden="true" />
          </div>

          <div className="arch-lodge-foundation" aria-hidden="true" />
        </div>
      )}

      {/* ==================== YOUDE GARDEN: UPPER CABINS / SINGLE-LINE DECK / LOWER CABIN ==================== */}
      {(youdeUpper.length > 0 ||
        youdeLower.length > 0 ||
        extraYoude.length > 0) && (
        <div className="arch-youde-zone">
          <div className="arch-youde-header">
            <span>{BUILDING_LABELS.youde}</span>
            <span className="arch-youde-sub">上層獨棟・下層觀景木屋</span>
          </div>

          <div className="arch-youde-rows">
            {youdeUpper.length > 0 && (
              <div className="arch-youde-row">
                {youdeUpper.map((room) => (
                  <div key={room.id} className="arch-cabin-unit">
                    <svg
                      viewBox="0 0 240 18"
                      preserveAspectRatio="none"
                      className="arch-cabin-roof-svg"
                      aria-hidden="true"
                    >
                      <polygon
                        points="4,17 120,2 236,17"
                        className={
                          room.code === '獨棟別墅'
                            ? 'arch-cabin-roof-villa'
                            : 'arch-cabin-roof-fill'
                        }
                      />
                      <polyline
                        points="2,17 120,2 238,17"
                        className={
                          room.code === '獨棟別墅'
                            ? 'arch-cabin-roof-stroke-villa'
                            : 'arch-cabin-roof-stroke'
                        }
                      />
                    </svg>
                    <div className="arch-cabin-body">{renderRoom(room)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Single Minimalist Line for 大觀景平台 */}
            {youdeLower.length > 0 && (
              <div className="arch-deck-line" aria-hidden="true">
                <span>大觀景平台</span>
              </div>
            )}

            {/* Lower Terrace: 景觀四人兩房木屋 right below viewing deck line */}
            {youdeLower.length > 0 && (
              <div className="arch-youde-lower">
                {youdeLower.map((room) => (
                  <div key={room.id} className="arch-room-slot">
                    {renderRoom(room)}
                  </div>
                ))}
              </div>
            )}

            {extraYoude.length > 0 && (
              <div className="arch-youde-row">
                {extraYoude.map((room) => (
                  <div key={room.id} className="arch-cabin-unit">
                    <div className="arch-cabin-body">{renderRoom(room)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
