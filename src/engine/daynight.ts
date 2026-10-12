import { HOURS, isDayHour } from './profiles';
import { buildContext, simulateForKwp } from './simulate';
import { marginalRate } from './tariff';
import type { Assumptions, Scenario, SimulationResult, TariffVersion } from './types';

/** แยกผลรายปีเป็นช่วงกลางวัน (06:00–17:59) และกลางคืน */
export interface DayNightSplit {
  dayLoad: number;
  nightLoad: number;
  /** ไฟจากแผงที่บ้านใช้ (เกิดได้เฉพาะกลางวัน) */
  daySelf: number;
  dayImport: number;
  nightImport: number;
  pv: number;
  export: number;
  /** ค่าไฟโดยประมาณของหน่วยกลางคืนที่ยังต้องซื้อ (คิดที่อัตราส่วนเพิ่มของบิลหลังติด) */
  nightCostThb: number;
}

export function dayNightSplit(sim: SimulationResult, t: TariffVersion): DayNightSplit {
  const r = { dayLoad: 0, nightLoad: 0, daySelf: 0, dayImport: 0, nightImport: 0, pv: 0, export: 0, nightCostThb: 0 };
  sim.hourly.forEach((hm, m) => {
    let nightImportMonth = 0;
    for (let h = 0; h < HOURS; h++) {
      const l = hm.load[h]!;
      const s = hm.self[h]!;
      if (isDayHour(h)) {
        r.dayLoad += l;
        r.daySelf += s;
        r.dayImport += l - s;
      } else {
        r.nightLoad += l;
        r.daySelf += s; // กันกรณีผลิตนอกช่วง (ปกติ = 0)
        r.nightImport += l - s;
        nightImportMonth += l - s;
      }
    }
    r.nightCostThb += nightImportMonth * marginalRate(sim.months[m]!.importKwh, t);
  });
  r.pv = sim.annual.pvKwh;
  r.export = sim.annual.exportKwh;
  return r;
}

export interface DayShiftRow {
  dayFraction: number;
  grossSaving: number;
  selfUseKwh: number;
  billAfter: number;
  /** สัดส่วนไฟทั้งปีที่แผงจ่ายแทนการไฟฟ้า */
  coverage: number;
}

/** จำลองว่า ถ้าย้ายการใช้ไฟไปกลางวันมากขึ้น/น้อยลง ด้วยขนาดแผงเดิม จะประหยัดต่างกันแค่ไหน */
export function compareDayFractions(scenario: Scenario, assumptions: Assumptions, kwp: number, fractions: number[]): DayShiftRow[] {
  return fractions.map((f) => {
    const ctx = buildContext({ ...scenario, dayUseFraction: f }, assumptions);
    const sim = simulateForKwp(ctx, kwp);
    return {
      dayFraction: f,
      grossSaving: sim.annual.grossSaving,
      selfUseKwh: sim.annual.selfUseKwh,
      billAfter: sim.annual.billAfter,
      coverage: sim.annual.loadKwh > 0 ? sim.annual.selfUseKwh / sim.annual.loadKwh : 0,
    };
  });
}

/** คำนวณ % ใช้ไฟกลางวันจากการจดเลขมิเตอร์ 06:00 → 18:00 → 06:00 วันถัดไป */
export function dayFractionFromMeter(at6: number, at18: number, next6: number): number | null {
  const day = at18 - at6;
  const total = next6 - at6;
  if (!(day >= 0) || !(total > 0) || day > total) return null;
  return day / total;
}
