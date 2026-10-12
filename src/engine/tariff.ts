import type { TariffVersion } from './types';

/** อัตราบ้านอยู่อาศัยแบบก้าวหน้า ประเภท 1.2 ตั้งแต่รอบบิล ก.ย. 2569 + Ft ก.ย.–ธ.ค. 2569 */
export const TARIFF_1_2_2026_09: TariffVersion = {
  id: 'TH_RESIDENTIAL_1_2_2026_09',
  label: 'บ้านอยู่อาศัย 1.2 (อัตราก้าวหน้า) • Ft ก.ย.–ธ.ค. 2569',
  providers: ['MEA', 'PEA'],
  customerType: 'Residential 1.2',
  effectiveFrom: '2026-09-01',
  effectiveTo: '2026-12-31',
  blocks: [
    { upTo: 200, rate: 3.0 },
    { upTo: 400, rate: 4.1584 },
    { upTo: null, rate: 4.3583 },
  ],
  ftBahtPerKwh: 0.1623,
  serviceFee: 24.62,
  vatRate: 0.07,
  sourceUrl: 'https://www.pea.co.th/news/corporate-news/2412',
};

export const TARIFFS: TariffVersion[] = [TARIFF_1_2_2026_09];

export function getTariff(id: string): TariffVersion {
  return TARIFFS.find((t) => t.id === id) ?? TARIFF_1_2_2026_09;
}

/** ค่าพลังงานไฟฟ้าแบบขั้นบันได (ยังไม่รวม Ft / ค่าบริการ / VAT) */
export function energyCharge(kWh: number, t: TariffVersion = TARIFF_1_2_2026_09): number {
  const u = Math.max(kWh, 0);
  let charge = 0;
  let lower = 0;
  for (const b of t.blocks) {
    const upper = b.upTo ?? Infinity;
    if (u > lower) charge += (Math.min(u, upper) - lower) * b.rate;
    lower = upper;
  }
  return charge;
}

export interface BillBreakdown {
  kWh: number;
  energy: number;
  ft: number;
  service: number;
  vat: number;
  total: number;
}

export function billBreakdown(kWh: number, t: TariffVersion = TARIFF_1_2_2026_09): BillBreakdown {
  const u = Math.max(kWh, 0);
  const energy = energyCharge(u, t);
  const ft = u * t.ftBahtPerKwh;
  const service = t.serviceFee;
  const vat = (energy + ft + service) * t.vatRate;
  return { kWh: u, energy, ft, service, vat, total: energy + ft + service + vat };
}

/** bill(kWh) = (energyCharge + Ft × kWh + ค่าบริการ) × (1 + VAT) */
export function bill(kWh: number, t: TariffVersion = TARIFF_1_2_2026_09): number {
  return billBreakdown(kWh, t).total;
}

/** แปลงยอดเงินในบิล (รวม VAT) กลับเป็น kWh ด้วย piecewise inverse ตามขั้นบันได */
export function invertBill(amountThb: number, t: TariffVersion = TARIFF_1_2_2026_09): number {
  let remaining = amountThb / (1 + t.vatRate) - t.serviceFee;
  if (!(remaining > 0)) return 0;
  let lower = 0;
  for (const b of t.blocks) {
    const unit = b.rate + t.ftBahtPerKwh;
    const width = (b.upTo ?? Infinity) - lower;
    const blockCost = width * unit;
    if (remaining <= blockCost) return lower + remaining / unit;
    remaining -= blockCost;
    lower = b.upTo ?? Infinity;
  }
  return lower;
}

/** ค่าไฟเฉลี่ยต่อหน่วย (รวมทุกอย่าง) ที่ระดับการใช้ไฟหนึ่ง ๆ — ใช้เพื่ออธิบายเท่านั้น */
export function averageRate(kWh: number, t: TariffVersion = TARIFF_1_2_2026_09): number {
  return kWh > 0 ? bill(kWh, t) / kWh : 0;
}

/** อัตราส่วนเพิ่ม: ค่าไฟที่ลดได้ถ้าใช้ไฟน้อยลง 1 หน่วย ณ ระดับนี้ */
export function marginalRate(kWh: number, t: TariffVersion = TARIFF_1_2_2026_09): number {
  return bill(kWh, t) - bill(Math.max(0, kWh - 1), t);
}
