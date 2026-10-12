import { DAYS_IN_MONTH, HOURS, MONTHS, getLoadShape, hourlyLoadFractions, solarHourlyFractions } from './profiles';
import { bill, getTariff, invertBill } from './tariff';
import type { Assumptions, HourlyMonth, MonthResult, Scenario, SimulationResult, TariffVersion } from './types';

/** ต้องมีอย่างน้อยกี่เดือนจึงใช้ประวัติรายเดือนแทนค่าเฉลี่ย */
export const MIN_HISTORY_MONTHS = 3;

export interface MonthlyHistory {
  /** จำนวนเดือนที่กรอก */
  months: number;
  average: number;
  /** ตัวคูณรายเดือน (เดือนที่ไม่มีข้อมูล = 1) */
  factors: number[];
}

/** สรุปประวัติหน่วยไฟ 12 เดือน — null ถ้ามีข้อมูลน้อยกว่า MIN_HISTORY_MONTHS เดือน */
export function monthlyHistory(s: Scenario): MonthlyHistory | null {
  const vals = (s.monthlyKwh ?? []).slice(0, MONTHS);
  const filled = vals.filter((v): v is number => v != null && v > 0);
  if (filled.length < MIN_HISTORY_MONTHS) return null;
  const average = filled.reduce((a, b) => a + b, 0) / filled.length;
  const factors = Array.from({ length: MONTHS }, (_, m) => {
    const v = vals[m];
    return v != null && v > 0 ? v / average : 1;
  });
  return { months: filled.length, average, factors };
}

/** หน่วยไฟต่อเดือนที่ใช้จำลอง: ประวัติ 12 เดือน > kWh จากบิล > คำนวณย้อนจากยอดเงิน */
export function monthlyConsumptionKwh(s: Scenario, t: TariffVersion = getTariff(s.tariffId)): number {
  const hist = monthlyHistory(s);
  if (hist) return hist.average;
  if (s.billedKwh != null && s.billedKwh > 0) return s.billedKwh;
  return invertBill(s.billMonthlyThb, t);
}

/** ไฟที่แผง 1 kWp ผลิตได้ในแต่ละ [เดือน][ชั่วโมง] (kWh รวมทั้งเดือนของชั่วโมงนั้น) */
export function pvPerKwpMatrix(a: Assumptions, sunFactor = 1): number[][] {
  const solarFrac = solarHourlyFractions();
  const base = a.yieldKwhPerKwpPerDay * a.shadeMultiplier * a.orientationFactor * sunFactor;
  return DAYS_IN_MONTH.map((days, m) => solarFrac.map((f) => Math.max(0, base * days * a.monthlySolarFactors[m]! * f)));
}

/** โหลดบ้าน [เดือน][ชั่วโมง] (kWh รวมทั้งเดือนของชั่วโมงนั้น) */
export function loadMatrix(monthlyKwh: number, loadFractions: number[], monthlyLoadFactors: number[]): number[][] {
  return Array.from({ length: MONTHS }, (_, m) => loadFractions.map((f) => Math.max(0, monthlyKwh * monthlyLoadFactors[m]! * f)));
}

export interface SimulationContext {
  scenario: Scenario;
  assumptions: Assumptions;
  tariff: TariffVersion;
  monthlyKwh: number;
  /** ตัวคูณรายเดือนที่ใช้จริง (จากประวัติบิล ถ้ามี) */
  monthlyLoadFactors: number[];
  loadFractions: number[];
  load: number[][];
  pvPerKwp: number[][];
}

export function buildContext(scenario: Scenario, assumptions: Assumptions, sunFactor = 1): SimulationContext {
  const tariff = getTariff(scenario.tariffId);
  const monthlyKwh = monthlyConsumptionKwh(scenario, tariff);
  const loadFractions = hourlyLoadFractions(getLoadShape(scenario.loadShape).weights, scenario.dayUseFraction);
  const monthlyLoadFactors = monthlyHistory(scenario)?.factors ?? assumptions.monthlyLoadFactors;
  return {
    scenario,
    assumptions,
    tariff,
    monthlyKwh,
    monthlyLoadFactors,
    loadFractions,
    load: loadMatrix(monthlyKwh, loadFractions, monthlyLoadFactors),
    pvPerKwp: pvPerKwpMatrix(assumptions, sunFactor),
  };
}

/**
 * จับคู่โหลดกับไฟจากแผงทีละชั่วโมงของเดือนตัวแทน (time-matched self-consumption)
 * selfUse[m,h] = min(load[m,h], pv[m,h]); ไฟส่วนเกินคิดรายได้ = 0 บาท
 */
export function simulate(load: number[][], pvPerKwp: number[][], dcKwp: number, t: TariffVersion): SimulationResult {
  const kwp = Math.max(0, dcKwp);
  const months: MonthResult[] = [];
  const hourly: HourlyMonth[] = [];
  const annual = { loadKwh: 0, pvKwh: 0, selfUseKwh: 0, exportKwh: 0, importKwh: 0, billBefore: 0, billAfter: 0, grossSaving: 0 };
  for (let m = 0; m < MONTHS; m++) {
    const hm: HourlyMonth = { load: [], pv: [], self: [] };
    let loadKwh = 0;
    let pvKwh = 0;
    let selfUseKwh = 0;
    for (let h = 0; h < HOURS; h++) {
      const l = load[m]![h]!;
      const p = pvPerKwp[m]![h]! * kwp;
      const s = Math.min(l, p);
      hm.load.push(l);
      hm.pv.push(p);
      hm.self.push(s);
      loadKwh += l;
      pvKwh += p;
      selfUseKwh += s;
    }
    const importKwh = Math.max(0, loadKwh - selfUseKwh);
    const exportKwh = Math.max(0, pvKwh - selfUseKwh);
    const billBefore = bill(loadKwh, t);
    const billAfter = bill(importKwh, t);
    const grossSaving = Math.max(0, billBefore - billAfter);
    months.push({ month: m + 1, loadKwh, pvKwh, selfUseKwh, exportKwh, importKwh, billBefore, billAfter, grossSaving });
    hourly.push(hm);
    annual.loadKwh += loadKwh;
    annual.pvKwh += pvKwh;
    annual.selfUseKwh += selfUseKwh;
    annual.exportKwh += exportKwh;
    annual.importKwh += importKwh;
    annual.billBefore += billBefore;
    annual.billAfter += billAfter;
    annual.grossSaving += grossSaving;
  }
  return { months, hourly, annual };
}

export function simulateForKwp(ctx: SimulationContext, dcKwp: number): SimulationResult {
  return simulate(ctx.load, ctx.pvPerKwp, dcKwp, ctx.tariff);
}
