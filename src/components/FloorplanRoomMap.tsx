import type { ReactNode } from 'react';
import { BUILDING_LABELS } from '../constants/labels';
import type { Room } from '../types/domain';

interface FloorplanRoomMapProps {
  rooms: Room[];
  renderRoom: (room: Room) => ReactNode;
  compact?: boolean;
}

const XINYUE_FLOOR_BLUEPRINT = [
  { floor: '3F', leftCodes: ['E', 'E1'], rightCodes: ['F'] },
  { floor: '2F', leftCodes: ['C', 'C1'], rightCodes: ['D', 'D1'] },
  { floor: '1F', leftCodes: ['A', 'A1'], rightCodes: ['B', 'B1'] },
] as const;

const YOUDE_ROW_BLUEPRINT = [
  ['獨棟別墅', '獨棟木屋'],
  ['景觀四人兩房木屋'],
] as const;

/**
 * Renders guesthouse rooms in an architectural elevation layout (Option A):
 * - Xinyue Main Lodge: 3-story pitched-roof elevation with distinct floor slabs & central stairwell
 *     3F: [E][E1] | 樓梯 | [F][露台]
 *     2F: [C][C1] | 樓梯 | [D][D1]
 *     1F: [A][A1] | 樓梯 | [B][B1]
 * - Youde Garden: Standalone gable-roof wooden cabin silhouettes
 *     Row 1: 獨棟別墅, 獨棟木屋
 *     Row 2: 景觀四人兩房木屋
 * Keeps true spatial geometry across desktop, tablet, and mobile without horizontal distortion.
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
    left: row.leftCodes.map(takeRoom).filter((r): r is Room => Boolean(r)),
    right: row.rightCodes.map(takeRoom).filter((r): r is Room => Boolean(r)),
  })).filter((row) => row.left.length > 0 || row.right.length > 0);

  const youdeRows = YOUDE_ROW_BLUEPRINT.map((codes) =>
    codes.map(takeRoom).filter((r): r is Room => Boolean(r))
  ).filter((row) => row.length > 0);

  const extraXinyue = rooms.filter(
    (r) => r.building === 'xinyue' && !placedIds.has(r.id)
  );
  const extraYoude = rooms.filter(
    (r) => r.building === 'youde' && !placedIds.has(r.id)
  );

  return (
    <div className={`arch-map-shell ${compact ? 'is-compact' : ''}`}>
      {/* ==================== XINYUE 3-STORY MAIN LODGE ELEVATION ==================== */}
      {(xinyueRows.length > 0 || extraXinyue.length > 0) && (
        <div className="arch-lodge">
          {/* Minimalist Architectural Pitched Roof Silhouette */}
          <div className="arch-lodge-roof" aria-hidden="true">
            <svg
              viewBox="0 0 800 44"
              preserveAspectRatio="none"
              className="arch-roof-svg"
            >
              <polygon
                points="4,43 400,4 796,43"
                className="arch-roof-fill"
              />
              <polyline
                points="2,43 400,4 798,43"
                className="arch-roof-stroke"
              />
            </svg>
            <span className="arch-roof-title">{BUILDING_LABELS.xinyue}</span>
          </div>

          {/* 3-Story Structural Body */}
          <div className="arch-lodge-body">
            {xinyueRows.map((row, rowIdx) => (
              <div
                key={row.floor}
                className={`arch-floor-slab ${
                  rowIdx === xinyueRows.length - 1 ? 'is-ground' : ''
                }`}
              >
                <div className="arch-floor-badge">{row.floor}</div>

                <div className="arch-floor-wings">
                  {/* Left Wing (4-person room slightly wider than 2-person connecting room) */}
                  <div className="arch-wing">
                    {row.left.map((room) => (
                      <div key={room.id} className="arch-room-slot">
                        {renderRoom(room)}
                      </div>
                    ))}
                  </div>

                  {/* Central Stairwell Shaft */}
                  <div className="arch-stairwell" aria-label="樓梯間">
                    <div className="arch-stair-steps" aria-hidden="true" />
                    <span className="arch-stair-label">樓梯</span>
                  </div>

                  {/* Right Wing (keep 2-slot proportion; 3F right slot shows subtle balcony placeholder) */}
                  <div className="arch-wing">
                    {row.right.map((room) => (
                      <div key={room.id} className="arch-room-slot">
                        {renderRoom(room)}
                      </div>
                    ))}
                    {row.right.length === 1 && (
                      <div className="arch-balcony-slot" aria-hidden="true">
                        <span>景觀露台</span>
                      </div>
                    )}
                  </div>
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

          <div className="arch-lodge-foundation" aria-hidden="true" />
        </div>
      )}

      {/* ==================== YOUDE GARDEN STANDALONE WOODEN CABINS ==================== */}
      {(youdeRows.length > 0 || extraYoude.length > 0) && (
        <div className="arch-youde-zone">
          <div className="arch-youde-header">
            <span>{BUILDING_LABELS.youde}</span>
            <span className="arch-youde-sub">獨棟庭園木屋</span>
          </div>

          <div className="arch-youde-rows">
            {youdeRows.map((row, idx) => (
              <div key={idx} className="arch-youde-row">
                {row.map((room) => (
                  <div key={room.id} className="arch-cabin-unit">
                    <svg
                      viewBox="0 0 240 20"
                      preserveAspectRatio="none"
                      className="arch-cabin-roof-svg"
                      aria-hidden="true"
                    >
                      <polygon
                        points="4,19 120,2 236,19"
                        className="arch-cabin-roof-fill"
                      />
                      <polyline
                        points="2,19 120,2 238,19"
                        className="arch-cabin-roof-stroke"
                      />
                    </svg>
                    <div className="arch-cabin-body">{renderRoom(room)}</div>
                  </div>
                ))}
                {row.length === 1 && (
                  <div className="arch-cabin-spacer" aria-hidden="true" />
                )}
              </div>
            ))}

            {extraYoude.length > 0 && (
              <div className="arch-youde-row">
                {extraYoude.map((room) => (
                  <div key={room.id} className="arch-cabin-unit">
                    <svg
                      viewBox="0 0 240 20"
                      preserveAspectRatio="none"
                      className="arch-cabin-roof-svg"
                      aria-hidden="true"
                    >
                      <polygon
                        points="4,19 120,2 236,19"
                        className="arch-cabin-roof-fill"
                      />
                      <polyline
                        points="2,19 120,2 238,19"
                        className="arch-cabin-roof-stroke"
                      />
                    </svg>
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
