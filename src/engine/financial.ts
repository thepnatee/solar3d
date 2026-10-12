import type { Assumptions, CashflowRow, Offer } from './types';

export const TAX_DEDUCTION_CAP = 200_000;
export const PROJECT_YEARS = 25;

export interface CapexInfo {
  /** null = VAT ไม่ทราบ → ห้ามแสดงเป็นราคา All-in */
  priceAllIn: number | null;
  capex: number | null;
}

export function offerCapex(o: Pick<Offer, 'publishedPrice' | 'vatMode' | 'siteExtras'>, vatRate: number): CapexInfo {
  if (!(o.publishedPrice > 0) || o.vatMode === 'UNKNOWN') return { priceAllIn: null, capex: null };
  const priceAllIn = o.vatMode === 'INCL' ? o.publishedPrice : o.publishedPrice * (1 + vatRate);
  return { priceAllIn, capex: priceAllIn + Math.max(0, o.siteExtras) };
}

export function simplePayback(capex: number | null, annualNetSaving: number): number | null {
  if (capex == null || !(capex > 0) || !(annualNetSaving > 0)) return null;
  return capex / annualNetSaving;
}

/** สิทธิลดหย่อนภาษี = ลดฐานภาษี → เงินภาษีที่ประหยัดได้ = min(capex, 200,000) × อัตราภาษีส่วนเพิ่ม (ปิดเป็นค่าเริ่มต้น) */
export function taxSaving(capex: number, a: Pick<Assumptions, 'taxDeductionEnabled' | 'marginalTaxRate'>): number {
  if (!a.taxDeductionEnabled) return 0;
  return Math.min(capex, TAX_DEDUCTION_CAP) * Math.max(0, a.marginalTaxRate);
}

export function cashflow(
  capex: number,
  firstYearGross: number,
  oAndM: number,
  a: Pick<Assumptions, 'annualDegradation' | 'tariffGrowth' | 'discountRate' | 'taxDeductionEnabled' | 'marginalTaxRate'>,
  years = PROJECT_YEARS,
): CashflowRow[] {
  const rows: CashflowRow[] = [{ year: 0, gross: 0, oAndM: 0, tax: 0, net: -capex, cumulative: -capex, discounted: -capex }];
  let cumulative = -capex;
  for (let y = 1; y <= years; y++) {
    const gross = firstYearGross * (1 - a.annualDegradation) ** (y - 1) * (1 + a.tariffGrowth) ** (y - 1);
    const tax = y === 1 ? taxSaving(capex, a) : 0;
    const net = gross - oAndM + tax;
    cumulative += net;
    rows.push({ year: y, gross, oAndM, tax, net, cumulative, discounted: net / (1 + a.discountRate) ** y });
  }
  return rows;
}

export function npv(rows: CashflowRow[]): number {
  return rows.reduce((s, r) => s + r.discounted, 0);
}

/** ปีที่ยอดสะสมกลับมาเป็นบวก (ประมาณเชิงเส้นภายในปี) — null = ไม่คืนทุนภายในระยะโครงการ */
export function breakEvenYear(rows: CashflowRow[]): number | null {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    if (cur.cumulative >= 0 && prev.cumulative < 0) {
      return prev.year + -prev.cumulative / (cur.cumulative - prev.cumulative);
    }
  }
  return rows.length > 0 && rows[0]!.cumulative >= 0 ? 0 : null;
}

/** ราคาตลาดโดยประมาณ capex ≈ a + b × kWp (least squares จากแพ็กเกจที่รู้ราคา All-in) */
export interface PriceModel {
  fixed: number;
  perKwp: number;
  points: number;
}

export function fitPriceModel(samples: { kwp: number; capex: number }[]): PriceModel {
  const pts = samples.filter((s) => s.kwp > 0 && s.capex > 0);
  if (pts.length < 2) return { fixed: 30_000, perKwp: 24_000, points: pts.length };
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.kwp, 0) / n;
  const my = pts.reduce((s, p) => s + p.capex, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.kwp - mx) ** 2;
    sxy += (p.kwp - mx) * (p.capex - my);
  }
  if (sxx < 1e-9) return { fixed: 0, perKwp: my / mx, points: n };
  let perKwp = sxy / sxx;
  let fixed = my - perKwp * mx;
  // กันค่าแปลก ๆ เมื่อจุดข้อมูลน้อย: ต้นทุนต่อ kWp ต้องเป็นบวกและค่าคงที่ไม่ติดลบ
  if (perKwp <= 0 || fixed < 0) {
    perKwp = my / mx;
    fixed = 0;
  }
  return { fixed, perKwp, points: n };
}

export function estimateCapex(model: PriceModel, kwp: number): number {
  return model.fixed + model.perKwp * kwp;
}
