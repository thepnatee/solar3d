/** Pure roof / panel-layout geometry shared by the 3D scene and the calculator (no Three.js import). */

export interface HouseParams {
  /** ความยาวตามแนวสันหลังคา (m) */
  width: number;
  /** ความลึกบ้าน (m) */
  depth: number;
  floors: 1 | 2;
  pitchDeg: number;
  /** ทิศที่หลังคาฝั่งติดแผงหันไป (องศา จากทิศเหนือตามเข็มนาฬิกา: 180 = ใต้) */
  bearingDeg: number;
}

/** แผง 590 W ขนาดมาตรฐาน (ม.) */
export const PANEL_SHORT = 1.134;
export const PANEL_LONG = 2.278;
export const PANEL_GAP = 0.03;
export const ROOF_MARGIN = 0.3;
export const SLAB = 0.14;
export const OVERHANG = 0.5;

/** usable slope rectangle + how many panels fit (best of portrait/landscape) */
export function panelCapacity(h: HouseParams): { capacity: number; landscape: boolean; cols: number; rows: number; slopeLen: number } {
  const p = (h.pitchDeg * Math.PI) / 180;
  const slopeLen = h.depth / 2 / Math.cos(p);
  const uLen = h.width - 2 * ROOF_MARGIN;
  const vLen = slopeLen - 2 * ROOF_MARGIN;
  const fit = (a: number, b: number) => {
    const cols = Math.max(0, Math.floor((uLen + PANEL_GAP) / (a + PANEL_GAP)));
    const rows = Math.max(0, Math.floor((vLen + PANEL_GAP) / (b + PANEL_GAP)));
    return { cols, rows, capacity: cols * rows };
  };
  const portrait = fit(PANEL_SHORT, PANEL_LONG);
  const land = fit(PANEL_LONG, PANEL_SHORT);
  return land.capacity > portrait.capacity ? { ...land, landscape: true, slopeLen } : { ...portrait, landscape: false, slopeLen };
}

/** พื้นที่หลังคาฝั่งเดียว × 0.8 (หักทางเดิน/ระยะขอบ) */
export function usableRoofArea(h: HouseParams): number {
  const p = (h.pitchDeg * Math.PI) / 180;
  return h.width * (h.depth / 2 / Math.cos(p)) * 0.8;
}

