import { useState, type ReactNode } from 'react';
import { BOOKING_STATUS_LABELS, HOUSEKEEPING_LABELS } from '../constants/labels';
import { getBalanceDue, getDepositTrackingState } from '../domain/bookingLogic';
import type {
  Booking,
  HousekeepingStatus,
  Room,
  RoomBlock,
} from '../types/domain';

interface Campus3DFloorplanProps {
  rooms: Room[];
  stayMap: Map<string, Booking>;
  departMap: Map<string, Booking>;
  blockMap: Map<string, RoomBlock>;
  todayISO: string;
  resolveBarColorClass: (booking: Booking) => string;
  onSelectVacant: (room: Room) => void;
  onInspectBooking: (booking: Booking) => void;
  onInspectRoomBlock: (block: RoomBlock) => void;
  onToggleHousekeeping: (
    roomId: string,
    status: HousekeepingStatus
  ) => Promise<void> | void;
  renderExtraRoom?: (room: Room) => ReactNode;
}

interface PaletteStyle {
  fill: string;
  edge: string;
  text: string;
  isFilled: boolean;
}

const BAR_PALETTE: Record<string, PaletteStyle> = {
  'bar-green': { fill: '#2ECC71', edge: '#21A458', text: '#FFFFFF', isFilled: true },
  'bar-blue': { fill: '#3898EC', edge: '#2478C2', text: '#FFFFFF', isFilled: true },
  'bar-amber': { fill: '#F39C12', edge: '#CF8108', text: '#FFFFFF', isFilled: true },
  'bar-red': { fill: '#E74C3C', edge: '#C0392B', text: '#FFFFFF', isFilled: true },
  'bar-teal': { fill: '#00B8A9', edge: '#008F83', text: '#FFFFFF', isFilled: true },
  'bar-gray': { fill: '#CBD5E1', edge: '#94A3B8', text: '#334155', isFilled: true },
  'bar-muted': { fill: '#E2E8F0', edge: '#94A3B8', text: '#475569', isFilled: true },
  'bar-group-0': { fill: '#00B8A9', edge: '#008F83', text: '#FFFFFF', isFilled: true },
  'bar-group-1': { fill: '#3898EC', edge: '#2478C2', text: '#FFFFFF', isFilled: true },
  'bar-group-2': { fill: '#8B5CF6', edge: '#7044D4', text: '#FFFFFF', isFilled: true },
  'bar-group-3': { fill: '#EC4899', edge: '#C7337C', text: '#FFFFFF', isFilled: true },
};

const VACANT_STYLE: PaletteStyle = {
  fill: '#FFFFFF',
  edge: '#64748B',
  text: '#25313E',
  isFilled: false,
};

const BLOCKED_STYLE: PaletteStyle = {
  fill: 'url(#campus3d-hatch)',
  edge: '#64748B',
  text: '#334155',
  isFilled: false,
};

/* Architectural White-Model (Maquette) Tokens with subtle warm wood-slat accent */
const MAQUETTE = {
  ink: '#25313E',
  inkSoft: '#64748B',
  inkFaint: '#CBD5E1',
  guide: '#94A3B8',
  wallFront: '#F1F5F9',
  wallSide: '#E2E8F0',
  roofTop: '#FFFFFF',
  roofSlope: '#EEF2F6',
  villaRoof: '#E2EBF4',
  villaRoofStroke: '#3B6EA5',
  slatColor: '#9C7A5B',
  frameAccent: '#334155',
  shadow: 'rgba(15, 23, 42, 0.08)',
};

const SCALE = 40;
const OX = 258;
const OY = 346;

type Pt = readonly [number, number];

/** Asymmetric 3D axonometric projection: +x right, +y toward mountain view, +z up */
function iso(x: number, y: number, z = 0): Pt {
  const sx = OX + (x * 0.96 - y * 0.48) * SCALE;
  const sy = OY + (x * 0.14 + y * 0.34 - z * 0.92) * SCALE;
  return [Number(sx.toFixed(1)), Number(sy.toFixed(1))];
}

