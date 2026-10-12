const MID_MONTH_DAY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

export interface SunPosition {
  /** มุมเงย (rad) */
  elevation: number;
  /** มุมทิศ วัดจากทิศเหนือตามเข็มนาฬิกา (rad) */
  azimuth: number;
}

/** ตำแหน่งดวงอาทิตย์โดยประมาณ ตามละติจูด เดือน (0–11) และเวลาสุริยะ (ชั่วโมง) */
export function sunPosition(latDeg: number, month: number, solarHour: number): SunPosition {
  const n = MID_MONTH_DAY[month] ?? 172;
  const phi = (latDeg * Math.PI) / 180;
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + n)) / 365);
  const H = ((solarHour - 12) * 15 * Math.PI) / 180;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  return { elevation, azimuth };
}

/** เวกเตอร์ทิศไปหาดวงอาทิตย์ในพิกัดฉาก (เหนือ = -Z, ตะวันออก = +X, บน = +Y) */
export function sunDirection(p: SunPosition): [number, number, number] {
  const c = Math.cos(p.elevation);
  return [Math.sin(p.azimuth) * c, Math.sin(p.elevation), -Math.cos(p.azimuth) * c];
}
