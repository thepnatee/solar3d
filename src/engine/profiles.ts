import type { LoadShapeId } from './types';

export const HOURS = 24;
export const MONTHS = 12;
/** กลางวัน = 06:00–17:59 */
export const DAY_START = 6;
export const DAY_END = 17;

export const isDayHour = (h: number): boolean => h >= DAY_START && h <= DAY_END;

export const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
export const MONTH_SHORT_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** ตัวคูณแสงรายเดือน (illustrative จาก Excel ชีต Months — ไม่ใช่ข้อมูลรังสีจริงของหลังคา) */
export const DEFAULT_MONTHLY_SOLAR = [0.93, 1.02, 1.1, 1.08, 1.02, 0.95, 0.95, 0.94, 0.95, 0.98, 1.02, 1.06];
export const DEFAULT_MONTHLY_LOAD = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

/** น้ำหนักแดดรายชั่วโมง (Excel ชีต Load_Profile คอลัมน์ E) */
export const SOLAR_WEIGHTS = [0, 0, 0, 0, 0, 0, 0, 2, 5, 9, 13, 16, 17, 15, 12, 7, 3.5, 0.5, 0, 0, 0, 0, 0, 0];

export interface LoadShape {
  id: LoadShapeId;
  label: string;
  description: string;
  weights: number[];
}

export const LOAD_SHAPES: LoadShape[] = [
  {
    id: 'excel',
    label: 'มาตรฐาน (ตาม Excel)',
    description: 'ใช้ไฟมากช่วง 10:00–15:00 เช่น เปิดแอร์ทำงานที่บ้าน',
    weights: [1, 1, 1, 1, 1, 1, 2, 2, 4, 6, 8, 9, 10, 10, 9, 8, 7, 5, 4, 3, 2, 2, 2, 1],
  },
  {
    id: 'afternoon',
    label: 'แอร์หนักช่วงบ่าย',
    description: 'ใช้ไฟมากช่วง 13:00–17:59 แดดเริ่มอ่อน → ใช้ไฟจากแผงได้น้อยลง',
    weights: [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 5, 7, 9, 10, 10, 10, 9, 8, 6, 5, 4, 3, 2, 1],
  },
  {
    id: 'morningEvening',
    label: 'เช้า-เย็น (ออกไปทำงาน)',
    description: 'ใช้ไฟช่วงเช้าตรู่และหัวค่ำ กลางวันมีแค่ตู้เย็น/ปั๊มน้ำ',
    weights: [2, 2, 2, 2, 2, 2, 6, 7, 5, 3, 2, 2, 3, 2, 2, 3, 5, 7, 9, 9, 8, 7, 5, 3],
  },
];

export function getLoadShape(id: LoadShapeId): LoadShape {
  return LOAD_SHAPES.find((s) => s.id === id) ?? LOAD_SHAPES[0]!;
}

/**
 * สัดส่วนโหลดรายชั่วโมง: น้ำหนักช่วงกลางวันถูก normalize ให้รวม = dayFraction
 * และกลางคืนรวม = 1 - dayFraction (ตรงกับสูตร Excel Load_Profile!D)
 */
export function hourlyLoadFractions(weights: number[], dayFraction: number): number[] {
  const f = Math.min(Math.max(dayFraction, 0), 1);
  let daySum = 0;
  let nightSum = 0;
  for (let h = 0; h < HOURS; h++) {
    if (isDayHour(h)) daySum += weights[h]!;
    else nightSum += weights[h]!;
  }
  return weights.map((w, h) =>
    isDayHour(h) ? (daySum > 0 ? (w / daySum) * f : 0) : nightSum > 0 ? (w / nightSum) * (1 - f) : 0,
  );
}

export function solarHourlyFractions(weights: number[] = SOLAR_WEIGHTS): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (sum > 0 ? w / sum : 0));
}

/**
 * ตัวคูณทิศ/ความเอียงหลังคาโดยประมาณสำหรับละติจูดไทย (~14°N)
 * หันใต้ = 1.0, หันตะวันออก/ตะวันตก ≈ 0.92, หันเหนือที่เอียง 25° ≈ 0.85
 * เป็นค่าประมาณเพื่อการศึกษา — ใช้ PVGIS เมื่อต้องการความแม่นยำ
 */
export function orientationFactor(azimuthFromSouthDeg: number, tiltDeg: number): number {
  const d = (azimuthFromSouthDeg * Math.PI) / 180;
  const tilt = Math.min(Math.max(tiltDeg, 0), 60);
  const facingLoss = 0.36 * Math.sin((tilt * Math.PI) / 180) * ((1 - Math.cos(d)) / 2);
  const tiltLoss = Math.max(0, Math.abs(tilt - 15) - 10) * 0.004;
  return Math.max(0.5, 1 - facingLoss - tiltLoss);
}