function pts(points: Pt[]): string {
  return points.map((p) => `${p[0]},${p[1]}`).join(' ');
}

function shortText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

const STANDARD_CODES = new Set([
  'E1',
  'E',
  'F',
  'C1',
  'D1',
  'C',
  'D',
  'A1',
  'B1',
  'A',
  'B',
  '獨棟別墅',
  '獨棟木屋',
  '景觀四人兩房木屋',
]);

/**
 * Interactive 3D Architectural White-Model (Maquette) Campus Site Map for Desktop/Tablet:
 * - Upper terrace (left -> right): 獨棟別墅 -> 獨棟木屋 -> 侑德心悅（本館 3F/2F/1F exploded cutaway）
 * - Single minimalist architectural line separating 大觀景平台 from lower terrace
 * - Lower terrace directly beneath 大觀景平台: 景觀四人兩房木屋
 * - Authentic modern Zen flat-roof main lodge with rooftop stairwell tower, parapet wood slats,
 *   2F front-left protruding frame, right vertical louver grille, and E1 spanning the full back of 3F.
 */
export function Campus3DFloorplan({
  rooms,
  stayMap,
  departMap,
  blockMap,
  todayISO,
  resolveBarColorClass,
  onSelectVacant,
  onInspectBooking,
  onInspectRoomBlock,
  onToggleHousekeeping,
  renderExtraRoom,
}: Campus3DFloorplanProps) {
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);

  const byCode = new Map(rooms.map((room) => [room.code, room]));
  const extraRooms = rooms.filter((room) => !STANDARD_CODES.has(room.code));

  const getRoomVisual = (room: Room) => {
    const staying = stayMap.get(room.id);
    const departing = departMap.get(room.id);
    const activeBlock = blockMap.get(room.id);
    const isDirty = room.housekeepingStatus === 'dirty';

    if (!staying && activeBlock) {
      return {
        style: BLOCKED_STYLE,
        subtitle: shortText(activeBlock.reason, 5),
        kind: 'blocked' as const,
        staying: undefined,
        departing,
        activeBlock,
        isDirty,
      };
    }

    if (staying) {
      const barCls = resolveBarColorClass(staying);
      return {
        style: BAR_PALETTE[barCls] ?? BAR_PALETTE['bar-blue'],
        subtitle: shortText(staying.guestName, 5),
        kind: 'occupied' as const,
        staying,
        departing,
        activeBlock: undefined,
        isDirty,
      };
    }

    return {
      style: VACANT_STYLE,
      subtitle: departing ? `退:${shortText(departing.guestName, 3)}` : '空房',
      kind: 'vacant' as const,
      staying: undefined,
      departing,
      activeBlock: undefined,
      isDirty,
    };
  };

  const handleRoomClick = (room: Room) => {
    const staying = stayMap.get(room.id);
    const activeBlock = blockMap.get(room.id);
    if (staying) {
      onInspectBooking(staying);
    } else if (activeBlock) {
      onInspectRoomBlock(activeBlock);
    } else {
      onSelectVacant(room);
    }
  };

  const renderIsoBox = (
    key: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    colors: { top: string; front: string; side: string },
    stroke: string,
    sw = 1.05
  ) => {
    const tFL = iso(x0, y1, z1);
    const tFR = iso(x1, y1, z1);
    const tBR = iso(x1, y0, z1);
    const tBL = iso(x0, y0, z1);
    const bFL = iso(x0, y1, z0);
    const bFR = iso(x1, y1, z0);
    const bBR = iso(x1, y0, z0);
    return (
      <g key={key}>
        <polygon
          points={pts([tFL, tFR, bFR, bFL])}
          fill={colors.front}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([tFR, tBR, bBR, bFR])}
          fill={colors.side}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([tBL, tBR, tFR, tFL])}
          fill={colors.top}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </g>
    );
  };

  const renderRoomPlate = (
    code: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z: number,
    h: number,
    fontSize = 11.5
  ) => {
    const room = byCode.get(code);
    if (!room) return null;

    const vis = getRoomVisual(room);
    const { fill, edge, text, isFilled } = vis.style;
    const tFL = iso(x0, y1, z + h);
    const tFR = iso(x1, y1, z + h);
    const tBR = iso(x1, y0, z + h);
    const tBL = iso(x0, y0, z + h);
    const bFL = iso(x0, y1, z);
    const bFR = iso(x1, y1, z);
    const bBR = iso(x1, y0, z);
    const center = iso((x0 + x1) / 2, (y0 + y1) / 2, z + h);
    const dirtyDot = iso(x1 - 0.28, y0 + 0.28, z + h);
    const isHovered = hoveredRoomId === room.id;

    return (
      <g
        key={room.id}
        className={`campus3d-room ${isHovered ? 'is-hovered' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${room.name} ${vis.subtitle}`}
        onClick={() => handleRoomClick(room)}
        onMouseEnter={() => setHoveredRoomId(room.id)}
        onMouseLeave={() => setHoveredRoomId((prev) => (prev === room.id ? null : prev))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRoomClick(room);
          }
        }}
      >
        <polygon
          points={pts([tFL, tFR, bFR, bFL])}
          fill={isFilled ? edge : MAQUETTE.wallFront}
          fillOpacity={isFilled ? 0.85 : 1}
          stroke={edge}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([tFR, tBR, bBR, bFR])}
          fill={isFilled ? edge : MAQUETTE.wallSide}
          fillOpacity={isFilled ? 0.7 : 1}
          stroke={edge}
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <polygon
          className="campus3d-outline"
          points={pts([tBL, tBR, tFR, tFL])}
          fill={fill}
          stroke={isHovered ? '#00B8A9' : edge}
          strokeWidth={isHovered ? 2.1 : vis.kind === 'vacant' ? 1.35 : 1.25}
          strokeLinejoin="round"
        />
        {vis.isDirty && (
          <circle
            cx={dirtyDot[0]}
            cy={dirtyDot[1]}
            r={3.8}
            fill="#F59E0B"
            stroke="#FFFFFF"
            strokeWidth={1.3}
          />
        )}
        <text
          x={center[0]}
          y={center[1] - 3}
          textAnchor="middle"
          fill={text}
          fontSize={fontSize}
          fontWeight={700}
        >
          {room.code}
        </text>
        <text
          x={center[0]}
          y={center[1] + 10.5}
          textAnchor="middle"
          fill={text}
          fontSize={fontSize - 1.3}
          fontWeight={600}
          opacity={vis.kind === 'vacant' ? 0.72 : 0.96}
        >
          {vis.subtitle}
        </text>
      </g>
    );
  };

  const renderPitchedCabin = (
    code: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    zBase: number,
    wallH: number,
    ridgeH: number,
    isVilla: boolean
  ) => {
    const room = byCode.get(code);
    if (!room) return null;

    const vis = getRoomVisual(room);
    const { fill, edge, text } = vis.style;
    const sw = 1.15;

    const sh = [
      iso(x0 + 0.12, y0 + 0.14, zBase),
      iso(x1 + 0.18, y0 + 0.14, zBase),
      iso(x1 + 0.18, y1 + 0.16, zBase),
      iso(x0 + 0.12, y1 + 0.16, zBase),
    ];

    const tFL = iso(x0, y1, zBase + wallH);
    const tFR = iso(x1, y1, zBase + wallH);
    const tBR = iso(x1, y0, zBase + wallH);
    const bFL = iso(x0, y1, zBase);
    const bFR = iso(x1, y1, zBase);
    const bBR = iso(x1, y0, zBase);

    const ym = (y0 + y1) / 2;
    const ov = 0.18;
    const rL = iso(x0 - ov, ym, zBase + wallH + ridgeH);
    const rR = iso(x1 + ov, ym, zBase + wallH + ridgeH);
    const eFL = iso(x0 - ov, y1 + ov, zBase + wallH - 0.04);
    const eFR = iso(x1 + ov, y1 + ov, zBase + wallH - 0.04);
    const eBL = iso(x0 - ov, y0 - ov, zBase + wallH - 0.04);
    const eBR = iso(x1 + ov, y0 - ov, zBase + wallH - 0.04);
    const gablePeak = iso(x1, ym, zBase + wallH + ridgeH * 0.94);

    const labelPos = iso((x0 + x1) / 2, y1, zBase + wallH * 0.56);
    const dirtyDot = iso(x1 - 0.25, y1, zBase + wallH - 0.22);
    const roofColor = isVilla ? MAQUETTE.villaRoof : MAQUETTE.roofSlope;
    const roofStroke = isVilla ? MAQUETTE.villaRoofStroke : MAQUETTE.ink;
    const isHovered = hoveredRoomId === room.id;

    return (
      <g
        key={room.id}
        className={`campus3d-room ${isHovered ? 'is-hovered' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${room.name} ${vis.subtitle}`}
        onClick={() => handleRoomClick(room)}
        onMouseEnter={() => setHoveredRoomId(room.id)}
        onMouseLeave={() => setHoveredRoomId((prev) => (prev === room.id ? null : prev))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRoomClick(room);
          }
        }}
      >
        <polygon points={pts(sh)} fill={MAQUETTE.shadow} />
        <polygon
          className="campus3d-outline"
          points={pts([tFL, tFR, bFR, bFL])}
          fill={fill}
          stroke={isHovered ? '#00B8A9' : edge}
          strokeWidth={isHovered ? 2.1 : sw}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([tFR, tBR, bBR, bFR])}
          fill={MAQUETTE.wallSide}
          stroke={MAQUETTE.ink}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([tFR, gablePeak, tBR])}
          fill={MAQUETTE.wallSide}
          stroke={MAQUETTE.ink}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([eBL, eBR, rR, rL])}
          fill={MAQUETTE.roofTop}
          stroke={roofStroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([rL, rR, eFR, eFL])}
          fill={roofColor}
          stroke={roofStroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        {isVilla ? (
          [1, 2, 3, 4, 5].map((k) => {
            const rx = x0 + ((x1 - x0) * k) / 6;
            const p1 = iso(rx, ym, zBase + wallH + ridgeH);
            const p2 = iso(rx, y1 + ov, zBase + wallH - 0.04);
            return (
              <line
                key={k}
                x1={p1[0]}
                y1={p1[1]}
                x2={p2[0]}
                y2={p2[1]}
                stroke={roofStroke}
                strokeWidth={0.6}
                opacity={0.34}
              />
            );
          })
        ) : (
          <line
            x1={iso(x0 + 0.15, y1 + 0.02, zBase + wallH * 0.34)[0]}
            y1={iso(x0 + 0.15, y1 + 0.02, zBase + wallH * 0.34)[1]}
            x2={iso(x1 - 0.15, y1 + 0.02, zBase + wallH * 0.34)[0]}
            y2={iso(x1 - 0.15, y1 + 0.02, zBase + wallH * 0.34)[1]}
            stroke={MAQUETTE.slatColor}
            strokeWidth={0.8}
            opacity={0.45}
          />
        )}
        {vis.isDirty && (
          <circle
            cx={dirtyDot[0]}
            cy={dirtyDot[1]}
            r={3.8}
            fill="#F59E0B"
            stroke="#FFFFFF"
            strokeWidth={1.3}
          />
        )}
        <text
          x={labelPos[0]}
          y={labelPos[1] - 3}
          textAnchor="middle"
          fill={text}
          fontSize={11.5}
          fontWeight={700}
        >
          {room.code}
        </text>
        <text
          x={labelPos[0]}
          y={labelPos[1] + 10.5}
          textAnchor="middle"
          fill={text}
          fontSize={10.5}
          fontWeight={600}
          opacity={vis.kind === 'vacant' ? 0.72 : 0.96}
        >
          {vis.subtitle}
        </text>
      </g>
    );
  };

  /* Coordinates for viewing deck line, lower cabin, and 3-story exploded lodge */
  const deckLeft = iso(-0.4, 3.35, 1.9);
  const deckRight = iso(6.85, 3.35, 1.9);
  const deckDropL = iso(-0.4, 3.35, 0.0);
  const deckDropR = iso(6.85, 3.35, 0.0);
  const deckBackL = iso(-0.4, 2.75, 1.9);
  const deckLabel = iso(3.15, 3.22, 1.9);

  const c2x0 = 0.7;
  const c2x1 = 5.4;
  const c2y0 = 3.55;
  const c2y1 = 5.35;
  const c2z = 0.0;
  const c2h = 1.05;
  const subLowerLabel = iso((c2x0 + c2x1) / 2, c2y1 + 0.55, 0);
  const upperTag = iso(3.2, 0.2, 4.3);

  const lx0 = 8.1;
  const lx1 = 14.3;
  const ly0 = -0.35;
  const ly1 = 3.25;
  const lxMidL = 11.05;
  const lxMidR = 11.35;
  const lyMidB = 1.32;
  const lyMidF = 1.58;
  const z1 = 1.9;
  const z2 = 4.35;
  const z3 = 6.8;
  const zRoof = 9.05;
  const slabH = 0.24;

  const corners: [number, number][] = [
    [lx0, ly0],
    [lx1, ly0],
    [lx1, ly1],
    [lx0, ly1],
  ];

  const renderFloorTray = (z: number, label: string) => {
    const pad = 0.12;
    const fTag = iso(lx1 + 0.62, (ly0 + ly1) / 2, z + 0.1);
    return (
      <g key={`tray-${label}`}>
        {renderIsoBox(
          `tray-box-${label}`,
          lx0 - pad,
          ly0 - pad,
          lx1 + pad,
          ly1 + pad,
          z - 0.14,
          z,
          { top: '#FFFFFF', front: MAQUETTE.wallFront, side: MAQUETTE.wallSide },
          MAQUETTE.inkSoft,
          0.9
        )}
        <text
          x={fTag[0]}
          y={fTag[1]}
          textAnchor="start"
          fill={MAQUETTE.ink}
          fontSize={11.5}
          fontWeight={700}
        >
          {label}
        </text>
      </g>
    );
  };

  /* 2F signature front-left protruding concrete frame */
  const f2BL = iso(lx0 - 0.12, ly1 + 0.14, z2 - 0.14);
  const f2BR = iso(lxMidL + 0.05, ly1 + 0.14, z2 - 0.14);
  const f2TR = iso(lxMidL + 0.05, ly1 + 0.14, z2 + 0.78);
  const f2TL = iso(lx0 - 0.12, ly1 + 0.14, z2 + 0.78);

  const backLbl = iso(lx0 - 0.35, (ly0 + lyMidB) / 2, z3 + 0.2);
  const frontLbl = iso(lx0 - 0.35, (lyMidF + ly1) / 2, z3 + 0.2);
  const lodgeTitle = iso((lx0 + lx1) / 2, ly1 + 0.65, z1 - 0.25);

  const hoveredRoom = hoveredRoomId
    ? rooms.find((r) => r.id === hoveredRoomId) ?? null
    : null;
  const hoveredStay = hoveredRoom ? stayMap.get(hoveredRoom.id) : undefined;
  const hoveredBlock = hoveredRoom ? blockMap.get(hoveredRoom.id) : undefined;
  const hoveredDepart = hoveredRoom ? departMap.get(hoveredRoom.id) : undefined;

  return (
    <div className="campus3d-shell">
      {/* Compact Live Readout Strip */}
      <div className="campus3d-readout">
        {hoveredRoom ? (
          <>
            <div className="campus3d-readout-main">
              <strong>{hoveredRoom.name}</strong>
              {hoveredStay ? (
                <span>
                  {hoveredStay.guestName}・
                  {getDepositTrackingState(hoveredStay, todayISO) ===
                  'deposit_overdue'
                    ? '逾期未匯'
                    : BOOKING_STATUS_LABELS[hoveredStay.status]}
                  ・
                  {getBalanceDue(hoveredStay) > 0
                    ? `尾款 $${getBalanceDue(hoveredStay).toLocaleString()}`
                    : '已付清'}
                </span>
              ) : hoveredBlock ? (
                <span>維護鎖房：{hoveredBlock.reason}</span>
              ) : (
                <span>
                  空房（${hoveredRoom.standardRate.toLocaleString()} / 晚）
                  {hoveredDepart ? `・上午退房：${hoveredDepart.guestName}` : ''}
                </span>
              )}
            </div>
            <div className="campus3d-readout-actions">
              <span
                className={`campus3d-hk-pill ${
                  hoveredRoom.housekeepingStatus === 'dirty'
                    ? 'is-dirty'
                    : 'is-clean'
                }`}
              >
                {HOUSEKEEPING_LABELS[hoveredRoom.housekeepingStatus]}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  void onToggleHousekeeping(
                    hoveredRoom.id,
                    hoveredRoom.housekeepingStatus === 'dirty'
                      ? 'clean'
                      : 'dirty'
                  )
                }
              >
                切換房務
              </button>
            </div>
          </>
        ) : (
          <div className="campus3d-readout-hint">
            <span>點擊空房可立即新增訂房，點擊已訂房可檢視明細（橘點表示待清掃）</span>
          </div>
        )}
      </div>

      {/* True 3D Axonometric Architectural White Maquette SVG */}
      <div className="campus3d-stage">
        <svg
          viewBox="0 0 960 494"
          className="campus3d-svg"
          role="img"
          aria-label="侑德心悅・侑德園 3D 建築園區平面圖"
        >
          <defs>
            <pattern
              id="campus3d-hatch"
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill="#F1F5F9" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke="#94A3B8"
                strokeWidth="1.5"
              />
            </pattern>
          </defs>

          {/* 1. Single-Line Architectural Viewing Deck Edge */}
          <line
            x1={deckDropL[0]}
            y1={deckDropL[1]}
            x2={deckDropR[0]}
            y2={deckDropR[1]}
            stroke={MAQUETTE.inkFaint}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <line
            x1={deckLeft[0]}
            y1={deckLeft[1]}
            x2={deckDropL[0]}
            y2={deckDropL[1]}
            stroke={MAQUETTE.inkFaint}
            strokeWidth={0.9}
          />
          <line
            x1={deckRight[0]}
            y1={deckRight[1]}
            x2={deckDropR[0]}
            y2={deckDropR[1]}
            stroke={MAQUETTE.inkFaint}
            strokeWidth={0.9}
          />
          <line
            x1={deckBackL[0]}
            y1={deckBackL[1]}
            x2={deckLeft[0]}
            y2={deckLeft[1]}
            stroke={MAQUETTE.inkFaint}
            strokeWidth={0.9}
          />
          <line
            x1={deckLeft[0]}
            y1={deckLeft[1]}
            x2={deckRight[0]}
            y2={deckRight[1]}
            stroke={MAQUETTE.ink}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <text
            x={deckLabel[0]}
            y={deckLabel[1] - 5}
            textAnchor="middle"
            fill={MAQUETTE.inkSoft}
            fontSize={10}
            fontWeight={600}
            letterSpacing="1.5"
          >
            ── 大觀景平台 ──
          </text>

          {/* 2. Lower Terrace: 景觀四人兩房木屋 directly beneath viewing deck */}
          <polygon
            points={pts([
              iso(c2x0 + 0.14, c2y0 + 0.14, 0),
              iso(c2x1 + 0.16, c2y0 + 0.14, 0),
              iso(c2x1 + 0.16, c2y1 + 0.16, 0),
              iso(c2x0 + 0.14, c2y1 + 0.16, 0),
            ])}
            fill={MAQUETTE.shadow}
          />
          {renderRoomPlate('景觀四人兩房木屋', c2x0, c2y0, c2x1, c2y1, c2z, c2h, 11.5)}
          <line
            x1={iso(c2x0, c2y1, c2z + c2h + 0.06)[0]}
            y1={iso(c2x0, c2y1, c2z + c2h + 0.06)[1]}
            x2={iso(c2x1, c2y1, c2z + c2h + 0.06)[0]}
            y2={iso(c2x1, c2y1, c2z + c2h + 0.06)[1]}
            stroke={MAQUETTE.ink}
            strokeWidth={1}
            opacity={0.45}
          />
          <text
            x={subLowerLabel[0]}
            y={subLowerLabel[1]}
            textAnchor="middle"
            fill={MAQUETTE.inkSoft}
            fontSize={9.5}
          >
            下層・觀景台正下方
          </text>

          {/* 3. Upper-Left Terrace: 獨棟別墅 & 獨棟木屋 */}
          {renderPitchedCabin('獨棟別墅', 0.1, 0.35, 3.05, 2.55, 1.9, 1.15, 0.72, true)}
          {renderPitchedCabin('獨棟木屋', 3.65, 0.55, 6.25, 2.55, 1.9, 1.05, 0.78, false)}
          <text
            x={upperTag[0]}
            y={upperTag[1]}
            textAnchor="middle"
            fill={MAQUETTE.inkSoft}
            fontSize={10.5}
            fontWeight={600}
          >
            侑德園（上層獨棟區）
          </text>

          {/* 4. Upper-Right Hero: 侑德心悅（本館）3F/2F/1F Exploded White Maquette */}
          <polygon
            points={pts([
              iso(lx0 + 0.15, ly0 + 0.15, z1),
              iso(lx1 + 0.22, ly0 + 0.15, z1),
              iso(lx1 + 0.22, ly1 + 0.2, z1),
              iso(lx0 + 0.15, ly1 + 0.2, z1),
            ])}
            fill={MAQUETTE.shadow}
          />

          {/* Vertical Dashed Axonometric Alignment Guides */}
          {corners.map(([cx, cy], idx) => {
            const pBot = iso(cx, cy, z1);
            const pTop = iso(cx, cy, zRoof);
            return (
              <line
                key={idx}
                x1={pBot[0]}
                y1={pBot[1]}
                x2={pTop[0]}
                y2={pTop[1]}
                stroke={MAQUETTE.guide}
                strokeWidth={0.85}
                strokeDasharray="2.5 3"
                opacity={0.65}
              />
            );
          })}

          {/* 1F */}
          {renderFloorTray(z1, '1F')}
          {renderRoomPlate('A1', lx0, ly0, lxMidL, lyMidB, z1, slabH, 11)}
          {renderRoomPlate('B1', lxMidR, ly0, lx1, lyMidB, z1, slabH, 11)}
          {renderRoomPlate('A', lx0, lyMidF, lxMidL, ly1, z1, slabH, 11.5)}
          {renderRoomPlate('B', lxMidR, lyMidF, lx1, ly1, z1, slabH, 11.5)}

          {/* 2F + Signature Front-Left Protruding Frame */}
          {renderFloorTray(z2, '2F')}
          {renderRoomPlate('C1', lx0, ly0, lxMidL, lyMidB, z2, slabH, 11)}
          {renderRoomPlate('D1', lxMidR, ly0, lx1, lyMidB, z2, slabH, 11)}
          {renderRoomPlate('C', lx0, lyMidF, lxMidL, ly1, z2, slabH, 11.5)}
          {renderRoomPlate('D', lxMidR, lyMidF, lx1, ly1, z2, slabH, 11.5)}
          <polyline
            points={pts([f2TL, f2TR, f2BR, f2BL, f2TL])}
            fill="none"
            stroke={MAQUETTE.frameAccent}
            strokeWidth={2}
            strokeLinejoin="round"
            opacity={0.82}
          />

          {/* 3F: E1 spans full back width; E & F in front (no balcony) */}
          {renderFloorTray(z3, '3F')}
          {renderRoomPlate('E1', lx0, ly0, lx1, lyMidB, z3, slabH, 11.5)}
          {renderRoomPlate('E', lx0, lyMidF, lxMidL, ly1, z3, slabH, 11.5)}
          {renderRoomPlate('F', lxMidR, lyMidF, lx1, ly1, z3, slabH, 11.5)}

          {/* Authentic Flat Roof + Parapet Wood Slats + Central Stairwell Tower */}
          {renderIsoBox(
            'roof-slab',
            lx0 - 0.12,
            ly0 - 0.12,
            lx1 + 0.12,
            ly1 + 0.12,
            zRoof,
            zRoof + 0.22,
            { top: MAQUETTE.roofTop, front: MAQUETTE.wallFront, side: MAQUETTE.wallSide },
            MAQUETTE.ink,
            1.15
          )}
          {Array.from({ length: 19 }).map((_, idx) => {
            const sx = lx0 + ((lx1 - lx0) * idx) / 18;
            const p1 = iso(sx, ly1 + 0.12, zRoof + 0.22);
            const p2 = iso(sx, ly1 + 0.12, zRoof + 0.48);
            return (
              <line
                key={`pslat-${idx}`}
                x1={p1[0]}
                y1={p1[1]}
                x2={p2[0]}
                y2={p2[1]}
                stroke={MAQUETTE.slatColor}
                strokeWidth={1.05}
                opacity={0.78}
              />
            );
          })}
          <line
            x1={iso(lx0, ly1 + 0.12, zRoof + 0.48)[0]}
            y1={iso(lx0, ly1 + 0.12, zRoof + 0.48)[1]}
            x2={iso(lx1, ly1 + 0.12, zRoof + 0.48)[0]}
            y2={iso(lx1, ly1 + 0.12, zRoof + 0.48)[1]}
            stroke={MAQUETTE.ink}
            strokeWidth={1.1}
          />
          {renderIsoBox(
            'roof-tower',
            lxMidL - 0.65,
            ly0 + 0.65,
            lxMidR + 0.65,
            ly1 - 0.85,
            zRoof + 0.22,
            zRoof + 1.15,
            { top: MAQUETTE.roofTop, front: MAQUETTE.wallFront, side: MAQUETTE.wallSide },
            MAQUETTE.ink,
            1.15
          )}

          {/* Full-Height Right Vertical Wood-Slat Louver Grille */}
          {[0, 1, 2, 3].map((s) => {
            const sy = ly1 - 0.1 - s * 0.22;
            const p1 = iso(lx1 + 0.16, sy, z1 - 0.14);
            const p2 = iso(lx1 + 0.16, sy, zRoof + 0.22);
            return (
              <line
                key={`vslat-${s}`}
                x1={p1[0]}
                y1={p1[1]}
                x2={p2[0]}
                y2={p2[1]}
                stroke={MAQUETTE.slatColor}
                strokeWidth={1.1}
                opacity={0.76}
              />
            );
          })}

          {/* Front/Back Orientation Micro-Labels */}
          <text
            x={backLbl[0]}
            y={backLbl[1]}
            textAnchor="end"
            fill={MAQUETTE.inkSoft}
            fontSize={9.5}
          >
            後・樹林
          </text>
          <text
            x={frontLbl[0]}
            y={frontLbl[1]}
            textAnchor="end"
            fill={MAQUETTE.inkSoft}
            fontSize={9.5}
          >
            前・山景
          </text>

          <text
            x={lodgeTitle[0]}
            y={lodgeTitle[1]}
            textAnchor="middle"
            fill={MAQUETTE.ink}
            fontSize={11.5}
            fontWeight={700}
          >
            侑德心悅（本館・3F/2F/1F 全展開）
          </text>

          {/* Subtle Bottom Mountain Valley Direction Contour */}
          <path
            d="M 36 468 Q 280 452 520 466 T 924 460"
            fill="none"
            stroke={MAQUETTE.inkFaint}
            strokeWidth={1}
          />
          <text
            x={480}
            y={482}
            textAnchor="middle"
            fill={MAQUETTE.inkSoft}
            fontSize={10}
            letterSpacing="2"
          >
            ▼ 拉拉山 180° 山谷雲海方向
          </text>
        </svg>
      </div>

      {/* Extra Custom Rooms (when user adds rooms beyond the 14 standard rooms) */}
      {extraRooms.length > 0 && renderExtraRoom && (
        <div className="campus3d-extra-wrap">
          <div className="campus3d-extra-title">新增自訂房型</div>
          <div className="arch-extra-grid">
            {extraRooms.map((room) => (
              <div key={room.id} className="arch-room-slot">
                {renderExtraRoom(room)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
