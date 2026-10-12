export type Utility = 'MEA' | 'PEA';
/** 0 = ไม่ทราบ */
export type Phase = 0 | 1 | 3;
export type SystemType = 'ON_GRID' | 'HYBRID' | 'HYBRID_READY' | 'OFF_GRID';
export type VatMode = 'INCL' | 'EXCL' | 'UNKNOWN';
export type EvidenceStatus = 'CONFIRMED_QUOTE' | 'PUBLISHED_VERIFY' | 'EXPIRED' | 'ESTIMATE';
export type LoadShapeId = 'excel' | 'afternoon' | 'morningEvening';

export interface TariffBlock {
  /** ปลายขั้น (kWh) — null = ไม่จำกัด */
  upTo: number | null;
  rate: number;
}

export interface TariffVersion {
  id: string;
  label: string;
  providers: Utility[];
  customerType: string;
  effectiveFrom: string;
  effectiveTo: string;
  blocks: TariffBlock[];
  ftBahtPerKwh: number;
  serviceFee: number;
  vatRate: number;
  sourceUrl: string;
}

export interface Installer {
  id: string;
  name: string;
  website: string;
  serviceArea: string;
  note?: string;
}

export interface Offer {
  id: string;
  installerId: string;
  packageName: string;
  systemType: SystemType;
  phase: 1 | 3;
  /** ผลรวมวัตต์แผง ÷ 1000 */
  solarDcKwp: number;
  /** true = ยังไม่ยืนยันจำนวนแผง ใช้ค่า placeholder */
  dcKwpPlaceholder: boolean;
  inverterAcKw: number;
  batteryKwh: number;
  panelWatt: number | null;
  panelCount: number | null;
  panelBrand?: string;
  inverterBrand?: string;
  panelWarrantyYears: number | null;
  inverterWarrantyYears: number | null;
  workWarrantyYears: number | null;
  publishedPrice: number;
  vatMode: VatMode;
  siteExtras: number;
  annualOandM: number;
  evidenceStatus: EvidenceStatus;
  promotionText?: string;
  validFrom?: string;
  validTo?: string;
  lastVerifiedAt: string;
  sourceUrl: string;
  notes?: string;
}

export interface Scenario {
  province: string;
  utility: Utility;
  phase: Phase;
  billMonthlyThb: number;
  /** หน่วยจริงจากบิล (kWh/เดือน) — null = คำนวณย้อนจากยอดบิล */
  billedKwh: number | null;
  /** สัดส่วนใช้ไฟ 06:00–17:59 */
  dayUseFraction: number;
  loadShape: LoadShapeId;
  /** พื้นที่หลังคาที่ใช้ได้ (ตร.ม.) — null = ไม่ทราบ */
  roofAreaM2: number | null;
  roofSurveyed: boolean;
  tariffId: string;
  /** หน่วยไฟย้อนหลังรายเดือน ม.ค.–ธ.ค. จากบิล/แอปการไฟฟ้า (null = ไม่มีข้อมูลเดือนนั้น) */
  monthlyKwh?: (number | null)[];
}

export interface Assumptions {
  yieldKwhPerKwpPerDay: number;
  shadeMultiplier: number;
  /** ตัวคูณทิศ/ความเอียงหลังคา (1 = หันทิศใต้ เอียงมาตรฐาน) */
  orientationFactor: number;
  annualDegradation: number;
  discountRate: number;
  tariffGrowth: number;
  areaPerKwp: number;
  taxDeductionEnabled: boolean;
  marginalTaxRate: number;
  monthlySolarFactors: number[];
  monthlyLoadFactors: number[];
}

export interface ScoreWeights {
  financial: number;
  selfUse: number;
  pricePerKwp: number;
  warranty: number;
  dataConfidence: number;
}

export interface MonthResult {
  month: number;
  loadKwh: number;
  pvKwh: number;
  selfUseKwh: number;
  exportKwh: number;
  importKwh: number;
  billBefore: number;
  billAfter: number;
  grossSaving: number;
}

export interface HourlyMonth {
  load: number[];
  pv: number[];
  self: number[];
}

export interface SimulationResult {
  months: MonthResult[];
  hourly: HourlyMonth[];
  annual: {
    loadKwh: number;
    pvKwh: number;
    selfUseKwh: number;
    exportKwh: number;
    importKwh: number;
    billBefore: number;
    billAfter: number;
    grossSaving: number;
  };
}

export interface CashflowRow {
  year: number;
  gross: number;
  oAndM: number;
  tax: number;
  net: number;
  cumulative: number;
  discounted: number;
}
